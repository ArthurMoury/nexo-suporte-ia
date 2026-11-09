"""Juiz LLM opcional de relevance, faithfulness e groundedness.

Usa API e pode consumir créditos. Nunca roda automaticamente no chat ou no CI.
Execute: python3 evaluation/judge.py evaluation/judge-sample.json
"""
import argparse
import json
import os
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'python_api'))
from nexo_agent.providers import checked_base, post_json
from nexo_agent.rag import read_document
from quality import JUDGMENT_SCHEMA, RUBRIC, score_judgment


def judge(question, answer, contexts, cited_ids, *, transport=post_json):
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        raise ValueError('Configure OPENAI_API_KEY no ambiente para usar o juiz.')
    # Avaliação separada da geração: o juiz recebe a pergunta, a resposta e os trechos,
    # sem assumir que o modelo que respondeu está correto ou que citar basta.
    payload = {
        'model':os.environ.get('JUDGE_MODEL','gpt-4.1-mini'), 'store':False,
        'instructions':RUBRIC, 'max_output_tokens':2500,
        'input':json.dumps({'question':question,'answer':answer,'contexts':contexts},ensure_ascii=False),
        'text':{'format':{'type':'json_schema','name':'rag_quality','strict':True,'schema':JUDGMENT_SCHEMA}}}
    body = transport(checked_base('openai',os.environ.get('OPENAI_BASE_URL'))+'/responses',payload,
                     {'Authorization':'Bearer '+key})
    if body.get('status') == 'incomplete':
        raise ValueError('O juiz não concluiu a avaliação.')
    text = ''.join(c['text'] for i in body.get('output',[]) if i.get('type')=='message'
                   for c in i.get('content',[]) if c.get('type')=='output_text')
    return score_judgment(question, answer, contexts, cited_ids, json.loads(text))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sample',type=Path,help='JSON com question, answer e article_ids (ou contexts e citation_ids).')
    args = parser.parse_args()
    sample = json.loads(args.sample.read_text())
    # Prefira contexts com os trechos efetivamente usados. article_ids é compatibilidade
    # para avaliar explicitamente contra documentos inteiros da versão local atual.
    contexts = sample.get('contexts')
    if contexts is None:
        contexts = {i:read_document(i)['body'] for i in sample['article_ids']}
    result = judge(sample['question'],sample['answer'],contexts,sample.get('citation_ids',sample.get('article_ids',[])))
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
