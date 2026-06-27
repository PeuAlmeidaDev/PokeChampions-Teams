# Move Chips (Standardized Detail Modal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a Pokémon's 4 moves in the detail modal as a fixed 2×2 chip grid (truncate + native tooltip) so line wrapping no longer changes card height, and make the modal's cards equal height.

**Architecture:** Replace the single joined moves string in `PokemonDetailCard` with a 2×2 `grid` of chips, padded to 4 fixed slots (invisible chips fill the gaps). Truncation is CSS-only — the full move name stays in the DOM (so the native `title` tooltip shows it and text-based tests keep matching). The card becomes `h-full flex` and the moves block is anchored to the bottom (`mt-auto`); the modal's `<li>` gets `h-full` so cards in a row stretch to equal height. No data, contract, or network change.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4 (utilities only), vitest + @testing-library/react (jsdom).

## Global Constraints

- TypeScript strict (+ `noUncheckedIndexedAccess`). No `any`, no non-null assertions (`!`).
- Component is presentational: no fetch, no API URLs, no business logic.
- Graceful degradation preserved: optional fields (item/ability/nature/teraType/EVs) omitted when null/empty — the UI never renders "null".
- Truncation is CSS-only: the full move text MUST remain in the DOM (`title={move}` for the tooltip; tests match on text).
- Moves grid is always 4 slots; missing moves (partial sets) become invisible `aria-hidden` chips to keep the 2×2 aligned.
- Dark theme already applied; chip is neutral dark (`bg-slate-700 text-slate-200`) — NO per-type color or hover details in this slice (that is the deferred PokeAPI slice).
- Conventional Commits in English. Run `pnpm lint && pnpm typecheck && pnpm test` green before committing.
- Branch: `feat/move-chips` (already created; spec already committed there).

---

### Task 1: Render moves as a fixed 2×2 chip grid; equal-height cards

**Files:**
- Modify: `packages/web/src/components/PokemonDetailCard.tsx` (moves rendering + card height)
- Modify: `packages/web/src/components/TeamDetailModal.tsx` (`<li>` gets `h-full`)
- Test: `packages/web/src/components/PokemonDetailCard.test.tsx` (add one TDD test)

**Interfaces:**
- Consumes: `DetailedPokemonSet` from `@pokemon-champions/shared` (`species`, `spriteUrl`, `item`, `ability`, `nature`, `teraType`, `evs: Record<string, number>`, `moves: string[]`); `PokemonSprite` from `./PokemonSprite.js`; test factory `makeDetailedPokemon` from `../test/factories.js` (default `moves: ["Fake Out", "Knock Off", "Parting Shot", "Flare Blitz"]`).
- Produces: same `PokemonDetailCard({ set }: { set: DetailedPokemonSet }): JSX.Element` signature — unchanged.

- [ ] **Step 1: Write the failing test**

Add this test to `packages/web/src/components/PokemonDetailCard.test.tsx`, inside the `describe("PokemonDetailCard", …)` block (after the existing two `it` blocks):

```tsx
  it("renderiza cada golpe como um chip próprio (não uma string única)", () => {
    render(<PokemonDetailCard set={makeDetailedPokemon()} />);
    // Exact-match getByText: only passes if each move is its own element.
    // The old joined string "Fake Out · Knock Off · …" fails an exact match.
    for (const move of ["Fake Out", "Knock Off", "Parting Shot", "Flare Blitz"]) {
      expect(screen.getByText(move)).toBeTruthy();
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails (RED)**

Run: `pnpm test -- packages/web/src/components/PokemonDetailCard.test.tsx`
Expected: the new test FAILS — `getByText("Fake Out")` throws "Unable to find an element with the text: Fake Out" because the current code renders one joined `<span>` (`Fake Out · Knock Off · Parting Shot · Flare Blitz`), which an exact text match does not match. The other two tests still pass.

- [ ] **Step 3: Implement the 2×2 chip grid + equal-height card in `PokemonDetailCard.tsx`**

Replace the entire file with:

```tsx
import type { JSX } from "react";
import type { DetailedPokemonSet } from "@pokemon-champions/shared";
import { PokemonSprite } from "./PokemonSprite.js";

const STAT_LABEL: Record<string, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};
const STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

/** A VGC set carries up to 4 moves; the grid always reserves this many slots. */
const MOVE_SLOTS = 4;

/** "252 HP / 4 Atk / 252 SpD" — only stats with a positive value. */
function formatStats(stats: Record<string, number>): string {
  return STAT_ORDER.filter((s) => (stats[s] ?? 0) > 0)
    .map((s) => `${stats[s]} ${STAT_LABEL[s]}`)
    .join(" / ");
}

/**
 * One Pokémon's full config in the detail modal. Presentational only. Optional
 * fields (item/ability/nature/Tera/EVs) are omitted when missing so the UI never
 * shows "null". Moves render as a fixed 2×2 chip grid (padded to MOVE_SLOTS so
 * card height stays constant regardless of move-name length); truncation is
 * CSS-only, so the full name stays in the DOM and shows via the native `title`
 * tooltip. The card is h-full so cards in a modal row stretch to equal height.
 * The chip is the seam where the later PokeAPI slice adds per-type color + a
 * details tooltip. Sprite reuses PokemonSprite (our resolved URL).
 */
