"""Eval-only bridge: real llm.intake/speak, network and usage traced by Inspect.

No changes to production modules. ContextVar keeps parallel samples isolated.
"""
import asyncio
import contextvars
import json
import os
import re
from pathlib import Path
import sys
import time
import urllib.request

HERE = Path(__file__).resolve().parent
EVAL = HERE.parent
AGENT = EVAL.parent
ROOT = AGENT.parents[1]
for path in (AGENT, EVAL):
    sys.path.insert(0, str(path))
os.environ.setdefault('JOURNAL_PATH', str(HERE / '.runtime' / 'core-journal.jsonl'))
(HERE / '.runtime').mkdir(exist_ok=True)

import llm
from inspect_ai.model import ChatMessageSystem, ChatMessageUser, GenerateConfig

# Inspect has no public data-dir option in this pinned version. Redirect only its
# appdirs helper, not HOME/APPDATA or other applications. Required by the sandbox.
import inspect_ai._util.appdirs as inspect_appdirs
inspect_appdirs.user_data_path = lambda package: HERE / '.runtime' / 'data' / package
inspect_appdirs.user_cache_path = lambda package: HERE / '.runtime' / 'cache' / package
os.environ.setdefault('INSPECT_DISPLAY', 'plain')

ACTIVE = contextvars.ContextVar('eval_bridge', default=None)
ORIGINAL_CHAT = llm.chat


def load_env():
    """Only import the one requested credential, never print .env or override shell."""
    path = ROOT / '.env'
    if path.exists() and not os.getenv('OPENROUTER_API_KEY'):
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            key, sep, value = line.partition('=')
            if sep and key.strip() == 'OPENROUTER_API_KEY':
                os.environ[key.strip()] = value.strip().strip('\"\'')
    os.environ.setdefault('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1')


def catalog():
    for attempt in range(3):
        try:
            with urllib.request.urlopen('https://openrouter.ai/api/v1/models', timeout=20) as response:
                return {m['id']: m for m in json.load(response)['data']}
        except (OSError, ValueError):
            if attempt == 2:
                raise


class BudgetExceeded(RuntimeError):
    pass


class Budget:
    """Durable cumulative USD ledger, including smoke, failures and inflight calls.

Reservations are deliberately conservative (one token per UTF-8 byte + overhead).
On failure keep reservation: a failed response might still have incurred a charge.
One runner per ledger; never run two matrix processes concurrently on this ledger.
"""
    def __init__(self, path=None, limit=3.0):
        self.path = Path(path or HERE / '.runtime' / 'budget.jsonl')
        self.limit = min(float(limit), 3.0)
        self.entries = []
        if self.path.exists():
            self.entries = [json.loads(line) for line in self.path.read_text(encoding='utf-8').splitlines() if line]
        self.lock = asyncio.Lock()

    @property
    def spent(self):
        return sum(e['usd'] for e in self.entries)

    def append(self, row):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open('a', encoding='utf-8') as out:
            out.write(json.dumps(row) + '\n')
        self.entries.append(row)

    async def reserve(self, model, system, user, max_tokens, prices):
        prompt_price, output_price = prices
        upper = (len((system + user).encode('utf-8')) + 1024) * prompt_price + max_tokens * output_price
        async with self.lock:
            if self.spent + upper > self.limit:
                raise BudgetExceeded('cumulative $3 budget: request not sent')
            self.append({'model': model, 'kind': 'reserve', 'usd': upper})
        return upper

    async def settle(self, model, reserved, actual):
        async with self.lock:
            self.append({'model': model, 'kind': 'settle', 'usd': actual - reserved})


class Bridge:
    def __init__(self, candidate, budget, prices):
        self.candidate, self.budget, self.prices = candidate, budget, prices
        self.loop = asyncio.get_running_loop()
        self.calls = []

    async def request(self, model, system, user, role='agent', as_json=False,
                      temperature=0.0, max_tokens=600):
        model_id = str(model.name).split('/', 1)[-1]
        # model.name for openai-api provider contains the provider prefix.
        for known in self.prices:
            if str(model.name).endswith('/' + known) or str(model.name) == known:
                model_id = known
                break
        prices = self.prices.get(model_id, (0, 0))
        if model_id not in self.prices and (role != 'agent' or self.candidate['mode'] == 'remote'):
            raise ValueError('unpriced remote model: refusing unbounded request')
        reserved = await self.budget.reserve(model_id, system, user, max_tokens, prices)
        start = time.perf_counter()
        record = {'model': model_id, 'role': role, 'input_tokens': 0, 'output_tokens': 0, 'usd': 0}
        extra = {'reasoning': {'enabled': False}}
        if as_json:
            extra['response_format'] = {'type': 'json_object'}
        try:
            deadline = max(1, int(float(os.getenv('AGENT_LLM_TIMEOUT', '30'))))
            result = await asyncio.wait_for(model.generate(
                [ChatMessageSystem(content=system), ChatMessageUser(content=user)],
                config=GenerateConfig(temperature=temperature, max_tokens=max_tokens, max_retries=0,
                                      timeout=deadline, attempt_timeout=deadline, extra_body=extra), cache=False),
                                      timeout=deadline + 5)
            if result.usage is None:
                raise RuntimeError('usage missing: charged upper reservation, sample invalid')
            record['input_tokens'] = (result.usage.input_tokens
                + (getattr(result.usage, 'input_tokens_cache_read', 0) or 0)
                + (getattr(result.usage, 'input_tokens_cache_write', 0) or 0))
            record['output_tokens'] = result.usage.output_tokens
            record['usd'] = record['input_tokens'] * prices[0] + record['output_tokens'] * prices[1]
            await self.budget.settle(model_id, reserved, record['usd'])
            if not result.completion.strip():
                raise ValueError('empty model completion')
            return result.completion
        except Exception as error:
            record['error'] = type(error).__name__
            underlying = error
            if getattr(error, 'last_attempt', None) is not None:
                underlying = error.last_attempt.exception() or error
            record['cause'] = type(underlying).__name__
            record['status_code'] = getattr(underlying, 'status_code', None)
            detail = str(underlying)
            for key in ('OPENROUTER_API_KEY', 'AGENT_LLM_API_KEY'):
                if os.getenv(key):
                    detail = detail.replace(os.environ[key], '<redacted>')
            record['error_detail'] = re.sub(r'sk-[A-Za-z0-9_-]{8,}', '<redacted>', detail)[:240]
            record['usd_reserved'] = reserved
            raise
        finally:
            record['seconds'] = time.perf_counter() - start
            self.calls.append(record)

    def chat(self, system, user, model=None, as_json=False, temperature=0.0, max_tokens=600):
        from inspect_ai.model import get_model
        return asyncio.run_coroutine_threadsafe(self.request(
            get_model(), system, user, as_json=as_json, temperature=temperature, max_tokens=max_tokens), self.loop).result()


def patched_chat(*args, **kwargs):
    active = ACTIVE.get()
    return active.chat(*args, **kwargs) if active else ORIGINAL_CHAT(*args, **kwargs)


def install_bridge():
    llm.chat = patched_chat
