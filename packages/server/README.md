# @pokemon-champions/server

**Responsabilidade:** transformar dados externos bagunçados (planilha do Google + links de
pokepaste + PokeAPI) em uma **API limpa e estável** que o `web` consome — e, em produção,
servir o próprio SPA buildado.

## Arquitetura interna: "Functional Core, Imperative Shell"

A pasta `src/` é organizada por **camadas de responsabilidade**, e a regra de ouro é
**separar o que é puro do que toca o mundo externo**:

```
src/
├─ domain/     # NÚCLEO PURO — funções sem efeitos colaterais (a parte testável)
│   ├─ csv.ts        # texto do CSV → linhas de time (RawTeamRow[])
│   ├─ paste.ts      # JSON do pokepaste → PokemonSet[] (via @pkmn/sets)
│   ├─ names.ts      # nome Showdown → slug PokeAPI (overrides + regra + fallback)
│   ├─ sprites.ts    # slug → URL do sprite
│   └─ assemble.ts   # junta linhas + pastes + sprites → Team[]
├─ ingest/     # CASCA IMPERATIVA — I/O de rede (fetch do sheet, pokepastes, PokeAPI)
├─ cache/      # persistência: L1 memória + L2 disco (data/cache/)
├─ http/       # Fastify: app (factory buildApp), rotas, validação na borda
└─ index.ts    # composition root / entrada: lê env e dá listen
```

### Por que essa separação (first principle)

- **`domain/` é puro:** mesma entrada → mesma saída, sem rede, sem disco, sem relógio.
  Isso é o que torna o TDD barato — testa-se sem mockar nada, com fixtures. É o
  *functional core*.
- **`ingest/`, `cache/`, `http/` são a casca imperativa:** lidam com o caos do mundo
  (rede caindo, arquivo faltando, formato inesperado). Concentrar o I/O nas bordas mantém
  o miolo limpo e confiável.
- **Direção de dependência:** a casca depende do núcleo, **nunca o contrário**. `http/`
  chama `domain/`; `domain/` não sabe que `http/` existe. (Inspirado em *Ports & Adapters*
  / Arquitetura Hexagonal.)

## Padrões de mercado usados aqui

- **Factory (`buildApp`)**: cria a instância Fastify **sem** dar `listen`. Assim os testes
  exercitam as rotas via `app.inject()` (sem abrir socket), e só o `index.ts` realmente
  sobe o servidor. Separa *construir* de *executar*.
- **Validação na borda**: `fastify-type-provider-zod` valida request e serializa response
  contra os schemas do `shared`. Nada externo entra cru no domínio.
- **Cache em camadas (L1/L2)**: memória (rápida) + disco (sobrevive a restart, evita
  marteladar APIs de terceiros).
- **Cliente educado de API**: segue redirect 307, limita concorrência, faz retry com
  backoff (mas nunca em 404), e degrada graciosamente — um dado ruim não derruba tudo.

## Configuração

| Arquivo | Função |
|---|---|
| `package.json` | Scripts (`dev` com `tsx watch`, `build` com `tsup`, `start`, `typecheck`). |
| `tsconfig.json` | Herda o base + `types: ["node"]`. |
| `vitest.config.ts` | Testes em ambiente `node`. |
| `src/http/app.ts` | `buildApp()` — instância Fastify configurada (compilers zod + rotas). |
| `src/index.ts` | **Única** borda que lê `process.env` (porta/host) e dá `listen`. |

## Princípio de responsabilidade aplicado

Regra prática ao adicionar código: **"isso é decisão (puro) ou é efeito (I/O)?"** Decisão
vai pra `domain/`; efeito vai pra `ingest`/`cache`/`http`. Handler de rota é **fino**:
recebe, chama o domínio, responde — sem lógica de negócio dentro.
