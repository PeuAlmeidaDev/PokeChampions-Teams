# @pokemon-champions/web

**Responsabilidade:** a **apresentação**. Consome a API do `server` e mostra os times de
forma agradável (grid, detalhe, busca). Não conhece a planilha, o pokepaste nem a PokeAPI —
só conhece a API limpa do nosso `server`.

## Por que o front não fala direto com as fontes externas

Poderíamos buscar a planilha e os pokepastes direto no navegador, mas isso esbarra em CORS,
é lento (centenas de requests) e frágil. Em vez disso, o `web` fala **só** com o nosso
`server`. Isso é **separação de responsabilidades** entre camadas: a complexidade de
ingestão/normalização fica no backend; o front cuida só de renderizar.

## Padrões de mercado usados aqui

- **SPA (Single Page Application)** com Vite + React: build estático, deploy trivial.
- **Revalidação defensiva da borda**: o `api/client.ts` revalida a resposta da API com o
  **mesmo schema zod do `shared`**. Se o server e o front saírem de sincronia, falha cedo e
  alto, em dev — em vez de renderizar lixo silenciosamente. (Conceito de *anti-corruption
  layer*: não confiar cegamente em dado que cruza a fronteira, mesmo vindo do nosso backend.)
- **Componentes de apresentação**: `TeamGrid`, `TeamCard`, `PokemonSprite` — cada um com
  uma responsabilidade visual única e recebendo dados via props (fáceis de testar isolados
  com fixtures).

## Configuração

| Arquivo | Função |
|---|---|
| `vite.config.ts` | Plugin React + **proxy** `/api → :3000` em dev (sem CORS) + config de teste. |
| `tsconfig.json` | Herda o base + `lib: DOM`, `jsx: react-jsx`. |
| `index.html` | HTML raiz; carrega `src/main.tsx`. |
| `src/main.tsx` | Ponto de montagem do React no DOM. |
| `src/App.tsx` | Componente raiz da aplicação. |

Testes rodam em ambiente **jsdom** (um DOM simulado em Node), configurado no
`vite.config.ts`.

## Princípio de responsabilidade aplicado

Componente que começa a fazer `fetch` direto, montar URL de API ou conter regra de negócio
está acumulando responsabilidade demais. Busca de dados isola-se em `api/`; componentes
recebem dados prontos e só desenham.
