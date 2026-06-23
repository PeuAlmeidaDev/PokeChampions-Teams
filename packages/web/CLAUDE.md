# CLAUDE.md — @pokemon-champions/web

Escopo: a **apresentação**. SPA React que consome a API do `server` e mostra os times.

## Regras (inegociáveis)

- **Só fala com `/api`** (o nosso server). **Nunca** buscar a planilha, pokepaste ou
  PokeAPI direto do navegador (CORS, lentidão, fragilidade — e quebra a separação de
  camadas).
- **Revalide a resposta da API** com o schema do `shared` no `api/client.ts`. Não confiar
  cegamente em dado que cruza a fronteira, mesmo vindo do nosso backend (*anti-corruption
  layer*). Drift server↔front falha cedo, em dev.
- **Busca de dados isola-se em `api/`.** Componentes recebem dados prontos via props.
- **Componentes são de apresentação:** sem `fetch`, sem montar URL de API, sem regra de
  negócio dentro deles.

## Sinal de responsabilidade vazando

Componente fazendo `fetch` ou contendo lógica de negócio = responsabilidade demais. Mova o
acesso a dados para `api/` e deixe o componente só desenhar.

## Config

- `vite.config.ts`: plugin React + **proxy** `/api → :3000` (dev, sem CORS) + config de
  teste. Testes em ambiente **jsdom**.
- `tsconfig.json`: `lib: DOM`, `jsx: react-jsx`.
