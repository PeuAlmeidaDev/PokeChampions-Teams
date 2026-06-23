# CLAUDE.md — .github/workflows/

Escopo: **Integração Contínua (CI)**.

## `ci.yml`

Roda em todo `push`/`pull_request`, numa máquina limpa (Ubuntu), a mesma sequência do gate
local:

```
pnpm install --frozen-lockfile  →  lint  →  typecheck  →  test  →  build
```

## Regras

- **CI verde em todo commit** (princípio Akita: todo commit é candidato a produção).
- **Antes de commitar**, rode o gate local: `pnpm lint && pnpm typecheck && pnpm test &&
  pnpm build`.
- Mudou script/etapa de verificação? Atualize aqui **e** confirme que o gate local reflete
  o mesmo.
- `--frozen-lockfile`: build reproduzível; o lockfile manda. Se ele divergir, o CI falha de
  propósito.

> A CI só executa de fato com um **remote no GitHub** + `push`. Localmente, o gate acima
> reproduz o mesmo resultado.
