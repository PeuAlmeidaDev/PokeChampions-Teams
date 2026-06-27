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
