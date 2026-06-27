# Teams TTL Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the in-memory teams cache a hard TTL so a weekly sheet update re-ingests automatically (no restart), serving the stale cache if a refresh fails.

**Architecture:** Add a TTL + `cachedAt` timestamp to `createTeamsService`. `getTeams()` returns the cache while fresh; once stale it re-ingests inline (the caller waits) via the existing single-flight promise, updating the cache on success. On re-ingest failure it serves the stale cache (logs, never throws) unless no cache exists yet (then it propagates → 503). A `now()` clock is injectable for deterministic tests. Server-only; the front already loads once and doesn't poll.

**Tech Stack:** Fastify 5 + TypeScript (strict), vitest (node).

## Global Constraints

- `domain/` stays pure; this changes only the `ingest/` shell and the `index.ts` env edge.
- `process.env` only in `index.ts`.
- Graceful degradation: a failed refresh serves the stale cache (never errors when a cache exists); only the first-ever load failure propagates.
- Single-flight preserved: concurrent calls share one in-flight ingest.
- TypeScript strict; no `any`, no non-null assertions. Conventional Commits in English, one commit per task. Run `pnpm lint && pnpm typecheck && pnpm test` green before each commit.
- TTL default: `6 * 60 * 60 * 1000` ms (6h), overridable via `TEAMS_TTL_MS`.
- Branch: `feat/teams-ttl-refresh` (already created; spec already committed there).

---

### Task 1: TTL + stale-fallback in the teams orchestrator

**Files:**
- Modify: `packages/server/src/ingest/orchestrator.ts`
- Test: `packages/server/src/ingest/orchestrator.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TeamsServiceDeps` gains `ttlMs: number` (required) and `now?: () => number` (optional, default `Date.now`). `createTeamsService` / `getTeams()` signatures otherwise unchanged.

- [ ] **Step 1: Extend the test `deps()` factory and add the two new behavior tests**

In `packages/server/src/ingest/orchestrator.test.ts`, add `ttlMs` to the default deps so existing tests never expire mid-run. Change the `deps()` return object to include it:

```ts
    readSpriteCache: vi.fn().mockResolvedValue(new Map()),
    writeSpriteCache: vi.fn().mockResolvedValue(undefined),
    ttlMs: 1_000_000,
    logger: { warn: vi.fn() },
    ...overrides,
```

Then add these two tests inside the `describe("createTeamsService", …)` block:

```ts
  it("re-ingere após o TTL vencer e devolve o dado novo", async () => {
    let t = 0;
    const TWO_TEAMS = [
      "Team ID,Team Description,Pokepaste,Pokemon Text for Copypasta,",
      "MB1,Sun,https://pokepast.es/a,Miraidon,Flutter Mane",
      "MB2,Rain,https://pokepast.es/b,Pikachu,",
    ].join("\n");
    const fetchSheetCsv = vi
      .fn()
      .mockResolvedValueOnce(CSV) // 1º ingest: 1 time
      .mockResolvedValueOnce(TWO_TEAMS); // 2º ingest (vencido): 2 times
    const service = createTeamsService(deps({ fetchSheetCsv, ttlMs: 1000, now: () => t }));

    const first = await service.getTeams();
    expect(first.teams).toHaveLength(1);

    t = 2000; // passou o TTL (>= 1000)
    const second = await service.getTeams();
    expect(fetchSheetCsv).toHaveBeenCalledTimes(2);
    expect(second.teams).toHaveLength(2); // dado fresco
  });

  it("na falha do re-ingest vencido serve o cache velho e retenta depois", async () => {
    let t = 0;
    const fetchSheetCsv = vi
      .fn()
      .mockResolvedValueOnce(CSV) // 1º ok
      .mockRejectedValueOnce(new Error("sheet down")) // 2º (vencido) falha
      .mockResolvedValueOnce(CSV); // 3º ok (retry)
    const logger = { warn: vi.fn() };
    const service = createTeamsService(deps({ fetchSheetCsv, ttlMs: 1000, now: () => t, logger }));

    await service.getTeams(); // carrega
    t = 2000; // vence
    const stale = await service.getTeams(); // re-ingest falha -> serve velho, não lança
    expect(stale.teams).toHaveLength(1);
    const retried = await service.getTeams(); // ainda vencido -> retenta
    expect(fetchSheetCsv).toHaveBeenCalledTimes(3);
    expect(retried.teams).toHaveLength(1);
  });
```

