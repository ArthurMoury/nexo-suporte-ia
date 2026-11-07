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
