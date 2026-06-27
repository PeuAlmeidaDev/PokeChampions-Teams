# Card Dark Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the SPA to a dark theme and restructure `TeamCard` so sprites sit on top in a fixed-height band (aligned across cards) with team metadata moved below as a labelled description block.

**Architecture:** Pure presentation change. Sprites become the first element of the card; the metadata header is replaced by a description block below a divider. Missing Pokémon slots (teams with <6) are padded with invisible cells so the band keeps a constant height. The dark theme is applied with Tailwind utility classes across every component plus a `body` background in `index.css`. No data, contract, fetch, or behavior changes — existing tests stay green throughout (this is refactor + restyle, not new behavior).

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4 (utilities only, no config), vitest + @testing-library/react (jsdom).

## Global Constraints

- TypeScript strict (+ `noUncheckedIndexedAccess`). No `any`, no non-null assertions (`!`) — narrow instead.
- Components are presentational: no fetch, no API URLs, no business logic.
- Graceful degradation: optional fields (`rank`/`tournament`/`ownerName`/`ownerHandle`) are omitted when null — the UI never renders "null".
- The card stays a single accessible `<button>` overlay with `aria-label={team.name}`; content sits above it as `pointer-events-none`.
- Conventional Commits in English, one commit per task. Run `pnpm lint && pnpm typecheck && pnpm test` green before each commit.
- Branch: `feat/card-dark-redesign` (already created, spec already committed there).

---

### Task 1: Restructure `TeamCard` — sprites on top, labelled description below, dark

**Files:**
- Modify: `packages/web/src/components/TeamCard.tsx` (full rewrite of the JSX)
- Test (unchanged, must stay green): `packages/web/src/components/TeamCard.test.tsx`

**Interfaces:**
- Consumes: `Team` from `@pokemon-champions/shared` (`id`, `name`, `rank`, `tournament`, `ownerName`, `ownerHandle`, `pokemon: PokemonSet[]`); `PokemonSprite` from `./PokemonSprite.js`.
- Produces: same component signature — `TeamCard({ team, onOpenDetail }: { team: Team; onOpenDetail: (id: string) => void }): JSX.Element`. No interface change.

**Why no new failing test:** observable behavior is unchanged — the existing tests already assert name, rank, tournament, owner (`"Kaito Arii · @ub_slow"`), all sprites, the "Ver detalhes" affordance, omit-on-null, and click→`onOpenDetail(id)`. The owner-join string and the rendered text are preserved exactly, so this is a refactor: keep those tests green. The only new DOM (invisible padding cells for <6 mons) is non-behavioral and verified visually.

- [ ] **Step 1: Rewrite `TeamCard.tsx`**

Replace the entire file with:

```tsx
import type { JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { PokemonSprite } from "./PokemonSprite.js";

const TEAM_SIZE = 6;

/**
 * One champion team as a card. Sprites sit on top in a fixed-height band (padded
 * to 6 slots so the band — and everything below it — aligns across cards
 * regardless of how much metadata a team has). Below a divider, a description
 * block shows the team name plus labelled rows (result / event / trainer), each
 * omitted when null so the UI never shows "null". Dark theme.
 *
 * The whole card is a single absolute <button> that opens the detail modal; the
 * content sits above it as pointer-events-none, so any click lands on the button.
 */
export function TeamCard({
  team,
  onOpenDetail,
}: {
  team: Team;
  onOpenDetail: (id: string) => void;
}): JSX.Element {
  const owner = [team.ownerName, team.ownerHandle ? `@${team.ownerHandle}` : null]
    .filter(Boolean)
    .join(" · ");

  // Pad to a constant slot count so the sprite band keeps the same height even
  // when a team has fewer than 6 Pokémon (partial paste) — keeps cards aligned.
  const emptySlots = Math.max(0, TEAM_SIZE - team.pokemon.length);

  return (
    <article className="relative flex h-full flex-col rounded-lg border border-slate-700 bg-slate-800 shadow-sm transition hover:border-violet-500/60 hover:shadow-lg hover:shadow-black/30">
      <button
        type="button"
        onClick={() => onOpenDetail(team.id)}
        className="absolute inset-0 z-0 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none"
        aria-label={team.name}
      />

      <ul className="pointer-events-none relative z-10 grid grid-cols-3 gap-2 p-4">
        {team.pokemon.map((p, i) => (
          <li key={`${p.species}-${i}`} className="flex flex-col items-center gap-1">
            <PokemonSprite species={p.species} spriteUrl={p.spriteUrl} />
            <span
              title={p.species}
              className="w-full truncate text-center text-xs text-slate-400"
            >
              {p.species}
            </span>
          </li>
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <li key={`empty-${i}`} aria-hidden className="flex flex-col items-center gap-1">
            <div className="h-24 w-24" />
          </li>
        ))}
      </ul>

      <div className="pointer-events-none relative z-10 mt-auto flex flex-col gap-2 border-t border-slate-700 p-4">
        <h2 className="font-semibold text-slate-100">{team.name}</h2>
        <dl className="flex flex-col gap-1 text-sm">
          {team.rank && (
            <div className="flex items-center gap-2">
              <dt className="shrink-0 text-slate-400" aria-label="Resultado">🏆</dt>
              <dd className="font-medium text-amber-300">{team.rank}</dd>
            </div>
          )}
          {team.tournament && (
            <div className="flex items-center gap-2">
              <dt className="shrink-0 text-slate-400" aria-label="Evento">🗓️</dt>
              <dd className="text-slate-200">{team.tournament}</dd>
            </div>
          )}
          {owner && (
            <div className="flex items-center gap-2">
              <dt className="shrink-0 text-slate-400" aria-label="Treinador">👤</dt>
              <dd className="text-slate-200">{owner}</dd>
            </div>
          )}
        </dl>
        <span className="mt-1 text-sm font-medium text-violet-400">Ver detalhes →</span>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Run the TeamCard tests — expect green (behavior unchanged)**

Run: `pnpm test -- packages/web/src/components/TeamCard.test.tsx`
Expected: PASS (3 tests). The tests find name/rank/tournament/owner/sprites/"Ver detalhes"/click exactly as before.

- [ ] **Step 3: Lint + typecheck**

Run: `pnpm lint; if ($?) { pnpm typecheck }`
Expected: both clean (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/TeamCard.tsx
git commit -m "feat(web): restructure team card — sprites on top, labelled description, dark"
```

