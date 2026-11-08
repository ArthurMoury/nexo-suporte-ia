"""Live native-Python agent smoke. Uses provider credits; never runs in CI."""
import argparse
import json
import re
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
CASES=[
 {'question':'Tenho 70 dias para pedir reembolso da primeira contratação paga?','source':'reembolso','pattern':r'(7|sete)\s+dias'},
 {'question':'Quanto custa o plano Pro?','source':'planos','pattern':r'39'},
 {'question':'E o Business?','source':'planos','pattern':r'79','followup':True},
 {'question':'Posso integrar o Nexo com WhatsApp?','source':'integracoes','pattern':r'não|indispon'}
]
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:4173');parser.add_argument('--output',default='docs/python-agent-live.json');args=parser.parse_args();rows=[];previous=None
    for case in CASES:
        history=[]
        if case.get('followup') and previous:history=[{'role':'user','content':previous['question']},{'role':'assistant','content':previous['answer']}]
        body={'question':case['question'],'history':history,'connection':{'provider':'server'}}
        request=Request(args.url.rstrip('/')+'/api/chat',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
        with urlopen(request,timeout=60) as response:result=json.load(response)
        ids=[c['id'] for c in result['citations']];trace=result['trace'];python_tools=[t['tool'] for t in trace if t['step']=='python'];checks={'native_python':result['runtime']=='python','llm_answer':result['mode']=='llm','rag_tool_called':'rag_search' in python_tools,'context_returned':sum(t['step']=='llm' for t in trace)>=2,'expected_source':case['source'] in ids,'essential_fact':bool(re.search(case['pattern'],result['answer'],re.I))}
        row={'question':case['question'],'answer':result['answer'],'provider':result['provider'],'model':result['model'],'runtime':result['runtime'],'citations':ids,'tools':python_tools,'latency_ms':result['latencyMs'],'knowledge_version':result['knowledgeVersion'],'checks':checks,'passed':all(checks.values())};rows.append(row);previous={'question':case['question'],'answer':result['answer']};print(('PASS' if row['passed'] else 'FAIL')+': '+case['question'],flush=True)
    report={'date':datetime.now(timezone.utc).isoformat(),'url':args.url,'type':'live Python tool-calling integration, not a broad semantic benchmark','results':rows};path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');raise SystemExit(0 if all(r['passed'] for r in rows) else 1)
if __name__=='__main__':main()
