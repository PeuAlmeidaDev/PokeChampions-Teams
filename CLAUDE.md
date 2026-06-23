# CLAUDE.md — PokémonChampions

Governança viva do projeto. A IA relê este arquivo antes de agir. Complementa o
`CLAUDE.md` global do Pedro (não substitui).

## O que é

Webapp para navegar **times campeões de Pokémon Champions (VGC 2026)** de forma mais
agradável que a planilha pública (VGCPastes): grid de times, detalhe das configs de cada
Pokémon (item/EV/IV/nature/Tera/moves) e busca por Pokémon. Exercício do **Método Akita**
(fatias finas, TDD, CI verde, deploy simples, build-to-learn).

## Stack

- **Monorepo:** pnpm workspaces (Node ≥ 20).
- **Backend:** Fastify 5 + TypeScript, validação/serialização na borda via
  `fastify-type-provider-zod` (zod). Build com `tsup` (esbuild bundla o `shared`).
- **Frontend:** Vite 7 + React 19 + TypeScript (SPA estático).
- **Contrato:** `@pokemon-champions/shared` (zod-first) — fonte única de tipos server↔web.
- **Parser de paste:** `@pkmn/sets` (formato Showdown). **Sprites:** PokeAPI.
- **Testes:** vitest (node p/ shared+server, jsdom p/ web). **Lint:** ESLint flat +
  typescript-eslint.

## Arquitetura

```
packages/
  shared/   # zod: Team, PokemonSet, TeamsResponse (contrato)
  server/   # Fastify API + ingestão + cache + serve o SPA buildado
    src/domain/   # PURO (núcleo TDD): csv, paste, names, sprites, assemble
    src/ingest/   # IMPURO (rede): fetchers + orchestrator
    src/cache/    # L1 memória + L2 disco (data/cache/)
    src/http/     # app Fastify (buildApp factory), rotas, schemas zod
  web/      # React SPA: api/client + components (TeamGrid, TeamCard, PokemonSprite)
```

Fluxo de dados: **sheet CSV → parse → pokepaste /json → @pkmn/sets → mapeia nome→sprite
(PokeAPI) → assemble Team[] → cache (memória+disco) → API → React**.

## Como rodar

```bash
pnpm install            # instalar (esbuild precisa de allowBuilds — já configurado)
pnpm dev                # Fastify :3000 + Vite :5173 (proxy /api → :3000)
pnpm test               # suíte completa (vitest)
pnpm typecheck          # tsc --noEmit em todos os packages
pnpm lint               # eslint .
pnpm build              # build de todos os packages
```

## Convenções (inegociáveis)

- **TypeScript strict** (+ `noUncheckedIndexedAccess` — relevante p/ índices do CSV).
- **Validação na borda com zod.** Toda entrada externa (CSV, pokepaste, PokeAPI, request
  HTTP) é validada antes de entrar no domínio. Nunca confiar em dado externo cru.
- **SRP por arquivo / separação de camadas.** Domínio puro separado de I/O (rede/disco).
  Lógica de negócio fora de route handlers (handlers finos).
- **TDD.** Teste antes da implementação para toda função de domínio/serviço.
- **`process.env` só na borda** (`server/src/index.ts`). Nunca dentro do domínio.
- **Commits granulares**, Conventional Commits em inglês, um commit por task.
- **CI verde em todo commit.** Rode `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
  antes de commitar.
- **Degradação graciosa:** um dado externo ruim (paste/sprite) nunca derruba o ingest
  inteiro nem a resposta da API — registra o erro e segue com placeholder.

## Riscos / Hurdles (aprendidos — não repetir o erro)

1. **Sprite vem de uma PokeAPI possivelmente não-padrão**: o ambiente atual serve
   fan-megas (ex: `staraptor-mega`) que a `pokeapi.co` pública não tem. **Pinar a base URL
   em config** e documentar; ~30 megas quebram se repontar.
2. **`Floette-Eternal-Mega` não tem sprite** (2º Pokémon mais usado, 39 times) → fallback
   para `floette-mega`.
3. **Layout do CSV é frágil**: 2 linhas de banner + cabeçalho duplo; os 6 Pokémon ficam
   nas colunas **37–42** (índice 0), itens em **5/8/11/14/17/20**. **Achar colunas pelo
   cabeçalho, não por letra fixa.** Assert "200 times" como canário.
4. **Alguns pastes omitem EV/IV/Tera** → parser e tipos toleram set parcial.
5. **Bom cidadão de API**: seguir redirect **307** do sheet; limitar concorrência
   (`p-limit`), retry com backoff só em 5xx/rede, **nunca em 404** (404 = bug de
   mapeamento, logar). Dedupe + cache em disco. User-Agent descritivo.
6. **Mapeamento Showdown→PokeAPI** tem 9 overrides conhecidos (Basculegion, Maushold,
   Mimikyu, Palafin, Aegislash, etc.) + normalização naive + fallback de segmentos.
7. **Dados mudam (sheet semanal)**: TTL + `POST /api/refresh`, stale-while-revalidate.

## Decisões registradas

- **pnpm** instalado via `npm i -g pnpm` (corepack bloqueado por permissão em
  `Program Files`). pnpm bloqueia build scripts por segurança → `allowBuilds: { esbuild:
  true }` em `pnpm-workspace.yaml`.
- **Fastify** (vs Express): validação na borda nativa via schema zod, de graça.
- **`shared` exporta `.ts` direto** (padrão internal-package): consumidores transpilam;
  `tsup` bundla no build do server.
- **Deploy alvo:** único processo — Fastify serve `web/dist` (sem CORS). (Fatia futura.)
