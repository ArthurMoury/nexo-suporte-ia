"""Regressão offline: mede cálculo de métricas e recuperação lexical sem custo de API."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'python_api'))
from nexo_agent.rag import read_document, rag_search
from quality import score_judgment

RETRIEVAL_CASES = [
    ('prazo para reembolso','reembolso'),
    ('preço do plano Pro','planos'),
    ('esqueci minha senha','acesso'),
    ('integrar com WhatsApp','integracoes'),
    ('cancelar a assinatura','cancelamento'),
]


def run_regression():
    # Regressão repete os mesmos casos a cada mudança. Se a busca piorar,
    # o CI falha antes da publicação. Isso não exige que o LLM escreva texto idêntico.
    retrieval = []
    for query, expected in RETRIEVAL_CASES:
        ids = [m['id'] for m in rag_search(query)['matches']]
        rank = ids.index(expected)+1 if expected in ids else None
        retrieval.append({'query':query,'expected':expected,'ids':ids,'recall_at_4':int(rank is not None),
                          'reciprocal_rank':1/rank if rank else 0,'passed':rank is not None})
    quality = []
    for case in json.loads((ROOT/'evaluation/quality-cases.json').read_text())['cases']:
        contexts = {i:read_document(i)['body'] for i in case['context_ids']}
        report = score_judgment(case['question'],case['answer'],contexts,case['citation_ids'],case['judgment'])
        measured = {k:report[k] for k in ['relevance','faithfulness','groundedness']}
        quality.append({'id':case['id'],'metrics':measured,'expected':case['expected'],'passed':measured==case['expected']})
    return {'mode':'offline fixtures, not live LLM scores','retrieval':retrieval,'quality':quality,
            'mean_reciprocal_rank':sum(r['reciprocal_rank'] for r in retrieval)/len(retrieval),
            'passed':all(r['passed'] for r in retrieval+quality)}


if __name__ == '__main__':
    result = run_regression()
    path = ROOT/'evaluation/results.quality.local.json'
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(f"Regressão RAG: {sum(c['passed'] for c in result['retrieval'])}/{len(result['retrieval'])} recuperações; "
          f"{sum(c['passed'] for c in result['quality'])}/{len(result['quality'])} casos de métricas.")
    raise SystemExit(0 if result['passed'] else 1)
