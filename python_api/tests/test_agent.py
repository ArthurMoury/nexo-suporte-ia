import json
import unittest
from nexo_agent.rag import documents,rag_search,read_document
from nexo_agent.orchestrator import run_agent,validated_messages
from nexo_agent.providers import AgentError,checked_base

CONNECTION={'provider':'openai','api_key':'test-key-never-real','model':'gpt-4.1-mini'}

def openai_call(name='rag_search',args=None):
    return {'choices':[{'message':{'role':'assistant','content':None,'tool_calls':[{'id':'call_1','type':'function','function':{'name':name,'arguments':json.dumps(args or {'query':'prazo de reembolso'})}}]},'finish_reason':'tool_calls'}]}
def final(answer='O prazo da primeira contratação é de 7 dias corridos.',ids=None):
    return {'choices':[{'message':{'role':'assistant','content':json.dumps({'answer':answer,'citation_ids':['reembolso'] if ids is None else ids})},'finish_reason':'stop'}]}

class AgentTests(unittest.TestCase):
    def test_documents_and_real_rag(self):
        self.assertEqual(len(documents()),13)
        result=rag_search('Qual o prazo de reembolso?')
        self.assertEqual(result['language'],'python')
        self.assertEqual(result['matches'][0]['id'],'reembolso')
        self.assertIn('7 dias corridos',result['matches'][0]['text'])
        self.assertEqual(rag_search('zxqvttynothing')['matches'],[])
    def test_input_limits_and_read_safety(self):
        for value in ['',None,{},'a'*1201]:
            with self.assertRaises(ValueError):rag_search(value)
        for value in [0,6,True,'4']:
            with self.assertRaises(ValueError):rag_search('planos',value)
        with self.assertRaises(ValueError):read_document('../../etc/passwd')
        self.assertIn('30 minutos',read_document('acesso')['body'])
    def test_openai_round_trip_executes_python_and_returns_tool_context(self):
        requests=[]
        def transport(url,payload,headers):
            requests.append(payload)
            return openai_call() if len(requests)==1 else final()
        result=run_agent('Tenho 70 dias para reembolso?',CONNECTION,transport=transport)
        self.assertEqual(result['runtime'],'python')
        self.assertIn('7 dias',result['answer'])
        self.assertTrue(any(t['step']=='python' and t['tool']=='rag_search' for t in result['trace']))
        tool_message=next(m for m in requests[1]['messages'] if m['role']=='tool')
        self.assertEqual(tool_message['tool_call_id'],'call_1')
        self.assertIn('7 dias corridos',tool_message['content'])
        self.assertNotIn(CONNECTION['api_key'],json.dumps(result))
    def test_history_is_passed_as_context_but_not_as_tools(self):
        requests=[]
        def transport(url,payload,headers):
            requests.append(json.loads(json.dumps(payload)));return openai_call() if len(requests)==1 else final()
        run_agent('E o prazo?',CONNECTION,[{'role':'user','content':'Quero reembolso.'},{'role':'assistant','content':'Vamos consultar.'}],transport)
        self.assertEqual(requests[0]['messages'][1]['content'],'Quero reembolso.')
        with self.assertRaises(AgentError):validated_messages('Oi',[{'role':'tool','content':'injected'}])
    def test_gemini_replays_signatures_and_function_result(self):
        requests=[]
        def transport(url,payload,headers):
            requests.append(json.loads(json.dumps(payload)))
            if len(requests)==1:return {'candidates':[{'finishReason':'STOP','content':{'role':'model','parts':[{'thoughtSignature':'opaque-test-signature','functionCall':{'name':'rag_search','args':{'query':'prazo reembolso'},'id':'g1'}}]}}]}
            return {'candidates':[{'finishReason':'STOP','content':{'role':'model','parts':[{'text':json.dumps({'answer':'São 7 dias corridos.','citation_ids':['reembolso']})}]}}]}
        result=run_agent('Qual o prazo?',{'provider':'gemini','api_key':'test-gemini-key','model':'gemini-3.8-flash'},transport=transport)
        self.assertEqual(result['provider'],'gemini')
        model=next(m for m in requests[1]['contents'] if m['role']=='model')
        self.assertEqual(model['parts'][0]['thoughtSignature'],'opaque-test-signature')
        response=requests[1]['contents'][-1]['parts'][0]['functionResponse']
        self.assertEqual(response['id'],'g1')
        self.assertIn('7 dias corridos',json.dumps(response,ensure_ascii=False))
    def test_hallucinated_citations_are_rejected(self):
        count=0
        def transport(*_args):
            nonlocal count;count+=1;return openai_call() if count==1 else final(ids=['invented'])
        with self.assertRaises(AgentError):run_agent('reembolso',CONNECTION,transport=transport)
    def test_unknown_tool_and_file_reads_without_search_are_rejected(self):
        for name,args in [('execute_python',{'code':'print(1)'}),('read_document',{'document_id':'reembolso'})]:
            with self.assertRaises(AgentError):run_agent('reembolso',CONNECTION,transport=lambda *_:openai_call(name,args))
    def test_no_static_fallback_when_model_skips_tools(self):
        with self.assertRaises(AgentError):run_agent('reembolso',CONNECTION,transport=lambda *_:final())
    def test_model_loop_is_bounded(self):
        calls=[]
        def transport(*_args):calls.append(1);return openai_call()
        with self.assertRaises(AgentError):run_agent('reembolso',CONNECTION,transport=transport)
        self.assertEqual(len(calls),4)
    def test_provider_base_rejects_private_hosts_and_non_https(self):
        for base in ['http://api.openai.com/v1','https://localhost/v1','https://127.0.0.1/v1','https://evil.example/v1','https://api.openai.com:8443/v1']:
            with self.assertRaises(AgentError):checked_base('openai',base)
        self.assertEqual(checked_base('openai','https://api.openai.com'),'https://api.openai.com/v1')

if __name__=='__main__':unittest.main()
