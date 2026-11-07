"""Regression benchmark. Stdlib only. Not a semantic faithfulness score."""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def evaluate(case, output, corpus):
    ids = {item['id'] for item in output['citations']}
    docs = {article['id']: article for article in corpus['articles']}
    expected = set(case['expected_ids'])
    approved = '\n\n'.join(docs[i]['body'] for i in [x['id'] for x in output['citations']] if i in docs)
    return {
        'retrieval_recall': len(ids & expected) / len(expected) if expected else float(not ids),
        'citation_validity': all(i in docs for i in ids),
        'approved_text_match': output['answer'] == approved if ids else output['status'] == 'handoff',
        'fact_match': all(f.casefold() in output['answer'].casefold() for f in case['facts']),
        'no_forbidden_claim': all(f.casefold() not in output['answer'].casefold() for f in case.get('forbidden', [])),
        'routing': output['status'] == case['status'],
        'handoff_contract': bool(output.get('handoff')) == (output['status'] == 'handoff'),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', help='Base URL of a running server, e.g. http://127.0.0.1:4173')
    parser.add_argument('--mode', choices=['base', 'auto'], default='base')
    parser.add_argument('--split', choices=['all', 'dev', 'test'], default='all')
    parser.add_argument('--output', default='evaluation/results.local.json')
    args = parser.parse_args()
    corpus = json.loads((ROOT / 'data/knowledge.json').read_text())
    cases = [json.loads(line) for line in (ROOT / 'evaluation/benchmark.jsonl').read_text().splitlines() if line]
    cases = [c for c in cases if args.split == 'all' or c['split'] == args.split]
    rows = []
    for case in cases:
        start = time.perf_counter()
        payload = json.dumps({'question': case['question'], 'mode': args.mode}, ensure_ascii=False)
        if args.url:
            request = Request(args.url.rstrip('/') + '/api/chat', data=payload.encode(), headers={'Content-Type': 'application/json'})
            with urlopen(request, timeout=60) as response:
                output = json.load(response)
        else:
            output = json.loads(subprocess.run(['node', 'scripts/ask.mjs'], cwd=ROOT, input=payload, capture_output=True, text=True, check=True).stdout)
        checks = evaluate(case, output, corpus)
        passed = all(v == 1 for v in checks.values())
        rows.append({'id': case['id'], 'split': case['split'], 'group': case['group'], 'checks': checks,
                     'passed': passed, 'mode': output['mode'], 'latency_ms': round((time.perf_counter()-start)*1000),
                     'citation_ids': [c['id'] for c in output['citations']]})
    # Compare source choices across paraphrases. Consistency alone is not correctness.
    groups = {}
    for row in rows:
        groups.setdefault(row['group'], []).append(set(row['citation_ids']))
    consistency = {name: all(ids == values[0] for ids in values) for name, values in groups.items() if len(values) > 1}
    report = {'suite': 'synthetic-nexo-v1', 'requested_mode': args.mode, 'split': args.split,
              'total': len(rows), 'passed': sum(r['passed'] for r in rows), 'rows': rows,
              'source_consistency_by_group': consistency,
              'limits': 'Synthetic benchmark. Exact facts and approved-text checks are not semantic groundedness or faithfulness. Dev/test share policy topics and are not an independent generalization study.'}
    path = ROOT / args.output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f"{report['passed']}/{report['total']} cases passed. Report: {path}")
    for row in rows:
        if not row['passed']:
            print(row['id'], {k: v for k, v in row['checks'].items() if v != 1})
    # A request to evaluate AI must fail if the model silently fell back.
    ai_fallback = args.mode == 'auto' and any(r['mode'] != 'ia' and r['group'] != 'injection' for r in rows)
    if ai_fallback:
        print('AI evaluation incomplete: at least one case fell back to deterministic search.')
    sys.exit(0 if all(r['passed'] for r in rows) and not ai_fallback else 1)


if __name__ == '__main__':
    main()