---

### Task 2: Dark theme for the app shell, search input, sprite fallback, and grid

**Files:**
- Modify: `packages/web/src/App.tsx` (wrapper + text colors)
- Modify: `packages/web/src/components/PokemonSearch.tsx` (input colors)
- Modify: `packages/web/src/components/PokemonSprite.tsx` (fallback box colors)
- Modify: `packages/web/src/components/TeamGrid.tsx` (empty-state text color)
- Modify: `packages/web/src/index.css` (body background)
- Tests (unchanged, must stay green): `App.test.tsx`, `PokemonSearch.test.tsx`, `TeamGrid.test.tsx`, `PokemonSprite.test.tsx`

**Interfaces:** No signature changes. Class-only edits.

**Why no new failing test:** every test asserts text/role/behavior, none asserts CSS classes — restyle keeps them green. Contrast is verified in the browser.

- [ ] **Step 1: `App.tsx` — wrap in a dark full-height container and fix text colors**

Wrap the returned markup in a dark container and recolor text. The outer element changes from `<main …>` to `<div class="min-h-screen …"><main …>`:

Replace the `return (` block's opening:

```tsx
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-7xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-100">Pokémon Champions</h1>

        {status === "loading" && <p className="text-slate-400">Carregando times…</p>}

        {status === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-slate-300">Não foi possível carregar os times.</p>
            <button
              type="button"
              onClick={load}
              className="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {status === "ready" && (
          <>
            <PokemonSearch value={query} onChange={setQuery} />
            <p className="mb-4 text-sm text-slate-400">
              {filteredTeams.length === 1
                ? "1 time campeão"
                : `${filteredTeams.length} times campeões`}
            </p>
            {isSearching && filteredTeams.length === 0 ? (
              <p className="text-slate-400">Nenhum time com esse Pokémon.</p>
            ) : (
              <TeamGrid teams={filteredTeams} onOpenDetail={openDetail} />
            )}
          </>
        )}

        {selectedId && (
          <TeamDetailModal
            status={detailStatus}
            detail={detail}
            onClose={closeDetail}
            onRetry={() => openDetail(selectedId)}
          />
        )}
      </main>
    </div>
  );
```

Note: the inner logic (`selectedId`, `detailStatus`, `openDetail`, `closeDetail`, etc.) is unchanged — only the wrapping `<div>`, the closing `</div>`, and the text color classes change. Keep the destructured `useTeamDetail` values exactly as they are above the return.

- [ ] **Step 2: `PokemonSearch.tsx` — dark input**

Replace the input's `className` with:

```tsx
      className="mb-4 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none sm:max-w-xs"
```

- [ ] **Step 3: `PokemonSprite.tsx` — dark fallback box**

Replace the fallback `<div>`'s `className` with:

```tsx
        className="flex h-24 w-24 items-center justify-center rounded bg-slate-700 p-1 text-center text-[10px] leading-tight text-slate-300"
```

- [ ] **Step 4: `TeamGrid.tsx` — dark empty state**

Replace the empty-state paragraph:

```tsx
    return <p className="text-slate-400">Nenhum time para mostrar.</p>;
```

- [ ] **Step 5: `index.css` — body background (no white overscroll/flash)**

Replace the file with:

```css
@import "tailwindcss";

@layer base {
  body {
    background-color: var(--color-slate-950);
  }
}
```

- [ ] **Step 6: Run the web tests — expect green**

