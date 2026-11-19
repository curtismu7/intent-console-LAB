# KServe-v2-shaped intent encoder proxying a REAL embedding model: nomic-embed-text-v1.5
# served by llama.cpp at http://embeddings.ping-devops-cmuir.svc.cluster.local:8080 (OpenAI /v1/embeddings, 768 dims, mean pooling).
# Endpoints: GET /v2, /v2/info, /v2/models/intent-encoder(+ /model_info, /get_worker_address),
# POST /v2/models/intent-encoder/infer.
import json, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

DIMS = 768
MODEL = 'intent-encoder'
UPSTREAM = 'http://embeddings.ping-devops-cmuir.svc.cluster.local:8080/v1/embeddings'

def embed(texts):
    body = json.dumps({'input': texts, 'model': 'nomic-embed-text-v1.5'}).encode()
    req = urllib.request.Request(UPSTREAM, data=body, headers={'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())
    return [row['embedding'] for row in d['data']]

MODEL_INFO = {
    'name': MODEL, 'versions': ['1'], 'platform': 'kserve-proxy-nomic',
    'inputs': [{'name': 'TEXT', 'datatype': 'BYTES', 'shape': [-1]}],
    'outputs': [{'name': 'EMBEDDING', 'datatype': 'FP32', 'shape': [-1, DIMS]}],
}
SERVER_INFO = {'name': 'triton-inference-server', 'version': '2.44.0', 'extensions': []}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def do_GET(self):
        p = self.path.split('?')[0].rstrip('/')
        if p in ('/v2', '/v2/info'): return self._send(200, SERVER_INFO)
        if p in ('/v2/models/intent-encoder', '/v2/models/intent-encoder/model_info'): return self._send(200, MODEL_INFO)
        if p in ('/v2/models/intent-encoder/get_worker_address', '/v2/models/intent-encoder/versions/1/get_worker_address'):
            return self._send(200, {'address': 'localhost:8000'})
        if p in ('/v2/health/ready', '/v2/models/intent-encoder/ready'): return self._send(200, {'ready': True})
        return self._send(404, {'error': 'Not Found'})
    def do_POST(self):
        p = self.path.split('?')[0].rstrip('/')
        if not p.endswith('/infer'):
            return self._send(404, {'error': 'Not Found'})
        try:
            n = int(self.headers.get('content-length', 0))
            body = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return self._send(400, {'error': 'bad json'})
        rows = []
        for inp in (body.get('inputs') or []):
            for d in (inp.get('data') or []):
                if isinstance(d, str) and len(d) <= 2000: rows.append(d)
        if not rows or len(rows) > 8:
            return self._send(400, {'error': 'no usable TEXT inputs'})
        try:
            out = embed(rows)
        except Exception as e:
            return self._send(502, {'error': 'upstream: %s' % e})
        return self._send(200, {
            'model_name': MODEL, 'model_version': '1',
            'outputs': [{'name': 'EMBEDDING', 'datatype': 'FP32', 'shape': [len(rows), DIMS], 'data': [x for row in out for x in row]}],
        })

HTTPServer(('0.0.0.0', 8000), H).serve_forever()
