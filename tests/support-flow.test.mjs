import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {indexFlow,resolvePath,solutionFor,handoffFor} from '../public/support-flow.js';
const tree=JSON.parse(readFileSync(new URL('../data/support-flow.json',import.meta.url)));
const {articles}=JSON.parse(readFileSync(new URL('../data/knowledge.json',import.meta.url)));

test('five topics lead through categories and problems to 24 sourced solutions',()=>{
  assert.equal(tree.children.length,5);const index=indexFlow(tree,articles);let leaves=0;
  for(const topic of tree.children){assert.ok(topic.children.length>=2);for(const category of topic.children){assert.ok(category.children.length>=2);for(const problem of category.children){assert.ok(problem.solution);assert.ok(index.has(problem.id));const path=resolvePath(tree,[topic.id,category.id,problem.id]);assert.equal(path.length,3);const solution=solutionFor(path.at(-1),articles);assert.ok(solution.steps.length>=2);assert.ok(solution.article.id);leaves++;}}}
  assert.equal(leaves,24);
});
test('a selection cannot jump to a sibling topic, unknown node or beyond a solution',()=>{
  assert.throws(()=>resolvePath(tree,['conta','devolver-pagamento']));
  assert.throws(()=>resolvePath(tree,['missing']));
  assert.throws(()=>resolvePath(tree,['conta','recuperar-acesso','esqueci-senha','financeiro']));
  assert.throws(()=>resolvePath(tree,{}));assert.deepEqual(resolvePath(tree,[]),[]);
});
test('restoring every saved path reconstructs the same problem and supports back navigation',()=>{
  for(const topic of tree.children)for(const category of topic.children)for(const problem of category.children){
    const saved=JSON.parse(JSON.stringify([topic.id,category.id,problem.id]));
    assert.equal(resolvePath(tree,saved).at(-1).id,problem.id);
    assert.equal(resolvePath(tree,saved.slice(0,-1)).at(-1).id,category.id);
    assert.equal(resolvePath(tree,saved.slice(0,1)).at(-1).id,topic.id);
  }
});
test('invalid policy references and duplicate flow IDs are rejected before rendering',()=>{
  const duplicate=structuredClone(tree);duplicate.children[1].id=duplicate.children[0].id;
  assert.throws(()=>indexFlow(duplicate,articles));
  const missing=structuredClone(tree);missing.children[0].children[0].children[0].articleId='nonexistent-policy';
  assert.throws(()=>indexFlow(missing,articles));
});
test('handoff preserves the full selected route and never claims a real ticket was opened',()=>{
  const draft=handoffFor(tree,['financeiro','cobrancas','cobranca-duplicada']);
  assert.match(draft,/Pagamentos e reembolsos → Pagamentos e cobranças → Apareceu uma cobrança duplicada/);
  assert.match(draft,/Nenhuma mensagem foi enviada e nenhum chamado real foi aberto/);
  assert.match(handoffFor(tree,[]),/Ajuda para escolher um assunto/);
});
test('refund and escalation paths preserve the seven-day rule and require human review',()=>{
  const refund=resolvePath(tree,['financeiro','devolver-pagamento','primeira-compra']).at(-1);
  const solution=solutionFor(refund,articles);assert.match(solution.intro,/7 dias corridos/);assert.equal(solution.needsHuman,true);
  const renewal=solutionFor(resolvePath(tree,['financeiro','devolver-pagamento','renovacao']).at(-1),articles);
  assert.match(renewal.intro,/não têm reembolso automático/);assert.equal(renewal.needsHuman,true);
  assert.throws(()=>solutionFor(tree,articles));
});
