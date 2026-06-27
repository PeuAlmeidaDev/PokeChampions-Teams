# Team Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar a configuração completa (item/ability/nature/Tera/EVs/IVs/moves) de cada Pokémon de um time campeão dentro do app, em um modal, buscando o pokepaste sob demanda.

**Architecture:** Fatia vertical lazy. Novo contrato em `shared` (separado do grid). No `server`, um parser puro (`@pkmn/sets`) + um fetcher de pokepaste + um cache em disco por time + um serviço orquestrador (espelha `createTeamsService`: lazy, single-flight, reusa o cache de sprite). No `web`, `fetchTeamDetail` + um modal apresentacional. O grid (`GET /api/teams`) não muda.

**Tech Stack:** TypeScript strict, zod 4, Fastify 5 + `fastify-type-provider-zod`, `@pkmn/sets` (parser Showdown), React 19, vitest.

## Global Constraints

- **TypeScript strict** + `noUncheckedIndexedAccess`. Tipagem estrita; sem `any` solto.
- **Validação na borda com zod.** Pokepaste `/json` e a resposta da API são validados antes de entrar no domínio/UI.
- **`domain/` é puro.** Sem rede/disco/relógio/`process.env`. I/O só em `ingest`/`cache`/`http`. `process.env` só em `index.ts`.
- **Handler de rota fino.** Zero regra de negócio no handler.
- **Cliente educado de API:** retry com backoff só em 5xx/rede, **nunca em 404**; User-Agent descritivo.
- **Degradação graciosa:** paste/sprite ruim nunca derruba a resposta — loga e segue com placeholder/omite.
- **Sprite sempre do nosso pipeline** (PokeAPI + cache via `resolveSprites`/`names.ts`), **nunca** imagem do pokepaste.
- **Commits granulares**, Conventional Commits em inglês, um commit por task.
- **CI verde:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` antes de cada commit.
- **Pokepaste `/json`** retorna `{ author, notes, paste, title }`; `paste` é o texto Showdown dos 6 sets separados por linha em branco.
- **`Sets.importSet(text)`** (de `@pkmn/sets`) retorna `Partial<PokemonSet<string>>`: campos `species,item,ability,nature,moves[],evs,ivs,teraType` podendo ser `undefined`; `evs`/`ivs` são `StatsTable = {hp,atk,def,spa,spd,spe}` numéricos.

---

### Task 1: Contrato `shared` — DetailedPokemonSet + TeamDetail

**Files:**
- Modify: `packages/shared/src/domain.ts` (append no fim)
- Modify: `packages/shared/src/index.ts` (garantir re-export — hoje exporta `domain.js`; confirmar)
- Test: `packages/shared/src/domain.test.ts` (append)

**Interfaces:**
- Produces: `DetailedPokemonSetSchema`, `TeamDetailSchema` (zod) e os tipos `DetailedPokemonSet`, `TeamDetail`. Campos: `species:string`, `spriteUrl:string`, `item/ability/nature/teraType: string|null`, `evs/ivs: Record<string,number>`, `moves: string[]`; `TeamDetail = { id:string, pokemon: DetailedPokemonSet[] }`.

- [ ] **Step 1: Escrever o teste que falha**

Append em `packages/shared/src/domain.test.ts`:

```ts
import { DetailedPokemonSetSchema, TeamDetailSchema } from "./index.js";

describe("DetailedPokemonSetSchema", () => {
  it("aceita um set completo", () => {
    const set = {
      species: "Incineroar",
      spriteUrl: "https://img/incineroar.png",
      item: "Assault Vest",
      ability: "Intimidate",
      nature: "Careful",
      teraType: "Grass",
      evs: { hp: 252, atk: 4, spd: 252 },
      ivs: {},
      moves: ["Fake Out", "Knock Off", "Parting Shot", "Flare Blitz"],
    };
    expect(DetailedPokemonSetSchema.parse(set)).toEqual(set);
  });

  it("aceita um set parcial (campos opcionais null/vazios)", () => {
    const set = {
      species: "Flutter Mane",
      spriteUrl: "/placeholder-sprite.png",
      item: null,
      ability: null,
      nature: null,
      teraType: null,
      evs: {},
      ivs: {},
      moves: [],
    };
    expect(() => DetailedPokemonSetSchema.parse(set)).not.toThrow();
  });
});

