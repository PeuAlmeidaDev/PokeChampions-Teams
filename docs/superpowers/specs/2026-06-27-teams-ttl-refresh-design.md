# Spec — Refresh da lista de times por TTL (hard)

**Data:** 2026-06-27
**Tipo:** fatia de servidor (casca `ingest/` + borda `index.ts`)
**Branch alvo:** `feat/teams-ttl-refresh` (a partir de `main`)

## Problema

A lista de times é ingerida da planilha no primeiro request e guardada em memória
(`orchestrator.ts`, variável `cached`) **sem expiração**. Não há TTL nem endpoint de refresh
(o hurdle nº7 do CLAUDE.md ficou pendente). Consequência: quando a planilha é atualizada
(semanalmente), a mudança **só aparece após um restart do processo**. Em produção (Railway,
disco efêmero) isso significa redeploy/restart manual a cada semana.

## Objetivo

Fazer a lista de times **re-ingerir sozinha** quando fica velha, sem restart e sem ação manual.
Escolha tomada (com o Pedro): **hard TTL** — passado o TTL, o próximo request **espera** o
re-ingest e recebe o dado fresco. Variante stale-while-revalidate descartada (mais código; a
espera ocasional do hard TTL é irrelevante no tráfego baixo deste app).

Fora de escopo (YAGNI agora): `POST /api/refresh` (auth/superfície nova), volume persistente,
TTL no detalhe por time (paste de um time raramente muda; e no deploy efêmero o cache de
detalhe zera no restart de qualquer jeito).

## Decisões de design (com porquê)

- **Hard TTL, não SWR.** Tráfego baixo + dado semanal → o "momento de expiração" é raro e a
  espera (~1–3s, com cache de sprite quente) é aceitável. Menos código, frescor forte. A
  estrutura permite evoluir pra SWR depois sem retrabalho.
- **O front NÃO faz polling.** `App.tsx` busca `/api/teams` uma vez no mount; não re-busca. Logo
  o TTL do servidor **nunca atualiza a tela no meio da sessão** — um usuário com o modal aberto
  estudando fica intocado; o dado novo só aparece num **reload** (momento que ele controla).
  Isso protege o caso de uso "estudar com o modal aberto". Registrado como decisão explícita.
- **Degradação graciosa na falha.** Se o re-ingest (vencido) falhar — planilha fora do ar — o
  service **devolve o `cached` velho** (loga, não lança). Dado velho > erro. Só propaga erro
  (→ 503) quando **não há cache nenhum** (falha no primeiríssimo load). Como `cached`/`cachedAt`
  não são atualizados na falha, o próximo request vencido **retenta** (sem backoff agora — YAGNI;
  tráfego baixo, planilha raramente cai).
- **Single-flight preservado.** Requests concorrentes (no load inicial OU num re-ingest vencido)
  compartilham uma única promise `inFlight` — nunca dois ingests simultâneos.
- **Relógio injetável.** O orchestrator é casca (não domínio puro), então pode usar relógio;
  mas injetamos `now?: () => number` (default `Date.now`) para os testes controlarem o tempo
  sem `vi.useFakeTimers` no relógio do cache.

## Mudança de interface

`TeamsServiceDeps` ganha:
```ts
  ttlMs: number;            // validade do cache em memória (ms)
  now?: () => number;       // relógio injetável; default Date.now
```
`createTeamsService` passa a rastrear `cachedAt: number | null` junto de `cached`.

`index.ts` (borda de env) lê:
```ts
const teamsTtlMs = Number(process.env.TEAMS_TTL_MS ?? 6 * 60 * 60 * 1000); // default 6h
```
e passa `ttlMs: teamsTtlMs` ao `createTeamsService`. (Sem `now` → usa `Date.now`.)

`getTeams()` (comportamento final):
```
se cached e não-vencido            -> devolve cached
se inFlight                        -> devolve inFlight (load inicial ou re-ingest em curso)
senão (sem cache, ou vencido)      -> inFlight = ingest()
                                        .then  -> cached = r; cachedAt = now(); return r
                                        .catch -> se cached: log + return cached (velho)
                                                  senão: throw (-> 503)
                                        .finally-> inFlight = null
                                      return inFlight
```
"vencido" = `cachedAt !== null && now() - cachedAt >= ttlMs`.

## Componentes afetados

- **`packages/server/src/ingest/orchestrator.ts`** — TTL + `cachedAt` + relógio injetável +
  fallback-stale-on-failure. Núcleo da fatia.
- **`packages/server/src/index.ts`** — lê `TEAMS_TTL_MS`, passa `ttlMs`.
- **Nada no front, no `shared`, no domínio puro, nem no detalhe.**

## Testes (TDD, `orchestrator.test.ts`)

Injetando `fetchSheetCsv` mock + `now` controlável:
- **dentro do TTL** → 2 chamadas a `getTeams` re-ingerem **uma vez só** (`fetchSheetCsv` 1×);
  devolve o mesmo `cached`.
- **após o TTL** (avança `now` além de `ttlMs`) → próximo `getTeams` re-ingere
  (`fetchSheetCsv` 2×) e devolve o **dado novo** (ex: `fetchedAt`/contagem diferente).
- **falha no re-ingest vencido** → `fetchSheetCsv` rejeita na 2ª; `getTeams` **devolve o cached
  velho** (não lança); e um request seguinte **retenta** (3ª chamada).
- **falha sem cache** (1º load rejeita) → `getTeams` **propaga** o erro (rota → 503), e a
  chamada seguinte retenta (inFlight limpo).
- **single-flight** preservado: chamadas concorrentes no load compartilham uma promise
  (`fetchSheetCsv` 1×) — teste existente continua válido.

(Os testes existentes do orchestrator passam a precisar de `ttlMs` nas deps — adicionar um valor
grande, ex. `ttlMs: 1_000_000`, pra não vencer no meio do teste.)

## Verificação

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes.
- **Manual (opcional):** subir local com `TEAMS_TTL_MS=5000`, bater `/api/teams` 2× com >5s de
  intervalo e ver o segundo re-ingerir (log de ingest / `fetchedAt` novo).

## Plano de entrega

Fatia única, branch própria, TDD. Provável quebra:
1. TTL + `cachedAt` + relógio injetável + fallback-stale em `orchestrator.ts` (TDD; ajustar
   testes existentes pra passar `ttlMs`).
2. Wiring `TEAMS_TTL_MS` em `index.ts` (typecheck/build).
