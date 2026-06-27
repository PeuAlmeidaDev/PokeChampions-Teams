# Railway Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app deployable on Railway as one process that serves both `/api` and the built SPA, with a railway.json and documented prod envs.

**Architecture:** `buildApp` gains an optional `webDistPath`; when set it registers `@fastify/static` over `packages/web/dist` with an SPA fallback (`setNotFoundHandler`: `/api/*` → 404 JSON, everything else → `index.html`). The composition root resolves the path from `import.meta.url` and only passes it when the directory exists, so `pnpm dev` (no `web/dist`, Vite serves the SPA) stays API-only. A `railway.json` declares the Nixpacks build/start/healthcheck.

**Tech Stack:** Fastify 5 + `@fastify/static` v8, TypeScript (strict), vitest (node), pnpm workspaces, Railway/Nixpacks.

## Global Constraints

- `domain/` stays pure; this changes only `http/app.ts`, the `index.ts` env edge, server `package.json`, and root config files.
- `process.env` and filesystem checks only at the edge (`index.ts`).
- API contract unchanged: `/api/*` 404s stay JSON (`{ error }`); the SPA fallback only applies to non-`/api` routes.
- The static-serving registration is opt-in via `webDistPath` so existing `inject()` tests stay API-only and `pnpm dev` is unaffected.
- TypeScript strict; no `any`, no non-null assertions. Conventional Commits in English, one commit per task. Run `pnpm lint && pnpm typecheck && pnpm test` green before each commit.
- Branch: `feat/deploy-railway` (already created off `main`; spec already committed there).

---

### Task 1: `buildApp` serves the SPA via `@fastify/static` + fallback

**Files:**
- Modify: `packages/server/package.json` (add `@fastify/static`)
- Modify: `packages/server/src/http/app.ts`
- Test: `packages/server/src/http/app.test.ts`

**Interfaces:**
- Produces: `AppDeps` gains `webDistPath?: string`. When set, `buildApp` serves `web/dist` and routes non-`/api` 404s to `index.html`.

- [ ] **Step 1: Write the failing tests** — append to `packages/server/src/http/app.test.ts`. First add these imports at the top (merge with the existing import lines):

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

Then add a fixture helper and the three tests at the end of the file:

```ts
function makeWebDist(): string {
  const dir = mkdtempSync(join(tmpdir(), "webdist-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>spa</title>");
  return dir;
}

describe("SPA serving (webDistPath set)", () => {
  it("serves index.html at /", async () => {
    app = buildApp({
      getTeams: vi.fn().mockResolvedValue(sample),
      getTeamDetail: vi.fn().mockResolvedValue(null),
      webDistPath: makeWebDist(),
    });
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>spa</title>");
  });

  it("falls back to index.html for an unknown non-/api route (client routing)", async () => {
    app = buildApp({
      getTeams: vi.fn().mockResolvedValue(sample),
      getTeamDetail: vi.fn().mockResolvedValue(null),
      webDistPath: makeWebDist(),
    });
    const res = await app.inject({ method: "GET", url: "/team/MB1" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>spa</title>");
  });

  it("keeps /api/* misses as JSON 404 (no HTML leak)", async () => {
    app = buildApp({
      getTeams: vi.fn().mockResolvedValue(sample),
      getTeamDetail: vi.fn().mockResolvedValue(null),
      webDistPath: makeWebDist(),
    });
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json()).toHaveProperty("error");
  });
});
```

- [ ] **Step 2: Run the tests to verify they FAIL (RED)**

Run: `pnpm test -- packages/server/src/http/app.test.ts`
Expected: the three new tests FAIL — `buildApp` ignores the (currently unknown) `webDistPath`, so `GET /` and `GET /team/MB1` hit Fastify's default 404 (not the html), and `GET /api/nope` is a 404 but via the default handler. (The existing API tests still pass.)

- [ ] **Step 3: Install `@fastify/static`**

Run: `pnpm --filter @pokemon-champions/server add @fastify/static`
Expected: adds `@fastify/static` (v8, Fastify-5 compatible) to `packages/server/package.json` dependencies and updates `pnpm-lock.yaml`.

- [ ] **Step 4: Implement the static serving in `app.ts`**

Add the import at the top of `packages/server/src/http/app.ts`:

```ts
import fastifyStatic from "@fastify/static";
```

Add `webDistPath` to `AppDeps`:

```ts
export interface AppDeps {
  getTeams: () => Promise<TeamsResponse>;
  getTeamDetail: (id: string) => Promise<TeamDetail | null>;
  /** When set, serve this dir (the built SPA) statically with an index.html fallback. */
  webDistPath?: string;
}
```

Then, immediately before `return app;`, register the static plugin and the SPA fallback:

```ts
  // Serve the built SPA in production (single process, no CORS). Opt-in: dev
  // leaves this unset (Vite serves the SPA), so the API runs alone.
  if (deps.webDistPath) {
    app.register(fastifyStatic, { root: deps.webDistPath, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      // /api misses stay JSON 404 (don't leak HTML into the API contract);
      // every other unmatched GET is a client route → serve the SPA shell.
      if (req.url.startsWith("/api")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.code(200).type("text/html").sendFile("index.html");
    });
  }

  return app;
```

- [ ] **Step 5: Run the tests to verify GREEN**