- [ ] **Step 2: Run the tests to verify the two new ones FAIL (RED)**

Run: `pnpm test -- packages/server/src/ingest/orchestrator.test.ts`
Expected: the two new tests FAIL. The current orchestrator ignores `ttlMs`/`now` and never expires, so after `t = 2000` the second `getTeams()` still returns the cached value: `fetchSheetCsv` was called once, not twice. (The other tests still pass — `ttlMs: 1_000_000` never expires.)

- [ ] **Step 3: Implement the TTL in `orchestrator.ts`**

Replace the `createTeamsService` function (keep the file header comment and `ingest()` body; only the deps interface, the closure state, and the returned `getTeams` change). The full file becomes:

```ts
/**
 * The ingest conductor. Lazy + single-flight + hard TTL: the first request
 * triggers the pipeline (sheet → parse → resolve sprites, skipping the disk
 * cache → assemble), concurrent callers share the in-flight promise, and the
 * assembled result is held in memory with a timestamp. Once the cache is older
 * than ttlMs, the next call re-ingests inline (the caller waits) and refreshes
 * it. A failed refresh serves the stale cache (logged) rather than erroring;
 * only a first-ever load with no cache propagates the failure (route → 503).
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
  /** Cache validity in ms; past this the next getTeams re-ingests. */
  ttlMs: number;
  /** Injectable clock (default Date.now) — lets tests drive expiry deterministically. */
  now?: () => number;
  logger?: { warn: (msg: string) => void };
}

export interface TeamsService {
  getTeams: () => Promise<TeamsResponse>;
}

export function createTeamsService(deps: TeamsServiceDeps): TeamsService {
  const logger = deps.logger ?? console;
  const now = deps.now ?? Date.now;
  let cached: TeamsResponse | null = null;
  let cachedAt: number | null = null;
  let inFlight: Promise<TeamsResponse> | null = null;

  async function ingest(): Promise<TeamsResponse> {
    const csv = await deps.fetchSheetCsv();
    const raw = parseTeamsCsv(csv);

    if (raw.length < CANARY_MIN_TEAMS) {
      logger.warn(
        `[ingest] parsed team count ${raw.length} is below ${CANARY_MIN_TEAMS} — sheet layout may have changed`,
      );
    }

    if (raw.length > 0 && raw.every((t) => t.species.length === 0)) {
      logger.warn(
        "[ingest] every team parsed with zero species — the species columns may have moved (check the 'Pokemon Text for Copypasta' header)",
      );
    }

    const wanted = new Set(raw.flatMap((t) => t.species));
    const cache = await deps.readSpriteCache();
    const missing = [...wanted].filter((s) => !cache.has(s));

    const fresh = missing.length > 0 ? await deps.resolveSprites(missing) : new Map<string, ResolvedSprite>();
    const merged = new Map([...cache, ...fresh]);
    await deps.writeSpriteCache(merged);

    const teams = assembleTeams(raw, merged);
    return { fetchedAt: new Date().toISOString(), teams };
  }

  function isStale(): boolean {
    return cachedAt !== null && now() - cachedAt >= deps.ttlMs;
  }

  return {
    getTeams() {
      if (cached && !isStale()) return Promise.resolve(cached);
      if (inFlight) return inFlight;
      inFlight = ingest()
        .then((result) => {
          cached = result;
          cachedAt = now();
          return result;
        })
        .catch((err: unknown) => {
          // Refresh failed: serve the stale cache rather than erroring. cachedAt
          // is left unchanged, so the next call retries. Only a first-ever load
          // with no cache propagates (route → 503).
          if (cached) {
            logger.warn(`[ingest] refresh failed, serving stale teams: ${String(err)}`);
            return cached;
          }
          throw err;
        })
        .finally(() => {
          inFlight = null; // success kept in `cached`; failure leaves stale cache in place
        });
      return inFlight;
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify GREEN**

Run: `pnpm test -- packages/server/src/ingest/orchestrator.test.ts`
Expected: all tests PASS — the two new ones plus the originals (the first-load-failure test still throws because there is no cache yet; single-flight and disk-cache tests unaffected).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint; if ($?) { pnpm typecheck }`
Expected: both clean. (`index.ts` still compiles — it constructs `createTeamsService` without `ttlMs` yet, which is a type error... see note.)

