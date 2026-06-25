# Real Ingest (Sheet + Sprites) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary `sample.ts` seam with a real ingest pipeline that feeds live champion teams (with PokeAPI sprites) into the existing `Team`/`PokemonSet` contract.

**Architecture:** Functional core / imperative shell. Pure domain (`csv`, `names`, `assemble`) is TDD'd with fixtures; the shell (`ingest/`, `cache/`) does network/disk I/O behind injected `fetch`-shaped deps; HTTP gets the ingest via dependency injection. Ingest is lazy + single-flight, held in memory; only the stable species→sprite map is persisted to disk.

**Tech Stack:** TypeScript (strict + `noUncheckedIndexedAccess`), Fastify 5, `fastify-type-provider-zod`, zod 4, `p-limit`, vitest. Node 20+ (global `fetch`).

## Global Constraints

- `domain/` is pure: no network, no disk, no clock, no `process.env`. Same input → same output.
- I/O only in the shell (`ingest/`, `cache/`, `http/`). Dependency direction: shell → core, never the reverse.
- `process.env` is read ONLY in `packages/server/src/index.ts`.
- Validate every external input at the border with zod (PokeAPI response, sprite cache file). Never trust raw external data.
- Polite external client: follow 307 redirects; limit concurrency with `p-limit`; retry with backoff ONLY on 5xx/network, NEVER on 404 (404 = mapping bug → log, never retry); dedupe; descriptive User-Agent.
- Graceful degradation: a bad species/sprite never crashes the ingest or the API response — log it and continue with a placeholder.
- Tests stub the network at the boundary (inject a `fetch`-shaped dep), never our own code.
- Conventional Commits in English, one commit per task. CI green (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) at every commit.
- Run all commands from the repo root unless stated. Server tests run via the `server` workspace (`pnpm --filter @pokemon-champions/server test`).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/server/src/domain/csv.ts` | modify | Parse sheet CSV → `RawTeam[]` with owner/tournament/rank + 6 species, columns located by header. |
| `packages/server/src/domain/names.ts` | create | `spriteCandidates(species)` — ordered PokeAPI slug candidates (overrides + naive + segment fallback). |
| `packages/server/src/domain/assemble.ts` | modify | `assembleTeams(raw, sprites)` join → `Team[]`; owns `PLACEHOLDER_SPRITE_URL` + `ResolvedSprite`. |
| `packages/server/src/cache/sprites.ts` | create | Disk L2: read/write species→`ResolvedSprite` map (`data/cache/sprites.json`), zod-validated. |
| `packages/server/src/ingest/sheet.ts` | create | Fetch the CSV (follows 307, descriptive UA, validates non-empty text). |
| `packages/server/src/ingest/sprites.ts` | create | `resolveSprites(species, opts)` — network only, cache-agnostic; p-limit, retry 5xx-not-404, dedupe, log misses. |
| `packages/server/src/ingest/orchestrator.ts` | create | `createTeamsService(deps)` — single-flight + in-memory hold + cache-skip composition + canary + `fetchedAt`. |
| `packages/server/src/http/app.ts` | modify | `buildApp({ getTeams })` DI; thin handler → 200, or 503 on ingest failure. |
| `packages/server/src/index.ts` | modify | Read env (the only env border); compose real deps; bind `fetch`/`fs`/URLs. |
| `packages/server/src/domain/sample.ts` + `.test.ts` | delete | The seam dies. |
| `packages/server/package.json` | modify | Add `p-limit`. |

**Shared `ResolvedSprite` type** (defined in `assemble.ts`, imported by cache/sprites/orchestrator):

```ts
export interface ResolvedSprite {
  spriteUrl: string;
  dexId: number | null;
}
```

---

### Task 1: Extend CSV parsing (RawTeam grows)

**Files:**
- Modify: `packages/server/src/domain/csv.ts`
- Test: `packages/server/src/domain/csv.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  export interface RawTeam {
    id: string;
    name: string;
    ownerName: string | null;
    ownerHandle: string | null;
    tournament: string | null;
    rank: string | null;
    pokepasteUrl: string;
    species: string[]; // 0..6 Showdown names, in sheet order, blanks dropped
  }
  export function parseTeamsCsv(csv: string): RawTeam[];
  ```

> **Empirical note:** the exact header strings for owner/tournament/rank and the six species columns must be confirmed against the live sheet's header row (CLAUDE.md hurdle #3). This task encodes the best-known names as named constants at the top of `csv.ts`; a follow-up verification happens in Task 9 when we exercise the real sheet. Columns are ALWAYS located by header name, never fixed position.

- [ ] **Step 1: Write the failing test** (replace the existing `csv.test.ts` body)

```ts
import { describe, expect, it } from "vitest";
import { parseTeamsCsv } from "./csv.js";

