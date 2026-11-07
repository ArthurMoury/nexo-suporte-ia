const $ = selector => document.querySelector(selector);
let knowledge;
let busy=false;
const nodes=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};

function switchView(name){
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`${name}-view`);
  document.querySelectorAll('.nav').forEach(el=>{const active=el.dataset.view===name;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('#main').focus({preventScroll:true});
}
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>switchView(el.dataset.view)));
document.querySelectorAll('[data-question]').forEach(el=>el.addEventListener('click',()=>{if(busy)return;$('#question').value=el.dataset.question;updateCounter();$('#chat-form').requestSubmit();}));
function updateCounter(){$('#counter').textContent=`${$('#question').value.length}/1200`;}
$('#question').addEventListener('input',updateCounter);
$('#question').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!busy)$('#chat-form').requestSubmit();}});

function updateSources(result){
  $('#source-count').textContent=result.citations.length;
  $('#sources').replaceChildren();
  result.citations.forEach(source=>{
    const doc=knowledge?.articles.find(x=>x.id===source.id);
    const details=nodes('details','source');details.id=`source-${source.id}`;
    details.append(nodes('summary','',source.title),nodes('small','',source.category),nodes('p','',doc?.body??'Consulte o artigo na base de conhecimento.'));
    $('#sources').append(details);
  });
  if(!result.citations.length)$('#sources').append(nodes('p','empty-source','Nenhum artigo cobre esta solicitação. O agente preparou um encaminhamento.'));
  const labels={search_knowledge:'Consultou a base de conhecimento',prepare_handoff:'Preparou um resumo para atendimento',approved_answer:'Validou os artigos e entregou o texto aprovado',policy_guard:'Aplicou os limites das políticas',model_fallback:'Usou a busca sem modelo'};
  $('#trace').replaceChildren(...result.trace.map(step=>nodes('li','',labels[step.tool]??step.tool)));
}
function message(role,text){
  const el=nodes('article',`message ${role}`);
  if(role==='assistant'){const head=nodes('div','message-header');head.append(nodes('span','assistant-icon','n'),nodes('strong','','Nexo'));el.append(head);}
  el.append(nodes('p',role==='user'?'':'message-text',text));$('#messages').append(el);return el;
}
async function sendQuestion(event){
  event.preventDefault();if(busy)return;
  const q=$('#question').value.trim();if(!q)return;
  busy=true;$('#send').disabled=true;$('#reset').disabled=true;$('#question').readOnly=true;
  $('#welcome')?.remove();message('user',q);$('#question').value='';updateCounter();
  const loading=nodes('div','message loading','Consultando as políticas…');$('#messages').append(loading);loading.scrollIntoView({block:'nearest'});
  $('#request-status').className='request-status';$('#request-status').textContent='';
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,mode:$('#mode').value}),signal:AbortSignal.timeout(55000)});
    if(!response.ok){if(response.status===429)throw new Error('Muitas consultas. Aguarde um minuto e tente novamente.');throw new Error('A consulta não foi concluída. Tente enviar novamente.');}
    const result=await response.json();loading.remove();
    const el=message('assistant',result.answer);
    el.querySelector('.message-header').append(nodes('small','',`${result.mode==='ia'?'Agente com IA':'Consulta sem modelo'} · ${result.latencyMs} ms`));
    const meta=nodes('div','message-meta');
    result.citations.forEach(source=>{const button=nodes('button','citation-chip',`▤ ${source.title}`);button.addEventListener('click',()=>{if(matchMedia('(max-width:900px)').matches){switchView('knowledge');if(knowledge){$('#knowledge-search').value='';renderKnowledge();}const article=document.getElementById(`article-${source.id}`);if(article){article.open=true;article.scrollIntoView({block:'center'});}}else{updateSources(result);const target=document.getElementById(`source-${source.id}`);target.open=true;target.scrollIntoView({block:'nearest'});}});meta.append(button);});el.append(meta);
    if(result.detail)el.append(nodes('p','fallback-note',result.detail));
    if(result.handoff){const handoff=nodes('div','handoff');const pre=nodes('pre','',result.handoff);const copy=nodes('button','','Copiar resumo');copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(result.handoff);copy.textContent='Resumo copiado ✓';}catch{copy.textContent='Selecione o resumo acima para copiar';pre.tabIndex=0;pre.focus();}});handoff.append(nodes('h3','','Resumo para atendimento'),pre,copy);el.append(handoff);}
    updateSources(result);el.scrollIntoView({block:'nearest'});
  }catch(error){loading.remove();$('#question').value=q;updateCounter();$('#request-status').className='request-status error';$('#request-status').textContent=error.name==='TimeoutError'?'A consulta demorou demais. Tente novamente.':error.message;}
  finally{busy=false;$('#send').disabled=false;$('#reset').disabled=false;$('#question').readOnly=false;$('#question').focus({preventScroll:true});}
}
$('#chat-form').addEventListener('submit',sendQuestion);
$('#reset').addEventListener('click',()=>{if(!busy)location.reload();});

function renderKnowledge(filter=''){
  const norm=value=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const articles=knowledge.articles.filter(a=>norm(`${a.title} ${a.category} ${a.body}`).includes(norm(filter)));
  $('#knowledge-list').replaceChildren(...articles.map(article=>{const details=nodes('details');details.id=`article-${article.id}`;details.append(nodes('summary','',article.title),nodes('p','',article.body),nodes('small','',`${article.id} · ${article.category} · Base fictícia`));return details;}));
  if(!articles.length)$('#knowledge-list').append(nodes('p','','Nenhum artigo encontrado. Tente outro termo.'));
}
try{
  const response=await fetch('/knowledge.json');if(!response.ok)throw new Error('base');knowledge=await response.json();renderKnowledge();
  knowledge.demoAccounts.forEach(account=>{const row=nodes('tr');[account.name,account.plan,account.seats,account.projects].forEach(value=>row.append(nodes('td','',value)));$('#accounts').append(row);});
  knowledge.demoTickets.forEach(ticket=>{const row=nodes('div','ticket-row');const title=nodes('div','',ticket.topic);title.append(nodes('small','',ticket.id));row.append(title,nodes('span','',ticket.status==='resolved'?'Resolvido':'Aguardando humano'));$('#tickets').append(row);});
}catch{$('#knowledge-list').append(nodes('p','','Não foi possível carregar a base. Recarregue a página para tentar novamente.'));}
$('#knowledge-search').addEventListener('input',event=>{if(knowledge)renderKnowledge(event.target.value);});
