"""Tests target failure modes in the measuring instrument, no live API traffic."""
import asyncio
import json
from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pytest
pytest.importorskip("inspect_ai")
from metrics import beats_baseline, loops, pass3, percentile, slot_matches
from runtime import ACTIVE, Bridge, Budget, BudgetExceeded, install_bridge
import llm
from tasks import deterministic, pass_cubed
from inspect_ai.scorer import Score


def test_invented_slots_and_paraphrased_literal_values_fail():
    result = slot_matches({'purpose': 'рост', 'repay_from': 'из выручки'},
                          {'purpose': 'рост', 'amount_rub': 100, 'repay_from': 'выручка'})
    assert result['purpose']
    assert not result['amount_rub'] and not result['repay_from']


def test_legacy_unannotated_repay_is_unknown_not_absent():
    from metrics import scored_fields
    item = {'expected': {}, 'text': 'Из текущей выручки'}
    assert 'repay_from' not in scored_fields(item, 'phrases-deepseek.json')
    assert 'repay_from' in scored_fields(item, 'phrases-repay-eval-a.json')


def test_loop_uses_semantic_slot_not_repeated_text():
    assert loops([{'goal': 'ask:purpose', 'reply': 'На что?'},
                  {'goal': 'ask:purpose', 'reply': 'А конкретнее?'}]) == {'purpose': 2}
    assert not loops([{'goal': 'ask:purpose'}, {'goal': 'manager', 'slot': 'purpose'}])


def test_missing_epoch_and_pass_at_three_are_not_pass_cubed():
    assert not pass3([{'id': 'x', 'epoch': 1, 'passed': True}])['x']
    assert not pass3([{'id': 'x', 'epoch': n, 'passed': n == 3} for n in (1, 2, 3)])['x']
    assert pass3([{'id': 'x', 'epoch': n, 'passed': True} for n in (1, 2, 3)])['x']
    reduce = pass_cubed()
    assert reduce([Score(value=1)] * 3).value == 1
    assert reduce([Score(value=1), Score(value=0), Score(value=1)]).value == 0
    assert reduce([Score(value=1)]).value == 0


def test_unknown_final_outcome_never_passes():
    result = deterministic({'trace': [{'user': '', 'reply': 'На что нужны деньги?'}], 'need': {}, 'view': None},
                           {'scenario': 'does-not-exist'})
    assert result['ok'] is False


def test_missing_samples_or_worse_guard_cannot_win():
    base = dict(status='success', slot_accuracy=.7, dialog_pass3=.5, redteam_pass3=.5, loop_rate=.2, guard_rate=.1, number_rate=0)
    assert not beats_baseline(dict(base, slot_accuracy=.9, guard_rate=.2), base)
    assert not beats_baseline(dict(base, slot_accuracy=.9, status='incomplete'), base)
    assert not beats_baseline(dict(base, slot_accuracy=.9), dict(base, status='incomplete'))
    assert beats_baseline(dict(base, slot_accuracy=.9), base)
    assert not beats_baseline(dict(base, slot_accuracy=.9, redteam_pass3=0), base)
    assert not beats_baseline(dict(base, slot_accuracy=.9, dialog_pass3=0), dict(base, dialog_pass3=0))


def test_empty_latency_is_unknown():
    assert percentile([], .95) is None
    assert percentile([1, 3], .5) == 2


def test_budget_is_cumulative_and_reserves_before_network(tmp_path):
    async def run():
        budget = Budget(tmp_path / 'ledger.jsonl', limit=.01)
        reserved = await budget.reserve('model', '', '', 10, (.000001, .000001))
        assert budget.spent == reserved
        await budget.settle('model', reserved, .002)
        assert budget.spent == pytest.approx(.002)
        loaded = Budget(budget.path, limit=.003)
        with pytest.raises(BudgetExceeded):
            await loaded.reserve('model', 'large prompt', '', 5000, (.000001, .000001))
        assert len(loaded.entries) == 2
    asyncio.run(run())


def test_failed_call_keeps_reservation_and_error_evidence(tmp_path):
    class BrokenModel:
        name = 'openrouter/test/model'
        async def generate(self, *args, **kwargs):
            raise TimeoutError('synthetic timeout')
    async def run():
        budget = Budget(tmp_path / 'ledger.jsonl')
        bridge = Bridge({'mode': 'remote'}, budget, {'test/model': (.000001, .000001)})
        with pytest.raises(TimeoutError):
            await bridge.request(BrokenModel(), 'system', 'user')
        assert budget.spent > 0
        assert bridge.calls[0]['error'] == 'TimeoutError'
        assert bridge.calls[0]['input_tokens'] == 0
    asyncio.run(run())


