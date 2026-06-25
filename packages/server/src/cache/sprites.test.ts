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
