# Team Grid Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw team name list with a responsive grid of team cards (2×3 sprite grid + metadata), with proper loading/error states, styled with Tailwind CSS v4.

**Architecture:** Presentational React components (`PokemonSprite` → `TeamCard` → `TeamGrid`) fed by the existing `App` shell, which orchestrates fetch + UI state. Data access stays in `api/` (unchanged); components never fetch. Styling via Tailwind v4 utility classes.

**Tech Stack:** React 19 + TypeScript (strict), Vite 7, Tailwind CSS v4 (`@tailwindcss/vite`), vitest + jsdom + `@testing-library/react`.

## Global Constraints

- Components are PRESENTATIONAL: no `fetch`, no API-URL building, no business logic. Data comes via props (web/CLAUDE.md).
- The web talks ONLY to `/api` (never the sheet/pokepaste/PokeAPI directly). Data access lives in `api/`; the response is already re-validated with zod in `api/client.ts`.
- `Team` shape (from `@pokemon-champions/shared`): `{ id, name, ownerName: string|null, ownerHandle: string|null, tournament: string|null, rank: string|null, pokepasteUrl, pokemon: PokemonSet[] }`. `PokemonSet`: `{ species: string, spriteUrl: string, dexId: number|null }`.
- Null optional fields are OMITTED in the UI — never render the string "null".
- Every `<img>` sprite: `alt={species}`, `loading="lazy"`, fixed `width={96} height={96}`, and an `onError` fallback. No list virtualization.
- TypeScript strict + `noUncheckedIndexedAccess`. Relative imports use the `.js` extension (ESM/NodeNext).
- Tests stub the network at the boundary (`vi.stubGlobal("fetch", ...)`), never our own `client`. Tests assert structure/text/roles, not CSS (jsdom applies no styles). Reuse `src/test/factories.ts`.
- Tailwind v4 setup is the OFFICIAL flow (confirmed via docs): `@tailwindcss/vite` plugin + `@import "tailwindcss";` — NOT the v3 PostCSS/`tailwind.config.js` flow.
- Run commands from repo root. Tests: `pnpm exec vitest run <pattern>` (no per-package test script). Gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, all green before every commit. One commit per task, Conventional Commits in English.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/web/package.json` | modify | add `tailwindcss` + `@tailwindcss/vite` |
| `packages/web/vite.config.ts` | modify | register the `@tailwindcss/vite` plugin |
| `packages/web/src/index.css` | create | `@import "tailwindcss";` |
| `packages/web/src/main.tsx` | modify | `import "./index.css";` |
| `packages/web/src/components/PokemonSprite.tsx` | create | one sprite `<img>` + error fallback |
| `packages/web/src/components/TeamCard.tsx` | create | one team card (2×3 grid + metadata) |
| `packages/web/src/components/TeamGrid.tsx` | create | responsive grid of `TeamCard` (replaces `TeamList`) |
| `packages/web/src/App.tsx` | modify | loading/error/ready states + header + `TeamGrid` |
| `packages/web/src/test/factories.ts` | modify | add `makePokemon` factory |
| `packages/web/src/components/TeamList.tsx` + `.test.tsx` | delete | superseded by `TeamGrid` |

---

### Task 1: Tailwind CSS v4 setup

**Files:**
- Modify: `packages/web/package.json` (deps)
- Modify: `packages/web/vite.config.ts`
- Create: `packages/web/src/index.css`
- Modify: `packages/web/src/main.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a working Tailwind pipeline — utility classes used in later tasks compile into the build.

> No unit test (build-tooling config). The gate is the full CI staying green (the plugin integrates without breaking build/test) and the browser check in Task 5's DoD.

- [ ] **Step 1: Add the dependencies**

Run: `pnpm --filter @pokemon-champions/web add tailwindcss @tailwindcss/vite`
Expected: both appear under `dependencies` in `packages/web/package.json`.

- [ ] **Step 2: Register the Vite plugin**

Edit `packages/web/vite.config.ts` to add the plugin alongside `react()`:

```ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Forward API calls to the Fastify server during dev (no CORS needed).
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Create the Tailwind entry CSS**

Create `packages/web/src/index.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Import the CSS at the app entry**

Edit `packages/web/src/main.tsx` to import the stylesheet (add the import at the top):

```ts
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Verify the full gate stays green**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green. The build runs the Tailwind plugin without error; existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web/package.json packages/web/vite.config.ts packages/web/src/index.css packages/web/src/main.tsx pnpm-lock.yaml
git commit -m "build(web): set up Tailwind CSS v4 via the Vite plugin"
```

---

### Task 2: PokemonSprite component

