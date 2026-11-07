# Como avaliar sem confundir as métricas

O benchmark inicial tem 24 perguntas sintéticas. `dev` serve para ajustes e `test` para regressão. Os dois grupos compartilham políticas e foram criados durante o desenvolvimento. Portanto, não formam um estudo independente de generalização.

```sh
npm run evaluate
python3 evaluation/evaluate.py --split test
python3 evaluation/evaluate.py --url http://127.0.0.1:4173 --mode base
python3 evaluation/evaluate.py --url https://nexo-suporte-arthurmoury.netlify.app --mode auto
```

O último comando usa chamadas reais de modelo e pode consumir créditos. O limite por IP pode retornar 429. Para uma execução completa, use uma instância local configurada ou distribua a execução respeitando o limite. O avaliador falha se você pedir `auto` e algum caso normal cair para busca sem modelo. As entradas de ataque podem ser bloqueadas antes da chamada de IA.

| Verificação | O que comprova | O que não comprova |
|---|---|---|
| `retrieval_recall` | IDs esperados apareceram nas citações finais | Qualidade semântica do ranking completo |
| `citation_validity` | IDs citados existem na base | Cada afirmação é sustentada |
| `approved_text_match` | Resposta coincide literalmente com os artigos citados, ou encaminha sem fonte | Relevância e completude |
| `fact_match` | Fatos esperados aparecem no texto | Ausência de todos os erros possíveis |
| `no_forbidden_claim` | Alegações proibidas cadastradas não aparecem | Segurança universal |
| `routing` | Decisão de responder ou encaminhar coincide com a referência | Chamado real aberto |
| `handoff_contract` | Rascunho acompanha o encaminhamento | Envio externo |
| Consistência de fontes | Paráfrases retornam o mesmo conjunto de fontes | Correção dos fatos |

## Juiz semântico opcional

```sh
python3 evaluation/judge.py evaluation/judge-sample.json
```

Esse adaptador usa `OPENAI_API_KEY`, `OPENAI_BASE_URL` e `JUDGE_MODEL` no ambiente. Não roda no CI, não usa credenciais do navegador e não é uma medição já realizada. O exemplo contém intencionalmente “70 dias” com uma fonte que diz “7 dias”, para calibrar faithfulness.

As notas de relevance e faithfulness são julgamentos de outro modelo. Compare com revisores humanos, use exemplos positivos e negativos, repita amostras, revise discordâncias e registre versão do juiz e rubric. Uma única nota não deve aprovar uma versão sozinha.

## Evolução do benchmark

1. Registre falhas novas com perguntas sintéticas ou devidamente anonimizadas.
2. Anote fontes esperadas, fatos essenciais, decisão e alegações proibidas.
3. Reserve um conjunto novo, escrito por outra pessoa, sem usá-lo para ajustar o prompt.
4. Compare baseline e agente com o mesmo conjunto.
5. Inspecione rastros e intervenções, além de custo e latência.
6. Só apresente números reais do modo avaliado, sem misturar fallback com execução de IA.