def test_provider_exception_never_leaks_credential(tmp_path, monkeypatch):
    credential = 'sk-unit-test-private-token'
    monkeypatch.setenv('OPENROUTER_API_KEY', credential)
    class ProviderError(Exception):
        status_code = 403
    class BrokenModel:
        name = 'openrouter/test/model'
        async def generate(self, *args, **kwargs):
            raise ProviderError('Authorization failed: ' + credential)
    async def run():
        bridge = Bridge({'mode': 'remote'}, Budget(tmp_path / 'ledger.jsonl'), {'test/model': (1e-6, 1e-6)})
        with pytest.raises(ProviderError):
            await bridge.request(BrokenModel(), 'system', 'user')
        assert credential not in json.dumps(bridge.calls)
        assert bridge.calls[0]['status_code'] == 403
        assert '<redacted>' in bridge.calls[0]['error_detail']
    asyncio.run(run())


def test_parallel_thread_bridge_preserves_model_context(tmp_path, monkeypatch):
    import inspect_ai.model
    class FakeModel:
        name = 'openrouter/test/model'
        async def generate(self, messages, **kwargs):
            assert kwargs['config'].attempt_timeout == kwargs['config'].timeout
            assert kwargs['config'].max_retries == 0
            await asyncio.sleep(.001)
            text = messages[-1].content
            return SimpleNamespace(completion=json.dumps({'purpose': text}),
                                   usage=SimpleNamespace(input_tokens=10, output_tokens=4))
    monkeypatch.setattr(inspect_ai.model, 'get_model', lambda: FakeModel())
    original = llm.chat
    install_bridge()
    async def run_one(text):
        bridge = Bridge({'mode': 'remote'}, Budget(tmp_path / (text + '.jsonl')), {'test/model': (1e-6, 1e-6)})
        token = ACTIVE.set(bridge)
        try:
            value = await asyncio.to_thread(llm.chat, 'system', text, as_json=True)
            assert json.loads(value)['purpose'] == text
            assert len(bridge.calls) == 1
        finally:
            ACTIVE.reset(token)
    async def run():
        await asyncio.gather(run_one('one'), run_one('two'))
    try:
        asyncio.run(run())
    finally:
        llm.chat = original


def test_judge_never_runs_after_code_failure(monkeypatch):
    from tasks import dimension_judges
    async def forbidden(*args, **kwargs):
        raise AssertionError('paid judge called after code failed')
    monkeypatch.setattr(Bridge, 'request', forbidden)
    state = SimpleNamespace(store=SimpleNamespace(get=lambda key, default=None:
                            {'code': {'ok': False}, 'loops': {}}.get(key, default)))
    result = asyncio.run(dimension_judges({'mode': 'templates'})(state, None))
    assert result.metadata['status'] == 'skipped'


def test_all_role_families_differ_and_models_fit_size_bound(monkeypatch):
    import run_matrix
    import yaml
    models = yaml.safe_load((Path(__file__).parent / 'models.yaml').read_text(encoding='utf-8'))['models']
    monkeypatch.setattr(run_matrix, 'model_object', lambda candidate: candidate)
    for candidate in models:
        assert candidate['parameters_b'] <= 120
        roles, _ = run_matrix.roles_for(candidate, models)
        assert len({candidate['family'], roles['user']['family'], roles['grader']['family']}) == 3


def test_report_detects_fully_missing_persona_epoch():
    from reporting import aggregate
    log = SimpleNamespace(status='success', eval=SimpleNamespace(task='dialog_task',
        dataset=SimpleNamespace(sample_ids=['missing-persona']), config=SimpleNamespace(epochs=3)), samples=[])
    row = aggregate({'name': 'test'}, [log])
    assert row['status'] == 'incomplete'
    assert row['errors'][0]['error'] == 'missing sample epochs'


def test_transport_failure_stops_invalid_dialog_without_calling_client(tmp_path, monkeypatch):
    import tasks
    from runtime import EVAL
    persona = json.loads((EVAL / 'data/personas-deepseek.json').read_text(encoding='utf-8'))[0]
    class Store(dict):
        def set(self, key, value):
            self[key] = value
    def fail_chat(self, *args, **kwargs):
        self.calls.append({'role': 'agent', 'error': 'TimeoutError'})
        raise TimeoutError('synthetic test')
    monkeypatch.setattr(Bridge, 'chat', fail_chat)
    old_chat = llm.chat
    state = SimpleNamespace(metadata={'item': persona}, store=Store(),
                            output=SimpleNamespace(completion=''), completed=False)
    async def run():
        tasks.configure(Budget(tmp_path / 'ledger.jsonl'), {})
        await tasks.conversation_solver({'name': 'test', 'mode': 'remote'})(state, None)
    try:
        asyncio.run(run())
    finally:
        llm.chat = old_chat
    assert state.completed
    assert state.store['error'] == 'RuntimeError'
    assert len(state.store['dialog']['trace']) == 1
    assert len(state.store['calls']) == 1
