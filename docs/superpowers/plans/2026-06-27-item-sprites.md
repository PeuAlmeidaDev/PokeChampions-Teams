# Item Sprites (Detail Modal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each held item's PokeAPI icon next to its name in the detail modal, resolving the icon server-side (mirroring the species-sprite pipeline) and threading `itemSpriteUrl` through the `TeamDetail` contract.

**Architecture:** New work mirrors the existing species-sprite pipeline one-for-one: a pure `itemSlug` (domain/names), a network `resolveItemSprites` (ingest/items, like ingest/sprites), an `items.json` disk cache (cache/items, like cache/sprites), and `assembleTeamDetail` joining each item to its icon. The contract gains a required-nullable `itemSpriteUrl`; the detail route and grid contract are unchanged. Graceful degradation at three points always falls back to the item name only.

**Tech Stack:** TypeScript strict, Fastify 5, zod, `@pkmn/sets`, p-limit, vitest (node + jsdom), React 19, Tailwind v4.

## Global Constraints

- `domain/` is pure: no network, disk, clock, or `process.env`. I/O only in `ingest`/`cache`/`http`. Dependency direction: shell → core, never the reverse.
- `process.env` only in `index.ts`.
- Good API citizen (mirror `ingest/sprites.ts`): dedupe, `p-limit`, retry with backoff ONLY on 5xx/network, NEVER on 404 (404 = mapping bug, log it); a miss is omitted, never thrown.
- Graceful degradation: a bad/absent item sprite never breaks the response — fall back to the name only.
- `itemSpriteUrl` is required-nullable (`z.string().nullable()`): present in every `DetailedPokemonSet`, `null` when the item is absent or unmapped. Drift fails loudly (web re-validates with the shared schema).
- TypeScript strict; no `any`, no non-null assertions. Conventional Commits in English, one commit per task. Run `pnpm lint && pnpm typecheck && pnpm test` green before each commit.
- Branch: `feat/item-sprites` (already created; spec already committed there).

---

### Task 1: Contract — add `itemSpriteUrl`; thread it through assemble (null for now)

**Files:**
- Modify: `packages/shared/src/domain.ts` (add field to `DetailedPokemonSetSchema`)
- Modify: `packages/server/src/domain/paste.ts` (`ParsedSet` omit list)
- Modify: `packages/server/src/domain/assemble.ts` (`assembleTeamDetail` gains an `itemSprites` param)
- Modify: `packages/server/src/ingest/detail.ts` (pass `new Map()` to the new param — temporary; Task 5 wires the real map)
- Modify: `packages/web/src/test/factories.ts` (`makeDetailedPokemon` gains `itemSpriteUrl`)
- Test: `packages/server/src/domain/assemble.test.ts` (new assertions for `itemSpriteUrl`)
- Fixture ripple: any other literal that builds a `DetailedPokemonSet`/`TeamDetail` (see Step 6)

**Interfaces:**
- Produces: `DetailedPokemonSet` now has `itemSpriteUrl: string | null`. `assembleTeamDetail(id, sets, sprites, itemSprites: Map<string,string>): TeamDetail` — items keyed by the exact `set.item` string.

- [ ] **Step 1: Write the failing test for the assemble mapping**

In `packages/server/src/domain/assemble.test.ts`, add (inside the `assembleTeamDetail` describe block; if there is none, add one):

```ts
  it("maps each item to its resolved item-sprite url, null when absent or unmapped", () => {
    const sets = [
      { species: "Incineroar", item: "Assault Vest", ability: null, nature: null, teraType: null, evs: {}, ivs: {}, moves: [] },
      { species: "Flutter Mane", item: "Booster Energy", ability: null, nature: null, teraType: null, evs: {}, ivs: {}, moves: [] },
      { species: "Ditto", item: null, ability: null, nature: null, teraType: null, evs: {}, ivs: {}, moves: [] },
    ];
    const itemSprites = new Map([["Assault Vest", "https://img/assault-vest.png"]]);
    const detail = assembleTeamDetail("MB1", sets, new Map(), itemSprites);

    expect(detail.pokemon[0]?.itemSpriteUrl).toBe("https://img/assault-vest.png"); // resolved
    expect(detail.pokemon[1]?.itemSpriteUrl).toBeNull(); // item present but not in the map
    expect(detail.pokemon[2]?.itemSpriteUrl).toBeNull(); // no item at all
  });
```

