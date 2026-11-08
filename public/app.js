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
app.addEventListener('transitionend', event => {
  if (event.propertyName === 'grid-template-columns') adjustComposer();
});

const storageKey = 'nexo-ia-conversations-v1';
let knowledge;
let busy = false;
let activeId = null;
let conversations = [];
let examples = [];
const drafts = new Map();

function validResult(value) {
  return value && typeof value.answer === 'string' && value.answer.length < 30000 &&
    Array.isArray(value.citations) && value.citations.every(x => x && typeof x.id === 'string' && typeof x.title === 'string') &&
    Array.isArray(value.trace) && value.trace.every(x => x && typeof x.tool === 'string') &&
    [null, undefined, 'string'].includes(value.handoff == null ? value.handoff : typeof value.handoff);
}
try {
  const stored = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
  if (Array.isArray(stored)) conversations = stored.filter(c => c && typeof c.id === 'string' &&
    typeof c.title === 'string' && Array.isArray(c.turns) && c.turns.every(t => typeof t.question === 'string' && validResult(t.result)))
    .slice(0, 12).map(c => ({id:c.id, title:c.title.slice(0, 80), turns:c.turns.slice(-20)}));
} catch { /* The interface also works when browser storage is unavailable. */ }

function saveConversations() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(conversations)); }
  catch { /* Keep the in-memory history when session storage is full or unavailable. */ }
}
function currentConversation() { return [...conversations, ...examples].find(c => c.id === activeId); }
function switchView(name) {
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== `${name}-view`);
  document.querySelectorAll('.nav').forEach(el => {
    const active = el.dataset.view === name;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  if (mobileSidebar.matches && sidebarOpen) setSidebarOpen(false);
  $('#main').focus({preventScroll:true});
  if (name === 'chat') adjustComposer();
}
function setSourcesOpen(open) {
  $('#chat-view').classList.toggle('sources-open', open);
  $('#context-toggle').setAttribute('aria-expanded', String(open));
  $('#context-panel').hidden = !open;
}
$('#context-toggle').addEventListener('click', () => setSourcesOpen($('#context-toggle').getAttribute('aria-expanded') !== 'true'));
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => switchView(el.dataset.view)));

function adjustComposer() {
  const input = $('#question');
  input.style.height = '0px';
  input.style.height = `${Math.max(28, Math.min(input.scrollHeight, 180))}px`;
  input.style.overflowY = input.scrollHeight > 180 ? 'auto' : 'hidden';
  $('#counter').textContent = input.value.length > 1000 ? `${input.value.length}/1200` : '';
}
$('#question').addEventListener('input', adjustComposer);
$('#question').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!busy) $('#chat-form').requestSubmit();
  }
});
function showWelcome() {
  $('#messages').append($('#welcome-template').content.cloneNode(true));
}
function clearSources() {
  $('#source-count').textContent = '0';
  $('#sources').replaceChildren(nodes('p', 'empty-source', 'Os artigos consultados aparecem aqui depois da sua pergunta.'));
  $('#trace').replaceChildren(nodes('li', '', 'Aguardando uma pergunta'));
}
function historyIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d','M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 1 1 18 0Z');
  svg.append(path); return svg;
}
function historyButton(conversation) {
  const button = nodes('button', 'history-item', undefined);
  button.classList.toggle('active', conversation.id === activeId);
  button.title = conversation.title;
  if (conversation.id === activeId) button.setAttribute('aria-current', 'true');
  button.append(historyIcon(), nodes('span', '', conversation.title));
  if (conversation.example) button.append(nodes('small', '', 'Exemplo'));
  button.disabled = busy;
  button.addEventListener('click', () => openConversation(conversation.id));
  return button;
}
function renderHistory() {
  $('#history-count').textContent = conversations.length;
  $('#history-list').replaceChildren(...conversations.map(historyButton));
  if (!conversations.length) $('#history-list').append(nodes('p', 'history-empty', 'Suas conversas aparecem aqui.'));
  $('#example-list').replaceChildren(...examples.map(historyButton));
  $('#mobile-history-list').replaceChildren(...[...conversations, ...examples].map(historyButton));
}
function openConversation(id) {
  if (busy) return;
  drafts.set(activeId, $('#question').value);
  activeId = id;
  const conversation = currentConversation();
  if (!conversation) { activeId = null; return; }
  $('#messages').replaceChildren();
  clearSources(); setSourcesOpen(false);
  for (const turn of conversation.turns) {
    message('user', turn.question);
    renderAnswer(turn.result);
  }
  if (!conversation.turns.length) showWelcome();
  if (conversation.turns.length) updateSources(conversation.turns.at(-1).result);
  $('#question').value = drafts.get(id) || '';
  $('#request-status').textContent = conversation.example ? 'Conversa de exemplo. Você pode continuar com uma nova pergunta.' : '';
  $('#request-status').className = 'request-status';
  switchView('chat'); renderHistory(); adjustComposer();
  $('.mobile-history').open = false;
  $('#messages').scrollTop = $('#messages').scrollHeight;
}
function newConversation() {
  if (busy) return;
  drafts.set(activeId, $('#question').value);
  activeId = null;
  $('#messages').replaceChildren(); showWelcome();
  clearSources(); setSourcesOpen(false);
  $('#question').value = ''; $('#request-status').textContent = '';
  $('#request-status').className = 'request-status';
  switchView('chat'); renderHistory(); adjustComposer();
  $('.mobile-history').open = false;
  $('#question').focus({preventScroll:true});
}
$('#reset').addEventListener('click', newConversation);
$('#messages').addEventListener('click', event => {
  const button = event.target.closest('[data-question]');
  if (!button || busy) return;
  $('#question').value = button.dataset.question;
  adjustComposer(); $('#chat-form').requestSubmit();
});

