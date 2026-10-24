"""Check whether the agent uses an LLM or templates, using only stdlib."""
import argparse
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4


def request(base, path, payload=None):
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None
    req = Request(base + path, data=body,
                  headers={'Content-Type': 'application/json'} if body is not None else {})
    with urlopen(req, timeout=90) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8090', help='Agent base URL')
    parser.add_argument('--expect-template', action='store_true', help='Succeed only if every reply uses templates')
    args = parser.parse_args()
    # Windows console defaults to cp1252: Cyrillic print would raise UnicodeEncodeError (a ValueError).
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    base = args.url.rstrip('/')
    session_id = 'check-ai-' + uuid4().hex
    sources = []
    try:
        health = request(base, '/health')
        print(f"model={health['llm']}")
        for index, text in enumerate(('Нужно 2 млн на закупку оборудования',
                                      'Верну из выручки от продаж', 'На 12 месяцев'), 1):
            result = request(base, '/turn', {'session_id': session_id, 'text': text})
            source = result['source']
            if source not in ('llm', 'template'):
                raise ValueError('invalid source')
            sources.append(source)
            preview = ' '.join(result['text'].split())[:120]
            print(f'{index}: source={source} | {preview}')
    except HTTPError as exc:
        print(f'FAIL: HTTP {exc.code}')
        return 1
    except (URLError, OSError):
        print('FAIL: ошибка соединения с агентом, проверьте --url и доступность сервиса')
        return 2
    except (ValueError, KeyError, TypeError):
        print('FAIL: некорректный JSON-ответ агента, проверьте версию сервиса')
        return 1

    if args.expect_template:
        if all(source == 'template' for source in sources):
            print('OK: все ответы source=template')
            return 0
        print('FAIL: ожидались только шаблоны, отключите модель через AGENT_LLM_URL=')
        return 1
    if 'llm' in sources:
        print('OK: получен ответ source=llm')
        return 0
    print('FAIL: все ответы source=template; проверьте AGENT_LLM_URL/MODEL/API_KEY в .env '
          '(AGENT_LLM_MODEL, AGENT_LLM_API_KEY) и доступность модели')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
