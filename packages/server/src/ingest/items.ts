/**
 * Resolves held-item names to PokeAPI item-sprite URLs. Shell (network I/O),
 * cache-agnostic: the conductor handles the disk cache. Mirrors resolveSprites
 * — dedupes, caps concurrency with p-limit, retries ONLY 5xx/network with
 * backoff and NEVER a 404 (a 404 is a mapping bug, logged). An item that misses
 * is omitted; assemble leaves itemSpriteUrl null (graceful degradation).
 */

import pLimit from "p-limit";
import { z } from "zod";
import { itemSlug } from "../domain/names.js";
import type { FetchLike } from "./sheet.js";

const ItemSchema = z.object({
  sprites: z.object({ default: z.string().nullable() }),
});

export interface ResolveItemSpritesOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
  concurrency?: number;
  logger?: { warn: (msg: string) => void };
}

const MAX_5XX_RETRIES = 2;
const backoff = (attempt: number) =>
  new Promise((r) => setTimeout(r, 200 * 2 ** attempt));

/** Fetch one item slug. Returns the sprite URL, or null on a miss
 * (404 / 200-without-sprite / 5xx after retries). Never throws. */
async function tryItem(
  slug: string,
  opts: { baseUrl: string },
  fetchImpl: FetchLike,
): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(`${opts.baseUrl}/item/${slug}`);
    } catch {
      if (attempt < MAX_5XX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      return null; // network failure after retries
    }
    if (res.status === 404) return null; // mapping miss — never retry
    if (res.status >= 500) {
      if (attempt < MAX_5XX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      return null;
    }
    if (!res.ok) return null;
    const parsed = ItemSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.sprites.default === null) return null;
    return parsed.data.sprites.default;
  }
}

export async function resolveItemSprites(
  items: string[],
  opts: ResolveItemSpritesOptions,
): Promise<Map<string, string>> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const logger = opts.logger ?? console;
  const limit = pLimit(opts.concurrency ?? 10);
  const unique = [...new Set(items)];
  const resolved = new Map<string, string>();

  await Promise.all(
    unique.map((name) =>
      limit(async () => {
        const hit = await tryItem(itemSlug(name), opts, fetchImpl);
        if (hit) {
          resolved.set(name, hit);
          return;
        }
        logger.warn(`[items] no PokeAPI sprite for "${name}" -- check the item slug/override`);
      }),
    ),
  );

  return resolved;
}
