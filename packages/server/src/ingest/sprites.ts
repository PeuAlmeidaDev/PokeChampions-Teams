/**
 * Resolves Showdown species names to PokeAPI sprites. Shell (network I/O),
 * cache-agnostic: the orchestrator handles the disk cache. Good API citizen —
 * dedupes, caps concurrency with p-limit, retries ONLY 5xx/network with backoff
 * and NEVER a 404 (a 404 is a mapping bug, logged). A species whose candidates
 * all miss is omitted; assemble fills the placeholder (graceful degradation).
 */

import pLimit from "p-limit";
import { z } from "zod";
import { spriteCandidates } from "../domain/names.js";
import type { ResolvedSprite } from "../domain/assemble.js";
import type { FetchLike } from "./sheet.js";

const PokeApiSchema = z.object({
  id: z.number().int(),
  sprites: z.object({ front_default: z.string().nullable() }),
});

export interface ResolveSpritesOptions {
  baseUrl: string;
  fetchImpl?: FetchLike;
  concurrency?: number;
  logger?: { warn: (msg: string) => void };
}

const MAX_5XX_RETRIES = 2;
const backoff = (attempt: number) =>
  new Promise((r) => setTimeout(r, 200 * 2 ** attempt));

/** Fetch one candidate slug. Returns the resolved sprite, or null on a miss
 * (404 / 200-without-sprite / 5xx after retries). Never throws. */
async function tryCandidate(
  slug: string,
  opts: { baseUrl: string },
  fetchImpl: FetchLike,
): Promise<ResolvedSprite | null> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(`${opts.baseUrl}/pokemon/${slug}`);
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
    const parsed = PokeApiSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.sprites.front_default === null) return null;
    return { spriteUrl: parsed.data.sprites.front_default, dexId: parsed.data.id };
  }
}

export async function resolveSprites(
  species: string[],
  opts: ResolveSpritesOptions,
): Promise<Map<string, ResolvedSprite>> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const logger = opts.logger ?? console;
  const limit = pLimit(opts.concurrency ?? 10);
  const unique = [...new Set(species)];
  const resolved = new Map<string, ResolvedSprite>();

  await Promise.all(
    unique.map((name) =>
      limit(async () => {
        for (const slug of spriteCandidates(name)) {
          const hit = await tryCandidate(slug, opts, fetchImpl);
          if (hit) {
            resolved.set(name, hit);
            return;
          }
        }
        logger.warn(`[sprites] no PokeAPI sprite for "${name}" -- check the override table`);
      }),
    ),
  );

  return resolved;
}
