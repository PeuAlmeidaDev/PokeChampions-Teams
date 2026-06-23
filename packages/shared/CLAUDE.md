# CLAUDE.md — @pokemon-champions/shared

Escopo: o **contrato de domínio** — fonte única da verdade sobre o formato dos dados que
trafegam entre `server` e `web`.

## Faça

- Defina **schemas zod** e derive o tipo deles: `export type Team = z.infer<typeof
  TeamSchema>`. Um schema gera tipo (compile-time) **e** validador (runtime) — DRY na borda.
- Mantenha tudo **puro e passivo**: só descrição de dados.
- Re-exporte a API pública por `src/index.ts`.

## Nunca

- **Sem I/O** aqui: nada de `fetch`, leitura de arquivo, acesso a disco/rede.
- **Sem regra de negócio** nem transformação de dados (isso é do `server`).
- **Sem `process.env`**.

## Sinal de responsabilidade vazando

Apareceu um `fetch`, um `fs`, ou lógica de transformação neste pacote? Mova para o `server`.
Este pacote só diz **qual é o formato**, não como obtê-lo.

## Config

- `package.json` exporta `./src/index.ts` direto (padrão *internal package*: consumidores
  transpilam; sem build separado).
- Mudou um schema aqui? `server` (quem produz) e `web` (quem revalida) precisam refletir —
  o TypeScript vai apontar onde.
