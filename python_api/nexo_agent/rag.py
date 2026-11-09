"""RAG recupera evidências; o LLM usa essas evidências para gerar uma resposta."""
import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from functools import lru_cache
from pathlib import Path
from .semantic_search import semantic_search, reciprocal_rank_fusion

ROOT = Path(__file__).resolve().parents[1] / 'documents'
STOP = set('a o e de do da dos das um uma em no na nos nas para por como qual quais que eu meu minha os as com ao tem posso quero saber sobre esse essa isso me se nao'.split())


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if unicodedata.category(c) != 'Mn')


def tokens(text):
    return [w for w in re.findall(r'[a-z0-9]+', normalize(text)) if len(w) > 2 and w not in STOP]


@lru_cache(maxsize=1)
def documents():
    """Divide Markdown em trechos com sobreposição, preservando a origem de cada um."""
    manifest = json.loads((ROOT/'manifest.json').read_text())
    result = []
    for path in sorted(ROOT.glob('*.md')):
        title, body = path.read_text().split('\n', 1)
        meta, chunks = manifest[path.stem], []
        for paragraph in body.strip().split('\n\n'):
            words = paragraph.split()
            for start in range(0, len(words), 160):
                chunks.append(' '.join(words[start:start+200]))
        result.append({'id':path.stem, 'title':title.lstrip('# ').strip(), 'body':body.strip(),
                       'category':meta['category'], 'keywords':meta['keywords'], 'chunks':chunks})
    return result


def document_chunks():
    return [{'id':d['id'], 'chunk_id':f"{d['id']}:{i}", 'title':d['title'],
             'category':d['category'], 'text':chunk}
            for d in documents() for i, chunk in enumerate(d['chunks'])]


def lexical_search(query, chunks):
    """BM25 mede correspondência de palavras, frequência e tamanho do trecho."""
    corpus = [(c, tokens(c['title']+' '+c['text'])) for c in chunks]
    query_tokens = set(tokens(query))
    if not query_tokens:
        return []
    avg = sum(len(t) for _, t in corpus)/len(corpus)
    df = Counter(w for _, t in corpus for w in set(t))
    metadata = {d['id']:d['keywords'] for d in documents()}
    ranked = []
    for chunk, text_tokens in corpus:
        counts, score = Counter(text_tokens), 0.0
        for word in query_tokens:
            freq = counts[word]
            if freq:
                # Termos raros discriminam melhor; saturação evita premiar repetição excessiva.
                idf = math.log(1+(len(corpus)-df[word]+.5)/(df[word]+.5))
                score += idf*freq*2.2/(freq+1.2*(1-.75+.75*len(text_tokens)/avg))
        for keyword in metadata[chunk['id']]:
            if re.search(r'\b'+re.escape(normalize(keyword))+r'\b', normalize(query)):
                score += 3.0
        if score > .8:
            ranked.append({**chunk, 'score':round(score, 3)})
    return sorted(ranked, key=lambda m:(-m['score'], m['chunk_id']))


def rag_search(query, top_k=4, *, embedder=None):
    """A mesma ferramenta pode recuperar por palavras ou por busca híbrida.

    Semantic search = busca semântica (não 'semantic research'). Embeddings
    representam significado; cosseno ordena proximidade; RRF combina com BM25.
    O modo lexical permanece padrão para não gerar novas cobranças de embeddings.
    """
    if not isinstance(query, str) or not query.strip() or len(query) > 1200:
        raise ValueError('Invalid query')
    if not isinstance(top_k, int) or isinstance(top_k, bool) or not 1 <= top_k <= 5:
        raise ValueError('Invalid top_k')
    chunks = document_chunks()
    lexical = lexical_search(query, chunks)
    if embedder is None:
        return {'query':query, 'matches':lexical[:top_k], 'retrieval':'lexical-bm25', 'language':'python'}
    semantic = semantic_search(query, chunks, knowledge_revision(), embedder)
    return {'query':query, 'matches':reciprocal_rank_fusion(lexical, semantic, top_k),
            'retrieval':'hybrid-bm25-embeddings', 'embedding_model':embedder.model, 'language':'python'}


def read_document(document_id):
    """Guardrail de leitura: procura ID conhecido; nunca aceita um caminho de arquivo."""
    if not isinstance(document_id, str):
        raise ValueError('Invalid document ID')
    doc = next((d for d in documents() if d['id'] == document_id), None)
    if not doc:
        raise ValueError('Document not found')
    return {k:doc[k] for k in ['id','title','category','body']}


def knowledge_revision():
    raw = json.dumps([{k:d[k] for k in ['id','title','body']} for d in documents()], ensure_ascii=False, sort_keys=True).encode()
    return 'docs-'+hashlib.sha256(raw).hexdigest()[:12]
