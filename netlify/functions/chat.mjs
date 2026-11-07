import {runAgent} from '../../src/engine.mjs';
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default async request => {
  if (request.method !== 'POST') return json({error:'Use POST.'},405);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({error:'Envie JSON.'},415);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({error:'Origem não permitida.'},403);
  try {
    // Count actual streamed bytes, including when Content-Length is absent.
    const reader = request.body?.getReader();
    if (!reader) return json({error:'Informe uma pergunta.'},400);
    let size=0; const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return json({error:'Mensagem muito grande.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!['auto','base',undefined].includes(body.mode)) return json({error:'Modo inválido.'},400);
    return json(await runAgent(body.question,{mode:body.mode}));
  } catch {
    return json({error:'Envie uma pergunta de 1 a 1.200 caracteres em JSON válido.'},400);
  }
};
export const config = { path:'/api/chat', rateLimit:{windowLimit:12,windowSize:60,aggregateBy:'ip'} };
