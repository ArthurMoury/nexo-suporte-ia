# Avaliação do agente Python

O comando `npm run check` executa 16 testes JavaScript, 10 testes Python, o benchmark histórico determinístico com 24 casos e o build.

## Testes do ciclo atual

Os testes Python usam as funções reais de RAG e leitura, com respostas do provedor simuladas. Verificam que o modelo recebe os resultados das funções, que o histórico é enviado como conversa e que fontes inventadas, ferramentas desconhecidas e leitura de arquivos por caminho são recusadas. O teste Gemini preserva a assinatura opaca do modelo e o ID da chamada ao produzir `functionResponse`.

Os testes de transporte verificam que a chave do servidor não vai para o navegador, que a chave enviada pelo cliente não substitui a conexão de servidor, que o teste de conexão depende da ferramenta Python e que uma conexão ausente não produz resposta de IA simulada.

Esses testes comprovam contratos e o ciclo do código. Não são uma medição independente da qualidade semântica do LLM.

## Testes reais da publicação

```sh
python3 evaluation/smoke.py --url https://nexo-suporte-arthurmoury.netlify.app
```

O smoke usa a conexão do servidor, faz chamadas reais que podem consumir créditos e grava `docs/python-agent-live.json`. Verifica runtime Python, execução de `rag_search`, retorno ao LLM, fonte esperada e fatos essenciais. Inclui uma pergunta de continuação com histórico. Não roda no CI.

A conexão Gemini pessoal depende de uma chave da pessoa que usa o app. O adaptador tem teste de protocolo simulado; uma validação real da chave acontece ao clicar “Testar e conectar” no perfil. Não apresentar teste simulado como uso real do Gemini.

## Referência determinística histórica

`evaluation/evaluate.py` e `src/engine.mjs` conservam a referência de regras e os 24 casos sintéticos do projeto inicial. `npm run evaluate` continua medindo somente essa referência. Esses números não devem ser usados como se fossem avaliação da resposta gerada pelo novo LLM.

Os relatórios históricos continuam em `docs/` com suas datas. O antigo fluxo de cinco assuntos e seus testes foram removidos da implementação ativa.

## Juiz semântico opcional

`evaluation/judge.py` é um adaptador de estudo para relevance e faithfulness. Usa credenciais do ambiente, pode consumir créditos e não roda no CI. Sua rubric precisa ser calibrada contra revisão humana antes de servir como critério de publicação. Uma citação existente, isoladamente, não comprova que todas as afirmações são sustentadas.

Para evoluir a avaliação, separar um conjunto não usado no ajuste, incluir paráfrases, erros de recuperação, múltiplas intenções, premissas erradas, ataques e indisponibilidade do provedor. Medir acurácia factual, relevância, faithfulness, custo, duração e consultas desnecessárias sem confundir uma métrica com outra.