function updateSources(result) {
  $('#source-count').textContent = result.citations.length;
  $('#sources').replaceChildren();
  result.citations.forEach(source => {
    const doc = knowledge?.articles.find(x => x.id === source.id);
    const details = nodes('details', 'source'); details.id = `source-${source.id}`;
    details.append(nodes('summary', '', source.title), nodes('small', '', source.category),
      nodes('p', '', doc?.body ?? 'Consulte o artigo na base de conhecimento.'));
    $('#sources').append(details);
  });
  if (!result.citations.length) $('#sources').append(nodes('p', 'empty-source', 'Nenhum artigo cobre esta solicitação. O atendimento pode continuar com uma pessoa.'));
  const labels = {search_knowledge:'Consultou a base de conhecimento', prepare_handoff:'Preparou um resumo para atendimento',
    approved_answer:'Conferiu as fontes e entregou a resposta', policy_guard:'Aplicou os limites das políticas', model_fallback:'Usou a busca sem modelo'};
  $('#trace').replaceChildren(...result.trace.map(step => nodes('li', '',
    step.tool === 'prepare_handoff' && step.status === 'requested' ? 'Solicitou um encaminhamento' : labels[step.tool] ?? step.tool)));
}
function message(role, text) {
  const el = nodes('article', `message ${role}`);
  if (role === 'assistant') {
    const head = nodes('div', 'message-header');
    const logo = nodes('img'); logo.src = '/logo.svg'; logo.alt = '';
    head.append(logo, nodes('strong', '', 'Nexo IA')); el.append(head);
  }
  el.append(nodes('p', role === 'user' ? '' : 'message-text', text));
  $('#messages').append(el); return el;
}
function renderAnswer(result) {
  const el = message('assistant', result.answer);
  const label = result.mode === 'example' ? 'Exemplo' : result.mode === 'ia' ? 'Agente com IA' : 'Consulta sem modelo';
  el.querySelector('.message-header').append(nodes('small', '', label));
  const meta = nodes('div', 'message-meta');
  result.citations.forEach(source => {
    const button = nodes('button', 'citation-chip', `▤ ${source.title}`);
    button.addEventListener('click', () => {
      updateSources(result); setSourcesOpen(true);
      const target = document.getElementById(`source-${source.id}`);
      if (target) { target.open = true; target.scrollIntoView({block:'nearest'}); }
    }); meta.append(button);
  }); el.append(meta);
  if (result.detail) el.append(nodes('p', 'fallback-note', result.detail));
  if (result.handoff) {
    const handoff = nodes('div', 'handoff'); const pre = nodes('pre', '', result.handoff);
    const copy = nodes('button', '', 'Copiar resumo');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(result.handoff); copy.textContent = 'Resumo copiado ✓'; }
      catch { copy.textContent = 'Selecione o resumo acima para copiar'; pre.tabIndex = 0; pre.focus(); }
    });
    handoff.append(nodes('h3', '', 'Resumo para atendimento'), pre, copy); el.append(handoff);
  }
  return el;
}
async function sendQuestion(event) {
  event.preventDefault(); if (busy) return;
  const q = $('#question').value.trim(); if (!q) return;
  let conversation = currentConversation();
  if (!conversation || conversation.example) {
    conversation = {id:crypto.randomUUID(), title:q.slice(0, 80), turns:conversation?.turns.slice() || []};
    conversations.unshift(conversation); conversations = conversations.slice(0, 12); activeId = conversation.id;
  }
  busy = true; $('#send').disabled = true; $('#reset').disabled = true; $('#question').readOnly = true;
  renderHistory();
  $('.welcome')?.remove(); const userMessage = message('user', q); $('#question').value = ''; adjustComposer();
  const loading = nodes('div', 'message loading', 'Consultando as informações…');
  $('#messages').append(loading); loading.scrollIntoView({block:'nearest'});
  $('#request-status').className = 'request-status'; $('#request-status').textContent = '';
  try {
    const response = await fetch('/api/chat', {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question:q, mode:$('#mode').value}), signal:AbortSignal.timeout(55000)});
    if (!response.ok) {
      if (response.status === 429) throw new Error('Muitas consultas. Aguarde um minuto e tente novamente.');
      throw new Error('A consulta não foi concluída. Tente enviar novamente.');
    }
    const result = await response.json(); if (!validResult(result)) throw new Error('A resposta não pôde ser carregada. Tente novamente.');
    loading.remove(); const el = renderAnswer(result);
    conversation.turns.push({question:q, result}); conversation.turns = conversation.turns.slice(-20);
    // Move a continued conversation to the top without changing its title.
    conversations = [conversation, ...conversations.filter(c => c.id !== conversation.id)].slice(0,12);
    drafts.delete(activeId); saveConversations(); updateSources(result); el.scrollIntoView({block:'nearest'});
  } catch (error) {
    loading.remove(); userMessage.remove();
    if (!conversation.turns.length) conversations = conversations.filter(c => c.id !== conversation.id);
    $('#question').value = q; adjustComposer(); $('#request-status').className = 'request-status error';
    $('#request-status').textContent = error.name === 'TimeoutError' ? 'A consulta demorou demais. Tente novamente.' : error.message;
  } finally {
    busy = false; $('#send').disabled = false; $('#reset').disabled = false; $('#question').readOnly = false;
    renderHistory(); $('#question').focus({preventScroll:true});
  }
}
$('#chat-form').addEventListener('submit', sendQuestion);

