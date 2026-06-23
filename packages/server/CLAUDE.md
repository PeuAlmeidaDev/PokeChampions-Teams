# CLAUDE.md — @pokemon-champions/server

Escopo: o **backend**. Transforma dados externos bagunçados (sheet + pokepaste + PokeAPI)
numa API limpa, e em produção serve o SPA buildado.

## Arquitetura interna (Functional Core, Imperative Shell)

```
src/
├─ domain/   # NÚCLEO PURO: csv, paste, names, sprites, assemble (sem I/O — testável)
├─ ingest/   # CASCA: I/O de rede (sheet, pokepastes, PokeAPI)
├─ cache/    # persistência: L1 memória + L2 disco (data/cache/)
├─ http/     # Fastify: buildApp factory, rotas, validação zod na borda
└─ index.ts  # composition root: lê env e dá listen
```

## Regras (inegociáveis)

- **`domain/` é puro.** Sem rede, sem disco, sem relógio, sem `process.env`. Mesma entrada
  → mesma saída. É aqui que o TDD é barato (fixtures, sem mocks).
- **I/O só na casca** (`ingest`/`cache`/`http`). Concentrar o caos do mundo nas bordas.
- **Direção de dependência: casca → núcleo, nunca o contrário.** `http/` chama `domain/`;
  `domain/` não conhece `http/`.
- **Handler de rota é fino:** recebe → chama domínio → responde. **Zero** regra de negócio
  dentro do handler.
- **Validação na borda com zod** (`fastify-type-provider-zod`): nada externo entra cru.
- **`process.env` só em `index.ts`** (a única borda de ambiente).
- **`buildApp()` é factory sem `listen`** — para testes via `app.inject()`. Só o
  `index.ts` sobe o servidor.
- **Cliente educado de API externa:** seguir redirect 307; limitar concorrência
  (`p-limit`); retry com backoff **só em 5xx/rede, nunca em 404** (404 = bug de mapeamento,
  logar); dedupe + cache em disco; User-Agent descritivo.
- **Degradação graciosa:** um paste/sprite ruim nunca derruba o ingest nem a resposta —
  registra o erro e segue com placeholder.

## Pergunta-guia ao adicionar código

**"Isso é decisão (puro) ou efeito (I/O)?"** Decisão → `domain/`. Efeito → `ingest`/`cache`/
`http`.

## Config

- `dev`: `tsx watch`. `build`: `tsup` (esbuild bundla o `shared`). Testes: ambiente `node`.
