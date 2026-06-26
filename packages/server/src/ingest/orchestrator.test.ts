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
