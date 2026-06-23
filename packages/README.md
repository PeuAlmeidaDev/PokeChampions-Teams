# packages/

Os **workspaces** do monorepo. Cada subpasta é um pacote independente com seu próprio
`package.json`, mas todos instalados e versionados juntos pelo pnpm.

## Os três pacotes e a regra de dependência

```
        ┌─────────────┐
        │   shared    │   ← contrato (zod): Team, PokemonSet, TeamsResponse
        │ (sem deps)  │     NÃO depende de ninguém
        └──────┬──────┘
        ▲              ▲
        │              │
 ┌──────┴─────┐  ┌─────┴──────┐
 │   server   │  │    web     │
 │ (produz)   │  │ (consome)  │
 └────────────┘  └────────────┘
```

- **`shared`** é o **núcleo estável**: define o formato dos dados e nada mais.
- **`server`** e **`web`** dependem de `shared`, nunca um do outro.
- A dependência é sempre **acíclica** (uma seta nunca volta). Ciclo entre pacotes é um
  cheiro de design: significa que duas coisas que deveriam ser separadas estão grudadas.

## Por que essa direção

Padrão de mercado conhecido como **shared kernel** (núcleo compartilhado) / *contract-first*.
O contrato é a peça mais estável e mais reutilizada, então ele fica embaixo, sem
dependências. Quem muda mais (a API, a UI) fica em cima e depende do que é estável — nunca
o contrário. Isso é o **Princípio da Inversão de Dependência** aplicado entre pacotes:
dependa de abstrações estáveis, não de detalhes voláteis.

## Como um pacote referencia o outro

No `package.json` do `server` e do `web`:

```json
"dependencies": { "@pokemon-champions/shared": "workspace:*" }
```

O prefixo `workspace:*` diz ao pnpm "use a versão local deste monorepo, não baixe do
registro". É o que liga os pacotes por código-fonte real.
