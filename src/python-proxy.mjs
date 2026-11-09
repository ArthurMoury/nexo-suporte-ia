import deployment from '../python-deployment.json' with {type:'json'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
// A recuperação só usa embeddings quando a pessoa seleciona esse modo no perfil.
function selectConnection(input,env){
  if(!input||typeof input!=='object'||Array.isArray(input))input={provider:'server'};
  const retrievalMode=input.retrievalMode||'lexical';
  if(!['lexical','hybrid'].includes(retrievalMode))throw new Error('Modo de recuperação inválido.');
  if(input.provider==='server'||!input.provider){
    if(retrievalMode==='hybrid'&&env.NEXO_SERVER_EMBEDDINGS!=='true')throw new Error('A conexão do servidor não oferece embeddings. Conecte uma chave própria da OpenAI ou Gemini para usar busca híbrida.');
    if(env.DISABLE_AI==='true'||!env.OPENAI_API_KEY)throw new Error('A conexão do servidor não está disponível. Conecte sua API no perfil Arthur Moury.');
    return {provider:'openai',api_key:env.OPENAI_API_KEY,model:env.OPENAI_MODEL||'gpt-4.1-mini',base_url:env.OPENAI_BASE_URL||'https://api.openai.com/v1',retrieval_mode:retrievalMode};
  }
  if(!['gemini','openai'].includes(input.provider))throw new Error('Provedor inválido.');
  if(typeof input.apiKey!=='string'||input.apiKey.length<10||input.apiKey.length>500)throw new Error('Informe uma chave de API válida no perfil Arthur Moury.');
  return {provider:input.provider,api_key:input.apiKey,model:input.model||(input.provider==='gemini'?'gemini-3.8-flash':'gpt-4.1-mini'),retrieval_mode:retrievalMode};
}
async function readBody(request){
  const reader=request.body?.getReader();if(!reader)throw new Error('Corpo vazio.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>45000){await reader.cancel();const error=new Error('Solicitação muito grande.');error.status=413;throw error;}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(buffer));
}
export function createAgentHandler({env=process.env,fetcher=fetch}={}){
  return async request=>{
    const path=new URL(request.url).pathname;
    if(path==='/api/config'&&request.method==='GET')return json({serverConfigured:Boolean(env.OPENAI_API_KEY)&&env.DISABLE_AI!=='true',provider:'openai',model:env.OPENAI_MODEL||'gpt-4.1-mini',runtime:'python',serverEmbeddingsConfigured:env.NEXO_SERVER_EMBEDDINGS==='true'});
    if(request.method!=='POST')return json({error:'Use POST.'},405);
    if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Envie JSON.'},415);
    const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem não permitida.'},403);
    let payload,connection;
    try{payload=await readBody(request);if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Envie um objeto JSON.');connection=selectConnection(payload.connection,env);}catch(error){return json({error:error instanceof SyntaxError?'JSON inválido.':error.message},error.status||400);}
    const testing=path==='/api/connection';
    const question=testing?'Qual é o prazo para solicitar reembolso?':payload.question;
    if(typeof question!=='string'||!question.trim()||question.length>1200)return json({error:'Escreva uma pergunta de 1 a 1.200 caracteres.'},400);
    const history=testing?[]:(payload.history||[]);
    if(!Array.isArray(history)||history.length>8)return json({error:'Histórico inválido.'},400);
    try{
      const response=await fetcher(env.NEXO_PYTHON_URL||deployment.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,history,connection}),signal:AbortSignal.timeout(55000),redirect:'error'});
      const result=await response.json();
      if(!response.ok)return json({error:typeof result.error==='string'?result.error:'O backend Python não concluiu a consulta.'},response.status>=400&&response.status<600?response.status:502);
      if(typeof result.answer!=='string'||result.runtime!=='python'||!Array.isArray(result.trace)||!Array.isArray(result.citations))throw new Error('Invalid response');
      if(testing)return json({connected:true,provider:result.provider,model:result.model,runtime:'python',retrievalMode:result.retrievalMode||'lexical',tools:result.trace.filter(t=>t.step==='python').map(t=>t.tool)});
      return json(result);
    }catch{return json({error:'Não foi possível concluir a consulta no backend Python. Tente novamente.'},502);}
  };
}