function renderKnowledge(filter = '') {
  const norm = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const articles = knowledge.articles.filter(a => norm(`${a.title} ${a.category} ${a.body}`).includes(norm(filter)));
  $('#article-count').textContent = `${articles.length} ${articles.length === 1 ? 'artigo' : 'artigos'}`;
  $('#knowledge-list').replaceChildren(...articles.map(article => {
    const details = nodes('details'); details.id = `article-${article.id}`;
    details.append(nodes('summary', '', article.title), nodes('p', '', article.body), nodes('small', '', article.category));
    return details;
  }));
  if (!articles.length) $('#knowledge-list').append(nodes('p', '', 'Nenhum artigo encontrado. Tente outro termo.'));
}
function buildExamples() {
  examples = [
    {id:'example-plans', title:'Planos e valores', question:'Quais são os planos e preços?', article:'planos'},
    {id:'example-access', title:'Recuperar meu acesso', question:'Como recuperar minha senha?', article:'acesso'},
    {id:'example-refund', title:'Como funciona o reembolso', question:'Qual é o prazo de reembolso?', article:'reembolso'}
  ].map(example => {
    const article = knowledge.articles.find(a => a.id === example.article);
    return {id:example.id, title:example.title, example:true, turns:[{question:example.question,
      result:{answer:article.body, mode:'example', status:'answered', citations:[{id:article.id,title:article.title,category:article.category}],
        trace:[{tool:'search_knowledge'},{tool:'approved_answer'}], handoff:null}}]};
  }); renderHistory();
}
showWelcome(); renderHistory(); adjustComposer();
try {
  const response = await fetch('/knowledge.json'); if (!response.ok) throw new Error('base');
  knowledge = await response.json(); renderKnowledge(); buildExamples();
  knowledge.demoAccounts.forEach(account => {
    const row = nodes('tr'); [account.name, account.plan, account.seats, account.projects].forEach(value => row.append(nodes('td', '', value)));
    $('#accounts').append(row);
  });
  knowledge.demoTickets.forEach(ticket => {
    const row = nodes('div', 'ticket-row'); const title = nodes('div', '', ticket.topic);
    title.append(nodes('small', '', ticket.id)); row.append(title, nodes('span', '', ticket.status === 'resolved' ? 'Resolvido' : 'Aguardando humano'));
    $('#tickets').append(row);
  });
} catch { $('#knowledge-list').append(nodes('p', '', 'Não foi possível carregar a base. Recarregue a página para tentar novamente.')); }
$('#knowledge-search').addEventListener('input', event => { if (knowledge) renderKnowledge(event.target.value); });
window.addEventListener('resize', adjustComposer);
