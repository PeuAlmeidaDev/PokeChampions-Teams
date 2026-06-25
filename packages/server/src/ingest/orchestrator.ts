/**
 * The ingest conductor. Lazy + single-flight: the first request triggers the
 * pipeline (sheet → parse → resolve sprites, skipping the disk cache → assemble),
 * concurrent callers share the in-flight promise, and the assembled result is
 * held in memory. On failure the promise is cleared so the next call retries —
 * the route turns a rejection into a 503 and the source can recover on its own.
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
  logger?: { warn: (msg: string) => void };
}

export interface TeamsService {
  getTeams: () => Promise<TeamsResponse>;
}

export function createTeamsService(deps: TeamsServiceDeps): TeamsService {
  const logger = deps.logger ?? console;
  let cached: TeamsResponse | null = null;
  let inFlight: Promise<TeamsResponse> | null = null;

  async function ingest(): Promise<TeamsResponse> {
    const csv = await deps.fetchSheetCsv();
    const raw = parseTeamsCsv(csv);

    if (raw.length < CANARY_MIN_TEAMS) {
      logger.warn(
        `[ingest] parsed team count ${raw.length} is below ${CANARY_MIN_TEAMS} — sheet layout may have changed`,
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

  return {
    getTeams() {
      if (cached) return Promise.resolve(cached);
      if (inFlight) return inFlight;
      inFlight = ingest()
        .then((result) => {
          cached = result;
          return result;
        })
        .finally(() => {
          inFlight = null; // clear whether it resolved or rejected; success kept in `cached`
        });
      return inFlight;
    },
  };
}