describe("parseTeamsCsv", () => {
  it("locates columns by header, not position, and extracts the six species", () => {
    // Header order is deliberately shuffled: the real sheet moves columns around.
    const csv = [
      "Pokemon 1,Team Description,Owner,Pokemon 2,Team ID,Full Name,Pokepaste,Pokemon 3,Tournament,Pokemon 4,Placement,Pokemon 5,Pokemon 6",
      "Miraidon,Sun Offense,@sunbro,Flutter Mane,MB1,Sun Bro,https://pokepast.es/abc,Iron Hands,Worlds 2026,Landorus-Therian,Champion,Amoonguss,Rillaboom",
    ].join("\n");

    expect(parseTeamsCsv(csv)).toEqual([
      {
        id: "MB1",
        name: "Sun Offense",
        ownerName: "Sun Bro",
        ownerHandle: "@sunbro",
        tournament: "Worlds 2026",
        rank: "Champion",
        pokepasteUrl: "https://pokepast.es/abc",
        species: [
          "Miraidon",
          "Flutter Mane",
          "Iron Hands",
          "Landorus-Therian",
          "Amoonguss",
          "Rillaboom",
        ],
      },
    ]);
  });

  it("tolerates a partial row: missing optional fields become null, blank species are dropped", () => {
    const csv = [
      "Team ID,Team Description,Pokepaste,Pokemon 1,Pokemon 2",
      "MB2,Trick Room,https://pokepast.es/tr,Indeedee-F,",
    ].join("\n");

    expect(parseTeamsCsv(csv)).toEqual([
      {
        id: "MB2",
        name: "Trick Room",
        ownerName: null,
        ownerHandle: null,
        tournament: null,
        rank: null,
        pokepasteUrl: "https://pokepast.es/tr",
        species: ["Indeedee-F"],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pokemon-champions/server test -- csv`
Expected: FAIL — current parser returns only `{ id, name, pokepasteUrl }`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Pure CSV parsing for the champions sheet. No I/O: a string goes in, domain
 * data comes out — this is the cheap-to-TDD core (server/CLAUDE.md). Fetching
 * the CSV from Google Sheets is a separate concern that lives in `ingest/`.
 */

// Columns are located by these header names, never by fixed position: the real
// sheet shuffles columns (CLAUDE.md hurdle #3). Confirm against the live header
// row when wiring real ingest (plan Task 9).
const HEADERS = {
  id: "Team ID",
  name: "Team Description",
  ownerName: "Full Name",
  ownerHandle: "Owner",
  tournament: "Tournament",
  rank: "Placement",
  pokepaste: "Pokepaste",
} as const;

/** Header pattern for the six Pokémon columns, e.g. "Pokemon 1".."Pokemon 6". */
const SPECIES_HEADER = /^Pok[eé]mon\s*\d+$/i;

/**
 * A team as read straight from the sheet, before sprites are resolved.
 * Intentionally NOT the shared `Team`: that contract needs PokeAPI sprite data
 * we don't have yet. Optional fields are null when the sheet omits them; the
 * species list drops blanks, so a partial paste yields fewer than six.
 */
export interface RawTeam {
  id: string;
  name: string;
  ownerName: string | null;
  ownerHandle: string | null;
  tournament: string | null;
  rank: string | null;
  pokepasteUrl: string;
  species: string[];
}

export function parseTeamsCsv(csv: string): RawTeam[] {
  const [headerLine, ...rows] = csv.trim().split("\n");
  if (headerLine === undefined) return [];

  const headers = headerLine.split(",");
  const col = (name: string): number => headers.indexOf(name);

  const idCol = col(HEADERS.id);
  const nameCol = col(HEADERS.name);
  const ownerNameCol = col(HEADERS.ownerName);
  const ownerHandleCol = col(HEADERS.ownerHandle);
  const tournamentCol = col(HEADERS.tournament);
  const rankCol = col(HEADERS.rank);
  const pokepasteCol = col(HEADERS.pokepaste);
  const speciesCols = headers
    .map((h, i) => (SPECIES_HEADER.test(h) ? i : -1))
    .filter((i) => i >= 0);

  // A cell value, or null when the column is absent/empty (optional fields).
  const opt = (cells: string[], i: number): string | null => {
    if (i < 0) return null;
    const v = cells[i]?.trim();
    return v ? v : null;
  };

  return rows.map((row) => {
    const cells = row.split(",");
    return {
      id: opt(cells, idCol) ?? "",
      name: opt(cells, nameCol) ?? "",
      ownerName: opt(cells, ownerNameCol),
      ownerHandle: opt(cells, ownerHandleCol),
      tournament: opt(cells, tournamentCol),
      rank: opt(cells, rankCol),
      pokepasteUrl: opt(cells, pokepasteCol) ?? "",
      species: speciesCols
        .map((i) => cells[i]?.trim() ?? "")
        .filter((s) => s.length > 0),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pokemon-champions/server test -- csv`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/domain/csv.ts packages/server/src/domain/csv.test.ts
git commit -m "feat(domain): parse owner, tournament, rank and species from the sheet"
```

---

### Task 2: Name → PokeAPI slug candidates

**Files:**
- Create: `packages/server/src/domain/names.ts`
- Test: `packages/server/src/domain/names.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export function spriteCandidates(species: string): string[];
  ```
  Returns an ordered, de-duplicated list of PokeAPI slugs to try for a Showdown
  species name: the explicit override first (when known), then the naive slug,
  then progressively shorter segment fallbacks. Sprite resolution (Task 6) tries
  them in order until one yields a sprite.

> **Empirical note:** the `OVERRIDES` table below is the v1 seed of the documented
> cases (CLAUDE.md hurdle #6 + the `Floette-Eternal-Mega → floette-mega` special
> case from hurdle #2). The PINNED PokeAPI instance serves non-standard fan-megas
> (hurdle #1), so some slugs differ from pokeapi.co. The 404 logs from Task 6 are
> the oracle that reveals a wrong override; correct the table when exercising
> (Task 9). This task builds the MECHANISM and proves it with representative cases.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { spriteCandidates } from "./names.js";

describe("spriteCandidates", () => {
  it("puts a known override first", () => {
    // Floette-Eternal-Mega has no sprite of its own; fall back to floette-mega.
    expect(spriteCandidates("Floette-Eternal-Mega")[0]).toBe("floette-mega");
    expect(spriteCandidates("Palafin-Hero")[0]).toBe("palafin-hero");
  });

  it("naive-slugs an ordinary name (lowercase, hyphen-separated)", () => {
    expect(spriteCandidates("Landorus-Therian")).toContain("landorus-therian");
    expect(spriteCandidates("Flutter Mane")).toContain("flutter-mane");
  });

  it("appends progressively shorter segment fallbacks, longest first", () => {
    const candidates = spriteCandidates("Staraptor-Mega");
    // naive slug before its shortened fallback
    expect(candidates.indexOf("staraptor-mega")).toBeLessThan(
      candidates.indexOf("staraptor"),
    );
    expect(candidates).toContain("staraptor");
  });

  it("de-duplicates while preserving order", () => {
    const candidates = spriteCandidates("Pikachu");
    expect(candidates).toEqual([...new Set(candidates)]);
    expect(candidates[0]).toBe("pikachu");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pokemon-champions/server test -- names`
Expected: FAIL — `names.js` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Maps a Showdown-format species name to an ordered list of PokeAPI slug
 * candidates. Pure: no network. Sprite resolution tries each candidate in turn
 * until one returns a sprite, so order matters — most specific first.
 *
 * The pinned PokeAPI instance serves non-standard forms (CLAUDE.md hurdle #1),
 * so OVERRIDES is the source of truth for the cases naive slugging gets wrong.
 * A 404 during resolution means a mapping bug — fix it here (hurdle #6).
 */

// Showdown name (verbatim) → known-good PokeAPI slug. v1 seed; confirm via the
// 404 logs when exercising real ingest.
const OVERRIDES: Record<string, string> = {
  "Floette-Eternal-Mega": "floette-mega", // hurdle #2: no own sprite
  "Basculegion": "basculegion-male",
  "Basculegion-F": "basculegion-female",
  "Indeedee-F": "indeedee-female",
  "Maushold": "maushold-family-of-four",
  "Mimikyu": "mimikyu-disguised",
  "Palafin": "palafin-zero",
  "Palafin-Hero": "palafin-hero",
  "Aegislash": "aegislash-shield",
  "Tatsugiri": "tatsugiri-curly",
  "Eiscue": "eiscue-ice",
};

/** Lowercase, collapse any run of non-alphanumerics into a single hyphen. */
function naiveSlug(species: string): string {
  return species
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function spriteCandidates(species: string): string[] {
  const candidates: string[] = [];

  const override = OVERRIDES[species];
  if (override) candidates.push(override);

  const slug = naiveSlug(species);
  candidates.push(slug);

  // Segment fallbacks: drop trailing "-segment" pieces, longest first.
  // "staraptor-mega" -> "staraptor". Helps forms the instance lacks.
  const parts = slug.split("-");
  for (let len = parts.length - 1; len >= 1; len--) {
    candidates.push(parts.slice(0, len).join("-"));
  }

  return [...new Set(candidates)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pokemon-champions/server test -- names`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/domain/names.ts packages/server/src/domain/names.test.ts
git commit -m "feat(domain): Showdown name to PokeAPI slug candidates with overrides"
```

---

### Task 3: Assemble joins teams with resolved sprites

**Files:**
- Modify: `packages/server/src/domain/assemble.ts`
- Modify: `packages/server/src/domain/sample.ts` (keep it compiling — it dies in Task 9)
- Test: `packages/server/src/domain/assemble.test.ts`

**Interfaces:**
- Consumes: `RawTeam` (Task 1).
- Produces:
  ```ts
  export interface ResolvedSprite { spriteUrl: string; dexId: number | null }
  export const PLACEHOLDER_SPRITE_URL = "/placeholder-sprite.png";
  export function assembleTeams(
    raw: RawTeam[],
    sprites: Map<string, ResolvedSprite>,
  ): Team[];
  ```
  `sprites` is keyed by the verbatim Showdown species name. A species absent from
  the map (resolution failed/omitted) becomes the placeholder + `dexId: null` —
  this is the single place the placeholder is applied.

- [ ] **Step 1: Write the failing test** (replace the existing `assemble.test.ts` body)

```ts
import { describe, expect, it } from "vitest";
import {
  assembleTeams,
  PLACEHOLDER_SPRITE_URL,
  type ResolvedSprite,
} from "./assemble.js";
import type { RawTeam } from "./csv.js";

const team: RawTeam = {
  id: "MB1",
  name: "Sun Offense",
  ownerName: "Sun Bro",
  ownerHandle: "@sunbro",
  tournament: "Worlds 2026",
  rank: "Champion",
  pokepasteUrl: "https://pokepast.es/abc",
  species: ["Miraidon", "Floette-Eternal-Mega"],
};

describe("assembleTeams", () => {
  it("joins each species with its resolved sprite", () => {
    const sprites = new Map<string, ResolvedSprite>([
      ["Miraidon", { spriteUrl: "https://img/miraidon.png", dexId: 1008 }],
      ["Floette-Eternal-Mega", { spriteUrl: "https://img/floette.png", dexId: 670 }],
    ]);

    expect(assembleTeams([team], sprites)).toEqual([
      {
        id: "MB1",
        name: "Sun Offense",
        ownerName: "Sun Bro",
        ownerHandle: "@sunbro",
        tournament: "Worlds 2026",
        rank: "Champion",
        pokepasteUrl: "https://pokepast.es/abc",
        pokemon: [
          { species: "Miraidon", spriteUrl: "https://img/miraidon.png", dexId: 1008 },
          { species: "Floette-Eternal-Mega", spriteUrl: "https://img/floette.png", dexId: 670 },
        ],
      },
    ]);
  });

  it("falls back to a placeholder for an unresolved species (graceful degradation)", () => {
    const sprites = new Map<string, ResolvedSprite>([
      ["Miraidon", { spriteUrl: "https://img/miraidon.png", dexId: 1008 }],
    ]);

    const [result] = assembleTeams([team], sprites);

    expect(result?.pokemon[1]).toEqual({
      species: "Floette-Eternal-Mega",
      spriteUrl: PLACEHOLDER_SPRITE_URL,
      dexId: null,
    });
  });

  it("returns an empty list for no teams", () => {
    expect(assembleTeams([], new Map())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pokemon-champions/server test -- assemble`
Expected: FAIL — `assembleTeams` takes one arg and emits `pokemon: []`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Promotes the sheet-only `RawTeam` into the shared `Team` contract by joining
 * each species with its resolved sprite. Pure: no I/O, no clock — same input,
 * same output (server/CLAUDE.md). A species with no resolved sprite degrades to
 * an explicit placeholder rather than crashing the response.
 */

import type { Team } from "@pokemon-champions/shared";
import type { RawTeam } from "./csv.js";

/** A sprite resolved (or not) for a single species. */
export interface ResolvedSprite {
  spriteUrl: string;
  dexId: number | null;
}

/** Sentinel sprite URL for species we could not map. The web maps it to a local asset. */
export const PLACEHOLDER_SPRITE_URL = "/placeholder-sprite.png";

export function assembleTeams(
  raw: RawTeam[],
  sprites: Map<string, ResolvedSprite>,
): Team[] {
  return raw.map((team) => ({
    id: team.id,
    name: team.name,
    ownerName: team.ownerName,
    ownerHandle: team.ownerHandle,
    tournament: team.tournament,
    rank: team.rank,
    pokepasteUrl: team.pokepasteUrl,
    pokemon: team.species.map((species) => {
      const resolved = sprites.get(species);
      return {
        species,
        spriteUrl: resolved?.spriteUrl ?? PLACEHOLDER_SPRITE_URL,
        dexId: resolved?.dexId ?? null,
      };
    }),
  }));
}
```

- [ ] **Step 4: Keep the doomed `sample.ts` compiling**

`sample.ts` calls `assembleTeams(parseTeamsCsv(SAMPLE_CSV))`. Update that single call so the project still type-checks (it is deleted in Task 9):

```ts
// in packages/server/src/domain/sample.ts
export function sampleTeams(): Team[] {
  return assembleTeams(parseTeamsCsv(SAMPLE_CSV), new Map());
}
```

- [ ] **Step 5: Run tests + typecheck to verify green**

Run: `pnpm --filter @pokemon-champions/server test -- assemble && pnpm --filter @pokemon-champions/server typecheck`
Expected: assemble PASS; typecheck clean (sample.ts compiles).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/domain/assemble.ts packages/server/src/domain/assemble.test.ts packages/server/src/domain/sample.ts
git commit -m "feat(domain): assemble joins teams with resolved sprites, placeholder on miss"
```

---

### Task 4: Sprite cache (disk L2)

**Files:**
- Create: `packages/server/src/cache/sprites.ts`
- Test: `packages/server/src/cache/sprites.test.ts`

**Interfaces:**
- Consumes: `ResolvedSprite` (Task 3).
- Produces:
  ```ts
  export function readSpriteCache(path: string): Promise<Map<string, ResolvedSprite>>;
  export function writeSpriteCache(path: string, sprites: Map<string, ResolvedSprite>): Promise<void>;
  ```
  Read returns an empty map when the file is missing or fails validation (logged,
  never throws — a corrupt cache must not break ingest). Write creates parent dirs.

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolvedSprite } from "../domain/assemble.js";
import { readSpriteCache, writeSpriteCache } from "./sprites.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sprite-cache-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sprite cache", () => {
  it("round-trips a map through disk", async () => {
    const path = join(dir, "sprites.json");
    const map = new Map<string, ResolvedSprite>([
      ["Miraidon", { spriteUrl: "https://img/miraidon.png", dexId: 1008 }],
    ]);

    await writeSpriteCache(path, map);
    const read = await readSpriteCache(path);

    expect(read).toEqual(map);
  });

  it("returns an empty map when the file is missing", async () => {
    const read = await readSpriteCache(join(dir, "does-not-exist.json"));
    expect(read).toEqual(new Map());
  });

  it("returns an empty map when the file is corrupt (never throws)", async () => {
    const path = join(dir, "sprites.json");
    await writeSpriteCache(path, new Map()); // create the dir
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, "not json at all", "utf8");

    await expect(readSpriteCache(path)).resolves.toEqual(new Map());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pokemon-champions/server test -- cache/sprites`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * L2 disk cache for the species → sprite map. The mapping is expensive to
 * resolve (one PokeAPI call per unique species) but stable (Pikachu is always
 * Pikachu), so persisting it survives restarts and keeps us polite to the API.
 * A missing or corrupt file degrades to an empty map — it must never break
 * ingest (server/CLAUDE.md graceful degradation).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { ResolvedSprite } from "../domain/assemble.js";

const CacheFileSchema = z.record(
  z.string(),
  z.object({ spriteUrl: z.string(), dexId: z.number().int().nullable() }),
);

export async function readSpriteCache(
  path: string,
): Promise<Map<string, ResolvedSprite>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return new Map(); // missing file — first run
  }
  const parsed = CacheFileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    // Corrupt cache: log and start fresh rather than crash ingest.
    console.warn(`[sprite-cache] ignoring corrupt cache at ${path}`);
    return new Map();
  }
  return new Map(Object.entries(parsed.data));
}

export async function writeSpriteCache(
  path: string,
  sprites: Map<string, ResolvedSprite>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const obj = Object.fromEntries(sprites);
  await writeFile(path, JSON.stringify(obj, null, 2), "utf8");
}
```

> Note: `JSON.parse(raw)` can throw on malformed JSON; wrap the parse so the
> corrupt-file case resolves to an empty map. Adjust Step 3 to `try { JSON.parse }`
> inside the same guard if the test for corrupt input fails.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pokemon-champions/server test -- cache/sprites`
Expected: PASS (round-trip, missing, corrupt).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/cache/sprites.ts packages/server/src/cache/sprites.test.ts
git commit -m "feat(cache): disk-persist the species to sprite map"
```

---

### Task 5: Fetch the sheet CSV (network)

**Files:**
- Create: `packages/server/src/ingest/sheet.ts`
- Test: `packages/server/src/ingest/sheet.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type FetchLike = typeof globalThis.fetch;
  export function fetchSheetCsv(url: string, fetchImpl?: FetchLike): Promise<string>;
  ```
  `fetch` follows 307 by default (`redirect: "follow"`). Throws on non-OK status
  or empty body — the orchestrator turns that into a 503 (root-source failure).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchSheetCsv } from "./sheet.js";

const ok = (body: string) =>
  new Response(body, { status: 200, headers: { "content-type": "text/csv" } });

describe("fetchSheetCsv", () => {
  it("returns the body text on 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok("Team ID,Team Description\nMB1,Sun"));
    await expect(fetchSheetCsv("https://sheet", fetchImpl)).resolves.toContain("MB1");
  });

  it("sends a descriptive User-Agent and follows redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok("x,y\n1,2"));
    await fetchSheetCsv("https://sheet", fetchImpl);

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.redirect).toBe("follow");
    expect(String(init.headers["User-Agent"])).toMatch(/PokemonChampions/i);
  });

  it("throws on a non-OK response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(fetchSheetCsv("https://sheet", fetchImpl)).rejects.toThrow(/500/);
  });

  it("throws on an empty body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok("   "));
    await expect(fetchSheetCsv("https://sheet", fetchImpl)).rejects.toThrow(/empty/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pokemon-champions/server test -- ingest/sheet`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Fetches the champions sheet as CSV text. Lives in the shell because it does
 * network I/O; the pure parsing is `domain/csv`. Follows the sheet's 307
 * redirect, identifies itself with a descriptive User-Agent (good API citizen),
 * and refuses an empty/failed response so the orchestrator can surface a 503.
 */

export type FetchLike = typeof globalThis.fetch;

const USER_AGENT =
  "PokemonChampions/0.1 (+https://github.com/PeuAlmeidaDev/PokemonChampions)";

export async function fetchSheetCsv(
  url: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<string> {
  const res = await fetchImpl(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`sheet fetch failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  if (text.trim().length === 0) {
    throw new Error("sheet fetch returned an empty body");
  }
  return text;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pokemon-champions/server test -- ingest/sheet`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ingest/sheet.ts packages/server/src/ingest/sheet.test.ts
git commit -m "feat(ingest): fetch the champions sheet CSV over the network"
```

---

### Task 6: Resolve sprites from PokeAPI (network)

**Files:**
- Modify: `packages/server/package.json` (add `p-limit`)
- Create: `packages/server/src/ingest/sprites.ts`
- Test: `packages/server/src/ingest/sprites.test.ts`

**Interfaces:**
- Consumes: `spriteCandidates` (Task 2), `ResolvedSprite` (Task 3), `FetchLike` (Task 5).
- Produces:
  ```ts
  export interface ResolveSpritesOptions {
    baseUrl: string;            // pinned PokeAPI base, e.g. ".../api/v2"
    fetchImpl?: FetchLike;
    concurrency?: number;       // default 10
    logger?: { warn: (msg: string) => void }; // default console
  }
  export function resolveSprites(
    species: string[],
    opts: ResolveSpritesOptions,
  ): Promise<Map<string, ResolvedSprite>>;
  ```
  Network only, cache-agnostic. Dedupes species, resolves each unique one by
  trying its `spriteCandidates` in order: 200 with a sprite wins; 404 → next
  candidate (NO retry — it is a mapping bug, logged); 5xx/network → retry with
  backoff, then next candidate. A species whose candidates all miss is OMITTED
  from the map and logged (assemble applies the placeholder). Concurrency capped
  with `p-limit`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @pokemon-champions/server add p-limit`
Expected: `p-limit` appears under `dependencies` in `packages/server/package.json`.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { resolveSprites } from "./sprites.js";

const pokeOk = (id: number, sprite: string | null) =>
  new Response(JSON.stringify({ id, sprites: { front_default: sprite } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const status = (code: number) => new Response("", { status: code });

const base = "https://poke/api/v2";

describe("resolveSprites", () => {
  it("resolves a species to its sprite url and dex id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pokeOk(25, "https://img/pikachu.png"));

    const map = await resolveSprites(["Pikachu"], { baseUrl: base, fetchImpl });

    expect(map.get("Pikachu")).toEqual({
      spriteUrl: "https://img/pikachu.png",
      dexId: 25,
    });
  });

  it("dedupes repeated species into a single fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pokeOk(25, "https://img/pikachu.png"));

    await resolveSprites(["Pikachu", "Pikachu", "Pikachu"], { baseUrl: base, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 404 and tries the next candidate", async () => {
    // Staraptor-Mega -> tries "staraptor-mega" (404) then "staraptor" (200).
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(404))
      .mockResolvedValueOnce(pokeOk(398, "https://img/staraptor.png"));

    const map = await resolveSprites(["Staraptor-Mega"], { baseUrl: base, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2); // one per candidate, no retry
    expect(map.get("Staraptor-Mega")?.dexId).toBe(398);
  });

  it("omits a species whose candidates all miss, and logs it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(status(404));
    const logger = { warn: vi.fn() };

    const map = await resolveSprites(["Totally-Fake"], { baseUrl: base, fetchImpl, logger });

    expect(map.has("Totally-Fake")).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("treats a 200 with null front_default as a miss (tries next candidate)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(pokeOk(670, null)) // floette-mega: no sprite
      .mockResolvedValueOnce(pokeOk(670, "https://img/floette.png")); // floette

    const map = await resolveSprites(["Floette-Mega"], { baseUrl: base, fetchImpl });

    expect(map.get("Floette-Mega")?.spriteUrl).toBe("https://img/floette.png");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @pokemon-champions/server test -- ingest/sprites`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Write the implementation**

```ts
/**
 * Resolves Showdown species names to PokeAPI sprites. Shell (network I/O),
 * cache-agnostic: the orchestrator handles the disk cache. Good API citizen —
 * dedupes, caps concurrency with p-limit, retries ONLY 5xx/network with backoff
 * and NEVER a 404 (a 404 is a mapping bug, logged). A species whose candidates
 * all miss is omitted; assemble fills the placeholder (graceful degradation).
 */

import pLimit from "p-limit";
import { z } from "zod";
import { spriteCandidates } from "../domain/names.js";
import type { ResolvedSprite } from "../domain/assemble.js";
import type { FetchLike } from "./sheet.js";

const PokeApiSchema = z.object({
  id: z.number().int(),
  sprites: z.object({ front_default: z.string().nullable() }),
});

export interface ResolveSpritesOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
  concurrency?: number;
  logger?: { warn: (msg: string) => void };
}

const MAX_5XX_RETRIES = 2;
const backoff = (attempt: number) =>
  new Promise((r) => setTimeout(r, 200 * 2 ** attempt));

/** Fetch one candidate slug. Returns the resolved sprite, or null on a miss
 * (404 / 200-without-sprite / 5xx after retries). Never throws. */
async function tryCandidate(
  slug: string,
  opts: Required<Pick<ResolveSpritesOptions, "baseUrl">> & ResolveSpritesOptions,
  fetchImpl: FetchLike,
): Promise<ResolvedSprite | null> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(`${opts.baseUrl}/pokemon/${slug}`);
    } catch {
      if (attempt < MAX_5XX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      return null; // network failure after retries
    }
    if (res.status === 404) return null; // mapping miss — never retry
    if (res.status >= 500) {
      if (attempt < MAX_5XX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      return null;
    }
    if (!res.ok) return null;
    const parsed = PokeApiSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.sprites.front_default === null) return null;
    return { spriteUrl: parsed.data.sprites.front_default, dexId: parsed.data.id };
  }
}

export async function resolveSprites(
  species: string[],
  opts: ResolveSpritesOptions,
): Promise<Map<string, ResolvedSprite>> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const logger = opts.logger ?? console;
  const limit = pLimit(opts.concurrency ?? 10);
  const unique = [...new Set(species)];
  const resolved = new Map<string, ResolvedSprite>();

  await Promise.all(
    unique.map((name) =>
      limit(async () => {
        for (const slug of spriteCandidates(name)) {
          const hit = await tryCandidate(slug, opts, fetchImpl);
          if (hit) {
            resolved.set(name, hit);
            return;
          }
        }
        logger.warn(`[sprites] no PokeAPI sprite for "${name}" — check the override table`);
      }),
    ),
  );

  return resolved;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @pokemon-champions/server test -- ingest/sprites`
Expected: PASS (resolve, dedupe, 404-no-retry, omit+log, null-sprite miss).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ingest/sprites.ts packages/server/src/ingest/sprites.test.ts packages/server/package.json pnpm-lock.yaml
git commit -m "feat(ingest): resolve PokeAPI sprites with dedupe, retry policy and fallbacks"
```

---

### Task 7: Orchestrator (single-flight ingest service)

**Files:**
- Create: `packages/server/src/ingest/orchestrator.ts`
- Test: `packages/server/src/ingest/orchestrator.test.ts`

**Interfaces:**
- Consumes: `parseTeamsCsv` (Task 1), `assembleTeams`/`ResolvedSprite` (Task 3),
  `TeamsResponse` (shared).
- Produces:
  ```ts
  export interface TeamsServiceDeps {
    fetchSheetCsv: () => Promise<string>;
    resolveSprites: (species: string[]) => Promise<Map<string, ResolvedSprite>>;
    readSpriteCache: () => Promise<Map<string, ResolvedSprite>>;
    writeSpriteCache: (sprites: Map<string, ResolvedSprite>) => Promise<void>;
    logger?: { warn: (msg: string) => void };
  }
  export interface TeamsService {
    getTeams: () => Promise<TeamsResponse>;
  }
  export function createTeamsService(deps: TeamsServiceDeps): TeamsService;
  ```
  `getTeams` is lazy + single-flight: the first call runs the ingest, concurrent
  callers share the in-flight promise, and the result is held in memory for
  subsequent calls. On failure the in-flight promise is cleared so the next call
  retries (no memoized failure). Resolution skips species already in the disk
  cache and persists the merged map. `fetchedAt` is stamped (ingest time) when the
  ingest completes. Warns when the parsed team count looks suspiciously low.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import type { ResolvedSprite } from "../domain/assemble.js";
import { createTeamsService, type TeamsServiceDeps } from "./orchestrator.js";

const CSV = [
  "Team ID,Team Description,Pokepaste,Pokemon 1,Pokemon 2",
  "MB1,Sun,https://pokepast.es/a,Miraidon,Flutter Mane",
].join("\n");

function deps(overrides: Partial<TeamsServiceDeps> = {}): TeamsServiceDeps {
  return {
    fetchSheetCsv: vi.fn().mockResolvedValue(CSV),
    resolveSprites: vi.fn(async (species: string[]) =>
      new Map<string, ResolvedSprite>(
        species.map((s) => [s, { spriteUrl: `https://img/${s}.png`, dexId: 1 }]),
      ),
    ),
    readSpriteCache: vi.fn().mockResolvedValue(new Map()),
    writeSpriteCache: vi.fn().mockResolvedValue(undefined),
    logger: { warn: vi.fn() },
    ...overrides,
  };
}

describe("createTeamsService", () => {
  it("ingests and assembles teams with a real ISO fetchedAt", async () => {
    const service = createTeamsService(deps());

    const result = await service.getTeams();

    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]?.pokemon).toHaveLength(2);
    expect(Number.isNaN(Date.parse(result.fetchedAt))).toBe(false);
  });

  it("is single-flight: concurrent calls share one ingest", async () => {
    const d = deps();
    const service = createTeamsService(d);

    await Promise.all([service.getTeams(), service.getTeams(), service.getTeams()]);

    expect(d.fetchSheetCsv).toHaveBeenCalledTimes(1);
  });

  it("serves the second call from memory (no re-ingest)", async () => {
    const d = deps();
    const service = createTeamsService(d);

    await service.getTeams();
    await service.getTeams();

    expect(d.fetchSheetCsv).toHaveBeenCalledTimes(1);
  });

  it("only resolves species missing from the disk cache, then persists the merge", async () => {
    const cached = new Map<string, ResolvedSprite>([
      ["Miraidon", { spriteUrl: "https://img/cached.png", dexId: 1008 }],
    ]);
    const d = deps({ readSpriteCache: vi.fn().mockResolvedValue(cached) });
    const service = createTeamsService(d);

    await service.getTeams();

    expect(d.resolveSprites).toHaveBeenCalledWith(["Flutter Mane"]); // not Miraidon
    expect(d.writeSpriteCache).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight promise on failure so the next call retries", async () => {
    const fetchSheetCsv = vi
      .fn()
      .mockRejectedValueOnce(new Error("sheet down"))
      .mockResolvedValueOnce(CSV);
    const service = createTeamsService(deps({ fetchSheetCsv }));

    await expect(service.getTeams()).rejects.toThrow("sheet down");
    await expect(service.getTeams()).resolves.toBeTruthy(); // retried
    expect(fetchSheetCsv).toHaveBeenCalledTimes(2);
  });

  it("warns when the parsed team count is suspiciously low", async () => {
    const logger = { warn: vi.fn() };
    const service = createTeamsService(deps({ logger }));

    await service.getTeams(); // 1 team, well under the ~200 canary

    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/team count/i));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pokemon-champions/server test -- ingest/orchestrator`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The ingest conductor. Lazy + single-flight: the first request triggers the
 * pipeline (sheet → parse → resolve sprites, skipping the disk cache → assemble),
 * concurrent callers share the in-flight promise, and the assembled result is
 * held in memory. On failure the promise is cleared so the next call retries —
 * the route turns a rejection into a 503 and the source can recover on its own.
 */

import type { TeamsResponse } from "@pokemon-champions/shared";
import { parseTeamsCsv } from "../domain/csv.js";
import { assembleTeams, type ResolvedSprite } from "../domain/assemble.js";

/** Below this parsed-team count, the sheet layout has probably changed. ~200 expected. */
const CANARY_MIN_TEAMS = 150;

export interface TeamsServiceDeps {
  fetchSheetCsv: () => Promise<string>;
  resolveSprites: (species: string[]) => Promise<Map<string, ResolvedSprite>>;
  readSpriteCache: () => Promise<Map<string, ResolvedSprite>>;
  writeSpriteCache: (sprites: Map<string, ResolvedSprite>) => Promise<void>;
  logger?: { warn: (msg: string) => void };
}

export interface TeamsService {
  getTeams: () => Promise<TeamsResponse>;
}

export function createTeamsService(deps: TeamsServiceDeps): TeamsService {
  const logger = deps.logger ?? console;
  let cached: TeamsResponse | null = null;
  let inFlight: Promise<TeamsResponse> | null = null;

  async function ingest(): Promise<TeamsResponse> {
    const csv = await deps.fetchSheetCsv();
    const raw = parseTeamsCsv(csv);

    if (raw.length < CANARY_MIN_TEAMS) {
      logger.warn(
        `[ingest] parsed team count ${raw.length} is below ${CANARY_MIN_TEAMS} — sheet layout may have changed`,
      );
    }

    const wanted = new Set(raw.flatMap((t) => t.species));
    const cache = await deps.readSpriteCache();
    const missing = [...wanted].filter((s) => !cache.has(s));

    const fresh = missing.length > 0 ? await deps.resolveSprites(missing) : new Map();
    const merged = new Map([...cache, ...fresh]);
    await deps.writeSpriteCache(merged);

    const teams = assembleTeams(raw, merged);
    return { fetchedAt: new Date().toISOString(), teams };
  }

  return {
    getTeams() {
      if (cached) return Promise.resolve(cached);
      if (inFlight) return inFlight;
      inFlight = ingest()
        .then((result) => {
          cached = result;
          return result;
        })
        .finally(() => {
          inFlight = null; // clear whether it resolved or rejected; success kept in `cached`
        });
      return inFlight;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pokemon-champions/server test -- ingest/orchestrator`
Expected: PASS (ingest, single-flight, memory hit, cache-skip+persist, retry-on-failure, canary).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ingest/orchestrator.ts packages/server/src/ingest/orchestrator.test.ts
git commit -m "feat(ingest): single-flight teams service with disk-cache skip and canary"
```

---

### Task 8: Inject ingest into the HTTP app (503 on failure)

**Files:**
- Modify: `packages/server/src/http/app.ts`
- Modify: `packages/server/src/index.ts` (temporary wiring keeps it compiling)
- Test: `packages/server/src/http/app.test.ts`

**Interfaces:**
- Consumes: `TeamsService['getTeams']` shape (Task 7), `TeamsResponse` (shared).
- Produces:
  ```ts
  export interface AppDeps { getTeams: () => Promise<TeamsResponse> }
  export function buildApp(deps: AppDeps): FastifyInstance;
  ```
  The route handler stays thin: call `getTeams()` → 200; on rejection → 503 with
  `{ error }`. Validation/serialization stay zod at the border.

- [ ] **Step 1: Write the failing test** (replace `app.test.ts`)

```ts
import type { FastifyInstance } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { TeamsResponseSchema, type TeamsResponse } from "@pokemon-champions/shared";
import { buildApp } from "./app.js";

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

const sample: TeamsResponse = {
  fetchedAt: "2026-06-25T00:00:00.000Z",
  teams: [
    {
      id: "MB1",
      name: "Sun",
      ownerName: null,
      ownerHandle: null,
      tournament: null,
      rank: null,
      pokepasteUrl: "https://pokepast.es/a",
      pokemon: [],
    },
  ],
};

it("GET /api/health returns ok", async () => {
  app = buildApp({ getTeams: vi.fn().mockResolvedValue(sample) });
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/health" });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok" });
});

it("GET /api/teams returns what the ingest service produced", async () => {
  app = buildApp({ getTeams: vi.fn().mockResolvedValue(sample) });
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/teams" });

  expect(res.statusCode).toBe(200);
  const body = TeamsResponseSchema.parse(res.json());
  expect(body.teams[0]?.id).toBe("MB1");
});

it("GET /api/teams returns 503 when ingest fails", async () => {
  app = buildApp({ getTeams: vi.fn().mockRejectedValue(new Error("sheet down")) });
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/teams" });

  expect(res.statusCode).toBe(503);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pokemon-champions/server test -- http/app`
Expected: FAIL — `buildApp` takes no args and imports `sampleTeams`.

- [ ] **Step 3: Rewrite `app.ts`**

```ts
import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { TeamsResponseSchema, type TeamsResponse } from "@pokemon-champions/shared";
import { z } from "zod";

/** Everything the HTTP layer needs from the rest of the app, injected so tests
 * can drive routes without touching the network. */
export interface AppDeps {
  getTeams: () => Promise<TeamsResponse>;
}

/**
 * Builds the Fastify app fully configured but NOT listening. Keeping listen()
 * out of here lets tests drive routes via `app.inject(...)` without a socket.
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const api = app.withTypeProvider<ZodTypeProvider>();

  api.route({
    method: "GET",
    url: "/api/health",
    schema: { response: { 200: z.object({ status: z.literal("ok") }) } },
    handler: async () => ({ status: "ok" as const }),
  });

  api.route({
    method: "GET",
    url: "/api/teams",
    schema: {
      response: {
        200: TeamsResponseSchema,
        503: z.object({ error: z.string() }),
      },
    },
    // Thin handler: ask the ingest service for teams; turn a root-source failure
    // into 503 so the client can retry (the service self-recovers next call).
    handler: async (_req, reply) => {
      try {
        return await deps.getTeams();
      } catch (err) {
        app.log.error(err);
        return reply.code(503).send({ error: "teams temporarily unavailable" });
      }
    },
  });

  return app;
}
```

- [ ] **Step 4: Keep `index.ts` compiling (temporary)**

`buildApp` now requires `deps`. Until Task 9 wires the real service, pass a
temporary `getTeams` backed by the existing sample seam so the app still builds:

```ts
import { buildApp } from "./http/app.js";
import { sampleTeams } from "./domain/sample.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp({
  getTeams: async () => ({ fetchedAt: new Date().toISOString(), teams: sampleTeams() }),
});

app.listen({ port, host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Run tests + typecheck + build**

Run: `pnpm --filter @pokemon-champions/server test -- http/app && pnpm --filter @pokemon-champions/server typecheck && pnpm --filter @pokemon-champions/server build`
Expected: app tests PASS (200, 503, health); typecheck + build clean.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/http/app.ts packages/server/src/http/app.test.ts packages/server/src/index.ts
git commit -m "feat(http): inject ingest into the app and serve 503 on failure"
```

---

### Task 9: Wire real ingest, delete the seam, exercise

**Files:**
- Modify: `packages/server/src/index.ts`
- Delete: `packages/server/src/domain/sample.ts`, `packages/server/src/domain/sample.test.ts`

**Interfaces:**
- Consumes: `createTeamsService` (Task 7), `fetchSheetCsv` (Task 5),
  `resolveSprites` (Task 6), `readSpriteCache`/`writeSpriteCache` (Task 4).
- Produces: the running server, env-configured.

> This task has no new unit test (it is the composition root — pure wiring +
> deletion). Its gate is the full suite staying green AND exercising the real
> pipeline in the browser.

- [ ] **Step 1: Rewrite `index.ts` as the composition root**

```ts
import { buildApp } from "./http/app.js";
import { createTeamsService } from "./ingest/orchestrator.js";
import { fetchSheetCsv } from "./ingest/sheet.js";
import { resolveSprites } from "./ingest/sprites.js";
import { readSpriteCache, writeSpriteCache } from "./cache/sprites.js";

// Entry point = the edge: the only place that reads the environment.
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const sheetUrl = process.env.SHEET_CSV_URL;
const pokeApiBaseUrl = process.env.POKEAPI_BASE_URL ?? "https://pokeapi.co/api/v2";
const spriteCachePath = process.env.SPRITE_CACHE_PATH ?? "data/cache/sprites.json";

if (!sheetUrl) {
  console.error("SHEET_CSV_URL is required");
  process.exit(1);
}

const logger = { warn: (msg: string) => console.warn(msg) };

const service = createTeamsService({
  fetchSheetCsv: () => fetchSheetCsv(sheetUrl),
  resolveSprites: (species) => resolveSprites(species, { baseUrl: pokeApiBaseUrl, logger }),
  readSpriteCache: () => readSpriteCache(spriteCachePath),
  writeSpriteCache: (sprites) => writeSpriteCache(spriteCachePath, sprites),
  logger,
});

const app = buildApp({ getTeams: service.getTeams });

app.listen({ port, host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Delete the seam**

```bash
git rm packages/server/src/domain/sample.ts packages/server/src/domain/sample.test.ts
```

- [ ] **Step 3: Confirm no dangling references**

Run: `grep -rn "sample" packages/server/src` (expect: no matches), then full CI:
`pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: no `sample` references; all four green.

- [ ] **Step 4: Confirm the real sheet header names + PokeAPI base**

Set the real values (the live sheet CSV-export URL and, if not pokeapi.co, the
pinned instance) and inspect the sheet header row once to confirm the column
header constants in `csv.ts` (`HEADERS` + `SPECIES_HEADER`). If a header differs,
fix the constant and re-run `pnpm --filter @pokemon-champions/server test -- csv`.

```bash
# PowerShell, from repo root:
$env:SHEET_CSV_URL="<live sheet CSV export url>"
# $env:POKEAPI_BASE_URL="<pinned instance>"  # only if not pokeapi.co
```

- [ ] **Step 5: Exercise the real pipeline (the feedback loop)**

Run: `pnpm dev`, then open `http://localhost:5173`.
Expected: real champion teams render. Check the server log:
- parsed team count near ~200 (no canary warning) — confirms the CSV layout.
- any `[sprites] no PokeAPI sprite for "X"` lines reveal override gaps — add the
  correct slug to `OVERRIDES` in `names.ts`, restart, confirm the warning clears.
- `data/cache/sprites.json` exists and is populated; a second `pnpm dev` start
  resolves no new sprites (cache hit).

- [ ] **Step 6: Final CI + commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add -A
git commit -m "feat(ingest): wire real sheet+sprite ingest and remove the sample seam"
```

---

## Self-Review

**Spec coverage:**
- Fetch sheet (307) → Task 5. ✓
- Parse columns by header incl. 6 species + owner/tournament/rank → Task 1. ✓
- Resolve sprite + dexId per unique species → Task 6. ✓
- Assemble real `Team[]` → Task 3. ✓
- L1 memory hold → Task 7 (`cached`). ✓
- L2 disk cache for sprite map only → Task 4 + composed in Task 7. ✓
- Lazy + single-flight → Task 7. ✓
- Two-level failure (root → 503 + clear memo; item → placeholder + log) → Task 7 (memo clear), Task 8 (503), Task 6 (omit+log), Task 3 (placeholder). ✓
- Canary ~200 → Task 7 (`CANARY_MIN_TEAMS`). ✓
- zod at the border (PokeAPI response, cache file) → Task 6, Task 4. ✓
- `front_default: null` → placeholder → Task 6 (miss) + Task 3 (placeholder). ✓
- DI for testable HTTP → Task 8. ✓
- `process.env` only in `index.ts` → Task 9. ✓
- Delete `sample.ts` + test → Task 9. ✓
- Add `p-limit` → Task 6. ✓
- Out of scope (pokepaste/@pkmn/sets, TTL/refresh, contract change) → not in any task. ✓

**Placeholder scan:** No code step deferred. The two "empirical" notes (CSV header
names in Task 1; override slugs + base URL in Tasks 2/9) describe a concrete
verification action against the live source, with the 404 log as the oracle — not
unwritten code.

**Type consistency:** `RawTeam` (Task 1) consumed by Tasks 3/7. `ResolvedSprite` +
`PLACEHOLDER_SPRITE_URL` defined in Task 3, imported by Tasks 4/6/7. `FetchLike`
defined in Task 5, imported by Task 6. `spriteCandidates` (Task 2) used in Task 6.
`createTeamsService`/`getTeams` (Task 7) consumed by Tasks 8/9. `AppDeps`/`buildApp`
(Task 8) consumed by Task 9. Names align across tasks.
