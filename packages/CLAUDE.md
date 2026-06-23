# CLAUDE.md — packages/

Escopo: os **workspaces** do monorepo. Complementa o `CLAUDE.md` da raiz.

## Os três pacotes

| Package | Responsabilidade única |
|---|---|
| `shared` | Contrato de domínio (schemas zod + tipos). Núcleo estável. |
| `server` | Ingere/normaliza dados externos, cacheia, serve a API. |
| `web` | SPA React: consome a API e apresenta. |

## Regras (inegociáveis)

- **Dependência acíclica.** `web → shared` e `server → shared`. **Nunca** `web → server`,
  `server → web`, nem `shared → qualquer`. Uma seta que volta = erro de design.
- **`shared` não depende de ninguém.** É o que muda menos; tudo aponta pra ele.
- **Referência sempre por `workspace:*`** no `package.json` (`"@pokemon-champions/shared":
  "workspace:*"`) — versão local do monorepo, não do registro.
- Ao criar um pacote novo: adicione ao glob `packages/*` (já coberto), `tsconfig.json`
  estendendo o base, e declare suas deps explicitamente (pnpm é estrito — sem fantasma).

## Princípio

Direção de dependência segue a **estabilidade**: dependa do estável (`shared`), nunca o
estável depender do volátil. (Inversão de dependência entre pacotes.)