Run: `pnpm test -- packages/server/src/http/app.test.ts`
Expected: all tests PASS — the three new SPA tests plus the existing API tests.

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint; if ($?) { pnpm typecheck }`
Expected: both clean. (`@fastify/static` augments `FastifyReply` with `sendFile`, so the type resolves. `index.ts` still compiles — it doesn't pass `webDistPath` yet, which is optional.)

- [ ] **Step 7: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml packages/server/src/http/app.ts packages/server/src/http/app.test.ts
git commit -m "feat(server): serve the built SPA from Fastify with an index.html fallback"
```

---

### Task 2: Resolve `webDistPath` in the composition root (exists-gated)

**Files:**
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `AppDeps.webDistPath` (Task 1).
- Produces: nothing downstream.

- [ ] **Step 1: Add the path resolution and pass it to `buildApp`**

At the top of `packages/server/src/index.ts`, add the node imports (next to the existing imports):

```ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
```

After the other `process.env` reads (e.g. after `detailCacheDir`), resolve the path and gate it on existence:

```ts
// Resolve the built SPA dir from THIS file's location (works in dev via tsx and
// in prod from dist/), overridable by env. Only serve it when it exists — in
// dev `web/dist` is absent (Vite serves the SPA), so the API runs alone.
const webDistCandidate =
  process.env.WEB_DIST_PATH ??
  resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const webDistPath = existsSync(webDistCandidate) ? webDistCandidate : undefined;
if (!webDistPath) {
  console.warn(`[web] ${webDistCandidate} not found — serving API only (dev/Vite mode)`);
}
```

Then add `webDistPath` to the existing `buildApp({ ... })` call:

```ts
const app = buildApp({
  getTeams: service.getTeams,
  getTeamDetail: detailService.getTeamDetail,
  webDistPath,
});
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm typecheck; if ($?) { pnpm build }`
Expected: both clean. The server `build` (tsup, ESM) keeps `import.meta.url` intact.

- [ ] **Step 3: Lint + full test suite**

Run: `pnpm lint; if ($?) { pnpm test }`
Expected: lint clean; all tests green (no behavior change to existing suites).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): resolve and exists-gate the SPA dist path at the edge"
```

---

### Task 3: Railway config + env docs

**Files:**
- Create: `railway.json` (repo root)
- Modify: `packages/server/.env.example`

**Interfaces:** none (declarative config + docs).

- [ ] **Step 1: Create `railway.json` at the repo root**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm build"
  },
  "deploy": {
    "startCommand": "node packages/server/dist/index.js",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 2: Document the production envs in `packages/server/.env.example`**

Append to `packages/server/.env.example`:

```
# Cache validity for the teams list (ms); past this the next request re-ingests.
# Default 6h. (See the teams-ttl-refresh slice.)
TEAMS_TTL_MS=21600000

# Where the built SPA lives. Optional: in production it is auto-resolved relative
# to the server's dist/ (packages/web/dist). Set only to override.
# WEB_DIST_PATH=

# In production the host (Railway) injects PORT; HOST defaults to 0.0.0.0.
# PORT=
# HOST=0.0.0.0
```

- [ ] **Step 3: Verify the build still works (config files don't break it)**

Run: `pnpm build`
Expected: build succeeds (server + web). `railway.json` and `.env.example` are not part of the build.

- [ ] **Step 4: Commit**

```bash
git add railway.json packages/server/.env.example
git commit -m "chore(deploy): add railway.json and document production envs"
```

---

### Final verification (after all tasks)

- [ ] **Full gate:** `pnpm lint; if ($?) { pnpm typecheck }; if ($?) { pnpm test }; if ($?) { pnpm build }` — all green.
- [ ] **Prod-like local run:** `pnpm build`, then `SHEET_CSV_URL="<a real export-csv URL>" node packages/server/dist/index.js`. Open `http://localhost:3000` and confirm the Fastify process serves the SPA (not Vite); `GET /api/health` → `{ "status": "ok" }`; reloading a client route (e.g. open a modal then refresh) does not 404.
- [ ] **Dev still works:** `pnpm dev` → the `[web] … not found — serving API only` warn appears, Vite serves the SPA on :5173 with the `/api` proxy.
- [ ] **Hand-off note for the user (manual, on Railway):** create the project from the GitHub repo; set `SHEET_CSV_URL` (required) and optionally `POKEAPI_BASE_URL` / `TEAMS_TTL_MS`; Railway provides `PORT`; deploy and check `/api/health`.

## Self-Review

**Spec coverage:** ✅ `@fastify/static` + SPA fallback opt-in via `webDistPath` (Task 1) · ✅ `/api/*` stays JSON 404 (Task 1, fallback guard + test) · ✅ path resolved via `import.meta.url`, `WEB_DIST_PATH` override (Task 2) · ✅ `existsSync` gate keeps `pnpm dev` API-only (Task 2) · ✅ `railway.json` Nixpacks build/start/healthcheck (Task 3) · ✅ env docs incl. `TEAMS_TTL_MS`/`WEB_DIST_PATH` (Task 3) · ✅ tests for serve/fallback/api-404 (Task 1) · ✅ domain/front/shared untouched.

**Placeholder scan:** none — full code/edits and exact commands per step. The `@fastify/static` version is pinned by `pnpm add` (latest = v8, Fastify-5 compatible); the prod-like run uses a real CSV URL the user supplies (the only non-literal, by nature).

**Type consistency:** `webDistPath?: string` defined on `AppDeps` (Task 1), provided by `index.ts` (Task 2). `buildApp(deps)` signature otherwise unchanged. `reply.sendFile` comes from the `@fastify/static` type augmentation loaded by the Task 1 import.
