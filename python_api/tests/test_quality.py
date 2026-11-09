"""Contraexemplos diferenciam relevância, fidelidade e fundamentação com evidências."""
import copy
import json
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'evaluation'))
from quality import score_judgment
from regression import run_regression
from nexo_agent.rag import read_document


class QualityTests(unittest.TestCase):
    def setUp(self):
        self.case=json.loads((ROOT/'evaluation/quality-cases.json').read_text())['cases'][0]
        self.context={'reembolso':read_document('reembolso')['body']}

    def test_labeled_regression_catches_false_deadline_irrelevance_and_missing_grounding(self):
        result=run_regression()
        self.assertTrue(result['passed'],json.dumps(result,ensure_ascii=False))
        rows={r['id']:r['metrics'] for r in result['quality']}
        self.assertEqual(rows['prazo-inventado-com-citacao']['faithfulness'],0)
        self.assertEqual(rows['fiel-mas-irrelevante']['relevance'],0)
        self.assertEqual(rows['contexto-sustenta-mas-fonte-nao-citada']['groundedness'],0)
        self.assertIsNone(rows['abstencao-sem-afirmacao']['faithfulness'])

    def score(self, judgment):
        return score_judgment(self.case['question'],self.case['answer'],self.context,['reembolso'],judgment)

    def test_judge_cannot_fabricate_quote_or_claim(self):
        for change in ['quote','document','claim']:
            j=copy.deepcopy(self.case['judgment'])
            if change=='quote':j['claims'][0]['evidence'][0]['quote']='Reembolso em 70 dias.'
            if change=='document':j['claims'][0]['evidence'][0]['document_id']='inventado'
            if change=='claim':j['claims'][0]['text']='A resposta nunca disse isso.'
            with self.assertRaises(ValueError):self.score(j)

    def test_judge_score_must_be_finite_and_supported_claim_needs_evidence(self):
        for value in [True,-1,2,float('nan'),float('inf')]:
            j=copy.deepcopy(self.case['judgment']);j['relevance']['score']=value
            with self.assertRaises(ValueError):self.score(j)
        j=copy.deepcopy(self.case['judgment']);j['claims'][0]['evidence']=[]
        with self.assertRaises(ValueError):self.score(j)

    def test_optional_llm_judge_protocol_and_audited_metrics(self):
        from unittest.mock import patch
        from judge import judge
        case=json.loads((ROOT/'evaluation/quality-cases.json').read_text())['cases'][1]
        def transport(url,payload,headers):
            self.assertTrue(url.endswith('/responses'))
            self.assertFalse(payload['store'])
            self.assertEqual(payload['text']['format']['type'],'json_schema')
            self.assertIn('claims',payload['text']['format']['schema']['properties'])
            return {'status':'completed','output':[{'type':'message','content':[
                {'type':'output_text','text':json.dumps(case['judgment'])}]}]}
        with patch.dict('os.environ',{'OPENAI_API_KEY':'test-only-not-real','OPENAI_BASE_URL':'https://api.openai.com/v1'}):
            result=judge(case['question'],case['answer'],self.context,case['citation_ids'],transport=transport)
        self.assertEqual(result['relevance'],1)
        self.assertEqual(result['faithfulness'],0)
        self.assertEqual(result['groundedness'],0)
