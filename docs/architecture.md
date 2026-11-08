# Arquitetura e decisões

A experiência principal é um chatbot de suporte guiado por escolhas. O usuário começa por um dos cinco assuntos, escolhe uma categoria e identifica o problema. O sistema apresenta uma solução cadastrada e oferece confirmação de resolução ou resumo para atendimento humano.

## Fluxo de atendimento

`data/support-flow.json` é a fonte da árvore. Existem cinco assuntos, categorias intermediárias e 24 situações finais. Cada situação tem ID, rótulo, política relacionada, introdução, passos e indicação de análise humana quando necessária.

`public/support-flow.js` contém funções puras para indexar e validar a árvore, resolver um caminho de escolhas e preparar o resumo humano. Os testes usam as mesmas funções do navegador. Uma seleção só pode seguir para um filho da etapa atual. IDs duplicados, fontes inexistentes e menus sem solução são rejeitados.

`public/app.js` monta o diálogo: mensagem do assistente, escolha do usuário, próxima pergunta e novas opções. Somente as opções atuais são clicáveis. Voltar reconstrói o caminho anterior. O menu inicial reinicia o caminho dentro do atendimento. Novo atendimento cria outra sessão ao fazer a primeira escolha.

As soluções são conteúdo cadastrado. A interface mostra passos específicos para cada problema e a política que fundamenta a orientação. Isso não equivale a uma medição semântica automática de faithfulness. A coerência entre passos e política precisa de revisão editorial.

## Conclusão e encaminhamento

A confirmação “Sim, resolveu” registra que o usuário considerou a orientação suficiente. Não prova que uma operação ocorreu em um sistema externo. O pedido humano prepara um resumo com o caminho escolhido. Ele não envia e-mail, abre chamados, cancela planos, altera dados ou executa reembolsos.

## Estado e privacidade

Até 12 atendimentos ficam no armazenamento de sessão da aba, sob uma chave nova específica do fluxo guiado. Cada registro contém ID, título, caminho e situação (`active`, `resolved` ou `handoff`). Os registros são validados ao carregar. O histórico antigo de mensagens permanece armazenado sem ser sobrescrito, mas não é usado nesta interface.

Sem armazenamento disponível, o atendimento funciona em memória. As escolhas não são enviadas a um LLM. A interface carrega apenas arquivos de configuração e políticas. Não há campo de texto livre no atendimento. A busca da base de conhecimento é um recurso separado.

## Navegação

A barra principal abre e fecha com animação. A preferência é separada para desktop e celular. No celular, a navegação é um menu sobreposto com fechamento por Esc, toque fora ou escolha de seção. O painel de fontes é independente e começa fechado. As transições respeitam movimento reduzido.

## API experimental de IA

O endpoint `POST /api/chat` foi preservado como experimento separado. Ele recebe `question` e `mode` (`auto` ou `base`) e devolve texto, fontes, encaminhamento, rastro e versão da base. O atendimento por opções não chama esse endpoint.

No modo IA, o controlador permite `search_knowledge` e `prepare_handoff`, limita a quatro chamadas de modelo, com até 450 tokens de saída por chamada e timeout individual de 12 segundos. IDs de fontes precisam ter sido recuperados na execução. O texto final da API é composto pelos artigos selecionados. Falhas do provedor geram fallback explícito para a referência sem modelo.

A API valida formato e tamanho do corpo e a origem do navegador. O limite Netlify é de 12 requisições por IP por minuto, sem equivaler a um teto global de custo. Credenciais ficam no servidor. `store: false` desativa o armazenamento de resposta solicitado ao provedor, sem garantir retenção zero em toda a infraestrutura.

## Avaliação

Os seis testes do fluxo percorrem as 24 soluções e verificam caminhos, retorno e restauração, fontes válidas, IDs únicos, regras de reembolso e resumo humano. Os 12 testes anteriores cobrem controlador e contrato HTTP da API. O benchmark Python com 24 perguntas e o juiz semântico opcional continuam específicos à API experimental.

A aplicação é uma demonstração sintética. Para atendimento real, revisar políticas, validar o fluxo com usuários, configurar canais humanos, proteger dados e conferir permissões e efeitos de cada integração.
