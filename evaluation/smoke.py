"""Six live AI smoke tests. Uses model credits. This is not a quality benchmark."""
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

CASES = [
    ('Quanto custa o plano Pro?', 'planos', 'answered'),
    ('Tenho 70 dias para pedir reembolso?', 'reembolso', 'answered'),
    ('Como recuperar minha senha?', 'acesso', 'answered'),
    ('Tem integração com WhatsApp?', 'integracoes', 'answered'),
    ('Quero falar com um atendente humano.', 'atendimento', 'handoff'),
    ('Vocês vendem pizza?', None, 'handoff'),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:4173')
    parser.add_argument('--output', default='docs/live-smoke.json')
    args = parser.parse_args()
    url = args.url.rstrip('/') + '/api/chat'
    rows = []
    for question, source, status in CASES:
        started = time.perf_counter()
        request = Request(url, data=json.dumps({'question': question, 'mode': 'auto'}).encode(),
                          headers={'Content-Type': 'application/json'})
        with urlopen(request, timeout=55) as response:
            output = json.load(response)
        ids = [c['id'] for c in output['citations']]
        passed = output['mode'] == 'ia' and output['status'] == status and (source is None or source in ids)
        passed = passed and (status != 'handoff' or bool(output.get('handoff')))
        rows.append({'question': question, 'mode': output['mode'], 'status': output['status'],
                     'citation_ids': ids, 'latency_ms': round((time.perf_counter() - started) * 1000), 'passed': passed})
        print(f"{'PASS' if passed else 'FAIL'}: {question} [{output['mode']}]", flush=True)
    report = {'date': datetime.now(timezone.utc).isoformat(), 'url': url,
              'type': 'live AI smoke test, not a benchmark', 'results': rows}
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    raise SystemExit(0 if all(r['passed'] for r in rows) else 1)


if __name__ == '__main__':
    main()