Run: `pnpm test -- packages/web`
Expected: PASS (all web suites; class-only changes don't affect assertions).

- [ ] **Step 7: Lint + typecheck**

Run: `pnpm lint; if ($?) { pnpm typecheck }`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/PokemonSearch.tsx packages/web/src/components/PokemonSprite.tsx packages/web/src/components/TeamGrid.tsx packages/web/src/index.css
git commit -m "feat(web): apply dark theme to app shell, search, sprite fallback and grid"
```

---

### Task 3: Dark theme for the detail modal

**Files:**
- Modify: `packages/web/src/components/TeamDetailModal.tsx` (backdrop, panel, header, states)
- Modify: `packages/web/src/components/PokemonDetailCard.tsx` (card, text, Tera badge, moves)
- Tests (unchanged, must stay green): `TeamDetailModal.test.tsx`, `PokemonDetailCard.test.tsx`

**Interfaces:** No signature changes. Class-only edits.

- [ ] **Step 1: `TeamDetailModal.tsx` — dark backdrop, panel, header, and states**

Apply these class replacements (text/structure unchanged):

- Backdrop `div`: `bg-slate-900/50` → `bg-slate-950/70`
- Panel `div`: `bg-slate-50` → `bg-slate-900 border border-slate-700`
- Title `h2`: `text-slate-900` → `text-slate-100`
- Close `button`: `text-slate-500 hover:bg-slate-200` → `text-slate-400 hover:bg-slate-800`
- Loading `p`: `text-slate-500` → `text-slate-400`
- Error `p`: `text-slate-700` → `text-slate-300`
- Retry `button`: `bg-sky-600 … hover:bg-sky-700` → `bg-violet-600 … hover:bg-violet-700`

Resulting key lines:

```tsx
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 sm:p-8"
```
```tsx
        className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
```
```tsx
          <h2 className="text-lg font-bold text-slate-100">Detalhe do time</h2>
```
```tsx
            className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800"
```
```tsx
        {status === "loading" && <p className="text-slate-400">Carregando detalhe…</p>}
```
```tsx
            <p className="text-slate-300">Não foi possível carregar o detalhe.</p>
```
```tsx
              className="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
```

- [ ] **Step 2: `PokemonDetailCard.tsx` — dark card, text, Tera badge, moves**

Apply these class replacements (text/structure unchanged):

- Article: `border-slate-200 bg-white` → `border-slate-700 bg-slate-800`
- Species `span`: `text-slate-900` → `text-slate-100`
- Tera badge: `bg-fuchsia-100 text-fuchsia-800` → `bg-fuchsia-500/15 text-fuchsia-300`
- item/ability/nature `span`s: `text-slate-600` → `text-slate-300`
- EVs `span`: `text-slate-500` → `text-slate-400`
- moves `span`: `text-sky-800` → `text-sky-300`

Resulting key lines:

```tsx
    <article className="flex gap-3 rounded-lg border border-slate-700 bg-slate-800 p-3">
```
```tsx
          <span className="font-semibold text-slate-100">{set.species}</span>
```
```tsx
            <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-medium text-fuchsia-300">
              Tera {set.teraType}
            </span>
```
```tsx
        {set.item && <span className="text-slate-300">@ {set.item}</span>}
        {set.ability && <span className="text-slate-300">{set.ability}</span>}
        {set.nature && <span className="text-slate-300">{set.nature} Nature</span>}
        {evs && <span className="text-slate-400">{evs}</span>}
        {set.moves.length > 0 && (
          <span className="text-sky-300">{set.moves.join(" · ")}</span>
        )}
```

- [ ] **Step 3: Run the web tests — expect green**

Run: `pnpm test -- packages/web`
Expected: PASS (all web suites).

- [ ] **Step 4: Lint + typecheck**

Run: `pnpm lint; if ($?) { pnpm typecheck }`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/TeamDetailModal.tsx packages/web/src/components/PokemonDetailCard.tsx
git commit -m "feat(web): apply dark theme to the team detail modal"
```

---

### Final verification (after all tasks)

- [ ] **Full gate:** `pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm test }; if ($?) { pnpm build }` — all green.
- [ ] **Browser:** `pnpm dev`, open http://localhost:5173. Confirm:
  - Dark page; cards `slate-800` on `slate-950`.
  - Sprite bands align horizontally across cards with different metadata (e.g. a "Champion" card next to one with no rank/owner).
  - Description block below the divider: team name + 🏆 result / 🗓️ event / 👤 trainer, omitting null rows.
  - Search input and detail modal read coherently in dark; text contrast is comfortable.
  - A team with <6 Pokémon (if any) still aligns (invisible padding slots).

## Self-Review

**Spec coverage:** ✅ sprites-on-top fixed band (Task 1, padding) · ✅ labelled description below (Task 1) · ✅ omit-null rows (Task 1, preserved) · ✅ dark tokens for page/card/text/accent (Tasks 1–3) · ✅ search + modal dark (Tasks 2–3) · ✅ sprite fallback dark (Task 2) · ✅ body bg / no white flash (Task 2) · ✅ accessibility button+aria-label preserved (Task 1) · ✅ no data/contract/behavior change (all tasks restyle/refactor).

**Placeholder scan:** none — every step shows the exact code/classes and the exact command + expected result.

**Type consistency:** `TeamCard` signature unchanged; `TEAM_SIZE`/`emptySlots`/`owner` are local; no cross-task type references. `useTeamDetail` destructured values in `App` are untouched by Task 2 (only wrapper + classes change).
