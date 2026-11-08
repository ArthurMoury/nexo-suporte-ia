import {cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
const knowledge=JSON.parse(await readFile('data/knowledge.json','utf8'));
for(const article of knowledge.articles){const md=await readFile(`python_api/documents/${article.id}.md`,'utf8');const [heading,...body]=md.split('\n');article.title=heading.replace(/^#\s*/,'').trim();article.body=body.join('\n').trim();}
await writeFile('dist/knowledge.json',JSON.stringify(knowledge,null,2)+'\n');console.log('Build concluído: dist/');