- [ ] **Step 2: Run it — expect FAIL (compile error: assembleTeamDetail takes 3 args; field missing)**

Run: `pnpm test -- packages/server/src/domain/assemble.test.ts`
Expected: FAIL — `assembleTeamDetail` currently takes 3 args and `itemSpriteUrl` does not exist on the result type.

- [ ] **Step 3: Add the contract field** in `packages/shared/src/domain.ts` — insert `itemSpriteUrl` right after `spriteUrl` in `DetailedPokemonSetSchema`:

```ts
export const DetailedPokemonSetSchema = z.object({
  species: z.string(),
  spriteUrl: z.string(),
  /** Resolved PokeAPI item-sprite URL, or null when the Pokémon holds no item or the item could not be mapped. */
  itemSpriteUrl: z.string().nullable(),
  item: z.string().nullable(),
  ability: z.string().nullable(),
  nature: z.string().nullable(),
  teraType: z.string().nullable(),
  evs: z.record(z.string(), z.number()),
  ivs: z.record(z.string(), z.number()),
  moves: z.array(z.string()),
});
```

- [ ] **Step 4: Exclude `itemSpriteUrl` from `ParsedSet`** in `packages/server/src/domain/paste.ts` (it is resolved separately, like `spriteUrl`):

```ts
export type ParsedSet = Omit<DetailedPokemonSet, "spriteUrl" | "itemSpriteUrl">;
```

- [ ] **Step 5: Thread the item map through assemble** in `packages/server/src/domain/assemble.ts` — replace `assembleTeamDetail`:

```ts
export function assembleTeamDetail(
  id: string,
  sets: ParsedSet[],
  sprites: Map<string, ResolvedSprite>,
  itemSprites: Map<string, string>,
): TeamDetail {
  return {
    id,
    pokemon: sets.map((set) => ({
      ...set,
      spriteUrl: sprites.get(set.species)?.spriteUrl ?? PLACEHOLDER_SPRITE_URL,
      itemSpriteUrl: set.item ? (itemSprites.get(set.item) ?? null) : null,
    })),
  };
}
```

Then in `packages/server/src/ingest/detail.ts`, update the single call site (Task 5 replaces the empty map with the real one):

```ts
    const detail = assembleTeamDetail(id, sets, merged, new Map());
```

- [ ] **Step 6: Update every fixture that builds a `DetailedPokemonSet`/`TeamDetail`**

In `packages/web/src/test/factories.ts`, `makeDetailedPokemon` — add a sample URL so web tests can assert the icon:

```ts
export function makeDetailedPokemon(
  overrides: Partial<DetailedPokemonSet> = {},
): DetailedPokemonSet {
  return {
    species: "Incineroar",
    spriteUrl: "https://img/incineroar.png",
    itemSpriteUrl: "https://img/assault-vest.png",
    item: "Assault Vest",
    ability: "Intimidate",
    nature: "Careful",
    teraType: "Grass",
    evs: { hp: 252, atk: 4, spd: 252 },
    ivs: {},
    moves: ["Fake Out", "Knock Off", "Parting Shot", "Flare Blitz"],
    ...overrides,
  };
}
```

Then run `pnpm typecheck` and `pnpm test` and fix EVERY remaining spot the compiler or a Zod `.parse` flags as missing `itemSpriteUrl` by adding `itemSpriteUrl: null` (or a sample URL) to that literal. Known candidates to check: `packages/web/src/App.test.tsx` (inline `detail` object returned by the fetch mock — gets parsed by `TeamDetailSchema`, so it MUST include the field), `packages/web/src/api/client.test.ts`, `packages/server/src/ingest/detail.test.ts`, `packages/server/src/ingest/detail.test-helpers.ts`, `packages/server/src/http/app.test.ts`, `packages/shared/src/domain.test.ts`. `ParsedSet` literals (in `assemble.test.ts`, `paste.test.ts`) do NOT need the field — it is omitted from `ParsedSet`.

