# Pokémon Champions

Webapp para navegar os **times campeões de Pokémon Champions (VGC 2026)** de um jeito mais
agradável que a planilha pública (VGCPastes): grid de times com sprites, detalhe completo de
cada Pokémon (item, habilidade, nature, Tera, EVs/IVs, golpes) e busca por Pokémon.

Exercício do **Método Akita** — fatias verticais finas, TDD (red→green), CI verde por commit,
deploy simples, build-to-learn.

## Funcionalidades

- **Grid de times** campeões com sprites (PokeAPI), metadados (resultado, evento, treinador) e
  nome de cada Pokémon.
- **Detalhe sob demanda** (modal): item (com ícone), habilidade, nature, Tera, EVs e os 4 golpes
  em grade 2×2.
- **Busca por Pokémon** — filtro client-side instantâneo sobre os times carregados.
- **Tema escuro** coeso, cards de altura uniforme.
- **Atualização automática** dos dados: a lista re-ingere sozinha quando passa o TTL (planilha
  muda semanalmente) — sem restart.

## Stack

- **Monorepo:** pnpm workspaces · Node ≥ 20.
- **Backend:** Fastify 5 + TypeScript, validação/serialização na borda com `fastify-type-provider-zod`. Build com `tsup`.
- **Frontend:** Vite 7 + React 19 + TypeScript (SPA estático) · Tailwind CSS v4.
- **Contrato:** `@pokemon-champions/shared` (zod-first) — fonte única de tipos server↔web.
- **Dados externos:** planilha (Google Sheets CSV), pastes (`@pkmn/sets`, formato Showdown),
  sprites e ícones de item (PokeAPI).
- **Testes:** vitest (node + jsdom). **Lint:** ESLint flat + typescript-eslint.

## Arquitetura

```
packages/
  shared/   # contrato zod: Team, PokemonSet, TeamDetail (núcleo estável; sem I/O)
  server/   # Fastify API + ingestão + cache; em produção serve o SPA buildado
    src/domain/   # núcleo PURO (TDD): csv, paste, names, sprites, items, assemble
    src/ingest/   # casca IMPURA (rede): fetchers + orchestrator + detail
    src/cache/    # L2 disco (data/cache/): sprites, items, details
    src/http/     # app Fastify (factory buildApp), rotas, schemas zod, serve o SPA
  web/      # React SPA: api/client (revalida com zod) + componentes
```

**Fluxo de dados:** `sheet CSV → parse → pokepaste /json → @pkmn/sets → mapeia nome→sprite e
item→ícone (PokeAPI) → assemble → cache (memória + disco, com TTL) → API → React`.

Princípio do server: **Functional Core, Imperative Shell** — `domain/` é puro e testável;
todo I/O (rede, disco, env) fica nas bordas (`ingest`/`cache`/`http`/`index.ts`).

## Rodando localmente

Pré-requisitos: **Node ≥ 20** e **pnpm 11** (`npm i -g pnpm`).

```bash
pnpm install            # instala tudo (esbuild já liberado em allowBuilds)

# Config: copie o exemplo e preencha SHEET_CSV_URL
cp packages/server/.env.example packages/server/.env
# edite packages/server/.env e cole a URL de export CSV da planilha

pnpm dev                # Fastify :3000 + Vite :5173 (proxy /api → :3000)
```

Abra **http://localhost:5173**. Em dev, o Vite serve o SPA e faz proxy de `/api` pro Fastify.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | server (:3000) + web (:5173) em paralelo |
| `pnpm test` | suíte completa (vitest) |
| `pnpm typecheck` | `tsc --noEmit` em todos os pacotes |
| `pnpm lint` | ESLint |
| `pnpm build` | build de todos os pacotes (shared bundlado no server via tsup) |

CI local antes de commitar: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Variáveis de ambiente

Lidas **só na borda** (`packages/server/src/index.ts`). Veja `packages/server/.env.example`.

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `SHEET_CSV_URL` | **sim** | — | URL de **export CSV** da planilha (`.../export?format=csv&gid=<GID>`) |
| `POKEAPI_BASE_URL` | não | `https://pokeapi.co/api/v2` | base da PokeAPI (sprites + itens) |
| `TEAMS_TTL_MS` | não | `21600000` (6h) | validade do cache da lista de times; vencido → re-ingere |
| `WEB_DIST_PATH` | não | auto (`packages/web/dist`) | onde o SPA buildado mora (só p/ override) |
| `PORT` / `HOST` | não | `3000` / `0.0.0.0` | em produção o host injeta `PORT` |
| `SPRITE_CACHE_PATH` / `ITEM_CACHE_PATH` / `DETAIL_CACHE_DIR` | não | `data/cache/…` | caminhos do cache em disco |

> O `.env` é gitignored. O `.env.example` (público) não contém segredos — `SHEET_CSV_URL` fica
> em branco. A planilha-fonte é pública (sem credenciais).

## Deploy (Railway)

Em produção roda como **um único processo**: o Fastify serve o SPA buildado (`packages/web/dist`)
**e** a API — sem CORS. O `railway.json` na raiz declara build, start e healthcheck.

1. **New Project → Deploy from GitHub repo** (branch `main`).
2. **Variables:** `SHEET_CSV_URL` (obrigatória); opcionais acima.
3. Deploy. Build: `pnpm install --frozen-lockfile && pnpm build` · Start:
   `node packages/server/dist/index.js` · Healthcheck: `/api/health`.

O cache em disco é **efêmero** (re-ingere a cada restart) — alinhado ao TTL e à cadência
semanal da planilha. Sem volume persistente.

## API

| Rota | Resposta |
|---|---|
| `GET /api/health` | `{ "status": "ok" }` |
| `GET /api/teams` | lista de times com sprites (`TeamsResponse`) |
| `GET /api/teams/:id/detail` | config completa do time (`TeamDetail`); 404 se não existe |

Toda resposta é validada por schema zod (na borda do server **e** revalidada no web).
