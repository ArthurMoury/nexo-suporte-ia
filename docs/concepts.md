# Conceitos de IA no Nexo: do código à verificação

Este guia acompanha os comentários nos módulos Python. A ordem sugerida é recuperação → orquestração → guardrails → avaliação → regressão. Embedding é o vetor; semantic search é a busca semântica que usa esses vetores. “Semantic research” costuma significar pesquisa sobre semântica; aqui o recurso implementado é **semantic search**.

| Conceito | Pergunta que responde | Código comentado |
|---|---|---|
| Relevance | A resposta atende ao pedido? | [quality.py](../evaluation/quality.py), função `score_judgment` |
| Faithfulness | As afirmações preservam os fatos e exceções do contexto? | [quality.py](../evaluation/quality.py) e rubrica em `RUBRIC` |
| Groundedness | As afirmações têm lastro em evidências dos documentos citados? | [quality.py](../evaluation/quality.py), auditoria de `claims` e `evidence` |
| Guardrails | Quais limites o código impõe ao modelo? | [guardrails.py](../python_api/nexo_agent/guardrails.py) |
| Embeddings | Como textos se tornam vetores que representam significado? | [embeddings.py](../python_api/nexo_agent/embeddings.py) |
| Semantic search | Como encontrar significado semelhante sem depender de palavras iguais? | [semantic_search.py](../python_api/nexo_agent/semantic_search.py) |
| Testes de regressão | Uma mudança quebrou algo que já funcionava? | [regression.py](../evaluation/regression.py) e [testes Python](../python_api/tests/) |

## Embeddings, busca semântica e RAG

`EmbeddingClient` envia textos a um modelo de embeddings: `text-embedding-3-small` na OpenAI ou `gemini-embedding-001` no Gemini. Esse modelo é diferente do LLM que redige a resposta. A resposta da API contém listas de números reais. O código valida valores finitos, dimensões, quantidade e associação entre cada texto e seu vetor.

Os vetores são normalizados. Para dois vetores unitários, o produto escalar é a similaridade de cosseno. A busca semântica ordena os trechos pela proximidade do vetor da pergunta. Isso permite recuperar paráfrases, embora um ranking alto não seja prova de verdade nem uma probabilidade de a resposta estar correta.

A ferramenta `rag_search` oferece dois modos:

- **BM25 (padrão):** busca lexical por palavras e termos cadastrados, sem chamar um modelo de embeddings.
- **Híbrido (opcional no perfil):** combina o ranking BM25 e o ranking semântico por Reciprocal Rank Fusion (RRF). A fusão soma posições dos rankings, sem comparar escalas incompatíveis de pontuação.

O backend guarda somente os vetores dos documentos públicos em um cache limitado na memória do processo. Uma revisão SHA-256 invalida esse cache ao alterar os textos. **O hash de revisão não é um embedding.** Perguntas, histórico e chaves não são guardados nesse cache. Em serverless, o cache pode desaparecer e os documentos precisam ser vetorizados novamente. Não há banco vetorial externo.

Na publicação atual, o gateway da Netlify recusou o modelo de embeddings. A conexão do servidor permanece em BM25. Uma chave própria OpenAI/Gemini pode habilitar o modo híbrido. Não foi fornecida uma chave pessoal para validar essa conexão real; os adaptadores foram testados com transporte simulado.

Para ativar: **Arthur Moury → Conectar API → OpenAI/Gemini com chave própria → Busca nos documentos → Híbrida → Testar e conectar**. A disponibilidade depende do endpoint e do modelo de embeddings da conexão. Se o provedor não aceitar embeddings, o teste informa erro e preserva a conexão anterior; não simula uma busca semântica. Use sua própria conexão OpenAI/Gemini se o gateway não oferecer o endpoint necessário.

Embeddings e teste de conexão podem consumir créditos. O juiz LLM também faz chamadas pagas quando executado explicitamente. Nenhum desses custos é necessário para rodar `npm run check`.

## Relevance, faithfulness e groundedness

Esses nomes podem se sobrepor entre bibliotecas. Neste projeto, adotamos definições operacionais explícitas:

- **Relevance:** nota de 0 a 1 dada pelo avaliador sobre quanto a resposta atende à pergunta. Uma explicação correta de preços pode ter relevance 0 para uma pergunta de reembolso.
- **Faithfulness:** quantidade de afirmações sustentadas pelo contexto dividida pelo total de afirmações. Contradições e afirmações sem suporte diminuem a nota.
- **Groundedness:** quantidade de afirmações sustentadas com evidência literal em um documento citado na resposta, dividida pelo total de afirmações.

O avaliador separa cada afirmação factual e atribui `entailed`, `contradicted` ou `unsupported`. Para afirmações sustentadas, precisa indicar o ID e um trecho literal do contexto. O Python confere se esse trecho existe no documento. Uma afirmação apoiada no contexto, mas sem fonte citada, pode ter faithfulness alta e groundedness baixa sob essa definição.

Exemplo: “O reembolso é em 70 dias” citando a política verdadeira de sete dias. A resposta pode ser relevante e o ID pode existir, mas a afirmação contradiz o documento: faithfulness e groundedness são 0 no caso rotulado de regressão.

O código **não verifica implicação semântica sozinho**. Um trecho literal pode existir e ainda ser interpretado incorretamente pelo juiz. A classificação e a extração completa das afirmações precisam ser revisadas e calibradas por pessoas. Respostas sem afirmações factuais recebem `null` nas duas métricas baseadas em afirmações; não recebem uma aprovação automática.

## Guardrails em três fronteiras

1. **Entrada:** limita tamanho e histórico, só aceita papéis `user`/`assistant` e barra padrões reconhecíveis de chaves digitadas no chat antes de chamar o provedor. Não é um detector completo de dados pessoais.
2. **Ferramentas:** permite somente `rag_search` e `read_document`, valida argumentos e exige que um documento tenha sido recuperado antes de ser lido. Não usa `eval`, `exec` ou execução arbitrária de código.
3. **Saída e orçamento:** valida JSON, texto e IDs de fontes; limita quatro rodadas, seis chamadas e tempo de execução. O transporte restringe origem, tamanho e endpoints. A Netlify limita requisições por IP.

As instruções também orientam o LLM a preservar fatos e ignorar comandos vindos dos documentos. Prompt não substitui uma validação em código. Esses controles não eliminam alucinações nem são um teto global de gasto; para clientes reais ainda são necessárias autenticação, autorização e cotas globais.

## Avaliação e regressão

```sh
npm run check
npm run evaluate:quality
```

O primeiro comando verifica sintaxe do frontend, testes JavaScript/Python, benchmark histórico, regressão atual e build. O segundo executa cinco casos de recuperação e seis casos rotulados das métricas. Os rótulos são exemplos didáticos fixos criados no projeto, não uma avaliação humana independente do modelo.

O CI executa os mesmos casos sem chave e sem chamadas à API. Os transportes de LLM e embeddings são simulados; BM25, cosseno, fusão, ferramentas e validações são executados em Python real. Um teste de paráfrase usa vetores controlados para validar a matemática, não para estimar a qualidade semântica de um modelo comercial.

Para avaliar uma resposta com um juiz real, configure a credencial no ambiente e execute:

```sh
python3 evaluation/judge.py evaluation/judge-sample.json
```

O arquivo de exemplo contém um prazo errado intencionalmente. O juiz recebe a pergunta, a resposta e os contextos, devolve julgamentos estruturados e o código calcula as três métricas. O juiz não roda a cada mensagem do chat nem no CI. Prefira amostras com `contexts` contendo exatamente os trechos usados pela geração e `citation_ids`; `article_ids` é um atalho para carregar documentos locais completos.

## Abrir e estudar no VS Code

Abra a pasta `suporte-ia`. Há uma tarefa **Nexo: verificar tudo** em `.vscode/tasks.json` e uma tarefa **Nexo: regressão de qualidade**. Leia primeiro este guia e depois os módulos da tabela. Os comentários explicam decisões, limites e o caminho do dado, sem exigir que você conheça previamente todos esses conceitos.

Referências: [Embeddings da OpenAI](https://developers.openai.com/api/docs/guides/embeddings), [Embeddings do Gemini](https://ai.google.dev/gemini-api/docs/embeddings). As métricas deste projeto têm definições operacionais próprias, explicitadas acima.