- [ ] **Step 7: Run the affected suites — expect GREEN**

Run: `pnpm test -- packages/server/src/domain/assemble.test.ts` then `pnpm test`
Expected: the new assemble test passes; the whole suite is green after the fixture updates.

- [ ] **Step 8: Lint + typecheck + commit**

Run: `pnpm lint; if ($?) { pnpm typecheck }`
```bash
git add packages/shared/src/domain.ts packages/server/src/domain/paste.ts packages/server/src/domain/assemble.ts packages/server/src/domain/assemble.test.ts packages/server/src/ingest/detail.ts packages/web/src/test/factories.ts
# plus any fixture files touched in Step 6:
git add -A
git commit -m "feat(shared): add itemSpriteUrl to the TeamDetail contract"
```

---

### Task 2: `itemSlug` (pure)

**Files:**
- Modify: `packages/server/src/domain/names.ts` (export `itemSlug`)
- Test: `packages/server/src/domain/names.test.ts`

**Interfaces:**
- Produces: `export function itemSlug(item: string): string` — naive slug (lowercase, runs of non-alphanumerics → single hyphen, trimmed). Reuses the existing private `naiveSlug`.

- [ ] **Step 1: Write the failing test** — add to `packages/server/src/domain/names.test.ts`:

```ts
import { itemSlug } from "./names.js";

describe("itemSlug", () => {
  it("lowercases and hyphenates item names", () => {
    expect(itemSlug("Assault Vest")).toBe("assault-vest");
    expect(itemSlug("Choice Specs")).toBe("choice-specs");
    expect(itemSlug("Leftovers")).toBe("leftovers");
  });

  it("trims hyphens at the edges", () => {
    expect(itemSlug(" Focus Sash ")).toBe("focus-sash");
  });

  // Known naive-slug edge: apostrophes hyphenate (PokeAPI uses "kings-rock").
  // Documented as a graceful miss for this slice; an override would fix it later.
  it("collapses apostrophes into a hyphen (naive behavior, not the API slug)", () => {
    expect(itemSlug("King's Rock")).toBe("king-s-rock");
  });
});
```

(If `names.test.ts` already imports from `./names.js`, merge the import; do not duplicate it.)

- [ ] **Step 2: Run it — expect FAIL** (`itemSlug` not exported)

Run: `pnpm test -- packages/server/src/domain/names.test.ts`
Expected: FAIL — `itemSlug` is not exported.

- [ ] **Step 3: Implement** — in `packages/server/src/domain/names.ts`, add after `naiveSlug`:

```ts
/** Slug for a held-item name, same naive transform as species. PokeAPI item
 * endpoint uses lowercase-hyphenated names (e.g. "Assault Vest" -> "assault-vest"). */
export function itemSlug(item: string): string {
  return naiveSlug(item);
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm test -- packages/server/src/domain/names.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/domain/names.ts packages/server/src/domain/names.test.ts
git commit -m "feat(server): add itemSlug for PokeAPI item-endpoint slugs"
```

---

### Task 3: `resolveItemSprites` (network, mirrors `resolveSprites`)

**Files:**
- Create: `packages/server/src/ingest/items.ts`
- Test: `packages/server/src/ingest/items.test.ts`

**Interfaces:**
- Consumes: `itemSlug` from `../domain/names.js`; `FetchLike` from `./sheet.js`.
- Produces: `resolveItemSprites(items: string[], opts: ResolveItemSpritesOptions): Promise<Map<string, string>>` — `itemName` → sprite URL; misses omitted. `ResolveItemSpritesOptions = { baseUrl: string; fetchImpl?: FetchLike; concurrency?: number; logger?: { warn(msg: string): void } }`.

