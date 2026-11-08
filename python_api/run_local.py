from http.server import ThreadingHTTPServer
from api.agent import handler
print('Python backend: http://127.0.0.1:4180/api/agent',flush=True)
ThreadingHTTPServer(('127.0.0.1',4180),handler).serve_forever()
