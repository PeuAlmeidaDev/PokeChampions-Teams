# Spec — Deploy no Railway (Fastify serve o SPA + config)

**Data:** 2026-06-27
**Tipo:** fatia de servidor + infra (http + borda + config de deploy)
**Branch alvo:** `feat/deploy-railway` (a partir de `main`)

## Problema

O alvo de deploy do projeto (CLAUDE.md) é **um único processo: Fastify serve `web/dist` sem
CORS** — mas isso estava marcado como "fatia futura" e **não existe**: o server só responde
`/api`, e não há config de deploy (`railway.json`, etc.). Logo, o app **não é deployável** como
um artefato único.

## Objetivo

Tornar o app deployável no **Railway** como **um processo** que serve a API **e** o SPA:
1. Fastify serve `packages/web/dist` (estáticos + `index.html`) com **fallback SPA**.
2. Config declarativa do Railway (build + start + healthcheck).
3. Documentar os envs de produção.

Decisões já tomadas (com o Pedro): host **Railway**; build via **Nixpacks nativo** (sem
Dockerfile); cache **efêmero** (sem volume); refresh por TTL **já entregue** (PR #1). Fora de
escopo: Dockerfile, volume, CORS, CI/CD além do auto-deploy nativo do Railway.

## Decisões de design (com porquê)

- **`@fastify/static`** (plugin canônico do Fastify) servindo `web/dist` com
  `{ root, wildcard: false }`. `wildcard: false` cria rotas por arquivo e deixa o
  `setNotFoundHandler` cuidar do fallback (padrão SPA documentado pelo plugin).
- **Fallback SPA via `setNotFoundHandler`:** rota não-casada →
  - se `req.url` começa com `/api` → **404 JSON** (não vaza HTML; mantém o contrato da API);
  - senão → `reply.sendFile("index.html")` (client-side routing e reload funcionam).
- **Serving é opt-in por `webDistPath`** no `buildApp(deps)`. Se a composition root passar o
  caminho, registra static + fallback; se não, comportamento atual (API-only). Assim os testes
  via `inject()` continuam dirigindo só `/api`, e novos testes passam um `webDistPath` de
  fixture. Mantém o `buildApp` testável.
- **Caminho do `web/dist` resolvido por `import.meta.url`, não `cwd`.** O `index.js` compilado
  fica em `packages/server/dist/`; `resolve(dirname(fileURLToPath(import.meta.url)),
  "../../web/dist")` → `packages/web/dist` (igual em dev via tsx e em prod). Override por env
  `WEB_DIST_PATH`.
- **Gate por `existsSync` na borda (`index.ts`).** Em **dev**, `web/dist` não existe (o Vite
  serve o SPA na :5173 com proxy `/api`), então registrar o static num dir inexistente
  **quebraria o `pnpm dev`** (o plugin lança no `ready`). Solução: `index.ts` passa o
  `webDistPath` **só se o diretório existir**; senão passa `undefined` (API-only). Em prod o
  `pnpm build` cria `web/dist` → serve; em dev não existe → pula. Automático, sem flag de
  ambiente. (`existsSync` é I/O — fica na borda `index.ts`, nunca no domínio.)
- **`railway.json` na raiz**, builder Nixpacks, `--frozen-lockfile` (build determinístico;
  exige `pnpm-lock.yaml` atualizado ao adicionar a dep), healthcheck no `/api/health` (já existe).

## Interfaces / mudanças

**`packages/server/src/http/app.ts`** — `AppDeps` ganha `webDistPath?: string`; `buildApp` passa
a registrar o static quando presente:
```ts
export interface AppDeps {
  getTeams: () => Promise<TeamsResponse>;
  getTeamDetail: (id: string) => Promise<TeamDetail | null>;
  webDistPath?: string; // quando setado, serve o SPA + fallback
}
```
Registro (depois das rotas `/api`):
```ts
if (deps.webDistPath) {
  app.register(fastifyStatic, { root: deps.webDistPath, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) {
      return reply.code(404).send({ error: "not found" });
    }
    return reply.code(200).type("text/html").sendFile("index.html");
  });
}
```

**`packages/server/src/index.ts`** — resolve o caminho e passa só se existir:
```ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const webDistCandidate =
  process.env.WEB_DIST_PATH ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const webDistPath = existsSync(webDistCandidate) ? webDistCandidate : undefined;
if (!webDistPath) {
  console.warn(`[web] ${webDistCandidate} not found — serving API only (dev/Vite mode)`);
}
```
e adicionar `webDistPath` ao `buildApp({ ... })`.

**`packages/server/package.json`** — `+ "@fastify/static": "^8"` em dependencies (versão
compatível com Fastify 5; confirmar a major no install). Atualiza `pnpm-lock.yaml`.

**`railway.json`** (raiz):
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm build"
  },
  "deploy": {
    "startCommand": "node packages/server/dist/index.js",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

**`packages/server/.env.example`** — documentar os envs de produção: `SHEET_CSV_URL`
(obrigatório), `POKEAPI_BASE_URL`, `TEAMS_TTL_MS` (vem do PR #1), `WEB_DIST_PATH` (opcional;
default resolvido automaticamente), `PORT`/`HOST` (o Railway injeta `PORT`).

## Testes (TDD onde dá)

**`packages/server/src/http/app.test.ts`** — com um `webDistPath` apontando para um dir de
fixture temporário contendo um `index.html` (`<!doctype html><title>spa</title>`):
- `GET /` → 200 + corpo contém o html do `index.html`.
- `GET /alguma/rota/spa` → 200 + mesmo `index.html` (fallback do client-routing).
- `GET /api/inexistente` → **404** com corpo **JSON** (`{ error }`), **não** html.
- (Os testes existentes, sem `webDistPath`, seguem API-only inalterados.)

Sem teste do `railway.json` nem do `existsSync`-gate (config declarativa / I/O de borda) — a
verificação é o build/deploy real.

## Verificação

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes.
- **Local (prod-like):** `pnpm build`, depois `SHEET_CSV_URL=... node packages/server/dist/index.js`
  → abrir `http://localhost:3000` e ver o SPA servido pelo Fastify (não o Vite); `GET /api/health`
  responde; um reload numa rota do cliente não dá 404.
- **`pnpm dev` continua funcionando** (web/dist ausente → API-only + Vite na :5173).

## Sequência de merge (atenção)

Esta branch sai de `main` (sem o TTL — que está no PR #1). O `index.ts` é tocado pelas duas
fatias, mas em **linhas/funções diferentes** (TTL: `ttlMs` no `createTeamsService`; deploy:
`webDistPath` no `buildApp`) → merge provavelmente **sem conflito**. Recomendação: **mergear o
PR #1 (TTL) primeiro**, depois esta; assim o `main` deployado já leva o TTL junto. Se mergear
fora de ordem, resolver o `index.ts` é trivial.

## Plano de entrega

Fatia única, branch própria. Provável quebra:
1. `@fastify/static` dep + `buildApp` serve SPA/fallback (TDD em `app.test.ts`).
2. `index.ts` resolve `webDistPath` com gate `existsSync` (typecheck/build).
3. `railway.json` + `.env.example` (config/docs).