- [ ] **Step 1: Write the failing test** — create `packages/server/src/ingest/items.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveItemSprites } from "./items.js";

const itemOk = (sprite: string | null) =>
  new Response(JSON.stringify({ id: 1, name: "x", sprites: { default: sprite } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const status = (code: number) => new Response("", { status: code });
const base = "https://poke/api/v2";

describe("resolveItemSprites", () => {
  it("resolves an item name to its sprite url", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(itemOk("https://img/assault-vest.png"));
    const map = await resolveItemSprites(["Assault Vest"], { baseUrl: base, fetchImpl });
    expect(map.get("Assault Vest")).toBe("https://img/assault-vest.png");
    expect(fetchImpl).toHaveBeenCalledWith(`${base}/item/assault-vest`);
  });

  it("dedupes repeated items into a single fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(itemOk("https://img/x.png"));
    await resolveItemSprites(["Leftovers", "Leftovers"], { baseUrl: base, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("omits an item on 404 (no retry) and logs it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(status(404));
    const logger = { warn: vi.fn() };
    const map = await resolveItemSprites(["Made Up Item"], { baseUrl: base, fetchImpl, logger });
    expect(map.has("Made Up Item")).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // never retry a 404
    expect(logger.warn).toHaveBeenCalled();
  });

  it("treats a 200 with null sprites.default as a miss", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(itemOk(null));
    const map = await resolveItemSprites(["Weird Item"], { baseUrl: base, fetchImpl });
    expect(map.has("Weird Item")).toBe(false);
  });
});

describe("resolveItemSprites — 5xx/network retry path", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("retries two 500s then succeeds (3 attempts)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(500))
      .mockResolvedValueOnce(status(500))
      .mockResolvedValueOnce(itemOk("https://img/leftovers.png"));
    const promise = resolveItemSprites(["Leftovers"], { baseUrl: base, fetchImpl });
    await vi.runAllTimersAsync();
    const map = await promise;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(map.get("Leftovers")).toBe("https://img/leftovers.png");
  });

  it("gives up after the retry cap and omits the item (3 attempts)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const logger = { warn: vi.fn() };
    const promise = resolveItemSprites(["Leftovers"], { baseUrl: base, fetchImpl, logger });
    await vi.runAllTimersAsync();
    const map = await promise;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(map.has("Leftovers")).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`./items.js` does not exist)

Run: `pnpm test -- packages/server/src/ingest/items.test.ts`
Expected: FAIL — cannot resolve `./items.js`.

- [ ] **Step 3: Implement** — create `packages/server/src/ingest/items.ts`:

```ts
/**
 * Resolves held-item names to PokeAPI item-sprite URLs. Shell (network I/O),
 * cache-agnostic: the conductor handles the disk cache. Mirrors resolveSprites
 * — dedupes, caps concurrency with p-limit, retries ONLY 5xx/network with
 * backoff and NEVER a 404 (a 404 is a mapping bug, logged). An item that misses
 * is omitted; assemble leaves itemSpriteUrl null (graceful degradation).
 */

import pLimit from "p-limit";
import { z } from "zod";
import { itemSlug } from "../domain/names.js";
import type { FetchLike } from "./sheet.js";

const ItemSchema = z.object({
  sprites: z.object({ default: z.string().nullable() }),
});

export interface ResolveItemSpritesOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
  concurrency?: number;
  logger?: { warn: (msg: string) => void };
}

const MAX_5XX_RETRIES = 2;
const backoff = (attempt: number) =>
  new Promise((r) => setTimeout(r, 200 * 2 ** attempt));

/** Fetch one item slug. Returns the sprite URL, or null on a miss
 * (404 / 200-without-sprite / 5xx after retries). Never throws. */
async function tryItem(
  slug: string,
  opts: { baseUrl: string },
  fetchImpl: FetchLike,
): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(`${opts.baseUrl}/item/${slug}`);
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
    const parsed = ItemSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.sprites.default === null) return null;
    return parsed.data.sprites.default;
  }
}