**Files:**
- Create: `packages/web/src/components/PokemonSprite.tsx`
- Test: `packages/web/src/components/PokemonSprite.test.tsx`

**Interfaces:**
- Consumes: nothing (presentational; props only).
- Produces:
  ```ts
  export function PokemonSprite(props: { species: string; spriteUrl: string }): JSX.Element;
  ```
  Renders a lazy `<img>` with `alt={species}`; on image error it swaps to a labelled fallback box (a `div` with `role="img"`, `aria-label={species}`, and the species as text) so a broken/sentinel sprite never shows a broken-image icon.

- [ ] **Step 1: Write the failing test**

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PokemonSprite } from "./PokemonSprite.js";

afterEach(cleanup);

describe("PokemonSprite", () => {
  it("renders a lazy img with the sprite url and species as alt", () => {
    render(<PokemonSprite species="Charizard" spriteUrl="https://img/charizard.png" />);

    const img = screen.getByAltText("Charizard");
    expect(img.getAttribute("src")).toBe("https://img/charizard.png");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to a labelled box when the image fails to load", () => {
    render(<PokemonSprite species="Charizard" spriteUrl="https://broken/x.png" />);

    fireEvent.error(screen.getByAltText("Charizard"));

    // the <img> (alt) is gone, replaced by a text fallback carrying the name
    expect(screen.queryByAltText("Charizard")).toBeNull();
    expect(screen.getByText("Charizard")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run PokemonSprite`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```tsx
import { useState, type JSX } from "react";

/**
 * One Pokémon sprite. Presentational: the URL is already resolved by the server
 * (PokeAPI front_default) and arrives via props. On load error it degrades to a
 * labelled box rather than a broken-image icon — covers both a dead URL and the
 * server's placeholder sentinel with one path.
 */
export function PokemonSprite({
  species,
  spriteUrl,
}: {
  species: string;
  spriteUrl: string;
}): JSX.Element {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={species}
        className="flex h-24 w-24 items-center justify-center rounded bg-slate-100 p-1 text-center text-[10px] leading-tight text-slate-500"
      >
        {species}
      </div>
    );
  }

  return (
    <img
      src={spriteUrl}
      alt={species}
      width={96}
      height={96}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-24 w-24 object-contain"
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run PokemonSprite`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/PokemonSprite.tsx packages/web/src/components/PokemonSprite.test.tsx
git commit -m "feat(web): PokemonSprite with lazy loading and broken-image fallback"
```

---

### Task 3: TeamCard component

**Files:**
- Modify: `packages/web/src/test/factories.ts` (add `makePokemon`)
- Create: `packages/web/src/components/TeamCard.tsx`
- Test: `packages/web/src/components/TeamCard.test.tsx`

**Interfaces:**
- Consumes: `PokemonSprite` (Task 2); `Team`/`PokemonSet` (shared).
- Produces:
  ```ts
  export function makePokemon(overrides?: Partial<PokemonSet>): PokemonSet; // test factory
  export function TeamCard(props: { team: Team }): JSX.Element;
  ```
  Renders one card: `name` heading, `rank` badge, `tournament`, an owner line (`ownerName` and `@ownerHandle` joined), a 3-column grid of `PokemonSprite`, and a "ver paste" link to `pokepasteUrl`. Null optional fields are omitted.

- [ ] **Step 1: Add the `makePokemon` factory**

Edit `packages/web/src/test/factories.ts`: add the import of `PokemonSet` to the existing type import and append the factory.

```ts
import type { PokemonSet, Team, TeamsResponse } from "@pokemon-champions/shared";

// ... existing makeTeam / makeTeamsResponse unchanged ...

export function makePokemon(overrides: Partial<PokemonSet> = {}): PokemonSet {
  return {
    species: "Pikachu",
    spriteUrl: "https://img/pikachu.png",
    dexId: 25,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing test**

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TeamCard } from "./TeamCard.js";
import { makePokemon, makeTeam } from "../test/factories.js";

afterEach(cleanup);

describe("TeamCard", () => {
  it("shows name, rank, tournament, owner, all sprites and the paste link", () => {
    const team = makeTeam({
      name: "Sun Offense",
      rank: "2nd",
      tournament: "Ruler of Origin Tour",
      ownerName: "Kaito Arii",
      ownerHandle: "ub_slow",
      pokepasteUrl: "https://pokepast.es/abc",
      pokemon: [
        makePokemon({ species: "Charizard" }),
        makePokemon({ species: "Garchomp" }),
      ],
    });

    render(<TeamCard team={team} />);

    expect(screen.getByText("Sun Offense")).toBeTruthy();
    expect(screen.getByText("2nd")).toBeTruthy();
    expect(screen.getByText("Ruler of Origin Tour")).toBeTruthy();
    expect(screen.getByText("Kaito Arii · @ub_slow")).toBeTruthy();
    expect(screen.getByAltText("Charizard")).toBeTruthy();
    expect(screen.getByAltText("Garchomp")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /ver paste/i }).getAttribute("href"),
    ).toBe("https://pokepast.es/abc");
  });

  it("omits optional fields that are null (never renders 'null')", () => {
    const team = makeTeam({
      name: "Anon",
      rank: null,
      tournament: null,
      ownerName: null,
      ownerHandle: null,
      pokemon: [],
    });

    render(<TeamCard team={team} />);

    expect(screen.getByText("Anon")).toBeTruthy();
    expect(screen.queryByText(/null/i)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run TeamCard`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Write the implementation**

```tsx
import type { JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { PokemonSprite } from "./PokemonSprite.js";

/**
 * One champion team as a card: metadata header + a 3-column sprite grid + a link
 * to the source paste. Presentational only. Optional fields (rank, tournament,
 * owner) are omitted when null so the UI never shows "null".
 */
export function TeamCard({ team }: { team: Team }): JSX.Element {
  const owner = [team.ownerName, team.ownerHandle ? `@${team.ownerHandle}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="flex h-full flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-slate-900">{team.name}</h2>
          {team.rank && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {team.rank}
            </span>
          )}
        </div>
        {team.tournament && (
          <p className="text-sm text-slate-600">{team.tournament}</p>
        )}
        {owner && <p className="text-sm text-slate-500">{owner}</p>}
      </header>

      <ul className="grid grid-cols-3 gap-2">
        {team.pokemon.map((p, i) => (
          <li key={`${p.species}-${i}`} className="flex justify-center">
            <PokemonSprite species={p.species} spriteUrl={p.spriteUrl} />
          </li>
        ))}
      </ul>

      <a
        href={team.pokepasteUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-auto text-sm text-sky-600 hover:underline"
      >
        ver paste →
      </a>
    </article>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run TeamCard`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/TeamCard.tsx packages/web/src/components/TeamCard.test.tsx packages/web/src/test/factories.ts
git commit -m "feat(web): TeamCard with 2x3 sprite grid and metadata"
```

---

### Task 4: TeamGrid component

**Files:**
- Create: `packages/web/src/components/TeamGrid.tsx`
- Test: `packages/web/src/components/TeamGrid.test.tsx`

**Interfaces:**
- Consumes: `TeamCard` (Task 3); `Team` (shared).
- Produces:
  ```ts
  export function TeamGrid(props: { teams: Team[] }): JSX.Element;
  ```
  Responsive grid of `TeamCard` (1 col → 2/3/4 by breakpoint). Empty list → an empty-state message. (Created here but still unused; `App` switches to it in Task 5, where `TeamList` is removed.)

- [ ] **Step 1: Write the failing test**

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TeamGrid } from "./TeamGrid.js";
import { makeTeam } from "../test/factories.js";

afterEach(cleanup);

describe("TeamGrid", () => {
  it("renders a card for every team", () => {
    render(
      <TeamGrid
        teams={[
          makeTeam({ id: "MB1", name: "Sun Offense" }),
          makeTeam({ id: "MB2", name: "Trick Room Hard" }),
        ]}
      />,
    );

    expect(screen.getByText("Sun Offense")).toBeTruthy();
    expect(screen.getByText("Trick Room Hard")).toBeTruthy();
  });

  it("shows an empty state when there are no teams", () => {
    render(<TeamGrid teams={[]} />);

    expect(screen.getByText(/nenhum time/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run TeamGrid`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```tsx
import type { JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { TeamCard } from "./TeamCard.js";

/**
 * Presentational grid of team cards. Receives ready teams via props (no fetch).
 * Responsive: one column on small screens, more as width allows.
 */
export function TeamGrid({ teams }: { teams: Team[] }): JSX.Element {
  if (teams.length === 0) {
    return <p className="text-slate-500">Nenhum time para mostrar.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {teams.map((team) => (
        <li key={team.id}>
          <TeamCard team={team} />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run TeamGrid`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/TeamGrid.tsx packages/web/src/components/TeamGrid.test.tsx
git commit -m "feat(web): responsive TeamGrid of team cards"
```

---

### Task 5: App states + wire TeamGrid, remove TeamList

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App.test.tsx`
- Delete: `packages/web/src/components/TeamList.tsx`, `packages/web/src/components/TeamList.test.tsx`

**Interfaces:**
- Consumes: `TeamGrid` (Task 4); `fetchTeams` (`api/client.ts`, unchanged): `() => Promise<TeamsResponse>` that throws on non-OK.
- Produces: the finished app — explicit `status: "loading" | "error" | "ready"`, a header with the team count, error state with a retry that refetches.

- [ ] **Step 1: Write the failing test** (replace `App.test.tsx`)

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App.js";
import { makeTeam, makeTeamsResponse } from "./test/factories.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows loading, then the team grid with a count", async () => {
    const body = makeTeamsResponse({
      teams: [makeTeam({ id: "MB1", name: "Sun Offense" })],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => body })),
    );

    render(<App />);

    expect(screen.getByText(/carregando/i)).toBeTruthy();
    expect(await screen.findByText("Sun Offense")).toBeTruthy();
    expect(screen.getByText(/1 times? campe/i)).toBeTruthy();
  });

  it("shows an error state with a retry that refetches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeTeamsResponse({ teams: [makeTeam({ name: "Recovered" })] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText(/não foi possível/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(await screen.findByText("Recovered")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run App`
Expected: FAIL — no loading text / no retry button in the current App.

- [ ] **Step 3: Rewrite `App.tsx`**

```tsx
import { useCallback, useEffect, useState, type JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { fetchTeams } from "./api/client.js";
import { TeamGrid } from "./components/TeamGrid.js";

type Status = "loading" | "error" | "ready";

/**
 * The web app's imperative shell: fetches teams, tracks an explicit status, and
 * renders the matching view. An explicit status (not an empty array) keeps
 * "loading" distinct from "loaded but empty". Data access stays behind api/.
 */
export function App(): JSX.Element {
  const [status, setStatus] = useState<Status>("loading");
  const [teams, setTeams] = useState<Team[]>([]);

  const load = useCallback(() => {
    let active = true;
    setStatus("loading");
    fetchTeams()
      .then((res) => {
        if (!active) return;
        setTeams(res.teams);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!active) return;
        // Degrade gracefully: surface an error state instead of a blank crash.
        console.error("Failed to load teams", err);
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Pokémon Champions</h1>

      {status === "loading" && <p className="text-slate-500">Carregando times…</p>}

      {status === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-slate-700">Não foi possível carregar os times.</p>
          <button
            type="button"
            onClick={load}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          <p className="mb-4 text-sm text-slate-600">{teams.length} times campeões</p>
          <TeamGrid teams={teams} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run App`
Expected: PASS (loading→grid+count; error→retry→recovered).

- [ ] **Step 5: Delete the superseded TeamList**

```bash
git rm packages/web/src/components/TeamList.tsx packages/web/src/components/TeamList.test.tsx
```

- [ ] **Step 6: Confirm no dangling references + full gate**

Run: `grep -rn "TeamList" packages/web/src` (expect: no matches), then `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: no `TeamList` references; all four green.

- [ ] **Step 7: Exercise in the browser (the feedback loop)**

Run: `pnpm dev`, open `http://localhost:5173`.
Expected: a responsive grid of team cards with real sprites (lazy-loading as you scroll), rank badges, tournament/owner, and a "ver paste" link. Toggle the states: with the API up you see the grid + count; stop the Fastify server and reload to see the error state + working retry.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): render teams as a card grid with loading/error states"
```

---

## Self-Review

**Spec coverage:**
- `TeamGrid` replaces `TeamList` → Task 4 (+ removal in Task 5). ✓
- `TeamCard` 2×3 with name/rank/tournament/owner/sprites/paste link → Task 3. ✓
- `PokemonSprite` (alt, lazy, fixed size, onError fallback) → Task 2. ✓
- App states loading/error(+retry)/empty/ready + header count → Task 5 (empty state lives in `TeamGrid`). ✓
- Tailwind v4 official setup → Task 1. ✓
- Performance: `loading="lazy"` + fixed dims, no virtualization → Task 2 (sprite) + constraint. ✓
- Null fields omitted → Task 3 (test asserts no "null"). ✓
- Stub network not client; reuse factories → Tasks 3/5 (factory) and App test. ✓
- Out of scope (search, detail, virtualization, backend/contract change) → not in any task. ✓

**Placeholder scan:** No code step deferred; all components and tests have full code. Task 1 has no unit test by design (build-tooling config) and says so explicitly with a concrete gate.

**Type consistency:** `PokemonSprite({species, spriteUrl})` defined in Task 2, consumed by `TeamCard` (Task 3) with the same prop names. `TeamCard({team})` consumed by `TeamGrid` (Task 4). `TeamGrid({teams})` consumed by `App` (Task 5). `makePokemon` defined in Task 3, used in Task 3's test. `fetchTeams` signature matches `api/client.ts`. `Team`/`PokemonSet` field names match the shared contract.
