# Spec — Grid de times (frontend)

- **Data:** 2026-06-25
- **Projeto:** PokémonChampions
- **Fatia:** transformar a lista crua de nomes (`TeamList`) num **grid de cards** com
  sprites e metadados, mais estados de loading/erro decentes.
- **Pré-requisito:** a fatia de ingest real está em `main` — `GET /api/teams` serve 259
  times reais, cada `pokemon` já com `spriteUrl` (PNG resolvido da PokeAPI) e `dexId`.

## Objetivo

Apresentar os times campeões de forma legível e organizada: cada time como um **card**
(cabeçalho com metadados + grade 2×3 de sprites), num grid responsivo. Corrigir a ausência
de estados de loading/erro. Sem mudar o contrato nem o backend.

## Escopo (decisões do brainstorming)

### Dentro
- `TeamGrid` (grid responsivo de cards) substituindo `TeamList`.
- `TeamCard` no formato **2×3**: título (`name`), badges (`rank`, `tournament`), dono
  (`ownerName` + `@ownerHandle`), grade 2×3 de sprites, link "ver paste" (`pokepasteUrl`).
- `PokemonSprite`: um `<img>` por Pokémon, com `alt`, `loading="lazy"`, dimensão fixa e
  fallback `onError`.
- Estados no `App`: **loading / erro (+ retry) / vazio / sucesso**, via um `status`
  explícito (não inferido do array vazio).
- Cabeçalho com título + contagem de times.
- **Tailwind CSS v4** como fundação de estilo (setup oficial via `@tailwindcss/vite`).

### Fora (YAGNI — fatias futuras)
- **Busca por Pokémon** (filtro) — próxima fatia de UI.
- **Detalhe do time** (item/EV/IV/nature/Tera/moves) — exige estender o contrato em
  `shared` + buscar pokepaste; fatia separada.
- **Virtualização** da lista (react-window etc.) — `loading="lazy"` cobre a escala atual;
  só entra se medirmos peso de DOM real (evidência, não suposição).
- Mudança no backend / contrato.

## Arquitetura (componentes)

Mantém `web/CLAUDE.md`: componentes só apresentam; dados ficam em `api/`; `App` orquestra;
nenhum componente faz `fetch` nem fala com a PokeAPI.

| Componente | Tipo | Responsabilidade |
|---|---|---|
| `PokemonSprite` | apresentação | Renderiza um sprite: `<img src={spriteUrl} alt={species} loading="lazy" width height>`. `onError` → box neutro com o nome (degradação graciosa: sprite quebrado/sentinela nunca vira ícone de imagem partida). |
| `TeamCard` | apresentação | Recebe `team`; desenha o card 2×3: `name`, badges `rank`/`tournament`, dono, grade 2×3 de `PokemonSprite`, link `pokepasteUrl`. Campos `null` são **omitidos** (nunca "null" na tela). |
| `TeamGrid` | apresentação | Recebe `teams`; grid responsivo de `TeamCard` (1 col mobile → 2/3/4 em telas maiores). **Substitui `TeamList`** (removido com seu teste). |
| `App` | shell | Busca via `api/fetchTeams`; mantém `status` + `teams`; renderiza loading/erro/vazio/sucesso. |

Fluxo: `App` → `fetchTeams` (revalida com zod) → `teams` → `TeamGrid` → `TeamCard` →
`PokemonSprite`.

## Estados (App)

Um `status: "loading" | "error" | "ready"` explícito (corrige a ambiguidade atual entre
"carregando" e "sem dados"):

- **loading:** indicador "Carregando times…" enquanto a 1ª busca não volta.
- **error:** `fetchTeams` rejeitou (503 / drift de schema / rede) → mensagem amigável +
  botão "tentar de novo" que refaz a busca.
- **ready + vazio:** "Nenhum time para mostrar."
- **ready + dados:** cabeçalho (título + "N times campeões") + `TeamGrid`.

## Performance (259 × 6 = 1554 sprites)

- **`loading="lazy"`** em todo `<img>` — defesa principal, nativa, custo zero: o navegador
  só baixa o sprite perto da viewport.
- **`width`/`height` fixos** (ex.: 96×96) — evita layout shift no carregamento.
- **`alt={species}`** — acessibilidade + fallback textual.
- **Sem virtualização** nesta fatia (ver "Fora").

## Estilo — Tailwind CSS v4

Setup oficial v4 (NÃO o fluxo PostCSS/`tailwind.config.js` da v3):
- Plugin `@tailwindcss/vite` no `vite.config.ts`.
- `@import "tailwindcss";` num `src/index.css`, importado em `main.tsx`.
- Versões pinadas e setup confirmado na doc oficial (context7) no plano — nada de memória.

## Testes (vitest + jsdom + @testing-library/react)

Reusa `src/test/factories.ts`. jsdom não aplica CSS → testes verificam estrutura/texto/
acessibilidade, não pixels (o visual é validado no navegador pelo Pedro).

| Alvo | Casos |
|---|---|
| `PokemonSprite` | `<img>` com `src` e `alt={species}`; disparar `error` no img → fallback (box + nome). |
| `TeamCard` | mostra `name`, `rank`, `tournament`, dono; 6 sprites; **omite** campos `null`. |
| `TeamGrid` | N times → N cards; lista vazia não quebra. |
| `App` | loading inicial → grid no sucesso; erro + botão "tentar de novo" no reject. **Stub na rede** (mock do `fetch`), não no `client`. |

## Definition of done

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes (rodados agora).
- `pnpm dev` mostrando o grid 2×3 real em `localhost:5173`: sprites carregando (lazy),
  metadados corretos, estados de loading/erro funcionando.
- `TeamList` e seu teste removidos; nenhuma referência remanescente.
- Componentes sem `fetch`/lógica de negócio; dados só via `api/`.

## Notas

- O polimento visual fino (cores, tipografia, sombras, hover, espaçamento) é guiado pela
  skill `frontend-design` na implementação — esta fatia entrega estrutura + estados; a
  "cara" do app entra com método, não chute.