describe("TeamDetailSchema", () => {
  it("valida um detalhe de time", () => {
    const detail = {
      id: "MB1",
      pokemon: [
        {
          species: "Incineroar",
          spriteUrl: "x",
          item: null,
          ability: null,
          nature: null,
          teraType: null,
          evs: {},
          ivs: {},
          moves: [],
        },
      ],
    };
    expect(TeamDetailSchema.parse(detail).id).toBe("MB1");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/shared test`
Expected: FAIL — `DetailedPokemonSetSchema`/`TeamDetailSchema` não existem.

- [ ] **Step 3: Implementar os schemas**

Append em `packages/shared/src/domain.ts`:

```ts
/**
 * Per-Pokémon configuration, shown in the team-detail modal. Fetched on demand
 * from the team's pokepaste (not part of the grid contract). Every config field
 * is optional/partial: real pastes omit EVs/IVs/Tera (hurdle #4). The sprite is
 * resolved by OUR pipeline (PokeAPI + cache), never taken from the pokepaste.
 */
export const DetailedPokemonSetSchema = z.object({
  species: z.string(),
  spriteUrl: z.string(),
  item: z.string().nullable(),
  ability: z.string().nullable(),
  nature: z.string().nullable(),
  teraType: z.string().nullable(),
  evs: z.record(z.string(), z.number()),
  ivs: z.record(z.string(), z.number()),
  moves: z.array(z.string()),
});
export type DetailedPokemonSet = z.infer<typeof DetailedPokemonSetSchema>;

/** Response body of `GET /api/teams/:id/detail`. */
export const TeamDetailSchema = z.object({
  id: z.string(),
  pokemon: z.array(DetailedPokemonSetSchema),
});
export type TeamDetail = z.infer<typeof TeamDetailSchema>;
```

Confirmar que `packages/shared/src/index.ts` re-exporta tudo de `domain.js` (ex.: `export * from "./domain.js";`). Se não, adicionar.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/domain.ts packages/shared/src/domain.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add DetailedPokemonSet and TeamDetail contract"
```

---

### Task 2: `@pkmn/sets` + parser puro `domain/paste.ts`

**Files:**
- Modify: `packages/server/package.json` (nova dependência)
- Create: `packages/server/src/domain/paste.ts`
- Create: `packages/server/src/domain/paste.test.ts`

**Interfaces:**
- Consumes: `DetailedPokemonSet` (Task 1).
- Produces: `type ParsedSet = Omit<DetailedPokemonSet, "spriteUrl">` e `parsePaste(text: string): ParsedSet[]`. Descarta sets sem espécie ou malformados; nunca lança.

- [ ] **Step 1: Instalar o parser canônico**

Run: `pnpm --filter @pokemon-champions/server add @pkmn/sets`
Expected: `@pkmn/sets` (e seu `@pkmn/types`) em `dependencies`.

- [ ] **Step 2: Escrever o teste que falha**

Create `packages/server/src/domain/paste.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePaste } from "./paste.js";

const FULL = `Incineroar @ Assault Vest
Ability: Intimidate
Tera Type: Grass
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Fake Out
- Knock Off
- Parting Shot
- Flare Blitz

Flutter Mane @ Booster Energy
Ability: Protosynthesis
Tera Type: Fairy
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Moonblast
- Shadow Ball
- Icy Wind
- Protect`;

describe("parsePaste", () => {
  it("parseia múltiplos sets separados por linha em branco", () => {
    const sets = parsePaste(FULL);
    expect(sets).toHaveLength(2);
  });

  it("mapeia os campos de um set completo", () => {
    const [inc] = parsePaste(FULL);
    expect(inc).toMatchObject({
      species: "Incineroar",
      item: "Assault Vest",
      ability: "Intimidate",
      nature: "Careful",
      teraType: "Grass",
      moves: ["Fake Out", "Knock Off", "Parting Shot", "Flare Blitz"],
    });
    expect(inc?.evs).toMatchObject({ hp: 252, atk: 4, spd: 252 });
  });

  it("tolera set parcial: sem item/EV/Tera vira null/{}", () => {
    const sets = parsePaste(`Amoonguss\nAbility: Regenerator\n- Spore`);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      species: "Amoonguss",
      item: null,
      teraType: null,
      evs: {},
      moves: ["Spore"],
    });
  });

  it("descarta lixo e segue com os sets válidos", () => {
    const sets = parsePaste(`\n\n   \n\nPikachu\n- Thunderbolt`);
    expect(sets).toHaveLength(1);
    expect(sets[0]?.species).toBe("Pikachu");
  });

  it("texto vazio devolve lista vazia", () => {
    expect(parsePaste("")).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/server test paste`
Expected: FAIL — `./paste.js` não existe.

- [ ] **Step 4: Implementar o parser puro**

Create `packages/server/src/domain/paste.ts`:

```ts
/**
 * Pure parser: pokepaste text -> our per-Pokémon config. Uses @pkmn/sets to
 * parse the Showdown format, then maps to our contract. No I/O. Graceful: a
 * malformed or species-less set is dropped, never crashing the rest (one bad
 * Pokémon must not take down the other five). Sprite is NOT resolved here —
 * that's the orchestrator's job (assembleTeamDetail).
 */

import { Sets } from "@pkmn/sets";
import type { DetailedPokemonSet } from "@pokemon-champions/shared";

export type ParsedSet = Omit<DetailedPokemonSet, "spriteUrl">;

const STATS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

function asNullableString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickStats(table: unknown): Record<string, number> {
  if (table === null || typeof table !== "object") return {};
  const src = table as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const s of STATS) {
    const v = src[s];
    if (typeof v === "number") out[s] = v;
  }
  return out;
}

export function parsePaste(text: string): ParsedSet[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const chunks = normalized
    .split(/\n[ \t]*\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const sets: ParsedSet[] = [];
  for (const chunk of chunks) {
    let parsed: Partial<import("@pkmn/types").PokemonSet<string>>;
    try {
      parsed = Sets.importSet(chunk);
    } catch {
      continue; // malformed set — skip, keep the rest
    }
    const species = asNullableString(parsed.species);
    if (!species) continue; // unusable without a species

    const moves = Array.isArray(parsed.moves)
      ? parsed.moves.filter((m): m is string => typeof m === "string" && m.length > 0)
      : [];

    sets.push({
      species,
      item: asNullableString(parsed.item),
      ability: asNullableString(parsed.ability),
      nature: asNullableString(parsed.nature),
      teraType: asNullableString(parsed.teraType),
      evs: pickStats(parsed.evs),
      ivs: pickStats(parsed.ivs),
      moves,
    });
  }
  return sets;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/server test paste`
Expected: PASS (5 testes). Se algum campo divergir (ex.: `nature` vier `"Careful"` vs `"Careful Nature"`), ajustar a expectativa ao retorno real do `@pkmn/sets` — ele já normaliza a nature sem o sufixo.

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json packages/server/src/domain/paste.ts packages/server/src/domain/paste.test.ts ../../pnpm-lock.yaml
git commit -m "feat(server): pure pokepaste parser via @pkmn/sets"
```

---

### Task 3: Join puro `assembleTeamDetail`

**Files:**
- Modify: `packages/server/src/domain/assemble.ts` (append)
- Modify: `packages/server/src/domain/assemble.test.ts` (append)

**Interfaces:**
- Consumes: `ParsedSet` (Task 2), `ResolvedSprite` + `PLACEHOLDER_SPRITE_URL` (existentes em `assemble.ts`), `TeamDetail` (Task 1).
- Produces: `assembleTeamDetail(id: string, sets: ParsedSet[], sprites: Map<string, ResolvedSprite>): TeamDetail`. Junta o sprite por espécie; espécie sem sprite → placeholder.

- [ ] **Step 1: Escrever o teste que falha**

Append em `packages/server/src/domain/assemble.test.ts`:

```ts
import { assembleTeamDetail } from "./assemble.js";
import type { ParsedSet } from "./paste.js";

describe("assembleTeamDetail", () => {
  const set: ParsedSet = {
    species: "Incineroar",
    item: "Assault Vest",
    ability: "Intimidate",
    nature: "Careful",
    teraType: "Grass",
    evs: { hp: 252 },
    ivs: {},
    moves: ["Fake Out"],
  };

  it("junta o sprite resolvido por espécie", () => {
    const sprites = new Map([["Incineroar", { spriteUrl: "https://img/inc.png", dexId: 727 }]]);
    const detail = assembleTeamDetail("MB1", [set], sprites);
    expect(detail.id).toBe("MB1");
    expect(detail.pokemon[0]?.spriteUrl).toBe("https://img/inc.png");
    expect(detail.pokemon[0]?.item).toBe("Assault Vest");
  });

  it("espécie sem sprite degrada para o placeholder", () => {
    const detail = assembleTeamDetail("MB1", [set], new Map());
    expect(detail.pokemon[0]?.spriteUrl).toBe("/placeholder-sprite.png");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/server test assemble`
Expected: FAIL — `assembleTeamDetail` não existe.

- [ ] **Step 3: Implementar**

Append em `packages/server/src/domain/assemble.ts`:

```ts
import type { TeamDetail } from "@pokemon-champions/shared";
import type { ParsedSet } from "./paste.js";

/**
 * Promotes parsed pokepaste sets into the TeamDetail contract by joining each
 * species with its resolved sprite (same pipeline as the grid). Pure. A species
 * with no resolved sprite degrades to the placeholder (graceful degradation).
 */
export function assembleTeamDetail(
  id: string,
  sets: ParsedSet[],
  sprites: Map<string, ResolvedSprite>,
): TeamDetail {
  return {
    id,
    pokemon: sets.map((set) => ({
      ...set,
      spriteUrl: sprites.get(set.species)?.spriteUrl ?? PLACEHOLDER_SPRITE_URL,
    })),
  };
}
```

(`ResolvedSprite` e `PLACEHOLDER_SPRITE_URL` já estão definidos no topo de `assemble.ts`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/server test assemble`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/domain/assemble.ts packages/server/src/domain/assemble.test.ts
git commit -m "feat(server): assembleTeamDetail joins parsed sets with sprites"
```

---

### Task 4: Fetcher `ingest/pokepaste.ts`

**Files:**
- Create: `packages/server/src/ingest/pokepaste.ts`
- Create: `packages/server/src/ingest/pokepaste.test.ts`

**Interfaces:**
- Consumes: `FetchLike` (de `./sheet.js`).
- Produces: `fetchPokepaste(url: string, opts?: { fetchImpl?: FetchLike }): Promise<string>` — retorna o campo `paste`. Retry só em 5xx/rede; nunca 404. Lança em falha definitiva.

- [ ] **Step 1: Escrever o teste que falha**

Create `packages/server/src/ingest/pokepaste.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchPokepaste } from "./pokepaste.js";

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("fetchPokepaste", () => {
  it("busca /json e devolve o campo paste", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { paste: "Pikachu\n- Thunderbolt", title: "" }));
    const paste = await fetchPokepaste("https://pokepast.es/abc", { fetchImpl });
    expect(paste).toBe("Pikachu\n- Thunderbolt");
    expect(fetchImpl).toHaveBeenCalledWith("https://pokepast.es/abc/json", expect.anything());
  });

  it("não dá retry em 404 e lança", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(404, {}));
    await expect(fetchPokepaste("https://pokepast.es/x", { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("dá retry em 5xx e então sucesso", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(500, {}))
      .mockResolvedValueOnce(res(200, { paste: "ok" }));
    const paste = await fetchPokepaste("https://pokepast.es/y", { fetchImpl });
    expect(paste).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("lança se o json não tiver o shape esperado", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { nope: true }));
    await expect(fetchPokepaste("https://pokepast.es/z", { fetchImpl })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/server test pokepaste`
Expected: FAIL — `./pokepaste.js` não existe.

- [ ] **Step 3: Implementar o fetcher**

Create `packages/server/src/ingest/pokepaste.ts`:

```ts
/**
 * Fetches a team's pokepaste as raw Showdown text (the `/json` endpoint returns
 * { author, notes, paste, title }; we only need `paste`). Shell: network I/O.
 * Good API citizen — descriptive User-Agent, backoff retry ONLY on 5xx/network,
 * NEVER on 404 (a 404 is a bad URL, not transient). Validates the JSON shape at
 * the boundary. Throws on definitive failure so the orchestrator surfaces a 503.
 */

import { z } from "zod";
import type { FetchLike } from "./sheet.js";

const USER_AGENT =
  "PokemonChampions/0.1 (+https://github.com/PeuAlmeidaDev/PokemonChampions)";

const PokepasteJsonSchema = z.object({ paste: z.string() });

const MAX_5XX_RETRIES = 2;
const backoff = (attempt: number) =>
  new Promise((r) => setTimeout(r, 200 * 2 ** attempt));

export interface FetchPokepasteOptions {
  fetchImpl?: FetchLike;
}

export async function fetchPokepaste(
  url: string,
  opts: FetchPokepasteOptions = {},
): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const jsonUrl = `${url.replace(/\/+$/, "")}/json`;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(jsonUrl, { headers: { "User-Agent": USER_AGENT } });
    } catch (err) {
      if (attempt < MAX_5XX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      throw err; // network failure after retries
    }

    if (response.status >= 500) {
      if (attempt < MAX_5XX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      throw new Error(`pokepaste fetch failed: ${response.status}`);
    }
    if (!response.ok) {
      throw new Error(`pokepaste fetch failed: ${response.status}`); // 404 etc — never retry
    }

    const parsed = PokepasteJsonSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("pokepaste json shape unexpected");
    }
    return parsed.data.paste;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/server test pokepaste`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ingest/pokepaste.ts packages/server/src/ingest/pokepaste.test.ts
git commit -m "feat(server): fetch pokepaste /json (polite client)"
```

---

### Task 5: Cache em disco `cache/detail.ts` (por time)

**Files:**
- Create: `packages/server/src/cache/detail.ts`
- Create: `packages/server/src/cache/detail.test.ts`

**Interfaces:**
- Consumes: `TeamDetail` + `TeamDetailSchema` (Task 1).
- Produces: `readDetailCache(dir: string, id: string): Promise<TeamDetail | null>` (arquivo ausente/corrompido → `null`, nunca lança) e `writeDetailCache(dir: string, id: string, detail: TeamDetail): Promise<void>` (um arquivo por time, sem corrida).

- [ ] **Step 1: Escrever o teste que falha**

Create `packages/server/src/cache/detail.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDetailCache, writeDetailCache } from "./detail.js";
import type { TeamDetail } from "@pokemon-champions/shared";

const detail: TeamDetail = {
  id: "MB1",
  pokemon: [
    { species: "Pikachu", spriteUrl: "x", item: null, ability: null, nature: null, teraType: null, evs: {}, ivs: {}, moves: [] },
  ],
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "detail-cache-"));
});

describe("detail cache", () => {
  it("write depois read devolve o mesmo detalhe", async () => {
    await writeDetailCache(dir, "MB1", detail);
    expect(await readDetailCache(dir, "MB1")).toEqual(detail);
  });

  it("arquivo ausente devolve null", async () => {
    expect(await readDetailCache(dir, "NOPE")).toBeNull();
  });

  it("arquivo corrompido devolve null (não lança)", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "BAD.json"), "not json at all", "utf8");
    expect(await readDetailCache(dir, "BAD")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/server test cache/detail`
Expected: FAIL — `./detail.js` não existe.

- [ ] **Step 3: Implementar o cache**

Create `packages/server/src/cache/detail.ts`:

```ts
/**
 * L2 disk cache for a team's detail, one file per team (data/cache/details/
 * <id>.json). One file per id avoids the read-modify-write races a shared map
 * would have under lazy single-flight. A missing or corrupt file degrades to
 * null — it must never break the request (server/CLAUDE.md graceful degradation).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TeamDetailSchema, type TeamDetail } from "@pokemon-champions/shared";

function fileFor(dir: string, id: string): string {
  return join(dir, `${id}.json`);
}

export async function readDetailCache(
  dir: string,
  id: string,
): Promise<TeamDetail | null> {
  let raw: string;
  try {
    raw = await readFile(fileFor(dir, id), "utf8");
  } catch {
    return null; // missing — not cached yet
  }
  try {
    const parsed = TeamDetailSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`[detail-cache] ignoring corrupt cache for ${id}`);
      return null;
    }
    return parsed.data;
  } catch {
    console.warn(`[detail-cache] ignoring corrupt cache for ${id}`);
    return null;
  }
}

export async function writeDetailCache(
  dir: string,
  id: string,
  detail: TeamDetail,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(fileFor(dir, id), JSON.stringify(detail, null, 2), "utf8");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/server test cache/detail`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/cache/detail.ts packages/server/src/cache/detail.test.ts
git commit -m "feat(server): per-team disk cache for team detail"
```

---

### Task 6: Orquestrador `ingest/detail.ts` (lazy + single-flight)

**Files:**
- Create: `packages/server/src/ingest/detail.ts`
- Create: `packages/server/src/ingest/detail.test.ts`

**Interfaces:**
- Consumes: `getTeams` (forma de `TeamsService`), `fetchPokepaste` (Task 4, injetado), `resolveSprites`/`readSpriteCache`/`writeSpriteCache` (existentes), `readDetailCache`/`writeDetailCache` (Task 5, injetados), `parsePaste`+`assembleTeamDetail` (domínio).
- Produces: `createTeamDetailService(deps): { getTeamDetail(id: string): Promise<TeamDetail | null> }`. `null` = time inexistente. Lança em falha de I/O. Single-flight por id; reusa o cache de sprite.

- [ ] **Step 1: Escrever o teste que falha**

Create `packages/server/src/ingest/detail.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createTeamDetailService } from "./detail.js";
import { makeTeamsResponse, makeRawTeamResponse } from "./detail.test-helpers.js";

function deps(overrides = {}) {
  return {
    getTeams: vi.fn().mockResolvedValue(
      makeTeamsResponse([{ id: "MB1", pokepasteUrl: "https://pokepast.es/abc" }]),
    ),
    fetchPokepaste: vi.fn().mockResolvedValue("Incineroar @ Assault Vest\nAbility: Intimidate\n- Fake Out"),
    resolveSprites: vi.fn().mockResolvedValue(new Map([["Incineroar", { spriteUrl: "https://img/inc.png", dexId: 727 }]])),
    readSpriteCache: vi.fn().mockResolvedValue(new Map()),
    writeSpriteCache: vi.fn().mockResolvedValue(undefined),
    readDetailCache: vi.fn().mockResolvedValue(null),
    writeDetailCache: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createTeamDetailService", () => {
  it("monta o detalhe: paste -> parse -> sprite -> assemble", async () => {
    const d = deps();
    const svc = createTeamDetailService(d);
    const detail = await svc.getTeamDetail("MB1");
    expect(detail?.id).toBe("MB1");
    expect(detail?.pokemon[0]?.species).toBe("Incineroar");
    expect(detail?.pokemon[0]?.spriteUrl).toBe("https://img/inc.png");
    expect(d.writeDetailCache).toHaveBeenCalledWith("MB1", expect.objectContaining({ id: "MB1" }));
  });

  it("devolve do cache sem buscar o pokepaste", async () => {
    const cached = { id: "MB1", pokemon: [] };
    const d = deps({ readDetailCache: vi.fn().mockResolvedValue(cached) });
    const svc = createTeamDetailService(d);
    expect(await svc.getTeamDetail("MB1")).toEqual(cached);
    expect(d.fetchPokepaste).not.toHaveBeenCalled();
  });

  it("time inexistente devolve null", async () => {
    const d = deps();
    const svc = createTeamDetailService(d);
    expect(await svc.getTeamDetail("NOPE")).toBeNull();
    expect(d.fetchPokepaste).not.toHaveBeenCalled();
  });

  it("não resolve sprites já presentes no cache de sprite", async () => {
    const d = deps({
      readSpriteCache: vi.fn().mockResolvedValue(new Map([["Incineroar", { spriteUrl: "https://cached/inc.png", dexId: 727 }]])),
    });
    const svc = createTeamDetailService(d);
    const detail = await svc.getTeamDetail("MB1");
    expect(d.resolveSprites).not.toHaveBeenCalled();
    expect(detail?.pokemon[0]?.spriteUrl).toBe("https://cached/inc.png");
  });

  it("single-flight: chamadas concorrentes pro mesmo id compartilham a promise", async () => {
    const d = deps();
    const svc = createTeamDetailService(d);
    await Promise.all([svc.getTeamDetail("MB1"), svc.getTeamDetail("MB1")]);
    expect(d.fetchPokepaste).toHaveBeenCalledTimes(1);
  });
});
```

Create helper `packages/server/src/ingest/detail.test-helpers.ts`:

```ts
import type { TeamsResponse, Team } from "@pokemon-champions/shared";

/** Minimal Team for detail tests — only id + pokepasteUrl matter here. */
export function makeRawTeamResponse(partial: Pick<Team, "id" | "pokepasteUrl">): Team {
  return {
    id: partial.id,
    name: "T",
    ownerName: null,
    ownerHandle: null,
    tournament: null,
    rank: null,
    pokepasteUrl: partial.pokepasteUrl,
    pokemon: [],
  };
}

export function makeTeamsResponse(teams: Array<Pick<Team, "id" | "pokepasteUrl">>): TeamsResponse {
  return { fetchedAt: "2026-06-26T00:00:00.000Z", teams: teams.map(makeRawTeamResponse) };
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/server test ingest/detail`
Expected: FAIL — `./detail.js` não existe.

- [ ] **Step 3: Implementar o orquestrador**

Create `packages/server/src/ingest/detail.ts`:

```ts
/**
 * Lazy, single-flight team-detail conductor — mirrors createTeamsService. On a
 * cache miss it looks the team up (by id) in the already-ingested teams, fetches
 * its pokepaste, parses it, resolves sprites REUSING the warm sprite cache (only
 * unknown species hit PokeAPI), assembles the TeamDetail and caches it on disk.
 * Concurrent calls for the same id share one in-flight promise. Returns null for
 * an unknown id (route -> 404); throws on I/O failure (route -> 503).
 */

import type { TeamDetail, TeamsResponse } from "@pokemon-champions/shared";
import type { ResolvedSprite } from "../domain/assemble.js";
import { assembleTeamDetail } from "../domain/assemble.js";
import { parsePaste } from "../domain/paste.js";

export interface TeamDetailServiceDeps {
  getTeams: () => Promise<TeamsResponse>;
  fetchPokepaste: (url: string) => Promise<string>;
  resolveSprites: (species: string[]) => Promise<Map<string, ResolvedSprite>>;
  readSpriteCache: () => Promise<Map<string, ResolvedSprite>>;
  writeSpriteCache: (sprites: Map<string, ResolvedSprite>) => Promise<void>;
  readDetailCache: (id: string) => Promise<TeamDetail | null>;
  writeDetailCache: (id: string, detail: TeamDetail) => Promise<void>;
}

export interface TeamDetailService {
  getTeamDetail: (id: string) => Promise<TeamDetail | null>;
}

export function createTeamDetailService(
  deps: TeamDetailServiceDeps,
): TeamDetailService {
  const inFlight = new Map<string, Promise<TeamDetail | null>>();

  async function build(id: string): Promise<TeamDetail | null> {
    const cached = await deps.readDetailCache(id);
    if (cached) return cached;

    const { teams } = await deps.getTeams();
    const team = teams.find((t) => t.id === id);
    if (!team) return null;

    const paste = await deps.fetchPokepaste(team.pokepasteUrl);
    const sets = parsePaste(paste);

    const wanted = [...new Set(sets.map((s) => s.species))];
    const spriteCache = await deps.readSpriteCache();
    const missing = wanted.filter((s) => !spriteCache.has(s));
    const fresh =
      missing.length > 0
        ? await deps.resolveSprites(missing)
        : new Map<string, ResolvedSprite>();
    const merged = new Map([...spriteCache, ...fresh]);
    if (missing.length > 0) await deps.writeSpriteCache(merged);

    const detail = assembleTeamDetail(id, sets, merged);
    await deps.writeDetailCache(id, detail);
    return detail;
  }

  return {
    getTeamDetail(id) {
      const existing = inFlight.get(id);
      if (existing) return existing;
      const promise = build(id).finally(() => inFlight.delete(id));
      inFlight.set(id, promise);
      return promise;
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/server test ingest/detail`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ingest/detail.ts packages/server/src/ingest/detail.test.ts packages/server/src/ingest/detail.test-helpers.ts
git commit -m "feat(server): lazy single-flight team-detail orchestrator"
```

---

### Task 7: Rota `GET /api/teams/:id/detail`

**Files:**
- Modify: `packages/server/src/http/app.ts`
- Modify: `packages/server/src/http/app.test.ts` (append)

**Interfaces:**
- Consumes: `getTeamDetail` (Task 6), `TeamDetailSchema` (Task 1).
- Produces: `AppDeps` ganha `getTeamDetail: (id: string) => Promise<TeamDetail | null>`. Rota: 200 `TeamDetail`; 404 se `null`; 503 se lançar. Param `id` validado por regex `^[A-Za-z0-9_-]+$`.

- [ ] **Step 1: Escrever o teste que falha**

Append em `packages/server/src/http/app.test.ts` (reaproveitar o helper de build do arquivo; passar também `getTeamDetail`):

```ts
import { TeamDetailSchema } from "@pokemon-champions/shared";

const sampleDetail = {
  id: "MB1",
  pokemon: [
    { species: "Pikachu", spriteUrl: "x", item: null, ability: null, nature: null, teraType: null, evs: {}, ivs: {}, moves: [] },
  ],
};

describe("GET /api/teams/:id/detail", () => {
  it("200 com o detalhe", async () => {
    const app = buildApp({
      getTeams: async () => makeTeamsResponse(),
      getTeamDetail: async () => sampleDetail,
    });
    const res = await app.inject({ method: "GET", url: "/api/teams/MB1/detail" });
    expect(res.statusCode).toBe(200);
    expect(TeamDetailSchema.parse(res.json()).id).toBe("MB1");
  });

  it("404 quando o serviço devolve null", async () => {
    const app = buildApp({
      getTeams: async () => makeTeamsResponse(),
      getTeamDetail: async () => null,
    });
    const res = await app.inject({ method: "GET", url: "/api/teams/NOPE/detail" });
    expect(res.statusCode).toBe(404);
  });

  it("503 quando o serviço lança", async () => {
    const app = buildApp({
      getTeams: async () => makeTeamsResponse(),
      getTeamDetail: async () => {
        throw new Error("pokepaste down");
      },
    });
    const res = await app.inject({ method: "GET", url: "/api/teams/MB1/detail" });
    expect(res.statusCode).toBe(503);
  });
});
```

(Se `app.test.ts` ainda não importa `makeTeamsResponse`, importar de `../test-helpers` correspondente ou inline um `TeamsResponse` mínimo — seguir o que o arquivo já usa para `getTeams`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/server test http/app`
Expected: FAIL — tipo `AppDeps` não tem `getTeamDetail` / rota inexistente.

- [ ] **Step 3: Implementar a rota**

Em `packages/server/src/http/app.ts`:

Adicionar import:
```ts
import {
  TeamsResponseSchema,
  TeamDetailSchema,
  type TeamsResponse,
  type TeamDetail,
} from "@pokemon-champions/shared";
```

Estender `AppDeps`:
```ts
export interface AppDeps {
  getTeams: () => Promise<TeamsResponse>;
  getTeamDetail: (id: string) => Promise<TeamDetail | null>;
}
```

Adicionar a rota (depois da rota `/api/teams`, antes de `return app;`):
```ts
  api.route({
    method: "GET",
    url: "/api/teams/:id/detail",
    schema: {
      params: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/) }),
      response: {
        200: TeamDetailSchema,
        404: z.object({ error: z.string() }),
        503: z.object({ error: z.string() }),
      },
    },
    // Thin handler: ask the detail service; null -> 404, throw -> 503.
    handler: async (req, reply) => {
      try {
        const detail = await deps.getTeamDetail(req.params.id);
        if (!detail) return reply.code(404).send({ error: "team not found" });
        return detail;
      } catch (err) {
        app.log.error(err);
        return reply.code(503).send({ error: "team detail temporarily unavailable" });
      }
    },
  });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/server test http/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http/app.ts packages/server/src/http/app.test.ts
git commit -m "feat(server): GET /api/teams/:id/detail route"
```

---

### Task 8: Composition root — ligar o serviço de detalhe em `index.ts`

**Files:**
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `createTeamDetailService` (Task 6), `fetchPokepaste` (Task 4), `readDetailCache`/`writeDetailCache` (Task 5), `service.getTeams` (existente).
- Produces: injeta `getTeamDetail` no `buildApp`. Sem teste unitário (composition root puro; verificado por build + curl na Task 13).

- [ ] **Step 1: Editar o composition root**

Em `packages/server/src/index.ts`:

Adicionar imports:
```ts
import { createTeamDetailService } from "./ingest/detail.js";
import { fetchPokepaste } from "./ingest/pokepaste.js";
import { readDetailCache, writeDetailCache } from "./cache/detail.js";
```

Adicionar env (junto dos outros, só na borda):
```ts
const detailCacheDir = process.env.DETAIL_CACHE_DIR ?? "data/cache/details";
```

Depois de `const service = createTeamsService({...})`, criar o serviço de detalhe:
```ts
const detailService = createTeamDetailService({
  getTeams: service.getTeams,
  fetchPokepaste: (url) => fetchPokepaste(url),
  resolveSprites: (species) => resolveSprites(species, { baseUrl: pokeApiBaseUrl, logger }),
  readSpriteCache: () => readSpriteCache(spriteCachePath),
  writeSpriteCache: (sprites) => writeSpriteCache(spriteCachePath, sprites),
  readDetailCache: (id) => readDetailCache(detailCacheDir, id),
  writeDetailCache: (id, detail) => writeDetailCache(detailCacheDir, id, detail),
});
```

Atualizar a injeção do app:
```ts
const app = buildApp({
  getTeams: service.getTeams,
  getTeamDetail: detailService.getTeamDetail,
});
```

- [ ] **Step 2: Verificar build + typecheck**

Run: `pnpm --filter @pokemon-champions/server typecheck && pnpm --filter @pokemon-champions/server build`
Expected: ambos sem erro.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): wire team-detail service into composition root"
```

---

### Task 9: `web` — `fetchTeamDetail` no client

**Files:**
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/src/api/client.test.ts` (append)

**Interfaces:**
- Consumes: `TeamDetailSchema`/`TeamDetail` (Task 1).
- Produces: `fetchTeamDetail(id: string): Promise<TeamDetail>` — revalida com `TeamDetailSchema`; lança em `!res.ok`.

- [ ] **Step 1: Escrever o teste que falha**

Append em `packages/web/src/api/client.test.ts` (seguir o padrão de mock de `fetch` do arquivo):

```ts
import { fetchTeamDetail } from "./client.js";

describe("fetchTeamDetail", () => {
  const detail = {
    id: "MB1",
    pokemon: [
      { species: "Pikachu", spriteUrl: "x", item: null, ability: null, nature: null, teraType: null, evs: {}, ivs: {}, moves: [] },
    ],
  };

  it("busca e revalida o detalhe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => detail }));
    expect(await fetchTeamDetail("MB1")).toEqual(detail);
  });

  it("lança em resposta não-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchTeamDetail("MB1")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/web test client`
Expected: FAIL — `fetchTeamDetail` não existe.

- [ ] **Step 3: Implementar**

Append em `packages/web/src/api/client.ts` (e adicionar `TeamDetailSchema`/`TeamDetail` ao import existente do shared):

```ts
export async function fetchTeamDetail(id: string): Promise<TeamDetail> {
  const res = await fetch(`/api/teams/${encodeURIComponent(id)}/detail`);
  if (!res.ok) {
    throw new Error(`Failed to fetch team detail: HTTP ${res.status}`);
  }
  const json: unknown = await res.json();
  return TeamDetailSchema.parse(json);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/web test client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/api/client.test.ts
git commit -m "feat(web): fetchTeamDetail client with schema revalidation"
```

---

### Task 10: `web` — `PokemonDetailCard` + factory de teste

**Files:**
- Modify: `packages/web/src/test/factories.ts` (append `makeDetailedPokemon`, `makeTeamDetail`)
- Create: `packages/web/src/components/PokemonDetailCard.tsx`
- Create: `packages/web/src/components/PokemonDetailCard.test.tsx`

**Interfaces:**
- Consumes: `DetailedPokemonSet` (Task 1), `PokemonSprite` (existente).
- Produces: `<PokemonDetailCard set={DetailedPokemonSet} />`. Mostra sprite + nome + item/ability/nature/Tera/EVs/moves; **omite** campos null/vazios; formata EVs só com stats `> 0` como `"252 HP / 4 Atk / 252 SpD"`.

- [ ] **Step 1: Factories de teste**

Append em `packages/web/src/test/factories.ts`:

```ts
import type { DetailedPokemonSet, TeamDetail } from "@pokemon-champions/shared";

export function makeDetailedPokemon(
  overrides: Partial<DetailedPokemonSet> = {},
): DetailedPokemonSet {
  return {
    species: "Incineroar",
    spriteUrl: "https://img/incineroar.png",
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

export function makeTeamDetail(overrides: Partial<TeamDetail> = {}): TeamDetail {
  return {
    id: "MB1",
    pokemon: [makeDetailedPokemon()],
    ...overrides,
  };
}
```

- [ ] **Step 2: Escrever o teste que falha**

Create `packages/web/src/components/PokemonDetailCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PokemonDetailCard } from "./PokemonDetailCard.js";
import { makeDetailedPokemon } from "../test/factories.js";

describe("PokemonDetailCard", () => {
  it("mostra os campos de configuração", () => {
    render(<PokemonDetailCard set={makeDetailedPokemon()} />);
    expect(screen.getByText("Incineroar")).toBeInTheDocument();
    expect(screen.getByText(/Assault Vest/)).toBeInTheDocument();
    expect(screen.getByText(/Intimidate/)).toBeInTheDocument();
    expect(screen.getByText("252 HP / 4 Atk / 252 SpD")).toBeInTheDocument();
    expect(screen.getByText(/Fake Out/)).toBeInTheDocument();
  });

  it("omite campos ausentes (nunca mostra 'null')", () => {
    const { container } = render(
      <PokemonDetailCard
        set={makeDetailedPokemon({ item: null, teraType: null, nature: null, evs: {} })}
      />,
    );
    expect(container.textContent).not.toContain("null");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/web test PokemonDetailCard`
Expected: FAIL — componente não existe.

- [ ] **Step 4: Implementar o componente**

Create `packages/web/src/components/PokemonDetailCard.tsx`:

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

/** "252 HP / 4 Atk / 252 SpD" — only stats with a positive value. */
function formatStats(stats: Record<string, number>): string {
  return STAT_ORDER.filter((s) => (stats[s] ?? 0) > 0)
    .map((s) => `${stats[s]} ${STAT_LABEL[s]}`)
    .join(" / ");
}

/**
 * One Pokémon's full config in the detail modal. Presentational only. Optional
 * fields (item/ability/nature/Tera/EVs) are omitted when missing so the UI never
 * shows "null". Sprite reuses PokemonSprite (our resolved URL).
 */
export function PokemonDetailCard({ set }: { set: DetailedPokemonSet }): JSX.Element {
  const evs = formatStats(set.evs);

  return (
    <article className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <PokemonSprite species={set.species} spriteUrl={set.spriteUrl} />
      <div className="flex flex-col gap-0.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{set.species}</span>
          {set.teraType && (
            <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-medium text-fuchsia-800">
              Tera {set.teraType}
            </span>
          )}
        </div>
        {set.item && <span className="text-slate-600">@ {set.item}</span>}
        {set.ability && <span className="text-slate-600">{set.ability}</span>}
        {set.nature && <span className="text-slate-600">{set.nature} Nature</span>}
        {evs && <span className="text-slate-500">{evs}</span>}
        {set.moves.length > 0 && (
          <span className="text-sky-800">{set.moves.join(" · ")}</span>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/web test PokemonDetailCard`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/PokemonDetailCard.tsx packages/web/src/components/PokemonDetailCard.test.tsx packages/web/src/test/factories.ts
git commit -m "feat(web): PokemonDetailCard presentational component"
```

---

### Task 11: `web` — `TeamDetailModal`

**Files:**
- Create: `packages/web/src/components/TeamDetailModal.tsx`
- Create: `packages/web/src/components/TeamDetailModal.test.tsx`

**Interfaces:**
- Consumes: `TeamDetail` (Task 1), `PokemonDetailCard` (Task 10).
- Produces: `<TeamDetailModal status detail onClose onRetry />` onde `status: "loading"|"error"|"ready"`, `detail: TeamDetail | null`. Grade 2×3 dos `PokemonDetailCard`. Fecha no Esc e no clique no backdrop. Loading/erro(+retry).

- [ ] **Step 1: Escrever o teste que falha**

Create `packages/web/src/components/TeamDetailModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamDetailModal } from "./TeamDetailModal.js";
import { makeTeamDetail, makeDetailedPokemon } from "../test/factories.js";

describe("TeamDetailModal", () => {
  it("ready: renderiza um card por Pokémon", () => {
    const detail = makeTeamDetail({
      pokemon: [makeDetailedPokemon(), makeDetailedPokemon({ species: "Flutter Mane" })],
    });
    render(<TeamDetailModal status="ready" detail={detail} onClose={() => {}} onRetry={() => {}} />);
    expect(screen.getByText("Incineroar")).toBeInTheDocument();
    expect(screen.getByText("Flutter Mane")).toBeInTheDocument();
  });

  it("loading: mostra estado de carregamento", () => {
    render(<TeamDetailModal status="loading" detail={null} onClose={() => {}} onRetry={() => {}} />);
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it("error: mostra erro e botão de retry", () => {
    const onRetry = vi.fn();
    render(<TeamDetailModal status="error" detail={null} onClose={() => {}} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("fecha no Esc", () => {
    const onClose = vi.fn();
    render(<TeamDetailModal status="ready" detail={makeTeamDetail()} onClose={onClose} onRetry={() => {}} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("fecha no clique do backdrop", () => {
    const onClose = vi.fn();
    render(<TeamDetailModal status="ready" detail={makeTeamDetail()} onClose={onClose} onRetry={() => {}} />);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/web test TeamDetailModal`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar o modal**

Create `packages/web/src/components/TeamDetailModal.tsx`:

```tsx
import { useEffect, type JSX } from "react";
import type { TeamDetail } from "@pokemon-champions/shared";
import { PokemonDetailCard } from "./PokemonDetailCard.js";

type Status = "loading" | "error" | "ready";

/**
 * Overlay showing a team's full config as a 2x3 grid of PokemonDetailCard.
 * Presentational + a small Esc/backdrop close affordance. Data (detail/status)
 * comes from the parent; this never fetches.
 */
export function TeamDetailModal({
  status,
  detail,
  onClose,
  onRetry,
}: {
  status: Status;
  detail: TeamDetail | null;
  onClose: () => void;
  onRetry: () => void;
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-testid="modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-xl bg-slate-50 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Detalhe do time</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded px-2 py-1 text-slate-500 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        {status === "loading" && <p className="text-slate-500">Carregando detalhe…</p>}

        {status === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-slate-700">Não foi possível carregar o detalhe.</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {status === "ready" && detail && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {detail.pokemon.map((set, i) => (
              <li key={`${set.species}-${i}`}>
                <PokemonDetailCard set={set} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @pokemon-champions/web test TeamDetailModal`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/TeamDetailModal.tsx packages/web/src/components/TeamDetailModal.test.tsx
git commit -m "feat(web): TeamDetailModal with 2x3 grid, Esc/backdrop close"
```

---

### Task 12: `web` — ligar tudo: `TeamCard` clicável + estado do modal no `App`

**Files:**
- Modify: `packages/web/src/components/TeamCard.tsx` (prop `onOpenDetail`)
- Modify: `packages/web/src/components/TeamCard.test.tsx` (append)
- Modify: `packages/web/src/App.tsx` (estado do modal + fetch)
- Modify: `packages/web/src/App.test.tsx` (append)

**Interfaces:**
- Consumes: `fetchTeamDetail` (Task 9), `TeamDetailModal` (Task 11), `TeamDetail` (Task 1).
- Produces: `TeamCard` recebe `onOpenDetail: (id: string) => void` e o chama ao clicar no card (o link "ver paste →" mantém `stopPropagation`). `App` gerencia `selectedTeamId` + `detailStatus` + `detail` e renderiza o modal.

- [ ] **Step 1: Teste do TeamCard clicável (falha)**

Append em `packages/web/src/components/TeamCard.test.tsx`:

```tsx
it("chama onOpenDetail com o id ao clicar no card", () => {
  const onOpenDetail = vi.fn();
  render(<TeamCard team={makeTeam({ id: "MB7" })} onOpenDetail={onOpenDetail} />);
  fireEvent.click(screen.getByRole("button", { name: /sun offense/i }));
  expect(onOpenDetail).toHaveBeenCalledWith("MB7");
});

it("o link 'ver paste' não dispara onOpenDetail", () => {
  const onOpenDetail = vi.fn();
  render(<TeamCard team={makeTeam()} onOpenDetail={onOpenDetail} />);
  fireEvent.click(screen.getByRole("link", { name: /ver paste/i }));
  expect(onOpenDetail).not.toHaveBeenCalled();
});
```

(Garantir imports de `vi`, `fireEvent`, `makeTeam` no arquivo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @pokemon-champions/web test TeamCard`
Expected: FAIL — `onOpenDetail` não existe / card não é botão.

- [ ] **Step 3: Tornar o TeamCard clicável**

Em `packages/web/src/components/TeamCard.tsx`:

Assinatura:
```tsx
export function TeamCard({
  team,
  onOpenDetail,
}: {
  team: Team;
  onOpenDetail: (id: string) => void;
}): JSX.Element {
```

Envolver o conteúdo clicável: transformar o `<article>` para acionar o detalhe. Tornar o cabeçalho/grid um `<button>` acessível que ocupa o card, mantendo o `<a>` fora dele. Implementação mínima: adicionar ao `<article>` um `role`/handler **não** é acessível; em vez disso, embrulhar o título numa `<button>` que cobre a área:

```tsx
  return (
    <article className="relative flex h-full flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpenDetail(team.id)}
        className="absolute inset-0 z-0 rounded-lg"
        aria-label={team.name}
      />
      <header className="pointer-events-none relative z-10 flex flex-col gap-1">
        {/* ...conteúdo do header inalterado... */}
      </header>

      <ul className="pointer-events-none relative z-10 grid grid-cols-3 gap-2">
        {/* ...sprites inalterados... */}
      </ul>

      <a
        href={team.pokepasteUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 mt-auto text-sm text-sky-600 hover:underline"
      >
        ver paste →
      </a>
    </article>
  );
```

(O `<button>` absoluto captura o clique do card; `header`/`ul` ficam `pointer-events-none` para o clique cair no botão; o `<a>` tem `z-10` + `stopPropagation` e permanece clicável.)

- [ ] **Step 4: Rodar e ver passar (TeamCard)**

Run: `pnpm --filter @pokemon-champions/web test TeamCard`
Expected: PASS.

- [ ] **Step 5: Teste do App com modal (falha)**

Append em `packages/web/src/App.test.tsx` (seguir o mock de `fetch`/`fetchTeams` já usado):

```tsx
it("abre o modal e carrega o detalhe ao clicar num time", async () => {
  const detail = {
    id: "MB1",
    pokemon: [
      { species: "Incineroar", spriteUrl: "x", item: "Assault Vest", ability: "Intimidate", nature: "Careful", teraType: "Grass", evs: { hp: 252 }, ivs: {}, moves: ["Fake Out"] },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/detail")
        ? Promise.resolve({ ok: true, json: async () => detail })
        : Promise.resolve({ ok: true, json: async () => makeTeamsResponse({ teams: [makeTeam({ id: "MB1" })] }) }),
    ),
  );

  render(<App />);
  const card = await screen.findByRole("button", { name: /sun offense/i });
  fireEvent.click(card);
  expect(await screen.findByText("Incineroar")).toBeInTheDocument();
});
```

- [ ] **Step 6: Rodar e ver falhar (App)**

Run: `pnpm --filter @pokemon-champions/web test App`
Expected: FAIL — App não abre modal.

- [ ] **Step 7: Estado do modal no App**

Em `packages/web/src/App.tsx`:

Imports:
```ts
import { fetchTeams, fetchTeamDetail } from "./api/client.js";
import { TeamDetailModal } from "./components/TeamDetailModal.js";
import type { Team, TeamDetail } from "@pokemon-champions/shared";
```

Adicionar estado e loader do detalhe dentro de `App`:
```ts
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<Status>("loading");

  const openDetail = useCallback((id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailStatus("loading");
    fetchTeamDetail(id)
      .then((d) => {
        setDetail(d);
        setDetailStatus("ready");
      })
      .catch((err: unknown) => {
        console.error("Failed to load team detail", err);
        setDetailStatus("error");
      });
  }, []);

  const closeDetail = useCallback(() => setSelectedId(null), []);
```

Passar `onOpenDetail={openDetail}` ao `TeamGrid` (que repassa ao `TeamCard`) e renderizar o modal quando `selectedId`:
```tsx
      {selectedId && (
        <TeamDetailModal
          status={detailStatus}
          detail={detail}
          onClose={closeDetail}
          onRetry={() => openDetail(selectedId)}
        />
      )}
```

Atualizar `TeamGrid` (`packages/web/src/components/TeamGrid.tsx`) para aceitar e repassar `onOpenDetail: (id: string) => void` ao `TeamCard`. Ajustar `TeamGrid.test.tsx` se ele renderiza `TeamCard` diretamente (passar um `onOpenDetail={() => {}}`).

- [ ] **Step 8: Rodar a suíte web inteira**

Run: `pnpm --filter @pokemon-champions/web test`
Expected: PASS (incluindo App, TeamGrid, TeamCard, modal, client).

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/App.test.tsx packages/web/src/components/TeamCard.tsx packages/web/src/components/TeamCard.test.tsx packages/web/src/components/TeamGrid.tsx packages/web/src/components/TeamGrid.test.tsx
git commit -m "feat(web): open team-detail modal from a team card"
```

---

### Task 13: Verificação ponta-a-ponta (CI verde + caminho real)

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte completa + qualidade**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: tudo verde.

- [ ] **Step 2: Exercitar o endpoint de verdade**

Com `pnpm dev` rodando, pegar um id real e bater no endpoint:

```bash
ID=$(curl -s http://localhost:3000/api/teams | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).teams[0].id))")
curl -s "http://localhost:3000/api/teams/$ID/detail" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('pokemon:',j.pokemon.length);console.log('primeiro:',j.pokemon[0].species, j.pokemon[0].item, j.pokemon[0].moves);})"
```
Expected: 6 Pokémon, com item/moves preenchidos; segunda chamada vem do cache (mais rápida; arquivo em `data/cache/details/<id>.json`).

- [ ] **Step 3: Exercitar no navegador**

Abrir http://localhost:5173/, clicar num card → modal abre, mostra os 6 Pokémon com config; sprites são os nossos (não quebrados); fecha no ✕, Esc e backdrop; "ver paste →" continua abrindo o pokepaste externo.

- [ ] **Step 4: Atualizar a memória do projeto**

Atualizar `walking-skeleton-next-slice.md`: marcar "Detalhe do time" como concluída; próxima fatia restante = "Busca por Pokémon".

---

## Self-Review (preenchido)

**1. Spec coverage:** contrato (T1), parser `@pkmn/sets` (T2), join+sprite (T3), fetch pokepaste (T4), cache disco (T5), orquestrador lazy/single-flight + reuso de sprite (T6), rota 200/404/503 (T7), wiring (T8), client revalidado (T9), `PokemonDetailCard` (T10), modal 2×3 + Esc/backdrop (T11), card clicável + estado (T12), degradação graciosa coberta em T2/T3/T4/T5/T7/T11, verificação E2E (T13). Sem lacunas.

**2. Placeholder scan:** sem TODO/TBD; todo passo de código traz o código.

**3. Type consistency:** `ParsedSet = Omit<DetailedPokemonSet,"spriteUrl">` usado igual em T2/T3/T6; `getTeamDetail(id) => Promise<TeamDetail|null>` igual em T6/T7/T8; `fetchTeamDetail` igual em T9/T12; `onOpenDetail:(id)=>void` igual em T12 (TeamCard/TeamGrid/App).

## Notas de risco

- **Forma exata do retorno do `@pkmn/sets`** (ex.: `nature` com/sem sufixo, `evs` parcial vs tabela completa): T2/Step 5 instrui ajustar a expectativa do teste ao retorno real — o mapeamento (`pickStats`, `asNullableString`) já tolera ambos.
- **Path traversal no `:id`**: mitigado pela regex `^[A-Za-z0-9_-]+$` na borda (T7).
- **`pnpm-lock.yaml`** muda na T2 (nova dep): incluído no commit.
