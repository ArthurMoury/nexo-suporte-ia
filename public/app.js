const $ = selector => document.querySelector(selector);
const nodes = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
// The main navigation has its own state, independent of the sources panel.
const app = $('.app');
const sidebar = $('#main-sidebar');
const sidebarToggle = $('#sidebar-toggle');
const mobileSidebar = matchMedia('(max-width:650px)');
let sidebarOpen = false;
function preferredSidebarState() {
  try {
    const saved = sessionStorage.getItem(`nexo-ia-sidebar-${mobileSidebar.matches ? 'mobile' : 'desktop'}`);
    if (saved !== null) return saved === 'open';
  } catch { /* Use responsive defaults if session storage is unavailable. */ }
  return !mobileSidebar.matches;
}
function setSidebarOpen(open, {remember = true, focus = false} = {}) {
  const wasInside = sidebar.contains(document.activeElement);
  // Restore focus before making a closing drawer inaccessible.
  if (!open && wasInside) {
    $('.content').inert = false;
    sidebarToggle.focus({preventScroll:true});
  }
  sidebarOpen = open;
  app.classList.toggle('sidebar-collapsed', !open);
  app.classList.toggle('sidebar-open', open);
  sidebar.inert = !open;
  sidebar.setAttribute('aria-hidden', String(!open));
  sidebarToggle.setAttribute('aria-expanded', String(open));
  const label = open ? 'Fechar menu lateral' : 'Abrir menu lateral';
  sidebarToggle.setAttribute('aria-label', label);
  sidebarToggle.title = label;
  // O desenho acompanha a ação: esquerda fecha, direita abre. aria-expanded comunica o estado.
  $('#sidebar-direction').setAttribute('d', open ? 'm16 9-3 3 3 3' : 'm13 9 3 3-3 3');
  $('.content').inert = mobileSidebar.matches && open;
  document.body.classList.toggle('menu-modal-open', mobileSidebar.matches && open);
  if (mobileSidebar.matches && open) {
    sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true');
    if (focus) $('#sidebar-close').focus({preventScroll:true});
  } else {
    sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal');
    if (focus && !open) sidebarToggle.focus({preventScroll:true});
  }
  if (remember) {
    try { sessionStorage.setItem(`nexo-ia-sidebar-${mobileSidebar.matches ? 'mobile' : 'desktop'}`, open ? 'open' : 'closed'); }
    catch { /* The control remains available without persisted preferences. */ }
  }
}
sidebarToggle.addEventListener('click', () => setSidebarOpen(!sidebarOpen, {focus:true}));
$('#sidebar-close').addEventListener('click', () => setSidebarOpen(false, {focus:true}));
$('.sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false, {focus:true}));
mobileSidebar.addEventListener('change', () => setSidebarOpen(preferredSidebarState(), {remember:false, focus:true}));
document.addEventListener('keydown', event => {
  if (!sidebarOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); setSidebarOpen(false, {focus:true}); }
  if (event.key === 'Tab' && mobileSidebar.matches) {
    const focusable = [...sidebar.querySelectorAll('a[href],button:not(:disabled),summary')]
      .filter(el => el.getClientRects().length && !el.closest('details:not([open]) > :not(summary)'));
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
setSidebarOpen(preferredSidebarState(), {remember:false, focus:true});
requestAnimationFrame(() => app.classList.add('sidebar-ready'));

const storageKey='nexo-ia-llm-conversations-v3';
let knowledge;
let busy=false;
let activeId=null;
let conversations=[];
let serverConfig={serverConfigured:false,serverEmbeddingsConfigured:false,provider:'openai',model:'gpt-4.1-mini'};
let connection={provider:'server',model:'gpt-4.1-mini',apiKey:'',retrievalMode:'lexical'};
const drafts=new Map();
// Modelo e modo podem persistir na sessão; a credencial continua apenas em memória.
function validResult(r){return r&&typeof r.answer==='string'&&r.answer.length<=10000&&r.runtime==='python'&&Array.isArray(r.citations)&&r.citations.every(c=>typeof c.id==='string'&&typeof c.title==='string')&&Array.isArray(r.trace);}
try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))conversations=saved.filter(c=>c&&typeof c.id==='string'&&typeof c.title==='string'&&Array.isArray(c.turns)&&c.turns.every(t=>typeof t.question==='string'&&validResult(t.result))).slice(0,12).map(c=>({id:c.id,title:c.title.slice(0,80),turns:c.turns.slice(-20)}));const prefs=JSON.parse(sessionStorage.getItem('nexo-api-preferences')||'null');if(prefs&&['server','gemini','openai'].includes(prefs.provider))connection={provider:prefs.provider,model:typeof prefs.model==='string'?prefs.model:'gemini-3.8-flash',apiKey:'',retrievalMode:prefs.retrievalMode==='hybrid'?'hybrid':'lexical'};}catch{}
function saveConversations(){try{sessionStorage.setItem(storageKey,JSON.stringify(conversations));}catch{}}
function currentConversation(){return conversations.find(c=>c.id===activeId);}
function switchView(name){document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`${name}-view`);document.querySelectorAll('.nav').forEach(el=>{const active=el.dataset.view===name;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});if(mobileSidebar.matches&&sidebarOpen)setSidebarOpen(false);$('#main').focus({preventScroll:true});if(name==='chat')adjustComposer();}
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>switchView(el.dataset.view)));
function setSourcesOpen(open){$('#chat-view').classList.toggle('sources-open',open);$('#context-toggle').setAttribute('aria-expanded',String(open));$('#context-panel').hidden=!open;}
$('#context-toggle').addEventListener('click',()=>setSourcesOpen($('#context-toggle').getAttribute('aria-expanded')!=='true'));
function adjustComposer(){const input=$('#question');input.style.height='0px';input.style.height=`${Math.max(28,Math.min(input.scrollHeight,180))}px`;input.style.overflowY=input.scrollHeight>180?'auto':'hidden';$('#counter').textContent=input.value.length>1000?`${input.value.length}/1200`:'';}
$('#question').addEventListener('input',adjustComposer);
$('#question').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!busy)$('#chat-form').requestSubmit();}});
function showWelcome(){const el=nodes('div','welcome chat-welcome');const logo=nodes('img','welcome-logo');logo.src='/logo.svg';logo.alt='';logo.width=64;logo.height=64;el.append(logo,nodes('h1','','Como posso ajudar?'),nodes('p','','Converse com o assistente. As respostas consultam os documentos da Nexo.'));$('#messages').append(el);}
function clearSources(){$('#source-count').textContent='0';$('#sources').replaceChildren(nodes('p','empty-source','As fontes recuperadas pelo agente aparecem aqui.'));$('#trace').replaceChildren(nodes('li','','Aguardando sua mensagem'));}
function historyIcon(){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 1 1 18 0Z');svg.append(path);return svg;}
function historyButton(c){const button=nodes('button','history-item');button.title=c.title;button.classList.toggle('active',c.id===activeId);if(c.id===activeId)button.setAttribute('aria-current','true');button.disabled=busy;button.append(historyIcon(),nodes('span','',c.title));button.addEventListener('click',()=>openConversation(c.id));return button;}
function renderHistory(){$('#history-count').textContent=conversations.length;$('#history-list').replaceChildren(...conversations.map(historyButton));if(!conversations.length)$('#history-list').append(nodes('p','history-empty','Suas conversas aparecem aqui.'));$('#mobile-history-list').replaceChildren(...conversations.map(historyButton));}
function openConversation(id){if(busy)return;drafts.set(activeId,$('#question').value);activeId=id;const c=currentConversation();if(!c)return;$('#messages').replaceChildren();clearSources();setSourcesOpen(false);c.turns.forEach(t=>{message('user',t.question);renderAnswer(t.result);});if(!c.turns.length)showWelcome();else updateSources(c.turns.at(-1).result);$('#question').value=drafts.get(id)||'';$('#request-status').textContent='';switchView('chat');renderHistory();adjustComposer();$('#messages').scrollTop=$('#messages').scrollHeight;}
function newConversation(){if(busy)return;drafts.set(activeId,$('#question').value);activeId=null;$('#messages').replaceChildren();showWelcome();clearSources();setSourcesOpen(false);$('#question').value='';$('#request-status').textContent='';switchView('chat');renderHistory();adjustComposer();$('#question').focus({preventScroll:true});}
$('#reset').addEventListener('click',newConversation);
function updateSources(result){$('#source-count').textContent=result.citations.length;$('#sources').replaceChildren();result.citations.forEach(source=>{const doc=knowledge?.articles.find(a=>a.id===source.id);const details=nodes('details','source');details.id=`source-${source.id}`;details.append(nodes('summary','',source.title),nodes('small','',source.category||'Documento'),nodes('p','',source.excerpt||doc?.body||'Documento consultado.'));$('#sources').append(details);});if(!result.citations.length)$('#sources').append(nodes('p','empty-source','Nenhum documento foi citado nesta resposta.'));$('#trace').replaceChildren(...result.trace.map(step=>{const li=nodes('li','',step.label);if(step.step==='tool_call'&&step.arguments){const args=nodes('pre','trace-arguments',JSON.stringify(step.arguments,null,2));li.append(args);}if(step.step==='python')li.append(nodes('small','trace-runtime',`Python · ${(step.documentIds||[]).length} documento(s) · ${step.durationMs} ms${step.retrieval?` · ${step.retrieval}`:''}${step.embeddingModel?` · ${step.embeddingModel}`:''}`));return li;}));}
function message(role,text){const el=nodes('article',`message ${role}`);if(role==='assistant'){const header=nodes('div','message-header');const logo=nodes('img');logo.src='/logo.svg';logo.alt='';header.append(logo,nodes('strong','','Assistente Nexo'));el.append(header);}if(text)el.append(nodes('p',role==='user'?'':'message-text',text));$('#messages').append(el);return el;}
function renderAnswer(result){const el=message('assistant',result.answer);el.querySelector('.message-header').append(nodes('small','',`${result.provider==='gemini'?'Gemini':'OpenAI'} · ${result.model}`));const meta=nodes('div','message-meta');result.citations.forEach(source=>{const button=nodes('button','citation-chip',`▤ ${source.title}`);button.addEventListener('click',()=>{updateSources(result);setSourcesOpen(true);const target=document.getElementById(`source-${source.id}`);if(target){target.open=true;target.scrollIntoView({block:'nearest'});}});meta.append(button);});el.append(meta);return el;}
function hasConnection(){return connection.provider==='server'?serverConfig.serverConfigured:Boolean(connection.apiKey);}
function requestConnection(){return connection.provider==='server'?{provider:'server',retrievalMode:connection.retrievalMode}:{provider:connection.provider,model:connection.model,apiKey:connection.apiKey,retrievalMode:connection.retrievalMode};}
async function sendQuestion(event){event.preventDefault();if(busy)return;const q=$('#question').value.trim();if(!q)return;if(!hasConnection()){openConnection('Conecte uma API para começar a conversar.');return;}let c=currentConversation();if(!c){c={id:crypto.randomUUID(),title:q.slice(0,80),turns:[]};conversations.unshift(c);conversations=conversations.slice(0,12);activeId=c.id;}busy=true;$('#send').disabled=true;$('#reset').disabled=true;$('#connection-open').disabled=true;$('#question').readOnly=true;renderHistory();$('.welcome')?.remove();const userMessage=message('user',q);$('#question').value='';adjustComposer();const loading=nodes('div','message loading','Consultando o modelo e os documentos…');$('#messages').append(loading);loading.scrollIntoView({block:'nearest'});$('#request-status').textContent='';$('#request-status').className='request-status';try{const history=c.turns.slice(-4).flatMap(t=>[{role:'user',content:t.question},{role:'assistant',content:t.result.answer.slice(0,2500)}]);const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,history,connection:requestConnection()}),signal:AbortSignal.timeout(60000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'A consulta não foi concluída.');if(!validResult(result))throw new Error('A resposta não pôde ser validada. Tente novamente.');loading.remove();const el=renderAnswer(result);c.turns.push({question:q,result});c.turns=c.turns.slice(-20);conversations=[c,...conversations.filter(x=>x.id!==c.id)].slice(0,12);drafts.delete(activeId);saveConversations();updateSources(result);el.scrollIntoView({block:'nearest'});}catch(error){loading.remove();userMessage.remove();if(!c.turns.length)conversations=conversations.filter(x=>x.id!==c.id);$('#question').value=q;adjustComposer();$('#request-status').className='request-status error';$('#request-status').textContent=error.name==='TimeoutError'?'A consulta demorou demais. Tente novamente.':error.message;}finally{busy=false;$('#send').disabled=false;$('#reset').disabled=false;$('#connection-open').disabled=false;$('#question').readOnly=false;renderHistory();$('#question').focus({preventScroll:true});}}
$('#chat-form').addEventListener('submit',sendQuestion);
$('#profile-button').addEventListener('click',()=>{const open=$('#profile-menu').hidden;$('#profile-menu').hidden=!open;$('#profile-button').setAttribute('aria-expanded',String(open));});
document.addEventListener('click',e=>{if(!e.target.closest('.profile-area')){$('#profile-menu').hidden=true;$('#profile-button').setAttribute('aria-expanded','false');}});
function updateConnectionLabel(){const connected=hasConnection();const name=connection.provider==='server'?`Servidor · ${serverConfig.model}`:connection.provider==='gemini'?'Gemini':'OpenAI';$('#connection-label').textContent=connected?`${name} conectado`:'Conectar API';$('#active-model').textContent=connected?name:'Conecte uma API no perfil';}
function providerFields() {const provider=$('#provider').value;const server=provider==='server';const available=!server||serverConfig.serverEmbeddingsConfigured;$('#retrieval-mode option[value=hybrid]').disabled=!available;if(!available)$('#retrieval-mode').value='lexical';$('.retrieval-help').textContent=available?'O modo híbrido usa um modelo de embeddings pela API conectada e pode consumir créditos adicionais. A disponibilidade depende do provedor.':'Esta conexão do servidor usa BM25. Para ativar busca híbrida com embeddings, conecte sua própria chave OpenAI ou Gemini.';$('#model-field').hidden=server;$('#key-field').hidden=server;$('#server-connection-info').hidden=!server;$('#server-connection-info').textContent=serverConfig.serverConfigured?`Conexão disponível no servidor: ${serverConfig.model}. A chave não é enviada ao navegador.`:'A conexão do servidor não está disponível. Selecione Gemini ou OpenAI e informe sua chave.';$('#get-api-key').hidden=provider!=='gemini';$('.connection-privacy').textContent=server?'A chave da conexão do servidor não é enviada ao navegador nem incluída no histórico. Suas mensagens e os trechos recuperados são enviados ao provedor de IA pelo backend.':'A chave fica somente na memória desta aba. Ela é enviada por HTTPS ao backend para consultar o provedor e não entra no histórico. Recarregar a página desconecta sua chave.';}
function openConnection(note=''){$('#profile-menu').hidden=true;$('#profile-button').setAttribute('aria-expanded','false');if(mobileSidebar.matches&&sidebarOpen)setSidebarOpen(false);$('#provider').value=connection.provider;$('#retrieval-mode').value=connection.retrievalMode;$('#model').value=connection.model;$('#api-key').value='';$('#api-key').placeholder=connection.apiKey?'Chave já conectada nesta aba. Deixe vazio para manter.':'Cole a chave do provedor';$('#connection-status').textContent=note;$('#connection-status').className='';providerFields();$('#connection-dialog').showModal();}
$('#connection-open').addEventListener('click',()=>openConnection());
$('#connection-close').addEventListener('click',()=>$('#connection-dialog').close());
$('#connection-dialog').addEventListener('close',()=>{$('#api-key').value='';});
$('#provider').addEventListener('change',()=>{$('#model').value=$('#provider').value==='gemini'?'gemini-3.8-flash':'gpt-4.1-mini';$('#api-key').value='';providerFields();});
$('#connection-form').addEventListener('submit',async event=>{event.preventDefault();const provider=$('#provider').value;const apiKey=$('#api-key').value.trim()||(provider===connection.provider?connection.apiKey:'');const retrievalMode=$('#retrieval-mode').value;const candidate=provider==='server'?{provider:'server',retrievalMode}:{provider,model:$('#model').value.trim(),apiKey,retrievalMode};$('#connect').disabled=true;$('#disconnect').disabled=true;for(const id of ['provider','model','api-key','retrieval-mode'])$('#'+id).disabled=true;$('#connection-status').className='';$('#connection-status').textContent='Testando o modelo e a chamada da ferramenta Python…';try{const response=await fetch('/api/connection',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connection:candidate}),signal:AbortSignal.timeout(60000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível conectar.');connection={provider,model:result.model,apiKey:provider==='server'?'':apiKey,retrievalMode};try{sessionStorage.setItem('nexo-api-preferences',JSON.stringify({provider:connection.provider,model:connection.model,retrievalMode:connection.retrievalMode}));}catch{}$('#api-key').value='';$('#api-key').placeholder='Chave conectada nesta aba.';$('#connection-status').className='success';$('#connection-status').textContent=`Conectado: ${result.model}. Ferramenta Python verificada: ${result.tools.join(', ')}. Busca: ${retrievalMode==='hybrid'?'híbrida com embeddings':'BM25'}.`;updateConnectionLabel();}catch(error){$('#connection-status').className='error';$('#connection-status').textContent=error.name==='TimeoutError'?'O teste demorou demais. Tente novamente.':error.message;}finally{$('#connect').disabled=false;$('#disconnect').disabled=false;for(const id of ['provider','model','api-key','retrieval-mode'])$('#'+id).disabled=false;}});
$('#disconnect').addEventListener('click',()=>{connection={provider:'gemini',model:'gemini-3.8-flash',apiKey:'',retrievalMode:'lexical'};$('#provider').value='gemini';$('#retrieval-mode').value='lexical';$('#model').value=connection.model;$('#api-key').value='';$('#api-key').placeholder='Cole a chave do provedor';try{sessionStorage.setItem('nexo-api-preferences',JSON.stringify({provider:'gemini',model:connection.model}));}catch{}providerFields();updateConnectionLabel();$('#connection-status').className='';$('#connection-status').textContent='Conexão removida desta aba.';});
function renderKnowledge(filter=''){const norm=t=>t.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();const articles=knowledge.articles.filter(a=>norm(`${a.title} ${a.category} ${a.body}`).includes(norm(filter)));$('#article-count').textContent=`${articles.length} ${articles.length===1?'artigo':'artigos'}`;$('#knowledge-list').replaceChildren(...articles.map(a=>{const el=nodes('details');el.id=`article-${a.id}`;el.append(nodes('summary','',a.title),nodes('p','',a.body),nodes('small','',`${a.category} · Documento Markdown`));return el;}));if(!articles.length)$('#knowledge-list').append(nodes('p','','Nenhum artigo encontrado. Tente outro termo.'));}
showWelcome();renderHistory();clearSources();adjustComposer();updateConnectionLabel();
try{const response=await fetch('/api/config');if(response.ok){serverConfig=await response.json();if(connection.provider==='server'){connection.model=serverConfig.model;if(!serverConfig.serverEmbeddingsConfigured)connection.retrievalMode='lexical';}}updateConnectionLabel();}catch{}
try{const response=await fetch('/knowledge.json');if(!response.ok)throw new Error('base');knowledge=await response.json();renderKnowledge();knowledge.demoAccounts.forEach(a=>{const row=nodes('tr');[a.name,a.plan,a.seats,a.projects].forEach(value=>row.append(nodes('td','',value)));$('#accounts').append(row);});knowledge.demoTickets.forEach(t=>{const row=nodes('div','ticket-row');const title=nodes('div','',t.topic);title.append(nodes('small','',t.id));row.append(title,nodes('span','',t.status==='resolved'?'Resolvido':'Aguardando humano'));$('#tickets').append(row);});}catch{$('#knowledge-list').append(nodes('p','','Não foi possível carregar os documentos. Recarregue a página.'));}
$('#knowledge-search').addEventListener('input',e=>{if(knowledge)renderKnowledge(e.target.value);});window.addEventListener('resize',adjustComposer);
