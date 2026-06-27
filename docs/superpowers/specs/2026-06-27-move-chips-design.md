# Spec — Padronização dos golpes no modal (move chips)

**Data:** 2026-06-27
**Tipo:** fatia de UI / apresentação (sem mudança de dados, contrato ou rede)
**Branch alvo:** `feat/move-chips` (stackada após `feat/card-dark-redesign`)

## Problema

No modal de detalhe, cada Pokémon (`PokemonDetailCard`) renderiza os golpes como **uma
string única** `set.moves.join(" · ")`. Conforme o tamanho dos nomes, essa string **quebra
linha de forma imprevisível**, então cada card fica com altura diferente e a grade de 2 colunas
do modal (`grid-cols-1 sm:grid-cols-2`) fica desalinhada. Os campos opcionais
(item/ability/nature/EVs) também variam (somem quando nulos), reforçando o desalinhamento.

## Objetivo

Padronizar o card do modal para que **a quebra de linha não mexa na estrutura**:
1. Golpes em **grade 2×2 de chips**, sempre **4 slots fixos** (slots vazios reservam altura),
   cada chip truncado com tooltip nativo (`title`) — altura do bloco de golpes constante.
2. Card de **altura uniforme** na linha da grade do modal (`h-full` + stretch).

Fora de escopo (fatia 2, explicitamente adiada pelo Pedro): buscar dados de golpe na PokeAPI —
**cor por tipo** do golpe (dark=preto, steel=prata, electric=amarelo, …) e **hover com
detalhes** (power/accuracy/descrição). O chip de golpe desta fatia é a costura onde a fatia 2
encaixa cor + tooltip, sem retrabalho.

## Decisões de design (com porquê)

- **Grade 2×2 de chips, 4 slots fixos.** VGC limita a 4 golpes; 2×2 é compacto e mantém altura
  constante. Slots vazios (sets parciais) viram chip invisível para preservar o 2×2 — mesma
  técnica de padding usada no `TeamCard` (alinhamento determinístico, não `min-height` mágico).
- **Truncar é só CSS.** `truncate` + `title={move}`: o nome completo **permanece no DOM** (a
  truncagem é visual). Logo as asserções de teste por texto continuam válidas e o tooltip nativo
  já dá o nome inteiro no hover (independente da fatia 2).
- **Bloco de golpes ancorado embaixo** (`mt-auto`) + `<article>` `h-full flex flex-col`: na
  grade do modal os cards de uma linha esticam para a mesma altura; o bloco de golpes fica
  sempre na base, alinhado entre cards.
- **Chip é a costura para a fatia 2.** Renderizar cada golpe como elemento próprio isola o ponto
  onde cor-por-tipo e tooltip-de-detalhes entram depois. Não construímos `MoveChip` como
  componente separado agora (YAGNI — Pedro escolheu "só organizar"); um elemento estilizado
  inline basta, e vira componente quando a fatia 2 exigir.

## Tokens (Tailwind v4, dark já aplicado)

| Elemento | Classe |
|---|---|
| Chip de golpe | `rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 truncate` |
| Grade de golpes | `grid grid-cols-2 gap-1` |
| Slot vazio | chip invisível reservando altura (`aria-hidden`, sem texto visível) |
| Card | `+ h-full flex flex-col`; bloco de golpes com `mt-auto` |

## Componentes afetados

- **`PokemonDetailCard.tsx`** — troca a string de golpes pela grade 2×2 de chips (4 slots,
  pad invisível, truncate+title); `<article>` ganha `h-full flex flex-col` e o bloco de golpes
  `mt-auto`. Campos meta (item/ability/nature/EVs) inalterados (omit-on-null mantido).
- **`TeamDetailModal.tsx`** — garantir que cada `<li>` da grade estique: adicionar `h-full` no
  `<li>` (ou no wrapper) para o `h-full` do card ter efeito. Nenhuma outra mudança.

## Testes (TDD onde há comportamento novo)

- **Novo (red→green):** "cada golpe é renderizado como um elemento próprio" —
  `expect(screen.getByText("Fake Out")).toBeTruthy()` com **match exato** (default do
  `getByText`). Na implementação atual os golpes são uma string única `"Fake Out · …"`, então o
  match exato de `"Fake Out"` **falha** (RED); com os chips separados passa (GREEN). Cobrir os 4
  golpes do factory.
- **Existentes (verdes):** `mostra os campos de configuração` usa regex parcial `/Fake Out/` →
  segue casando; `omite campos ausentes` (textContent sem "null") inalterado.
- Slots vazios de padding: não-comportamentais (chips invisíveis) — verificação visual no
  browser, sem teste de classe CSS.

## Verificação

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes.
- **Browser:** no modal, cards de uma linha com mesma altura; golpes em 2×2 que não quebram a
  estrutura mesmo com nomes longos (truncados com `…`, nome completo no tooltip); set parcial
  (<4 golpes) mantém o 2×2 alinhado.

## Plano de entrega

Fatia única, branch própria. Provável quebra:
1. TDD do "cada golpe é elemento próprio" + grade 2×2 de chips com 4 slots em `PokemonDetailCard`.
2. `h-full` no `<li>` do `TeamDetailModal` para igualar alturas.
(Pode ser 1 commit só, dado o tamanho — decidir no plano.)