export async function resolveItemSprites(
  items: string[],
  opts: ResolveItemSpritesOptions,
): Promise<Map<string, string>> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const logger = opts.logger ?? console;
  const limit = pLimit(opts.concurrency ?? 10);
  const unique = [...new Set(items)];
  const resolved = new Map<string, string>();

  await Promise.all(
    unique.map((name) =>
      limit(async () => {
        const hit = await tryItem(itemSlug(name), opts, fetchImpl);
        if (hit) {
          resolved.set(name, hit);
          return;
        }
        logger.warn(`[items] no PokeAPI sprite for "${name}" -- check the item slug/override`);
      }),
    ),
  );

  return resolved;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm test -- packages/server/src/ingest/items.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ingest/items.ts packages/server/src/ingest/items.test.ts
git commit -m "feat(server): resolve item sprites from PokeAPI /item endpoint"
```

---

### Task 4: `cache/items` (disk cache, mirrors `cache/sprites`)

**Files:**
- Create: `packages/server/src/cache/items.ts`
- Test: `packages/server/src/cache/items.test.ts`

**Interfaces:**
- Produces: `readItemCache(path: string): Promise<Map<string, string>>` and `writeItemCache(path: string, items: Map<string, string>): Promise<void>`.

- [ ] **Step 1: Write the failing test** — create `packages/server/src/cache/items.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readItemCache, writeItemCache } from "./items.js";

