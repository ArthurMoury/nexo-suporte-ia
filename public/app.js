import {indexFlow, resolvePath, solutionFor, handoffFor} from './support-flow.js';
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

const storageKey = 'nexo-ia-support-sessions-v2';
let knowledge, flow;
let ready = false;
let activeId = null;
let conversations = [];
let examples = [];
const emptySession = () => ({path:[], status:'active'});
function currentSession() { return [...conversations, ...examples].find(s => s.id === activeId) || emptySession(); }
function saveSessions() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(conversations)); } catch { /* In-memory support also works without browser storage. */ }
}
function restoreSessions() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(saved)) return;
    conversations = saved.filter(s => {
      if (!s || typeof s.id !== 'string' || typeof s.title !== 'string' || !['active','resolved','handoff'].includes(s.status)) return false;
      try {
        const path = resolvePath(flow, s.path);
        return s.status !== 'resolved' || !!path.at(-1)?.solution;
      } catch { return false; }
    }).slice(0,12).map(s => ({id:s.id, title:s.title.slice(0,80), path:s.path, status:s.status}));
  } catch { /* Keep an empty history when storage is absent or invalid. */ }
}
function editableSession() {
  let session = currentSession();
  if (!session.id || session.example) {
    session = {id:crypto.randomUUID(), title:'Atendimento guiado', path:[...session.path], status:session.status};
    conversations.unshift(session); conversations = conversations.slice(0,12); activeId = session.id;
  }
  return session;
}
function recordSession(session) {
  const path = resolvePath(flow, session.path);
  session.title = path.length ? [path[0].label, ...(path.at(-1).solution ? [path.at(-1).label] : [])].join(' · ').slice(0,80) : 'Atendimento guiado';
  conversations = [session, ...conversations.filter(s => s.id !== session.id)].slice(0,12);
  saveSessions(); renderHistory();
}
function switchView(name) {
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== `${name}-view`);
  document.querySelectorAll('.nav').forEach(el => {
    const active = el.dataset.view === name;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
  if (mobileSidebar.matches && sidebarOpen) setSidebarOpen(false);
  $('#main').focus({preventScroll:true});
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => switchView(el.dataset.view)));
function setSourcesOpen(open) {
  $('#chat-view').classList.toggle('sources-open',open);
  $('#context-toggle').setAttribute('aria-expanded',String(open));
  $('#context-panel').hidden = !open;
}
$('#context-toggle').addEventListener('click', () => setSourcesOpen($('#context-toggle').getAttribute('aria-expanded') !== 'true'));
function historyIcon() {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 1 1 18 0Z');svg.append(p);return svg;
}
function historyButton(session) {
  const button=nodes('button','history-item');button.title=session.title;button.classList.toggle('active',session.id===activeId);
  if (session.id===activeId) button.setAttribute('aria-current','true');
  button.append(historyIcon(),nodes('span','',session.title));
  if(session.example) button.append(nodes('small','','Exemplo'));
  else if(session.status==='resolved') button.append(nodes('small','','Resolvido'));
  button.addEventListener('click',()=>{activeId=session.id;setSourcesOpen(false);renderConversation();renderHistory();switchView('chat');});
  return button;
}
function renderHistory() {
  $('#history-count').textContent=conversations.length;
  $('#history-list').replaceChildren(...conversations.map(historyButton));
  if(!conversations.length) $('#history-list').append(nodes('p','history-empty','Seus atendimentos aparecem aqui.'));
  $('#example-list').replaceChildren(...examples.map(historyButton));
  $('#mobile-history-list').replaceChildren(...[...conversations,...examples].map(historyButton));
}
function newConversation() {
  activeId=null;setSourcesOpen(false);renderConversation();renderHistory();switchView('chat');
}
$('#reset').addEventListener('click',newConversation);
function choose(id) {
  if(!ready) return;
  const current=currentSession();
  const path=resolvePath(flow,current.path);const parent=path.at(-1)||flow;
  if(current.status!=='active'||!parent.children?.some(n=>n.id===id)) return;
  const session=editableSession();session.path.push(id);session.status='active';recordSession(session);renderConversation(true);
}
function goBack() {
  if(!ready) return;
  const session=editableSession();
  if(session.status!=='active')session.status='active';else session.path.pop();
  recordSession(session);renderConversation(true);
}
function goHome() {
  if(!ready)return;
  if(!currentSession().id) {renderConversation();return;}
  const session=editableSession();session.path=[];session.status='active';recordSession(session);setSourcesOpen(false);renderConversation(true);
}
function requestHuman() {
  if(!ready)return;
  const session=editableSession();session.status='handoff';recordSession(session);renderConversation(true);
}
function resolveIssue() {
  const session=editableSession();session.status='resolved';recordSession(session);renderConversation(true);
}
$('#guide-back').addEventListener('click',goBack);$('#guide-home').addEventListener('click',goHome);$('#guide-human').addEventListener('click',requestHuman);
function message(role,text) {
  const el=nodes('article',`message ${role}`);
  if(role==='assistant') {
    const header=nodes('div','message-header');const logo=nodes('img');logo.src='/logo.svg';logo.alt='';
    header.append(logo,nodes('strong','','Assistente Nexo'),nodes('small','','Atendimento guiado'));el.append(header);
  }
  if(text)el.append(nodes('p',role==='user'?'':'message-text',text));$('#messages').append(el);return el;
}
function action(label,callback,className='guide-action') {
  const button=nodes('button',className,label);button.type='button';button.addEventListener('click',callback);return button;
}
function optionList(node,container) {
  const group=nodes('div','guide-options');group.setAttribute('role','group');group.setAttribute('aria-label',node.prompt);
  for(const [i,child] of node.children.entries()) {
    const button=nodes('button','guide-option');button.type='button';
    const icon=nodes('span','guide-option-icon',node===flow?['◎','◫','↶','▤','⌁'][i]:'');icon.setAttribute('aria-hidden','true');
    const text=nodes('span','guide-option-copy');text.append(nodes('strong','',child.label));
    if(child.description)text.append(nodes('small','',child.description));
    const arrow=nodes('span','guide-option-arrow','›');arrow.setAttribute('aria-hidden','true');button.append(icon,text,arrow);
    button.addEventListener('click',()=>choose(child.id));group.append(button);
  }
  container.append(group);
  if(node!==flow) container.append(action('Meu problema não está na lista',requestHuman,'guide-alternative'));
  return group;
}
function citation(article) {
  const button=nodes('button','citation-chip',`▤ ${article.title}`);
  button.addEventListener('click',()=>{setSourcesOpen(true);const target=document.getElementById(`source-${article.id}`);if(target){target.open=true;target.scrollIntoView({block:'nearest'});}});return button;
}
function renderSolution(node) {
  const solution=solutionFor(node,knowledge.articles);const el=message('assistant');
  el.append(nodes('h2','solution-title',solution.title),nodes('p','message-text',solution.intro));
  const steps=nodes('ol','solution-steps');solution.steps.forEach(step=>steps.append(nodes('li','',step)));el.append(steps);
  const meta=nodes('div','message-meta');meta.append(citation(solution.article));el.append(meta);
  if(solution.needsHuman)el.append(nodes('p','solution-note','Esta solicitação precisa de análise humana. Você pode preparar um resumo com as opções escolhidas.'));
  return el;
}
function renderHandoff(path) {
  const selected=path.map(n=>n.id);const draft=handoffFor(flow,selected);const policy=knowledge.articles.find(a=>a.id==='atendimento');
  message('user','Quero continuar com um atendente.');const el=message('assistant','Preparei um resumo do caminho que você percorreu. Você pode copiá-lo para continuar o atendimento.');
  const box=nodes('div','handoff');const pre=nodes('pre','',draft);
  const copy=action('Copiar resumo',async()=>{try{await navigator.clipboard.writeText(draft);copy.textContent='Resumo copiado ✓';}catch{copy.textContent='Selecione o resumo acima para copiar';pre.tabIndex=0;pre.focus();}});
  box.append(nodes('h3','','Resumo para atendimento'),pre,copy);el.append(box,nodes('p','message-text handoff-policy',policy.body));
  const meta=nodes('div','message-meta');meta.append(citation(policy));el.append(meta);
  el.append(action('Voltar ao atendimento guiado',goBack));
}
function updateSources(path,status) {
  const leaf=path.at(-1);const ids=[...(leaf?.articleId?[leaf.articleId]:[]),...(status==='handoff'?['atendimento']:[])];
  const docs=[...new Set(ids)].map(id=>knowledge.articles.find(a=>a.id===id));
  $('#source-count').textContent=docs.length;$('#sources').replaceChildren();
  docs.forEach(doc=>{const details=nodes('details','source');details.id=`source-${doc.id}`;details.append(nodes('summary','',doc.title),nodes('small','',doc.category),nodes('p','',doc.body));$('#sources').append(details);});
  if(!docs.length)$('#sources').append(nodes('p','empty-source','Escolha as opções para chegar a uma solução. A política relacionada aparecerá aqui.'));
  const trace=path.map(n=>`Você escolheu: ${n.label}`);
  if(leaf?.solution)trace.push('Localizou a solução cadastrada e sua política de referência.');
  if(status==='handoff')trace.push('Preparou um resumo local, sem enviar mensagem ou abrir chamado.');
  if(status==='resolved')trace.push('Você confirmou que a orientação resolveu o problema.');
  $('#trace').replaceChildren(...(trace.length?trace:['Aguardando sua escolha de assunto']).map(t=>nodes('li','',t)));
}
function renderConversation(focus=false) {
  $('#messages').replaceChildren();
  if(!ready){$('#messages').append(nodes('p','guide-loading','Carregando as opções de atendimento…'));return;}
  const session=currentSession();const path=resolvePath(flow,session.path);const current=path.at(-1)||flow;
  let controls;
  if(!path.length&&session.status==='active') {
    const welcome=nodes('div','welcome guided-welcome');const logo=nodes('img','welcome-logo');logo.src='/logo.svg';logo.alt='';logo.width=60;logo.height=60;
    welcome.append(logo,nodes('h1','','Como podemos ajudar?'),nodes('p','','Escolha um assunto. Eu guio você até a solução.'));
    controls=optionList(flow,welcome);$('#messages').append(welcome);
  } else {
    message('assistant','Olá! Vamos encontrar a orientação para o seu problema.');
    path.forEach((node,i)=>{
      message('user',node.label);
      if(node.solution)renderSolution(node);
      else {
        const el=message('assistant',node.prompt);
        if(i===path.length-1&&session.status==='active')controls=optionList(node,el);
      }
    });
    if(session.status==='handoff')renderHandoff(path);
    else if(session.status==='resolved') {
      message('user','Sim, resolveu.');const el=message('assistant','Ótimo! Este atendimento foi marcado como resolvido. Se precisar, escolha outro assunto.');
      controls=nodes('div','guide-feedback');controls.append(action('Escolher outro assunto',goHome));el.append(controls);
    } else if(current.solution) {
      const el=message('assistant','Essa orientação resolveu seu problema?');controls=nodes('div','guide-feedback');
      controls.append(action('Sim, resolveu',resolveIssue,'guide-action primary'),action('Ainda preciso de ajuda',requestHuman));el.append(controls);
    }
  }
  updateSources(path,session.status);
  $('#guide-back').disabled=!path.length&&session.status==='active';
  $('#guide-home').disabled=!path.length&&session.status==='active';
  $('#guide-human').disabled=session.status==='handoff';
  $('#guide-step').textContent=session.status==='resolved'?'Atendimento resolvido':session.status==='handoff'?'Resumo preparado':current.solution?'Sua orientação':`Escolha ${path.length+1} de 3`;
  $('#guide-location').textContent=path.length?path.map(n=>n.label).join(' / '):'Assunto → Categoria → Problema';
  $('#guide-location').title=path.map(n=>n.label).join(' / ');
  if(path.length||session.status!=='active')$('#messages').scrollTop=$('#messages').scrollHeight;
  else $('#messages').scrollTop=0;
  if(focus) (controls?.querySelector('button')||$('#guide-back')).focus({preventScroll:true});
}
function renderKnowledge(filter='') {
  const norm=t=>t.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const articles=knowledge.articles.filter(a=>norm(`${a.title} ${a.category} ${a.body}`).includes(norm(filter)));
  $('#article-count').textContent=`${articles.length} ${articles.length===1?'artigo':'artigos'}`;
  $('#knowledge-list').replaceChildren(...articles.map(article=>{const el=nodes('details');el.id=`article-${article.id}`;el.append(nodes('summary','',article.title),nodes('p','',article.body),nodes('small','',article.category));return el;}));
  if(!articles.length)$('#knowledge-list').append(nodes('p','','Nenhum artigo encontrado. Tente outro termo.'));
}
function buildExamples() {
  examples=[
    {id:'example-access',title:'Recuperar minha senha',path:['conta','recuperar-acesso','esqueci-senha']},
    {id:'example-refund',title:'Reembolso da primeira contratação',path:['financeiro','devolver-pagamento','primeira-compra']},
    {id:'example-files',title:'Resolver um problema de arquivo',path:['equipe','conteudo','upload']}
  ].map(e=>({...e,example:true,status:'active'}));
}
renderConversation();renderHistory();
try {
  const responses=await Promise.all([fetch('/knowledge.json'),fetch('/support-flow.json')]);
  if(responses.some(r=>!r.ok))throw new Error('Content unavailable');
  [knowledge,flow]=await Promise.all(responses.map(r=>r.json()));indexFlow(flow,knowledge.articles);
  restoreSessions();buildExamples();ready=true;renderConversation();renderHistory();renderKnowledge();
  knowledge.demoAccounts.forEach(a=>{const row=nodes('tr');[a.name,a.plan,a.seats,a.projects].forEach(value=>row.append(nodes('td','',value)));$('#accounts').append(row);});
  knowledge.demoTickets.forEach(t=>{const row=nodes('div','ticket-row');const title=nodes('div','',t.topic);title.append(nodes('small','',t.id));row.append(title,nodes('span','',t.status==='resolved'?'Resolvido':'Aguardando humano'));$('#tickets').append(row);});
} catch {
  $('#messages').replaceChildren(nodes('p','guide-loading','Não foi possível carregar o atendimento.'));
  $('#messages').append(action('Tentar novamente',()=>location.reload()));
  $('#guide-back').disabled=true;$('#guide-home').disabled=true;$('#guide-human').disabled=true;
}
$('#knowledge-search').addEventListener('input',e=>{if(ready)renderKnowledge(e.target.value);});
