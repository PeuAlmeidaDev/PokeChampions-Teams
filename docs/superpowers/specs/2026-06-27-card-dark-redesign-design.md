# Spec — Redesign do card de time (tema escuro + padronização)

**Data:** 2026-06-27
**Tipo:** fatia de UI / apresentação (sem mudança de dados, contrato ou comportamento)
**Branch alvo:** `feat/card-dark-redesign` (stackada após `refactor/use-team-detail`)

## Problema

O `TeamCard` atual põe os metadados do time (nome + badge de resultado + torneio + dono) **no
topo**, em conteúdo de altura variável (campos somem quando `null`). Consequência: a faixa de
sprites — o que o usuário realmente quer ver — começa em alturas diferentes em cada card, e os
cards ficam desalinhados. Além disso, o nome do time vindo da planilha (ex:
*"Kimyeongddiyp's Charizard-Y Gholdengo Team"*) é uma string densa, difícil de parsear no topo.
O tema claro atual é funcional, mas sem personalidade.

## Objetivo

1. **Padronizar:** sprites no topo, em faixa de **altura reservada fixa**, alinhados entre todos
   os cards. Cards de mesma altura por linha do grid.
2. **Reorganizar a informação:** mover os metadados pra **baixo dos sprites**, como bloco de
   descrição legível, com rótulos/ícones.
3. **Tema escuro** coeso em toda a SPA (grid, busca, modal de detalhe).

Fora de escopo: qualquer mudança em `shared`, server, ingest, contrato ou lógica de fetch. É
puramente visual. Sem novos dados (ex: tipo/Tera→cor fica pra outra fatia — YAGNI).

## Decisões de design (com porquê)

- **Sprites como primeiro elemento + faixa de altura fixa.** Pôr os sprites no topo faz a faixa
  começar no mesmo `y` em todo card; reservar altura para 2 linhas de 3 (mesmo com <6 Pokémon)
  mantém a divisória e o bloco de descrição alinhados. Resolve o desalinhamento na raiz (era o
  header variável que empurrava os sprites).
- **Descrição rotulada embaixo.** O nome do time vira o título do bloco; abaixo, linhas com
  ícone/rótulo, cada uma **omitida quando `null`** (degradação graciosa, padrão já usado):
  - 🏆 **Resultado** (`rank`) — destaque (sinal mais importante: "Champion").
  - 🗓 **Evento** (`tournament`).
  - 👤 **Treinador** (`ownerName` / `@ownerHandle`) — mostrado quando qualquer um dos dois está
    presente (mesma regra de omitir-em-`null` de hoje). Se ambos `null`, a linha some.
  - O **arquétipo** do time (ex: "Charizard-Y Gholdengo") **não** vira texto extra: os sprites
    acima já o comunicam visualmente. O nome completo permanece como título (pedido do Pedro).
- **Tema escuro.** Sprites destacam sobre fundo escuro; visual mais "VGC". Aplicado em toda a SPA
  pra não destoar.

## Tokens de cor (Tailwind v4, utilitários — sem config nova)

| Elemento | Classe |
|---|---|
| Fundo da página | `bg-slate-950` (via wrapper `min-h-screen` no `App` + base no `index.css`) |
| Card | `bg-slate-800` borda `border-slate-700`, hover `border-violet-500/60` + `shadow-lg` |
| Título do time | `text-slate-100` |
| Rótulos | `text-slate-400`; valores `text-slate-200` |
| Acento (foco/hover/link) | `violet-400` / `sky-400` |
| Badge de resultado | `bg-violet-500/15 text-violet-300` (ou âmbar pra "Champion") |
| Nome sob o sprite | `text-slate-400` |
| Fallback de sprite | caixa `bg-slate-700 text-slate-300` (hoje é `bg-slate-100`) |

## Componentes afetados

- **`TeamCard.tsx`** — reestrutura (sprites→divisória→descrição rotulada) + cores dark. Mantém a
  acessibilidade: card continua um `<button>` único com `aria-label={team.name}`; conteúdo
  `pointer-events-none` sobre o botão (padrão atual preservado). "Ver detalhes →" continua como
  affordance (rodapé ou hover).
- **`PokemonSprite.tsx`** — só o estilo do fallback (box) pro dark.
- **`App.tsx`** — wrapper `min-h-screen bg-slate-950 text-slate-100`; ajustar textos
  (h1, contagem, estados loading/erro) pro dark.
- **`PokemonSearch.tsx`** — input dark (`bg-slate-800 border-slate-700 text-slate-100
  placeholder:text-slate-500`).
- **`TeamDetailModal.tsx`** + **`PokemonDetailCard.tsx`** — backdrop, painel, textos e badge
  Tera pro dark.
- **`index.css`** — `@layer base` setando `body { background: ... }` pra evitar flash branco /
  overscroll.

## Faixa de sprites — altura fixa

- Grid `grid-cols-3`, sempre **2 linhas** reservadas. Para times com <6 Pokémon, as células
  faltantes ficam vazias (sem placeholder visível) preservando a altura. Cada célula: sprite
  `h-24 w-24` (inalterado) + nome truncado abaixo.
- Card com `flex flex-col h-full`; a faixa de sprites tem altura determinística; o bloco de
  descrição vem abaixo. Grid do `TeamGrid` já estica os cards (`h-full`) → altura igual por linha.

## Testes (TDD onde há lógica; visual via asserção de presença)

A maior parte é estilo (classes), não lógica — então os testes existentes de `TeamCard`/`App`
devem permanecer **verdes** (comportamento inalterado: nome, sprites, clique abre modal,
contagem, empty-state). Acréscimos focados em comportamento observável, não em classe CSS:

- `TeamCard`: renderiza o nome, os 6 sprites, o resultado/torneio/dono **quando presentes** e os
  **omite quando `null`** (reforça/realoca asserções existentes para a nova posição).
- `TeamCard`: continua sendo um botão acionável (`aria-label`) que chama `onOpenDetail`.
- Sem teste de cor (classe CSS não é comportamento) — verificação de cor/contraste é no browser.

## Verificação

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes.
- **Browser:** grid dark com sprites alinhados entre cards de metadados diferentes; descrição
  legível embaixo; busca e modal coerentes no dark; contraste de texto adequado.

## Plano de entrega

Uma fatia, branch própria, commit(s) granular(es). Provável quebra:
1. `TeamCard` reestruturado + dark (núcleo da mudança) — com testes.
2. Dark no entorno (`App`/`PokemonSearch`/`PokemonSprite`/`index.css`).
3. Dark no modal (`TeamDetailModal`/`PokemonDetailCard`).