> NOTE: adding `ttlMs` as **required** to `TeamsServiceDeps` makes `index.ts` fail typecheck until Task 2 wires it. That is expected and resolved in Task 2. If you want each commit to typecheck green in isolation, do Task 2's `index.ts` edit before running typecheck here; otherwise proceed — Task 2 closes it. Either way, do not mark the feature done until Task 2 is committed and `pnpm typecheck` is green.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ingest/orchestrator.ts packages/server/src/ingest/orchestrator.test.ts
git commit -m "feat(server): give the teams cache a hard TTL with stale-on-failure fallback"
```

---

### Task 2: Wire `TEAMS_TTL_MS` in the composition root

**Files:**
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `TeamsServiceDeps.ttlMs` (Task 1).
- Produces: nothing downstream.

- [ ] **Step 1: Read the env and pass `ttlMs`**

In `packages/server/src/index.ts`, add the env read next to the other `process.env` reads (after `pokeApiBaseUrl`):

```ts
const teamsTtlMs = Number(process.env.TEAMS_TTL_MS ?? 6 * 60 * 60 * 1000); // default 6h
```

Then add `ttlMs` to the `createTeamsService({ ... })` call (next to `logger`):

```ts
const service = createTeamsService({
  fetchSheetCsv: () => fetchSheetCsv(sheetUrl),
  resolveSprites: (species) => resolveSprites(species, { baseUrl: pokeApiBaseUrl, logger }),
  readSpriteCache: () => readSpriteCache(spriteCachePath),
  writeSpriteCache: (sprites) => writeSpriteCache(spriteCachePath, sprites),
  ttlMs: teamsTtlMs,
  logger,
});
```

- [ ] **Step 2: Typecheck + build (the whole server now satisfies the deps)**

Run: `pnpm typecheck; if ($?) { pnpm build }`
Expected: both clean — `index.ts` now provides `ttlMs`, so the Task 1 type error is closed.

- [ ] **Step 3: Full test suite + lint**

Run: `pnpm lint; if ($?) { pnpm test }`
Expected: lint clean; all tests green.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): wire TEAMS_TTL_MS into the composition root"
```

---

### Final verification (after both tasks)

- [ ] **Full gate:** `pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm test }; if ($?) { pnpm build }` — all green.
- [ ] **Manual (optional):** run the server locally with `TEAMS_TTL_MS=5000`, hit `GET /api/teams` twice more than 5s apart, and confirm the second call re-ingests (a new ingest log line / a fresher `fetchedAt`).

## Self-Review

**Spec coverage:** ✅ hard TTL (Task 1) · ✅ stale-on-failure fallback, 503 only when no cache (Task 1, catch branch) · ✅ retry on next stale call (cachedAt unchanged on failure) · ✅ single-flight preserved (`inFlight` guard) · ✅ injectable `now` (Task 1) · ✅ `TEAMS_TTL_MS` default 6h (Task 2) · ✅ server-only, front/shared/domain/detail untouched · ✅ existing tests kept green via `ttlMs` in the factory.

**Placeholder scan:** none — full file in Task 1 Step 3, exact edits in Task 2, exact commands + expected output per step. The typecheck-red-until-Task-2 interplay is called out explicitly (not a placeholder — a sequencing note with the resolution).

**Type consistency:** `ttlMs: number` + `now?: () => number` defined on `TeamsServiceDeps` in Task 1, provided by the test factory (Task 1) and `index.ts` (Task 2). `isStale()`/`cachedAt`/`now` are local. `getTeams(): Promise<TeamsResponse>` unchanged.
