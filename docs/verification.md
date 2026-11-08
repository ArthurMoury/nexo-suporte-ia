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
