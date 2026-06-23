# PokémonChampions

Webapp para navegar **times campeões de Pokémon Champions (VGC 2026)** de forma mais
agradável que a planilha pública (VGCPastes): grid de times, detalhe das configs de cada
Pokémon (item/EV/IV/nature/Tera/moves) e busca por Pokémon.

> Governança técnica (convenções, riscos, decisões) vive em [`CLAUDE.md`](./CLAUDE.md).
> Este README é a porta de entrada do repositório.

## Por que monorepo

O projeto tem três partes que evoluem juntas e **compartilham um contrato de dados**
(o formato de um "time"). Em vez de três repositórios separados (com versionamento e
sincronização manual do contrato), usamos um **monorepo** com [pnpm workspaces]: um único
repo, um único `pnpm install`, e o contrato compartilhado por referência direta de código.

Padrão de mercado: *monorepo com workspaces* (mesmo modelo de Turborepo, Nx, Google).
Ganho central: **mudou o contrato num lugar, o TypeScript quebra em todos os consumidores
na hora** — em vez de descobrir o desencontro só em produção.

## As partes (ver [`packages/`](./packages/README.md))

| Package | Responsabilidade |
|---|---|
| [`shared`](./packages/shared/README.md) | Contrato de domínio (schemas zod + tipos). Fonte única da verdade. |
| [`server`](./packages/server/README.md) | Ingere a planilha + pokepastes, normaliza, cacheia, serve a API. |
| [`web`](./packages/web/README.md)       | SPA React que consome a API e apresenta. |

Direção de dependência (sempre acíclica): `web → shared` e `server → shared`.
O `shared` **não depende de ninguém** — é o núcleo estável.

## Como rodar

```bash
pnpm install     # instala tudo (1 vez)
pnpm dev         # server (Fastify :3000) + web (Vite :5173, proxy /api → :3000)
pnpm test        # suíte de testes (vitest)
pnpm typecheck   # checagem de tipos (tsc) em todos os packages
pnpm lint        # eslint
pnpm build       # build de produção de todos os packages
```

Pré-requisitos: **Node ≥ 20** e **pnpm** (`npm i -g pnpm`).

## Estrutura

```
.
├─ packages/          # os workspaces (shared, server, web)
├─ .github/workflows/ # CI (lint + typecheck + test + build)
├─ tsconfig.base.json # config TS estrita compartilhada por todos os packages
├─ eslint.config.js   # regras de lint (flat config)
├─ vitest.config.ts   # agrega os projetos de teste de cada package
├─ pnpm-workspace.yaml # declara os workspaces + allowBuilds
└─ CLAUDE.md          # governança do projeto
```

[pnpm workspaces]: https://pnpm.io/workspaces
