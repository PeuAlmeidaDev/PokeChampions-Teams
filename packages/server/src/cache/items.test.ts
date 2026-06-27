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
