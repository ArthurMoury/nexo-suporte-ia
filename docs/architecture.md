# Chat, LLM, ferramentas Python e RAG

A interface recebe texto livre. O transporte Netlify entrega a solicitação ao backend Python nativo na Vercel. O orquestrador Python prepara o histórico e as ferramentas, chama o provedor de LLM, executa as funções solicitadas e envia os resultados de volta ao modelo. O LLM redige a resposta final. Não há mais árvore de perguntas ou fluxo de atendimento numerado.

## Componentes reais

- `public/app.js`: chat, histórico, perfil e conexão da API. Usa texto seguro no DOM.
- `src/python-proxy.mjs`: seleciona a conexão e encaminha a requisição por HTTPS. Não gera resposta nem executa RAG.
- `python_api/nexo_agent/orchestrator.py`: mantém o ciclo de modelo, chamadas e resultados.
- `python_api/nexo_agent/providers.py`: adaptadores HTTP para Gemini e OpenAI.
- `python_api/nexo_agent/rag.py`: leitura, divisão e recuperação de trechos dos Markdown.
- `python_api/documents/`: 13 documentos e um manifesto de termos. O build também usa esses documentos para a base visível no app.

## O ciclo

1. O chat envia a mensagem e até quatro pares recentes de contexto.
2. O orquestrador Python envia instruções, conversa e declarações de funções ao LLM.
3. A primeira rodada exige uma consulta `rag_search`; o modelo formula os argumentos. Nas seguintes, pode solicitar outras consultas ou finalizar.
4. O Python valida a ferramenta e os argumentos, executa a função e obtém os trechos.
5. O resultado volta ao modelo como resposta de função, preservando os identificadores do protocolo.
6. O modelo produz JSON com texto e IDs das fontes. A aplicação valida o contrato e devolve texto, citações e rastro.

O texto final é gerado pelo modelo. A validade de um ID não comprova faithfulness semântica. O prompt exige preservar condições e exceções, mas isso continua sujeito à avaliação.

## Ferramentas

`rag_search(query, top_k=4)` combina BM25 com reforço de termos sobre trechos de até 200 palavras, com sobreposição quando um parágrafo é maior. É recuperação lexical, sem embeddings ou banco vetorial.

`read_document(document_id)` devolve a política completa somente para IDs conhecidos e já encontrados na execução. O ID não vira caminho de arquivo. O modelo não pode solicitar execução de código ou ferramentas arbitrárias.

## Provedores e limites

Gemini usa `generateContent`: conteúdo do modelo é preservado, incluindo assinaturas de pensamento, e o resultado Python volta em `functionResponse`. OpenAI usa Chat Completions: o resultado volta como mensagem `tool` vinculada por `tool_call_id`.

O limite é de quatro rodadas e seis chamadas de ferramenta. Cada chamada HTTP tem timeout de 18 segundos; o controlador interrompe novas rodadas quando o orçamento de tempo está próximo do limite do backend. O transporte Netlify espera até 55 segundos. Falhas de conexão, formato ou fonte produzem erro explícito, sem resposta estática rotulada como IA.

## Conexão e segredos

O perfil Arthur Moury abre as configurações. Uma chave pessoal fica apenas na variável de conexão da página e segue por HTTPS ao transporte e ao backend para o provedor. A aplicação não grava a chave em histórico, sessão, arquivos ou logs próprios. Recarregar remove a chave pessoal. A conexão do servidor usa as variáveis da Netlify e nunca devolve sua chave ao navegador.

`/api/config` retorna apenas disponibilidade, provedor, modelo e runtime. `/api/connection` faz uma consulta real e só confirma a conexão após uma função Python ter sido executada. A configuração não permite fornecer um endpoint arbitrário pelo navegador. O backend restringe os hosts dos provedores e não segue redirecionamentos.

As mensagens ficam na sessão da aba, separadas dos históricos antigos. Os provedores de infraestrutura e IA têm políticas próprias de tratamento e retenção. `store: false` na chamada OpenAI não é promessa de retenção zero na cadeia inteira.

## Publicação

Interface e transporte na Netlify; backend Python nativo na Vercel. `python-deployment.json` guarda somente a URL pública do backend. As publicações são manuais e independentes. O CI roda testes JavaScript, testes Python, o benchmark histórico de referência e o build.

A base é fictícia. Não há ações de cancelamento, reembolso, envio de mensagem ou abertura de chamado. Para atendimento real, adicionar autenticação, autorização, cotas globais, observabilidade com redação e avaliação com dados representativos.
