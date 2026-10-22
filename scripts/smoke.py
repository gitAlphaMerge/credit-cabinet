"""End-to-end smoke check for the Compose frontend, using only stdlib."""
import argparse
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


DEMO = Path(__file__).resolve().parents[1] / 'services' / 'frontend' / 'demo'


def request(base, path, body=None):
    req = Request(base + path, data=body,
                  headers={'Content-Type': 'application/json'} if body is not None else {})
    try:
        response = urlopen(req, timeout=40)
    except HTTPError as exc:
        response = exc
    with response:
        return response.code, response.read(), response.headers.get_content_type()


def error_json(data, content_type):
    if content_type != 'application/json':
        return False
    result = json.loads(data)
    return isinstance(result, dict) and isinstance(result.get('error'), str) and bool(result['error'].strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://localhost')
    base = parser.parse_args().base.rstrip('/')
    results = []

    def check(label, fn):
        try:
            ok, detail = fn()
        except Exception as exc:
            ok, detail = False, str(exc)
        results.append(ok)
        print(f"{'OK' if ok else 'FAIL':<5} | {label:<36} | {detail}")

    def get(path):
        status, _, _ = request(base, path)
        return status == 200, f'HTTP {status}'

    def score(body, invalid=False):
        status, data, content_type = request(base, '/api/score', body)
        if 400 <= status < 500:
            ok = error_json(data, content_type)
        elif status == 200 and not invalid:
            result = json.loads(data)
            ok = content_type == 'application/json' and isinstance(result, dict) and isinstance(result.get('view'), dict)
        else:
            ok = False
        return ok, f'HTTP {status}'

    print('RESULT | CHECK                                | DETAIL')
    for path in ('/', '/anketa.html', '/razgovor.html', '/v2/index.html',
                 '/v2/chat.html', '/v2/kabinet.html', '/api/health'):
        check('GET ' + path, lambda path=path: get(path))
    files = sorted(DEMO.glob('*.csv'))
    if not files:
        check('demo CSV files', lambda: (False, 'no CSV files found'))
    for file in files:
        def demo(file=file):
            # Demo need and questionnaire match the API contract.
            payload = {'statement_csv': file.read_text(encoding='utf-8'),
                       'need': {'purpose': '\u043a\u0430\u0441\u0441\u043e\u0432\u044b\u0439 \u0440\u0430\u0437\u0440\u044b\u0432',
                                'amount_rub': 1500000, 'term_months': 12},
                       'questionnaire': {'form': '\u041e\u041e\u041e', 'years': '\u0431\u043e\u043b\u044c\u0448\u0435 3'}}
            return score(json.dumps(payload).encode('utf-8'))
        check('POST ' + file.name, demo)
    check('POST garbage', lambda: score(b'garbage', invalid=True))
    check('POST empty body', lambda: score(b'', invalid=True))
    return 0 if all(results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
