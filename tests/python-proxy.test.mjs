import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAgentHandler} from '../src/python-proxy.mjs';
const req=(path,body)=>new Request(`https://nexo.example${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('provider config never exposes server credentials',async()=>{const h=createAgentHandler({env:{OPENAI_API_KEY:'private-server-token',OPENAI_MODEL:'model-test'}});const response=await h(new Request('https://nexo.example/api/config'));const config=await response.json();assert.equal(config.serverConfigured,true);assert.doesNotMatch(JSON.stringify(config),/private-server-token/);});
test('Python transport receives the configured credential, which is absent from the response',async()=>{let received;const h=createAgentHandler({env:{OPENAI_API_KEY:'private-server-token'},fetcher:async(_url,options)=>{received=JSON.parse(options.body);return Response.json({answer:'Resposta real de teste',runtime:'python',provider:'openai',model:'test',trace:[{step:'python',tool:'rag_search'}],citations:[]});}});const response=await h(req('/api/chat',{question:'Como funciona?',connection:{provider:'server',apiKey:'attacker-value'}}));assert.equal(received.connection.api_key,'private-server-token');assert.equal((await response.json()).runtime,'python');});
test('connection test verifies the Python tool and does not return a key',async()=>{const h=createAgentHandler({env:{},fetcher:async()=>Response.json({answer:'teste',runtime:'python',provider:'gemini',model:'gemini-test',trace:[{step:'python',tool:'rag_search'}],citations:[]})});const response=await h(req('/api/connection',{connection:{provider:'gemini',model:'gemini-test',apiKey:'client-only-test-key'}}));const result=await response.json();assert.equal(result.connected,true);assert.deepEqual(result.tools,['rag_search']);assert.doesNotMatch(JSON.stringify(result),/client-only-test-key/);});
test('unconfigured provider and invalid keys fail without a fake AI answer',async()=>{const h=createAgentHandler({env:{}});for(const connection of [{provider:'server'},{provider:'gemini',apiKey:''},{provider:'other'}])assert.equal((await h(req('/api/chat',{question:'oi',connection}))).status,400);});

// Regressão da configuração: o modo de busca atravessa o transporte sem mudar a chave.
test('retrieval mode is opt-in and validated before contacting Python',async()=>{
  let received;
  const h=createAgentHandler({env:{OPENAI_API_KEY:'private-server-token',NEXO_SERVER_EMBEDDINGS:'true'},fetcher:async(_url,options)=>{
    received=JSON.parse(options.body);
    return Response.json({answer:'Teste',runtime:'python',provider:'openai',model:'test',retrievalMode:received.connection.retrieval_mode,trace:[{step:'python',tool:'rag_search'}],citations:[]});
  }});
  await h(req('/api/chat',{question:'Planos?',connection:{provider:'server'}}));
  assert.equal(received.connection.retrieval_mode,'lexical');
  const response=await h(req('/api/connection',{connection:{provider:'server',retrievalMode:'hybrid'}}));
  assert.equal((await response.json()).retrievalMode,'hybrid');
  assert.equal(received.connection.api_key,'private-server-token');
  const rejected=await h(req('/api/chat',{question:'Planos?',connection:{provider:'server',retrievalMode:'arbitrary'}}));
  assert.equal(rejected.status,400);
});

// O gateway atual não oferece o modelo de embeddings: falha antes de gerar custo no LLM.
test('server hybrid retrieval needs explicit embedding capability',async()=>{
  const h=createAgentHandler({env:{OPENAI_API_KEY:'private-server-token'},fetcher:async()=>assert.fail('Must reject before contacting Python')});
  const response=await h(req('/api/connection',{connection:{provider:'server',retrievalMode:'hybrid'}}));
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/chave própria/);
});
