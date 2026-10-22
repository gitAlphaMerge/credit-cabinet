"""Build validated public/hidden v3 cases in three packages and two seeds."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import random
import shutil

import dirt
import from_spec
from validate_specs import ROOT, catalog, load_specs, print_report, validate

PUBLIC = ROOT / 'data/v3'
HIDDEN = ROOT / 'data/hidden/v3'
SPEC_DIR = ROOT / 'data/hidden/specs'


def json_bytes(value):
    """Use one stable JSON representation for documents and manifests."""
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')


def clean_bytes(ops):
    """Serialize the clean statement, retaining a label on every operation."""
    buffer = io.StringIO(newline='')
    writer = csv.writer(buffer, lineterminator='\n')
    writer.writerow(['date', 'amount', 'counterparty', 'purpose', 'label', 'inn'])
    for row in ops:
        writer.writerow([row['date'].isoformat(), f'{row["amount"]:.2f}', row['counterparty'],
                         row['purpose'], row['label'], row['inn']])
    return buffer.getvalue().encode('utf-8')


def text_field(value):
    """Bank exchange fields cannot contain embedded newlines."""
    return str(value).replace('\r', ' ').replace('\n', ' ')


def exchange_bytes(ops, meta):
    """Write multiline 1C exchange documents with positive amounts and account direction."""
    start, end = (from_spec.dt.date.fromisoformat(meta[k]).strftime('%d.%m.%Y') for k in ('start', 'end'))
    lines = ['1CClientBankExchange', 'ВерсияФормата=1.03', 'Кодировка=Windows',
             'Отправитель=Синтетика v3', f'ДатаНачала={start}', f'ДатаКонца={end}',
             f'РасчСчет={meta["account"]}', 'СекцияРасчСчет', f'ДатаНачала={start}', f'ДатаКонца={end}',
             f'РасчСчет={meta["account"]}', f'НачальныйОстаток={meta["opening"]:.2f}',
             f'ВсегоПоступило={meta["credit_total"]:.2f}', f'ВсегоСписано={meta["debit_total"]:.2f}',
             f'КонечныйОстаток={meta["closing"]:.2f}', 'КонецРасчСчет']
    labels = ['service'] * len(lines)
    for index, row in enumerate(ops, 1):
        incoming = row['amount'] >= 0
        other_account = '40702810' + f'{from_spec.zlib.crc32(row["counterparty"].encode("utf-8")):012d}'
        payer, payee = (row['counterparty'], meta['owner']) if incoming else (meta['owner'], row['counterparty'])
        payer_account, payee_account = (other_account, meta['account']) if incoming else (meta['account'], other_account)
        date = row['date'].strftime('%d.%m.%Y')
        block = ['СекцияДокумент=Платёжное поручение', f'Номер={index:06d}', f'Дата={date}',
                 f'Сумма={abs(row["amount"]):.2f}', f'Плательщик={text_field(payer)}',
                 f'ПлательщикСчет={payer_account}', f'Получатель={text_field(payee)}',
                 f'ПолучательСчет={payee_account}',
                 f'{"ПлательщикИНН" if incoming else "ПолучательИНН"}={row["inn"]}',
                 f'{"ДатаПоступило" if incoming else "ДатаСписано"}={date}',
                 f'НазначениеПлатежа={text_field(row["purpose"])}', 'КонецДокумента']
        lines.extend(block)
        labels.extend([row['label']] + ['service'] * (len(block) - 1))
    lines.append('КонецФайла')
    labels.append('service')
    return ('\r\n'.join(lines) + '\r\n').encode('cp1251'), labels


def label_bytes(labels):
    """Keep service/operation annotations beside dirty files, outside bank payloads."""
    return ('line,label\n' + ''.join(f'{index},{label}\n' for index, label in enumerate(labels, 1))).encode('utf-8')


def discover_specs(spec_dir=SPEC_DIR):
    """Read all Gemini batches in stable path order, rejecting duplicate case IDs globally."""
    paths = sorted([*Path(spec_dir).glob('*.gemini.json'), *Path(spec_dir).glob('*.factory.json')])
    if not paths:
        raise ValueError(f'No *.gemini.json or *.factory.json specs in {spec_dir}')
    batches = [(path, load_specs(path)) for path in paths]
    ids = []
    for _, specs in batches:
        if isinstance(specs, list):
            ids.extend(s['case_id'] for s in specs if isinstance(s, dict) and isinstance(s.get('case_id'), str))
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate case_id across spec files')
    return batches


def render_case(spec):
    """Render all bytes before writing a case, so failures cannot leave a partial case."""
    files, variants = {}, []
    for number in range(2):
        ops, meta = from_spec.generate(spec, number)
        folder = f'seed_{number}'
        names = {kind: f'{folder}/statement_{kind}.{ext}' for kind, ext in
                 (('clean', 'csv'), ('dirty', 'csv'), ('1c', 'txt'))}
        files[names['clean']] = clean_bytes(ops)
        # Existing dirt formatter changes presentation while preserving every operation.
        dirty, labels = dirt.write_dirty(ops, meta, 'semicolon', random.Random(from_spec.seed_for(spec['case_id'], number)))
        files[names['dirty']] = dirty
        files[f'{folder}/statement_dirty.labels.csv'] = label_bytes(labels)
        exchange, labels = exchange_bytes(ops, meta)
        files[names['1c']] = exchange
        files[f'{folder}/statement_1c.labels.csv'] = label_bytes(labels)
        document_names = []
        need, questionnaire = from_spec.core_inputs(spec)
        for name, value in (('need.json', need), ('questionnaire.json', questionnaire)):
            files[f'{folder}/{name}'] = json_bytes(value)
        for name, payload in from_spec.documents(spec, ops, meta).items():
            path = f'{folder}/{name}'
            files[path] = payload if isinstance(payload, bytes) else json_bytes(payload)
            document_names.append(path)
        # The bank_statement itself respects present=false, just like every other document.
        if not spec['documents']['bank_statement']['present']:
            for path in list(files):
                if path.startswith(folder + '/statement_'):
                    del files[path]
            names = {}
        variants.append(dict(seed_number=number, seed=from_spec.seed_for(spec['case_id'], number),
                             statements=names, documents=sorted(document_names),
                             opening_balance_rub=meta['opening'], closing_balance_rub=meta['closing'],
                             operation_total_rub=sum(from_spec.cents(r['amount']) for r in ops) / 100,
                             operation_count=len(ops), period_start=meta['start'], period_end=meta['end']))
    return files, variants


def build_all(spec_dir=SPEC_DIR, public=PUBLIC, hidden=HIDDEN, verbose=True):
    """Build valid cases only, returning manifests and an exact written-file hash map."""
    products = catalog()
    manifests = {'public': {}, 'hidden': {}}
    # Inputs and validation finish before retiring the explicitly authorised output trees.
    batches = [(path, specs, validate(specs, products)) for path, specs in discover_specs(spec_dir)]
    for directory, intended in ((public, PUBLIC), (hidden, HIDDEN)):
        resolved = Path(directory).resolve()
        expected = ROOT.resolve() / intended.relative_to(ROOT)
        if resolved != expected or Path(directory).is_symlink() or Path(directory).is_junction():
            raise ValueError(f'Unsafe output cleanup target: {resolved}')
        if resolved.exists():
            if any(p.is_symlink() or p.is_junction() for p in resolved.rglob('*')):
                raise ValueError(f'Refusing cleanup through linked output: {resolved}')
            shutil.rmtree(resolved)
    all_hashes, skipped = {}, []
    total_cases = 0
    for path, specs, findings in batches:
        if verbose:
            print(f'INPUT {path.name}')
            print_report(specs, findings)
        bad = {f['case_id'] for f in findings if f['severity'] == 'error'}
        if 'FILE' in bad:
            skipped.append(path.name)
            continue
        for spec in specs:
            cid = spec.get('case_id') if isinstance(spec, dict) else None
            if cid in bad or not isinstance(cid, str):
                skipped.append(cid or path.name)
                continue
            files, variants = render_case(spec)
            root = Path(hidden if spec['split'] == 'hidden' else public)
            case_root = root / cid
            hashes = {}
            for name, payload in sorted(files.items()):
                answer = name.endswith('.labels.csv') or name.endswith('statement_clean.csv')
                output = (Path(hidden) / 'answers' / cid if answer else case_root) / name
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(payload)
                rel = output.relative_to(ROOT).as_posix()
                hashes[rel] = hashlib.sha256(payload).hexdigest()
                all_hashes[rel] = hashes[rel]
            for variant in variants:
                variant['statements'] = {k: ((Path(hidden) / 'answers' / cid if k == 'clean' else case_root) / v).relative_to(ROOT).as_posix()
                                         for k, v in variant['statements'].items()}
                variant['documents'] = [(case_root / v).relative_to(ROOT).as_posix() for v in variant['documents']]
            manifests[spec['split']][cid] = dict(expected=spec['expected'], variants=variants,
                                                 files=hashes, document_status=spec['documents'])
            total_cases += 1
    for split, directory, name in (('public', public, 'golden_v3.json'),
                                    ('hidden', hidden, 'golden_v3_hidden.json')):
        target = Path(directory) / name
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = json_bytes(manifests[split])
        target.write_bytes(payload)
        all_hashes[target.relative_to(ROOT).as_posix()] = hashlib.sha256(payload).hexdigest()
    import check_v3
    readme = check_v3.readme(check_v3.evaluate(manifests['public'])).encode('utf-8')
    (Path(public) / 'README.md').write_bytes(readme)
    all_hashes[(Path(public) / 'README.md').relative_to(ROOT).as_posix()] = hashlib.sha256(readme).hexdigest()
    digest = hashlib.sha256(json_bytes(all_hashes)).hexdigest()
    if verbose:
        print(f'BUILD cases={total_cases} public={len(manifests["public"])} hidden={len(manifests["hidden"])} '
              f'files={len(all_hashes)} skipped={",".join(skipped) or "none"}')
        print(f'SHA256 {digest}')
    return manifests, all_hashes


def main():
    """Expose a reproducible local-only command line entry point."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec-dir', type=Path, default=SPEC_DIR)
    args = parser.parse_args()
    build_all(spec_dir=args.spec_dir)


if __name__ == '__main__':
    main()
