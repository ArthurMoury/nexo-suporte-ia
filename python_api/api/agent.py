import json
from http.server import BaseHTTPRequestHandler
from nexo_agent.orchestrator import run_agent
from nexo_agent.providers import AgentError
class handler(BaseHTTPRequestHandler):
    def log_message(self,*_args):pass
    def send_json(self,body,status=200):
        data=json.dumps(body,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_GET(self):self.send_json({'service':'nexo-python-agent','runtime':'python','tools':['rag_search','read_document']})
    def do_POST(self):
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=50000:self.send_json({'error':'Corpo inválido.'},413);return
            body=json.loads(self.rfile.read(size))
            if not isinstance(body,dict) or not isinstance(body.get('connection'),dict):raise AgentError('Configuração inválida.',400)
            self.send_json(run_agent(body.get('question'),body['connection'],body.get('history',[])))
        except AgentError as error:self.send_json({'error':str(error)},error.status)
        except (ValueError,TypeError,KeyError):self.send_json({'error':'Solicitação inválida.'},400)
        except Exception:self.send_json({'error':'O backend Python não concluiu a consulta. Tente novamente.'},502)
