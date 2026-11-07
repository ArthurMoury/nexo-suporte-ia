# Arquitetura e decisões

O produto é uma demonstração de suporte de uma empresa fictícia chamada Nexo. Seu problema é responder dúvidas recorrentes sem alterar preços e políticas nem afirmar que executou uma operação de conta.

## Contratos

`POST /api/chat` recebe `{"question":"...","mode":"auto"}` ou `mode: "base"`. A resposta tem `answer`, `citations`, `status`, `mode`, `handoff`, `trace`, `latencyMs` e `knowledgeVersion`. Cada consulta é independente. O histórico visual não é reenviado ao modelo.

No modo IA, o modelo controla consultas a `search_knowledge` e solicitações de `prepare_handoff`. O controlador aceita somente essas ferramentas. No máximo quatro chamadas de modelo são feitas por pergunta, cada uma com timeout de 12 segundos e limite de 450 tokens de saída. A configuração desativa chamadas paralelas. O provedor recebe a pergunta e os resultados das ferramentas da execução atual.

O resultado final do modelo é uma decisão JSON, não um texto livre para o cliente. A aplicação aceita até dois IDs recuperados nessa execução e compõe a resposta com os artigos originais. Isso garante correspondência literal do texto com a base. Não garante que o modelo tenha escolhido o artigo mais relevante ou que a política fictícia seja adequada para uma empresa real.

`prepare_handoff` não tem acesso a e-mail ou a um sistema de chamados. A aplicação prepara um rascunho em memória. Não existe confirmação de execução externa. Para pedidos explícitos de atendimento humano, o controlador também consulta a política de atendimento e inclui o canal e horário aprovados, mesmo que o modelo escolha encaminhar sem buscar primeiro.

## Por que não usar banco vetorial aqui?

A base tem 13 artigos curtos. Uma busca lexical com termos e sinônimos é pequena, auditável e suficiente para a referência inicial. Ela perde consultas implícitas, flexões e perguntas com pouca sobreposição lexical. O modelo pode reformular a busca, mas ainda depende desse mecanismo. Embeddings só devem entrar após medir essas falhas, comparando recall em um conjunto separado.

## Modos de execução

| Modo | Decisão | Modelo externo | Texto final |
|---|---|---|---|
| `base` | Busca lexical e regras | Não | Artigos aprovados |
| `auto`, configurado | Modelo escolhe ferramentas e fontes | Sim | Artigos aprovados |
| `auto`, falha ou sem chave | Retorna `mode: base` e aviso | Tentativa ou indisponível | Artigos aprovados |

O modo base é uma automação de consulta. Não é apresentado como prova de autonomia de um LLM. O modo IA implementa um ciclo de ferramentas limitado, com geração extrativa ao final, em vez de resposta livre.

## Dados sintéticos

`data/knowledge.json` reúne perfil da empresa, políticas, três organizações e três chamados de exemplo. As organizações não são usuários autenticados e seus registros são públicos. Os chamados são referências didáticas, sem histórico pessoal. O agente responde usando os artigos. Contas e chamados são exibidos para inspeção na interface, não consultados como dados privados de quem conversa.

## Segurança e limites

- A função valida formato, tamanho real do corpo e origem do navegador.
- O limite Netlify é de 12 requisições por IP por minuto. Não é um teto global de gasto nem autenticação.
- Segredos ficam no ambiente do servidor. Nenhuma chave vai para `dist/`.
- A UI usa `textContent`, não interpreta HTML fornecido pelo usuário ou pelo modelo.
- A CSP limita scripts, estilos e conexões à própria origem.
- A aplicação não persiste conversas e não escreve seus textos nos próprios logs. Infraestrutura e provedor têm políticas próprias.
- `store: false` desativa o armazenamento de resposta solicitado à API. Isso não equivale a uma promessa de retenção zero em toda a infraestrutura.
- A detecção por expressão regular cobre apenas alguns ataques óbvios. Não é uma proteção universal contra prompt injection. O limite principal é estrutural: ferramentas permitidas, ausência de operações externas e texto final vindo da base.

Antes de atender clientes reais: autenticação, autorização por conta, dados reais revisados, consentimento e política de privacidade, observabilidade com redação, cotas globais, análise de custos, revisão humana, testes adversariais maiores e armazenamento adequado. Não confundir uma demonstração publicada com um serviço de atendimento em produção para clientes reais.
