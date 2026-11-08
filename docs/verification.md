# Verificação da versão inicial

Data: **07/11/2026**.

| Camada | Resultado observado |
|---|---|
| Controlador e contrato HTTP | 12 testes passaram com `npm test` |
| Benchmark determinístico | 24 de 24 casos passaram com `npm run evaluate` |
| Build | `npm run build` produziu `dist/` |
| GitHub Actions | Workflow Quality concluído com sucesso no push inicial |
| Netlify | Deploy de produção concluído, frontend e `/api/chat` acessíveis publicamente |
| Modelo real | 6 de 6 consultas passaram no smoke test, todas com `mode: ia` |
| Interface | Navegação, busca na base, consulta com fontes, modo de fallback e layout de celular e desktop inspecionados em navegador |

O smoke test pode ser reproduzido com `python3 evaluation/smoke.py --url https://nexo-suporte-arthurmoury.netlify.app`. Ele usa créditos e não roda automaticamente no CI. Resultados e tempos estão em [live-smoke.json](live-smoke.json). O primeiro teste detectou ausência da política de contato em um encaminhamento. O controlador passou a consultar essa política em pedidos humanos e ganhou um teste específico.

A captura em [screenshot.png](screenshot.png) mostra uma resposta real de IA e o artigo usado. Ela não é um mockup.

Os resultados são de uma demonstração sintética pequena. Não medem generalização para atendimento real, taxa de resolução comercial ou qualidade semântica independente. O adaptador de LLM as a judge foi incluído, mas não foi executado como parte desta validação.

## Interface Nexo IA, 08/11/2026

A interface passou a usar a identidade Nexo IA, com logo vetorial própria. A barra superior reúne Central de Suporte e Assistente Nexo. O painel de fontes começa recolhido, com abertura manual e por citação. A base apresenta o contexto de uma loja fictícia de assinaturas de software, e a página do projeto ganhou uma apresentação visual do processo.

Verificações realizadas nesta atualização:

- `npm run check`: 12 testes de comportamento, 24 casos do benchmark e build aprovados.
- Navegador em desktop e celular de 390 × 844: navegação, início em uma linha e ausência de transbordamento horizontal.
- Campo sem alça de redimensionamento, com crescimento automático de 28 para 96 pixels ao inserir quatro linhas.
- Histórico reaberto após recarregar, incluindo na versão publicada. Exemplos identificados e acessíveis no celular.
- Citação abre o painel e o artigo tanto no computador quanto no celular. O painel permanece fechado após uma resposta quando não foi aberto pelo usuário.
- Uma consulta real de IA na Netlify respondeu à pergunta sobre reembolso e ficou disponível no histórico da aba.

Capturas da versão publicada: [tela inicial](interface-v2.png) e [sobre o projeto](project-v2.png). As capturas anteriores e os resultados de 07/11/2026 permanecem como registro da versão inicial.


## Navegação lateral e imagem do GitHub, 08/11/2026

A navegação principal ganhou controles para abrir e fechar, transição de 260 ms e preferência separada para computador e celular no armazenamento da sessão. No computador o conteúdo ocupa a área liberada. No celular o menu aparece sobre o conteúdo, com fundo atenuado, foco contido e fechamento por Esc, botão, toque fora e seleção de seção. Com movimento reduzido, as transições ficam desativadas. O painel de fontes mantém seu controle independente.

A nova captura [interface-v3.png](interface-v3.png) mostra a versão publicada e substitui a imagem principal do README. O novo caminho também evita reutilizar o endereço da captura anterior nos caches de imagens. `npm run check` passou com 12 testes, 24 casos determinísticos e build. A abertura, o fechamento, a preferência após recarregar e o menu móvel foram conferidos no navegador.

## Atendimento por opções, 08/11/2026

A experiência principal passou a começar com cinco assuntos, sem campo de mensagem livre. Assuntos levam a categorias, problemas específicos e 24 soluções cadastradas. A interface oferece retorno de etapa, menu inicial, confirmação de resolução e resumo para atendimento humano com o caminho completo.

Verificações desta versão:

- `npm run check`: 18 testes JavaScript, 24 casos do benchmark Python da API experimental e build aprovados.
- Os seis testes novos percorrem todas as 24 situações, verificam fontes, IDs, restauração, retorno, caminhos inválidos e resumo de encaminhamento.
- No navegador, foram percorridos os caminhos de senha e reembolso, incluindo confirmação de resolução, atualização da página, retorno de etapas e cópia do resumo humano.
- O atendimento financeiro foi conferido no celular em 390 × 844.
- Na publicação Netlify, foi percorrido Equipe e arquivos → Arquivos e exportação → Meu arquivo não pode ser enviado, chegando aos passos da solução.
- A tela inicial publicada mostra as cinco opções. O atendimento guiado não chama o endpoint de mensagens nem um modelo de IA. A API permanece como experimento separado.

Capturas atuais: [menu inicial](guided-support.png) e [solução com passos](guided-solution.png). Os registros e imagens anteriores documentam versões históricas da interface de mensagens.
