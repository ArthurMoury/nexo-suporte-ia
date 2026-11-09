"""Busca semântica por significado + fusão com BM25 (busca híbrida)."""
from collections import OrderedDict
from threading import Lock
from .embeddings import cosine_similarity

# Somente trechos públicos e vetores dos documentos são cacheados em memória.
# Consultas, conversas e chaves pessoais nunca são armazenadas aqui.
_INDEXES = OrderedDict()
_LOCK = Lock()


def clear_vector_cache():
    with _LOCK:
        _INDEXES.clear()


def semantic_search(query, chunks, revision, embedder):
    key = (embedder.namespace, revision)
    with _LOCK:
        vectors = _INDEXES.get(key)
    if vectors is None:
        # O hash revision apenas invalida o cache quando documentos mudam;
        # ele NÃO é um embedding. Os vetores vêm do modelo de embeddings por API.
        vectors = embedder.embed([c['title']+'\n'+c['text'] for c in chunks])
        with _LOCK:
            _INDEXES[key] = vectors
            _INDEXES.move_to_end(key)
            while len(_INDEXES) > 4:
                _INDEXES.popitem(last=False)
    query_vector = embedder.embed([query], query=True)[0]
    ranked = [{**chunk, 'semantic_score':round(cosine_similarity(query_vector, vector), 6)}
              for chunk, vector in zip(chunks, vectors)]
    return sorted(ranked, key=lambda c:(-c['semantic_score'], c['chunk_id']))


def reciprocal_rank_fusion(lexical, semantic, top_k):
    """RRF soma posições, sem comparar escalas diferentes de BM25 e cosseno.

    Similaridade não é probabilidade de verdade. A resposta ainda precisa ser
    fundamentada nos trechos e avaliada depois (groundedness/faithfulness).
    """
    merged = {}
    for ranking in [lexical, semantic]:
        for rank, chunk in enumerate(ranking[:top_k*2], 1):
            entry = merged.setdefault(chunk['chunk_id'], {**chunk, 'fusion_score':0.0})
            if 'semantic_score' in chunk:
                entry['semantic_score'] = chunk['semantic_score']
            entry['fusion_score'] += 1/(60+rank)
    rows = sorted(merged.values(), key=lambda c:(-c['fusion_score'], c['chunk_id']))[:top_k]
    return [{**c, 'score':round(c['fusion_score'], 6)} for c in rows]
