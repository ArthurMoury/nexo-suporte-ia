import {baseline,runAgent} from '../src/engine.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const data=JSON.parse(input);
console.log(JSON.stringify(data.mode==='auto'?await runAgent(data.question):baseline(data.question)));
