"""Guardrails: limites verificáveis ao redor do LLM, independentemente do prompt.

Não são um detector infalível de alucinações ou prompt injection. A sustentação
semântica da resposta é avaliada separadamente em evaluation/quality.py.
"""
import json
import re
from .providers import AgentError

# Evita reenviar credenciais reconhecíveis digitadas por engano no chat.
# Não promete detectar todo dado pessoal; o detector é intencionalmente específico.
_SECRET = re.compile(r'\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})\b')


def validated_messages(question, history):
    # Guardrail de entrada: valida tamanho, papel e conteúdo antes de chamar a API.
    if not isinstance(question, str) or not question.strip() or len(question) > 1200:
        raise AgentError('Escreva uma pergunta de 1 a 1.200 caracteres.', 400)
    if not isinstance(history, list) or len(history) > 8:
        raise AgentError('Histórico inválido.', 400)
    result = []
    for item in history:
        if not isinstance(item, dict) or item.get('role') not in ['user','assistant'] or not isinstance(item.get('content'), str) or len(item['content']) > 5000:
            raise AgentError('Histórico inválido.', 400)
        result.append({'role':item['role'], 'content':item['content']})
    if sum(len(x['content']) for x in result) > 16000:
        raise AgentError('Histórico muito longo. Inicie uma nova conversa.', 400)
    if any(_SECRET.search(text) for text in [question, *[m['content'] for m in result]]):
        raise AgentError('Remova a chave de API da mensagem. Use a conexão no perfil.', 400)
    return result + [{'role':'user', 'content':question.strip()}]


def validated_tool_arguments(call, seen):
    # Guardrail de ferramenta: só código previamente autorizado pode ser chamado.
    # Nada aqui usa eval/exec nem transforma argumentos em comandos de terminal.
    try:
        args = json.loads(call['arguments']) if isinstance(call['arguments'], str) else call['arguments']
    except (KeyError, TypeError, ValueError):
        raise AgentError('Argumentos de ferramenta inválidos.') from None
    if not isinstance(args, dict):
        raise AgentError('Argumentos de ferramenta inválidos.')
    name = call.get('name')
    allowed = (name == 'rag_search' and 'query' in args and set(args) <= {'query','top_k'})
    allowed |= (name == 'read_document' and set(args) == {'document_id'} and isinstance(args['document_id'], str) and args['document_id'] in seen)
    if not allowed:
        raise AgentError('O modelo solicitou uma ferramenta ou consulta não permitida.')
    return args


def validated_final(text, seen):
    # Guardrail de saída: formato e IDs precisam ser válidos e ter sido recuperados.
    # Ter um ID existente NÃO prova que cada afirmação é fiel à fonte.
    try:
        text = text.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0]
        final = json.loads(text)
        answer, ids = final['answer'], final['citation_ids']
        if not isinstance(answer, str) or not answer.strip() or len(answer) > 10000 or not isinstance(ids, list) or len(ids) > 13:
            raise ValueError('Invalid output')
        if any(not isinstance(i, str) or i not in seen for i in ids) or (seen and not ids) or _SECRET.search(answer):
            raise ValueError('Invalid citations or secret')
        return answer.strip(), list(dict.fromkeys(ids))
    except (ValueError, KeyError, TypeError, AttributeError, IndexError):
        raise AgentError('O modelo retornou uma resposta sem formato ou fontes válidas. Tente novamente.') from None
