"""Embeddings reais por API; não usa hashes ou contagens como vetores semânticos."""
import math
from urllib.parse import quote
from .providers import AgentError, checked_base, post_json, validate_model


def unit_vector(values):
    """Normaliza o vetor: com norma 1, produto escalar = similaridade de cosseno."""
    if not isinstance(values, list) or not 1 <= len(values) <= 4096:
        raise AgentError('O provedor retornou um embedding inválido.')
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise AgentError('O provedor retornou um embedding inválido.')
    norm = math.sqrt(sum(v*v for v in values))
    if not norm or not math.isfinite(norm):
        raise AgentError('O provedor retornou um embedding sem direção válida.')
    return [v/norm for v in values]


def cosine_similarity(left, right):
    # Todos os vetores precisam pertencer ao MESMO modelo e espaço de dimensões.
    if len(left) != len(right):
        raise AgentError('Os embeddings têm dimensões incompatíveis.')
    return max(-1.0, min(1.0, sum(a*b for a, b in zip(left, right))))


class EmbeddingClient:
    """O LLM gera texto; outro modelo, de embeddings, representa significado em números.

    Esta classe só é criada quando a pessoa escolhe busca híbrida no perfil.
    Essas chamadas podem consumir créditos além das chamadas do chat.
    """
    def __init__(self, connection, transport=post_json):
        self.provider = connection.get('provider', 'openai')
        self.key = connection.get('api_key')
        if self.provider not in ['openai', 'gemini'] or not isinstance(self.key, str) or not 10 <= len(self.key) <= 500:
            raise AgentError('Conecte uma API válida para usar embeddings.', 400)
        self.base = checked_base(self.provider, connection.get('base_url'))
        self.model = validate_model('text-embedding-3-small' if self.provider == 'openai' else 'gemini-embedding-001')
        self.transport = transport
        # Metadados públicos identificam o espaço vetorial. A chave não entra no cache.
        self.namespace = (self.provider, self.base, self.model)

    def embed(self, texts, *, query=False):
        if not isinstance(texts, list) or not 1 <= len(texts) <= 64 or any(not isinstance(t, str) or not t.strip() or len(t) > 12000 for t in texts):
            raise AgentError('Lote de embeddings inválido.', 400)
        if self.provider == 'openai':
            body = self.transport(self.base+'/embeddings', {
                'model': self.model, 'input': texts, 'encoding_format': 'float', 'dimensions': 768
            }, {'Authorization': 'Bearer '+self.key})
            rows = body.get('data', [])
            # O índice do provedor, e não a ordem incidental de resposta, associa texto e vetor.
            if not isinstance(rows, list) or len(rows) != len(texts) or any(not isinstance(r, dict) for r in rows):
                raise AgentError('O provedor não devolveu todos os embeddings.')
            indices = [r.get('index') for r in rows]
            if any(type(i) is not int for i in indices) or sorted(indices) != list(range(len(texts))):
                raise AgentError('A ordem dos embeddings não pôde ser validada.')
            vectors = [r.get('embedding') for r in sorted(rows, key=lambda r:r['index'])]
        else:
            # Query e documento têm papéis diferentes na recuperação. O taskType informa isso ao Gemini.
            requests = [{'model':'models/'+self.model, 'content':{'parts':[{'text':t}]},
                         'taskType':'RETRIEVAL_QUERY' if query else 'RETRIEVAL_DOCUMENT',
                         'outputDimensionality':768} for t in texts]
            body = self.transport(self.base+'/models/'+quote(self.model, safe='')+':batchEmbedContents',
                                  {'requests':requests}, {'x-goog-api-key':self.key})
            rows = body.get('embeddings', [])
            if not isinstance(rows, list) or len(rows) != len(texts) or any(not isinstance(r, dict) for r in rows):
                raise AgentError('O provedor não devolveu todos os embeddings.')
            vectors = [r.get('values') for r in rows]
        normalized = [unit_vector(v) for v in vectors]
        if len({len(v) for v in normalized}) != 1:
            raise AgentError('Os embeddings têm dimensões incompatíveis.')
        return normalized
