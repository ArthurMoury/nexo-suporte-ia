"""Regressões de recuperação: o transporte é simulado, as funções Python são reais."""
import json
import unittest
from nexo_agent.embeddings import EmbeddingClient, unit_vector, cosine_similarity
from nexo_agent.providers import AgentError
from nexo_agent.rag import rag_search
from nexo_agent.semantic_search import clear_vector_cache, semantic_search
from nexo_agent.orchestrator import run_agent
from test_agent import CONNECTION, openai_call, final


class SemanticSearchTests(unittest.TestCase):
    def setUp(self):
        clear_vector_cache()

    def test_vector_validation_and_cosine(self):
        self.assertAlmostEqual(cosine_similarity(unit_vector([3,4]),unit_vector([6,8])),1)
        for vector in [[],[0,0],[True,1],[float('nan'),1],[float('inf'),1]]:
            with self.assertRaises(AgentError):
                unit_vector(vector)
        with self.assertRaises(AgentError):
            cosine_similarity([1,0],[1])

    def test_embedding_adapter_restores_provider_order(self):
        def transport(url, payload, headers):
            self.assertTrue(url.endswith('/embeddings'))
            self.assertEqual(payload['model'],'text-embedding-3-small')
            self.assertEqual(payload['input'],['primeiro','segundo'])
            return {'data':[{'index':1,'embedding':[0,4]},{'index':0,'embedding':[3,0]}]}
        client=EmbeddingClient(CONNECTION,transport)
        self.assertEqual(client.embed(['primeiro','segundo']),[[1,0],[0,1]])

    def test_gemini_embedding_protocol(self):
        calls=[]
        def transport(url,payload,headers):
            calls.append(payload)
            self.assertTrue(url.endswith('gemini-embedding-001:batchEmbedContents'))
            self.assertEqual(headers,{'x-goog-api-key':'test-key-never-real'})
            return {'embeddings':[{'values':[1,2]}]}
        client=EmbeddingClient({**CONNECTION,'provider':'gemini'},transport)
        client.embed(['política']);client.embed(['dúvida'],query=True)
        self.assertEqual(calls[0]['requests'][0]['taskType'],'RETRIEVAL_DOCUMENT')
        self.assertEqual(calls[1]['requests'][0]['taskType'],'RETRIEVAL_QUERY')

    def test_missing_duplicate_or_nonfinite_embeddings_fail(self):
        for data in [[],[{'index':0,'embedding':[1,0]},{'index':0,'embedding':[0,1]}],
                     [{'index':0,'embedding':[float('nan'),1]},{'index':1,'embedding':[1,0]}]]:
            client=EmbeddingClient(CONNECTION,lambda *_:{'data':data})
            with self.assertRaises(AgentError):client.embed(['a','b'])

    def test_semantic_paraphrase_and_cache_invalidation(self):
        # A pergunta não compartilha palavras com o trecho. Os vetores simulados
        # isolam a matemática do ranking; não medem a qualidade de um modelo real.
        class Embedder:
            namespace=('test','semantic','v1');model='test-embedding';calls=[]
            def embed(self,texts,query=False):
                self.calls.append((texts,query))
                return [[1,0]] if query else [[0,1],[1,0]]
        embedder=Embedder()
        chunks=[{'chunk_id':'a:0','title':'Conta','text':'Atualização de cadastro'},
                {'chunk_id':'b:0','title':'Estorno','text':'Devolução de valores'}]
        self.assertEqual(semantic_search('Quero meu dinheiro de volta',chunks,'revision1',embedder)[0]['chunk_id'],'b:0')
        semantic_search('Outra pergunta',chunks,'revision1',embedder)
        self.assertEqual(len(embedder.calls),3)  # Documentos não são vetorizados novamente.
        semantic_search('Outra pergunta',chunks,'revision2',embedder)
        self.assertEqual(len(embedder.calls),5)  # Alterar a base invalida o índice.

    def test_hybrid_round_trip_uses_real_python_tool_and_exposes_retrieval(self):
        requests=[]
        def llm_transport(*_):
            requests.append(1)
            return openai_call() if len(requests)==1 else final()
        def embedding_transport(url,payload,headers):
            return {'data':[{'index':i,'embedding':[1,0] if 'reembolso' in text.lower() else [0,1]}
                            for i,text in enumerate(payload['input'])]}
        result=run_agent('Qual o prazo de reembolso?',{**CONNECTION,'retrieval_mode':'hybrid'},
                         transport=llm_transport,embedding_transport=embedding_transport)
        self.assertEqual(result['retrievalMode'],'hybrid')
        step=next(t for t in result['trace'] if t['step']=='python')
        self.assertEqual(step['retrieval'],'hybrid-bm25-embeddings')
        self.assertEqual(step['embeddingModel'],'text-embedding-3-small')
        self.assertIn('reembolso',[c['id'] for c in result['citations']])

    def test_lexical_does_not_contact_embedding_provider_and_hybrid_failure_is_explicit(self):
        def unexpected(*_):raise AssertionError('Unexpected embeddings request')
        requests=[]
        def llm(*_):
            requests.append(1);return openai_call() if len(requests)%2 else final()
        self.assertEqual(run_agent('Prazo?',CONNECTION,transport=llm,embedding_transport=unexpected)['retrievalMode'],'lexical')
        def unavailable(*_):raise AgentError('Embeddings indisponíveis')
        with self.assertRaisesRegex(AgentError,'Embeddings indisponíveis'):
            run_agent('Prazo?',{**CONNECTION,'retrieval_mode':'hybrid'},transport=llm,embedding_transport=unavailable)
