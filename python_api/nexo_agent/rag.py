"""Inspectable lexical RAG retriever over local Markdown documents."""
import json
import math
import re
import unicodedata
from collections import Counter
from functools import lru_cache
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1] / 'documents'
STOP = set('a o e de do da dos das um uma em no na nos nas para por como qual quais que eu meu minha os as com ao tem posso quero saber sobre esse essa isso me se nao'.split())
def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if unicodedata.category(c) != 'Mn')
def tokens(text):
    return [w for w in re.findall(r'[a-z0-9]+', normalize(text)) if len(w) > 2 and w not in STOP]
@lru_cache(maxsize=1)
def documents():
    manifest=json.loads((ROOT/'manifest.json').read_text()); result=[]
    for path in sorted(ROOT.glob('*.md')):
        title,body=path.read_text().split('\n',1); meta=manifest[path.stem];chunks=[]
        for paragraph in body.strip().split('\n\n'):
            words=paragraph.split()
            for start in range(0,len(words),160):chunks.append(' '.join(words[start:start+200]))
        result.append({'id':path.stem,'title':title.lstrip('# ').strip(),'body':body.strip(),'category':meta['category'],'keywords':meta['keywords'],'chunks':chunks})
    return result

def rag_search(query,top_k=4):
    """Retrieve relevant document chunks with BM25 and keyword boosts."""
    if not isinstance(query,str) or not query.strip() or len(query)>1200:raise ValueError('Invalid query')
    if not isinstance(top_k,int) or isinstance(top_k,bool) or not 1<=top_k<=5:raise ValueError('Invalid top_k')
    corpus=[(d,i,c,tokens(d['title']+' '+c)) for d in documents() for i,c in enumerate(d['chunks'])]
    query_tokens=set(tokens(query))
    if not query_tokens:return {'query':query,'matches':[],'retrieval':'lexical-bm25','language':'python'}
    avg=sum(len(t) for _,_,_,t in corpus)/len(corpus);df=Counter(w for _,_,_,t in corpus for w in set(t));ranked=[]
    for doc,number,chunk,text_tokens in corpus:
        counts=Counter(text_tokens);score=0.0
        for word in query_tokens:
            freq=counts[word]
            if freq:score+=math.log(1+(len(corpus)-df[word]+.5)/(df[word]+.5))*freq*2.2/(freq+1.2*(1-.75+.75*len(text_tokens)/avg))
        for keyword in doc['keywords']:
            if re.search(r'\b'+re.escape(normalize(keyword))+r'\b',normalize(query)):score+=3.0
        if score>.8:ranked.append({'id':doc['id'],'chunk_id':f"{doc['id']}:{number}",'title':doc['title'],'category':doc['category'],'text':chunk,'score':round(score,3)})
    ranked.sort(key=lambda m:(-m['score'],m['id'],m['chunk_id']))
    return {'query':query,'matches':ranked[:top_k],'retrieval':'lexical-bm25','language':'python'}

def read_document(document_id):
    """Read one known policy. IDs never become filesystem paths."""
    if not isinstance(document_id,str):raise ValueError('Invalid document ID')
    doc=next((d for d in documents() if d['id']==document_id),None)
    if not doc:raise ValueError('Document not found')
    return {k:doc[k] for k in ['id','title','category','body']}


def knowledge_revision():
    import hashlib
    raw=json.dumps([{k:d[k] for k in ['id','title','body']} for d in documents()],ensure_ascii=False,sort_keys=True).encode()
    return 'docs-'+hashlib.sha256(raw).hexdigest()[:12]
