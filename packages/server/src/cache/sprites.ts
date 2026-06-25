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

  // Wrap JSON.parse to catch malformed JSON (e.g., "not json at all")
  let parsed;
  try {
    const obj = JSON.parse(raw);
    parsed = CacheFileSchema.safeParse(obj);
  } catch {
    // Corrupt cache: log and start fresh rather than crash ingest.
    console.warn(`[sprite-cache] ignoring corrupt cache at ${path}`);
    return new Map();
  }

  if (!parsed.success) {
    // Validation failed: log and start fresh.
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