export function PokemonDetailCard({ set }: { set: DetailedPokemonSet }): JSX.Element {
  const evs = formatStats(set.evs);
  const emptyMoveSlots = Math.max(0, MOVE_SLOTS - set.moves.length);

  return (
    <article className="flex h-full gap-3 rounded-lg border border-slate-700 bg-slate-800 p-3">
      <PokemonSprite species={set.species} spriteUrl={set.spriteUrl} />
      <div className="flex flex-1 flex-col gap-0.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-100">{set.species}</span>
          {set.teraType && (
            <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-medium text-fuchsia-300">
              Tera {set.teraType}
            </span>
          )}
        </div>
        {set.item && <span className="text-slate-300">@ {set.item}</span>}
        {set.ability && <span className="text-slate-300">{set.ability}</span>}
        {set.nature && <span className="text-slate-300">{set.nature} Nature</span>}
        {evs && <span className="text-slate-400">{evs}</span>}
        <ul className="mt-auto grid grid-cols-2 gap-1 pt-1">
          {set.moves.map((move, i) => (
            <li key={`${move}-${i}`} className="min-w-0">
              <span
                title={move}
                className="block truncate rounded bg-slate-700 px-2 py-1 text-xs text-slate-200"
              >
                {move}
              </span>
            </li>
          ))}
          {Array.from({ length: emptyMoveSlots }, (_, i) => (
            <li key={`empty-${i}`} aria-hidden className="min-w-0">
              {/* Invisible chip: reserves the same height as a real chip so a
                  partial set still fills the 2×2 grid and stays aligned. */}
              <span className="block rounded px-2 py-1 text-xs">&nbsp;</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Give the modal's list items full height in `TeamDetailModal.tsx`**

In `packages/web/src/components/TeamDetailModal.tsx`, the ready-state list renders one `<li>` per Pokémon. Add `className="h-full"` to that `<li>` so the now-`h-full` card stretches to the row height. Change:

```tsx
              <li key={`${set.species}-${i}`}>
                <PokemonDetailCard set={set} />
              </li>
```

to:

```tsx
              <li key={`${set.species}-${i}`} className="h-full">
                <PokemonDetailCard set={set} />
              </li>
```

- [ ] **Step 5: Run the test to verify it passes (GREEN)**

Run: `pnpm test -- packages/web/src/components/PokemonDetailCard.test.tsx`
Expected: all 3 tests PASS. The new test finds each move as its own exact-text element; the existing `/Fake Out/` regex test and the omit-null test still pass.

- [ ] **Step 6: Run the full web suite (no regressions)**

Run: `pnpm test -- packages/web`
Expected: all web suites PASS (including `TeamDetailModal.test.tsx`, unaffected by the `<li>` class).

- [ ] **Step 7: Lint + typecheck**

Run: `pnpm lint; if ($?) { pnpm typecheck }`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/PokemonDetailCard.tsx packages/web/src/components/TeamDetailModal.tsx packages/web/src/components/PokemonDetailCard.test.tsx
git commit -m "feat(web): render detail-modal moves as a fixed 2x2 chip grid"
```

---

### Final verification (after the task)

- [ ] **Full gate:** `pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm test }; if ($?) { pnpm build }` — all green.
- [ ] **Browser:** `pnpm dev`, open the SPA, click a team to open the detail modal. Confirm:
  - Each Pokémon's 4 moves show as a 2×2 grid of chips; long names truncate with `…` and the full name appears on hover (native tooltip).
  - Cards in the same modal row are the same height; a long move name no longer makes one card taller.
  - A partial set (fewer than 4 moves, if present) keeps the 2×2 aligned via invisible slots.

## Self-Review

**Spec coverage:** ✅ moves as 2×2 chip grid (Step 3) · ✅ 4 fixed slots with invisible padding (Step 3, `emptyMoveSlots`) · ✅ truncate + `title`, full name in DOM (Step 3) · ✅ equal-height cards via `h-full` + `mt-auto` + modal `<li> h-full` (Steps 3–4) · ✅ omit-null meta preserved (Step 3, unchanged conditionals) · ✅ neutral dark chip, no type color/hover (Step 3) · ✅ no data/contract/network change · ✅ TDD red→green test for separate move elements (Steps 1–2, 5).

**Placeholder scan:** none — full file content in Step 3, exact edit in Step 4, exact commands + expected output in every run step.

**Type consistency:** `PokemonDetailCard({ set })` signature unchanged; `MOVE_SLOTS`/`emptyMoveSlots`/`evs` are locals; `formatStats`/`STAT_LABEL`/`STAT_ORDER` carried over verbatim. Test uses `makeDetailedPokemon` whose default `moves` array matches the four asserted names.
