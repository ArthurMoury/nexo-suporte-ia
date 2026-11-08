"""HTTP adapters. API keys are request-scoped, never written to disk or logs."""
import json
import re
from urllib.error import HTTPError,URLError
from urllib.parse import urlparse,quote
from urllib.request import Request,build_opener,HTTPRedirectHandler
class AgentError(Exception):
    def __init__(self,message,status=502):self.status=status;super().__init__(message)
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None

def checked_base(provider,base):
    if provider=='gemini':return 'https://generativelanguage.googleapis.com/v1beta'
    base=(base or 'https://api.openai.com/v1').rstrip('/');parsed=urlparse(base);host=parsed.hostname or ''
    trusted=host=='api.openai.com' or any(host.endswith('.'+s) for s in ['netlify.app','netlify.com','netlify.ai']) or host in ['netlify.app','netlify.com','netlify.ai']
    if parsed.scheme!='https' or parsed.username or parsed.password or parsed.port or not trusted or parsed.query or parsed.fragment:raise AgentError('Endereço do provedor não permitido.',400)
    return base if base.endswith('/v1') else base+'/v1'

def post_json(url,body,headers):
    request=Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json',**headers},method='POST')
    try:
        with build_opener(NoRedirect()).open(request,timeout=18) as response:return json.loads(response.read(2_000_000))
    except HTTPError as error:
        messages={400:'O provedor rejeitou a solicitação. Confira o modelo e a chave.',401:'A chave de API não foi aceita. Confira a conexão no perfil.',403:'A chave não tem permissão para esse modelo ou serviço.',404:'Modelo não encontrado. Confira o nome nas configurações.',429:'Limite ou cota do provedor atingido. Aguarde ou confira sua conta.'}
        raise AgentError(messages.get(error.code,'O provedor de IA não concluiu a solicitação.'),429 if error.code==429 else 502) from None
    except (URLError,TimeoutError,ValueError):raise AgentError('Não foi possível concluir a conexão com o provedor de IA.') from None

def validate_model(model):
    if not isinstance(model,str) or not re.fullmatch(r'[a-zA-Z0-9._-]{1,80}',model):raise AgentError('Nome de modelo inválido.',400)
    return model

class Provider:
    def __init__(self,provider,api_key,model,base_url=None,transport=post_json):
        if provider not in ['gemini','openai']:raise AgentError('Provedor inválido.',400)
        if not isinstance(api_key,str) or not 10<=len(api_key)<=500:raise AgentError('Conecte uma API no perfil Arthur Moury para conversar.',400)
        self.provider,self.key,self.model=provider,api_key,validate_model(model)
        self.base=checked_base(provider,base_url);self.transport=transport
    def generate(self,messages,tools,instructions,first=False):
        if self.provider=='openai':
            payload={'model':self.model,'messages':[{'role':'system','content':instructions},*messages],'tools':[{'type':'function','function':t} for t in tools],'tool_choice':{'type':'function','function':{'name':'rag_search'}} if first else 'auto','parallel_tool_calls':False,'max_tokens':1000,'temperature':.2,'store':False}
            body=self.transport(self.base+'/chat/completions',payload,{'Authorization':'Bearer '+self.key});choices=body.get('choices',[])
            if not choices or choices[0].get('finish_reason')=='length':raise AgentError('O modelo não concluiu a resposta. Tente novamente.')
            message=choices[0].get('message',{})
            return {'raw':message,'calls':[{'name':c['function']['name'],'arguments':c['function']['arguments'],'id':c['id']} for c in message.get('tool_calls',[])],'text':message.get('content') or ''}
        payload={'contents':messages,'systemInstruction':{'parts':[{'text':instructions}]},'tools':[{'functionDeclarations':tools}],'toolConfig':{'functionCallingConfig':{'mode':'ANY','allowedFunctionNames':['rag_search']} if first else {'mode':'AUTO'}},'generationConfig':{'temperature':.2,'maxOutputTokens':1500}}
        body=self.transport(self.base+'/models/'+quote(self.model,safe='')+':generateContent',payload,{'x-goog-api-key':self.key});candidates=body.get('candidates',[])
        if not candidates or candidates[0].get('finishReason') not in [None,'STOP']:raise AgentError('O Gemini não concluiu uma resposta válida. Confira o modelo e tente novamente.')
        raw=candidates[0].get('content',{})
        calls=[{'name':p['functionCall']['name'],'arguments':p['functionCall'].get('args',{}),'id':p['functionCall'].get('id')} for p in raw.get('parts',[]) if p.get('functionCall')]
        return {'raw':raw,'calls':calls,'text':'\n'.join(p['text'] for p in raw.get('parts',[]) if p.get('text') and not p.get('thought'))}
