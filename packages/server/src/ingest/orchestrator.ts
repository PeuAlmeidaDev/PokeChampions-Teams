/**
 * The ingest conductor. Lazy + single-flight + hard TTL: the first request
 * triggers the pipeline (sheet → parse → resolve sprites, skipping the disk
 * cache → assemble), concurrent callers share the in-flight promise, and the
 * assembled result is held in memory with a timestamp. Once the cache is older
 * than ttlMs, the next call re-ingests inline (the caller waits) and refreshes
 * it. A failed refresh serves the stale cache (logged) rather than erroring;
 * only a first-ever load with no cache propagates the failure (route → 503).
 */

import type { TeamsResponse } from "@pokemon-champions/shared";
import { parseTeamsCsv } from "../domain/csv.js";
import { assembleTeams, type ResolvedSprite } from "../domain/assemble.js";

/** Below this parsed-team count, the sheet layout has probably changed. ~200 expected. */
const CANARY_MIN_TEAMS = 150;

export interface TeamsServiceDeps {
  fetchSheetCsv: () => Promise<string>;
  resolveSprites: (species: string[]) => Promise<Map<string, ResolvedSprite>>;
  readSpriteCache: () => Promise<Map<string, ResolvedSprite>>;
  writeSpriteCache: (sprites: Map<string, ResolvedSprite>) => Promise<void>;
  /** Cache validity in ms; past this the next getTeams re-ingests. */
  ttlMs: number;
  /** Injectable clock (default Date.now) — lets tests drive expiry deterministically. */
  now?: () => number;
  logger?: { warn: (msg: string) => void };
}

export interface TeamsService {
  getTeams: () => Promise<TeamsResponse>;
}

export function createTeamsService(deps: TeamsServiceDeps): TeamsService {
  const logger = deps.logger ?? console;
  const now = deps.now ?? Date.now;
  let cached: TeamsResponse | null = null;
  let cachedAt: number | null = null;
  let inFlight: Promise<TeamsResponse> | null = null;

  async function ingest(): Promise<TeamsResponse> {
    const csv = await deps.fetchSheetCsv();
    const raw = parseTeamsCsv(csv);

    if (raw.length < CANARY_MIN_TEAMS) {
      logger.warn(
        `[ingest] parsed team count ${raw.length} is below ${CANARY_MIN_TEAMS} — sheet layout may have changed`,
      );
    }

    if (raw.length > 0 && raw.every((t) => t.species.length === 0)) {
      logger.warn(
        "[ingest] every team parsed with zero species — the species columns may have moved (check the 'Pokemon Text for Copypasta' header)",
      );
    }

    const wanted = new Set(raw.flatMap((t) => t.species));
    const cache = await deps.readSpriteCache();
    const missing = [...wanted].filter((s) => !cache.has(s));

    const fresh = missing.length > 0 ? await deps.resolveSprites(missing) : new Map<string, ResolvedSprite>();
    const merged = new Map([...cache, ...fresh]);
    await deps.writeSpriteCache(merged);

    const teams = assembleTeams(raw, merged);
    return { fetchedAt: new Date().toISOString(), teams };
  }

  function isStale(): boolean {
    return cachedAt !== null && now() - cachedAt >= deps.ttlMs;
  }

  return {
    getTeams() {
      if (cached && !isStale()) return Promise.resolve(cached);
      if (inFlight) return inFlight;
      inFlight = ingest()
        .then((result) => {
          cached = result;
          cachedAt = now();
          return result;
        })
        .catch((err: unknown) => {
          // Refresh failed: serve the stale cache rather than erroring. cachedAt
          // is left unchanged, so the next call retries. Only a first-ever load
          // with no cache propagates (route → 503).
          if (cached) {
            logger.warn(`[ingest] refresh failed, serving stale teams: ${String(err)}`);
            return cached;
          }
          throw err;
        })
        .finally(() => {
          inFlight = null; // success kept in `cached`; failure leaves stale cache in place
        });
      return inFlight;
    },
  };
}
