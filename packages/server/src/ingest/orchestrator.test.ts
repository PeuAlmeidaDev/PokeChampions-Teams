import { describe, expect, it, vi } from "vitest";
import type { ResolvedSprite } from "../domain/assemble.js";
import { createTeamsService, type TeamsServiceDeps } from "./orchestrator.js";

// Header names must match the live sheet (new csv.ts: species under
// "Pokemon Text for Copypasta", tournament as "Tournament / Event", rank as "Rank").
const CSV = [
  "Team ID,Team Description,Pokepaste,Pokemon Text for Copypasta,",
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
    ttlMs: 1_000_000,
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

  it("warns when the parsed team count is suspiciously low", async () => {
    const logger = { warn: vi.fn() };
    const service = createTeamsService(deps({ logger }));

    await service.getTeams(); // 1 team, well under the ~200 canary

    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/team count/i));
    // Normal fixture HAS species — species canary must NOT fire
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringMatching(/species/i));
  });

  it("warns when every team parses with zero species (species column absent)", async () => {
    // CSV has a valid "Team ID" header but NO "Pokemon Text for Copypasta" column,
    // so parseTeamsCsv returns teams with species: [].
    const NO_SPECIES_CSV = [
      "Team ID,Team Description,Pokepaste",
      "MB1,Sun,https://pokepast.es/a",
    ].join("\n");
    const logger = { warn: vi.fn() };
    const service = createTeamsService(
      deps({
        fetchSheetCsv: vi.fn().mockResolvedValue(NO_SPECIES_CSV),
        logger,
      }),
    );

    await service.getTeams();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/species/i));
  });
});