const dirs: string[] = [];
async function tempPath(file: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "items-cache-"));
  dirs.push(dir);
  return join(dir, file);
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("item cache", () => {
  it("round-trips a map through disk", async () => {
    const path = await tempPath("items.json");
    await writeItemCache(path, new Map([["Assault Vest", "https://img/av.png"]]));
    const read = await readItemCache(path);
    expect(read.get("Assault Vest")).toBe("https://img/av.png");
  });

  it("returns an empty map when the file is missing", async () => {
    const path = await tempPath("missing.json");
    expect((await readItemCache(path)).size).toBe(0);
  });

  it("returns an empty map when the file is corrupt", async () => {
    const path = await tempPath("corrupt.json");
    await writeFile(path, "not json at all", "utf8");
    expect((await readItemCache(path)).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`./items.js` does not exist)

Run: `pnpm test -- packages/server/src/cache/items.test.ts`
Expected: FAIL — cannot resolve `./items.js`.

- [ ] **Step 3: Implement** — create `packages/server/src/cache/items.ts`:

```ts
/**
 * L2 disk cache for the item-name → item-sprite-url map. Like the species
 * sprite cache: expensive to resolve (one PokeAPI call per unique item) but
 * stable, so persisting it survives restarts and keeps us polite to the API.
 * A missing or corrupt file degrades to an empty map — never breaks ingest.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const CacheFileSchema = z.record(z.string(), z.string());

export async function readItemCache(path: string): Promise<Map<string, string>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return new Map(); // missing file — first run
  }

  let parsed;
  try {
    const obj = JSON.parse(raw);
    parsed = CacheFileSchema.safeParse(obj);
  } catch {
    console.warn(`[item-cache] ignoring corrupt cache at ${path}`);
    return new Map();
  }

  if (!parsed.success) {
    console.warn(`[item-cache] ignoring corrupt cache at ${path}`);
    return new Map();
  }

  return new Map(Object.entries(parsed.data));
}

export async function writeItemCache(
  path: string,
  items: Map<string, string>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const obj = Object.fromEntries(items);
  await writeFile(path, JSON.stringify(obj, null, 2), "utf8");
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm test -- packages/server/src/cache/items.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/cache/items.ts packages/server/src/cache/items.test.ts
git commit -m "feat(server): add disk cache for item sprites"
```

---

### Task 5: Wire item resolution into the detail conductor + composition root

**Files:**
- Modify: `packages/server/src/ingest/detail.ts` (deps + resolve items + pass real map)
- Modify: `packages/server/src/index.ts` (wire resolver + cache + env)
- Test: `packages/server/src/ingest/detail.test.ts`

**Interfaces:**
- Consumes: `resolveItemSprites` (Task 3), `readItemCache`/`writeItemCache` (Task 4), `assembleTeamDetail`'s 4th param (Task 1).
- Produces: `TeamDetailServiceDeps` gains `resolveItemSprites: (items: string[]) => Promise<Map<string,string>>`, `readItemCache: () => Promise<Map<string,string>>`, `writeItemCache: (items: Map<string,string>) => Promise<void>`. `getTeamDetail` output now carries real `itemSpriteUrl`s.

The existing harness is a local `deps(overrides = {})` factory in `detail.test.ts` whose default `fetchPokepaste` already returns a paste with the item `"Assault Vest"` (`"Incineroar @ Assault Vest\n…"`). First extend that factory with the three new stubs (so every existing test keeps compiling once `detail.ts` reads them), then add the two new tests.

In `packages/server/src/ingest/detail.test.ts`, add these three lines inside the object returned by `deps()` (next to the other stubs, before `...overrides`):

```ts
    resolveItemSprites: vi.fn().mockResolvedValue(new Map()),
    readItemCache: vi.fn().mockResolvedValue(new Map()),
    writeItemCache: vi.fn().mockResolvedValue(undefined),
```

Then add the two tests inside the `describe("createTeamDetailService", …)` block:

```ts
  it("resolve item sprites e os inclui no detalhe", async () => {
    const resolveItemSprites = vi.fn().mockResolvedValue(new Map([["Assault Vest", "https://img/av.png"]]));
    const d = deps({ resolveItemSprites });
    const svc = createTeamDetailService(d);
    const detail = await svc.getTeamDetail("MB1");
    expect(detail?.pokemon[0]?.itemSpriteUrl).toBe("https://img/av.png");
  });

  it("não re-busca item já presente no cache de itens", async () => {
    const resolveItemSprites = vi.fn().mockResolvedValue(new Map());
    const d = deps({
      resolveItemSprites,
      readItemCache: vi.fn().mockResolvedValue(new Map([["Assault Vest", "https://cached/av.png"]])),
    });
    const svc = createTeamDetailService(d);
    const detail = await svc.getTeamDetail("MB1");
    expect(resolveItemSprites).not.toHaveBeenCalled();
    expect(detail?.pokemon[0]?.itemSpriteUrl).toBe("https://cached/av.png");
  });
```

- [ ] **Step 2: Run it — expect FAIL** (deps `resolveItemSprites`/`readItemCache`/`writeItemCache` not on the type; items not resolved)

Run: `pnpm test -- packages/server/src/ingest/detail.test.ts`
Expected: FAIL — the new deps don't exist on `TeamDetailServiceDeps` and `itemSpriteUrl` is null.

- [ ] **Step 3: Implement in `detail.ts`** — add the three deps to `TeamDetailServiceDeps`, resolve items mirroring the sprite path, and pass the real map. Replace the deps interface and the `build` body's resolve/assemble section:

```ts
export interface TeamDetailServiceDeps {
  getTeams: () => Promise<TeamsResponse>;
  fetchPokepaste: (url: string) => Promise<string>;
  resolveSprites: (species: string[]) => Promise<Map<string, ResolvedSprite>>;
  readSpriteCache: () => Promise<Map<string, ResolvedSprite>>;
  writeSpriteCache: (sprites: Map<string, ResolvedSprite>) => Promise<void>;
  resolveItemSprites: (items: string[]) => Promise<Map<string, string>>;
  readItemCache: () => Promise<Map<string, string>>;
  writeItemCache: (items: Map<string, string>) => Promise<void>;
  readDetailCache: (id: string) => Promise<TeamDetail | null>;
  writeDetailCache: (id: string, detail: TeamDetail) => Promise<void>;
}
```

In `build`, after the sprite resolution block and before `assembleTeamDetail`, add the item resolution (mirror of the sprite block):

```ts
    const wantedItems = [...new Set(sets.map((s) => s.item).filter((i): i is string => i !== null))];
    const itemCache = await deps.readItemCache();
    const missingItems = wantedItems.filter((i) => !itemCache.has(i));
    const freshItems =
      missingItems.length > 0
        ? await deps.resolveItemSprites(missingItems)
        : new Map<string, string>();
    const mergedItems = new Map([...itemCache, ...freshItems]);
    if (missingItems.length > 0) await deps.writeItemCache(mergedItems);

    const detail = assembleTeamDetail(id, sets, merged, mergedItems);
```

(Remove the temporary `new Map()` 4th arg from Task 1.)

- [ ] **Step 4: Wire the composition root in `index.ts`** — add the env line and the three deps to the `createTeamDetailService(...)` call:

```ts
const itemCachePath = process.env.ITEM_CACHE_PATH ?? "data/cache/items.json";
```
and in the `createTeamDetailService({ ... })` object add:
```ts
  resolveItemSprites: (items) => resolveItemSprites(items, { baseUrl: pokeApiBaseUrl, logger }),
  readItemCache: () => readItemCache(itemCachePath),
  writeItemCache: (items) => writeItemCache(itemCachePath, items),
```
with the imports at the top:
```ts
import { resolveItemSprites } from "./ingest/items.js";
import { readItemCache, writeItemCache } from "./cache/items.js";
```

- [ ] **Step 5: Run the detail suite + typecheck + build — expect GREEN**

Run: `pnpm test -- packages/server/src/ingest/detail.test.ts` then `pnpm typecheck` then `pnpm build`
Expected: detail tests pass; typecheck clean (index.ts now satisfies all deps); build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ingest/detail.ts packages/server/src/ingest/detail.test.ts packages/server/src/index.ts
git commit -m "feat(server): resolve and cache item sprites in the detail conductor"
```

---

### Task 6: Web — render the item icon in the detail card

**Files:**
- Create: `packages/web/src/components/ItemSprite.tsx`
- Create: `packages/web/src/components/ItemSprite.test.tsx`
- Modify: `packages/web/src/components/PokemonDetailCard.tsx` (item line)
- Test: `packages/web/src/components/PokemonDetailCard.test.tsx`

**Interfaces:**
- Consumes: `DetailedPokemonSet.itemSpriteUrl` (Task 1).
- Produces: `ItemSprite({ url, alt }: { url: string; alt: string }): JSX.Element | null` — small `<img>` that hides itself on load error.

- [ ] **Step 1: Write the failing test for `ItemSprite`** — create `packages/web/src/components/ItemSprite.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ItemSprite } from "./ItemSprite.js";

afterEach(cleanup);

describe("ItemSprite", () => {
  it("renders an img with the url and alt", () => {
    render(<ItemSprite url="https://img/av.png" alt="Assault Vest" />);
    const img = screen.getByAltText("Assault Vest") as HTMLImageElement;
    expect(img.src).toContain("https://img/av.png");
  });

  it("hides itself when the image fails to load", () => {
    render(<ItemSprite url="https://img/broken.png" alt="Assault Vest" />);
    fireEvent.error(screen.getByAltText("Assault Vest"));
    expect(screen.queryByAltText("Assault Vest")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`./ItemSprite.js` does not exist)

Run: `pnpm test -- packages/web/src/components/ItemSprite.test.tsx`
Expected: FAIL — cannot resolve `./ItemSprite.js`.

- [ ] **Step 3: Implement `ItemSprite.tsx`**:

```tsx
import { useState, type JSX } from "react";

/**
 * Small held-item icon. Presentational: the URL is already resolved by the
 * server (PokeAPI item sprite) and arrives via props. On load error it removes
 * itself so the card degrades to the item name only (graceful degradation),
 * mirroring PokemonSprite's onError fallback.
 */
export function ItemSprite({ url, alt }: { url: string; alt: string }): JSX.Element | null {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={url}
      alt={alt}
      width={24}
      height={24}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-6 w-6 shrink-0 object-contain"
    />
  );
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm test -- packages/web/src/components/ItemSprite.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for the card's item icon** — add to `packages/web/src/components/PokemonDetailCard.test.tsx`:

```tsx
  it("mostra o ícone do item quando há itemSpriteUrl", () => {
    render(<PokemonDetailCard set={makeDetailedPokemon({ item: "Assault Vest", itemSpriteUrl: "https://img/av.png" })} />);
    expect(screen.getByAltText("Assault Vest")).toBeTruthy();
  });

  it("mostra só o nome do item quando itemSpriteUrl é null", () => {
    render(<PokemonDetailCard set={makeDetailedPokemon({ item: "Leftovers", itemSpriteUrl: null })} />);
    expect(screen.queryByAltText("Leftovers")).toBeNull();
    expect(screen.getByText(/Leftovers/)).toBeTruthy();
  });
```

- [ ] **Step 6: Run it — expect FAIL** (no img with that alt; card renders item as plain text)

Run: `pnpm test -- packages/web/src/components/PokemonDetailCard.test.tsx`
Expected: FAIL — `getByAltText("Assault Vest")` finds nothing.

- [ ] **Step 7: Implement the item line in `PokemonDetailCard.tsx`** — add the import and replace the item line. Import:

```tsx
import { ItemSprite } from "./ItemSprite.js";
```

Replace:

```tsx
        {set.item && <span className="text-slate-300">@ {set.item}</span>}
```

with:

```tsx
        {set.item && (
          <span className="flex items-center gap-1 text-slate-300">
            {set.itemSpriteUrl && <ItemSprite url={set.itemSpriteUrl} alt={set.item} />}
            {set.item}
          </span>
        )}
```

- [ ] **Step 8: Run the web suite — expect PASS**

Run: `pnpm test -- packages/web`
Expected: all web suites PASS (the new card tests, ItemSprite tests, and existing ones — the `/Assault Vest/` regex still matches the name text).

- [ ] **Step 9: Lint + typecheck + commit**

Run: `pnpm lint; if ($?) { pnpm typecheck }`
```bash
git add packages/web/src/components/ItemSprite.tsx packages/web/src/components/ItemSprite.test.tsx packages/web/src/components/PokemonDetailCard.tsx packages/web/src/components/PokemonDetailCard.test.tsx
git commit -m "feat(web): show the held-item icon in the detail card"
```

---

### Final verification (after all tasks)

- [ ] **Full gate:** `pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm test }; if ($?) { pnpm build }` — all green.
- [ ] **Browser:** `pnpm dev`, open a team's detail modal. Confirm: item icons appear next to item names; a team with a rare/unmapped item shows the name with no broken image; cold load resolves items (watch `[items]` warns for any miss), cached load reads `data/cache/items.json`.

## Self-Review

**Spec coverage:** ✅ contract `+itemSpriteUrl` (Task 1) · ✅ `itemSlug` reusing naiveSlug (Task 2) · ✅ `resolveItemSprites` mirroring sprites w/ 404-no-retry + miss-omit + 5xx-retry (Task 3) · ✅ `cache/items` round-trip + corrupt→empty (Task 4) · ✅ assemble joins item→icon (Task 1) · ✅ detail conductor resolves+caches items, warm-cache skip (Task 5) · ✅ index wiring + `ITEM_CACHE_PATH` (Task 5) · ✅ `ItemSprite` onError-hide + card render, `@` removed (Task 6) · ✅ graceful degradation at all 3 points · ✅ grid contract & route unchanged.

**Placeholder scan:** none — Task 5 Step 1 now gives the exact `deps()`-factory extension and the two concrete tests (matching the real harness); Task 1 Step 6 names the exact fixture files to check and the exact mechanical fix (`itemSpriteUrl: null`). Every code step has full code + commands.

**Type consistency:** `assembleTeamDetail(id, sets, sprites, itemSprites)` 4-arg signature is set in Task 1 and consumed in Task 5; `resolveItemSprites(items, opts): Promise<Map<string,string>>` defined in Task 3, wired in Task 5; `readItemCache`/`writeItemCache` defined in Task 4, wired in Task 5; `ItemSprite({url, alt})` defined in Task 6 and used in the same task. `itemSpriteUrl: string | null` consistent across shared, factory, and web render.
