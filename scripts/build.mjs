import {cp,mkdir,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await cp('data/knowledge.json','dist/knowledge.json');
await cp('data/support-flow.json','dist/support-flow.json');
console.log('Build concluído: dist/');
