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
