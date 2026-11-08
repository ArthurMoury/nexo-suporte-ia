// Pure helpers shared by the browser and regression tests.
export function indexFlow(root, articles) {
  const index = new Map();
  const articleIds = new Set(articles.map(a => a.id));
  function visit(node, parent = null) {
    if (!node || typeof node.id !== 'string' || index.has(node.id) || typeof node.label !== 'string') throw new Error('Invalid or duplicate flow node');
    index.set(node.id, {node, parent});
    if (Array.isArray(node.children) && node.children.length) {
      if (typeof node.prompt !== 'string' || node.solution) throw new Error('Invalid support menu');
      node.children.forEach(child => visit(child, node.id));
    } else {
      if (!articleIds.has(node.articleId) || typeof node.solution?.intro !== 'string' || !Array.isArray(node.solution.steps) || !node.solution.steps.length || node.solution.steps.some(s => typeof s !== 'string' || !s.trim())) throw new Error('Solution without an approved policy or steps');
    }
  }
  visit(root);
  return index;
}
export function resolvePath(root, path) {
  if (!Array.isArray(path) || path.length > 8) throw new Error('Invalid support path');
  const selected = []; let current = root;
  for (const id of path) {
    const next = current.children?.find(n => n.id === id);
    if (!next) throw new Error('Choice is not available at this step');
    selected.push(next); current = next;
  }
  return selected;
}
export function solutionFor(node, articles) {
  const article = articles.find(a => a.id === node.articleId);
  if (!node.solution || !article) throw new Error('No solution for this menu');
  return {title:node.label, intro:node.solution.intro, steps:[...node.solution.steps],
    needsHuman:node.needsHuman === true, article};
}
export function handoffFor(root, path) {
  const selected = resolvePath(root, path);
  return ['Resumo para atendimento (demonstração)', 'Produto: Nexo Workspace',
    `Assunto: ${selected.map(n => n.label).join(' → ') || 'Ajuda para escolher um assunto'}`,
    'Situação: solicitação de atendimento humano.',
    'Canal fictício: suporte@nexo.example',
    'Nenhuma mensagem foi enviada e nenhum chamado real foi aberto.'].join('\n');
}
