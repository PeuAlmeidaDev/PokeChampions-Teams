/**
 * Lazy, single-flight team-detail conductor — mirrors createTeamsService. On a
 * cache miss it looks the team up (by id) in the already-ingested teams, fetches
 * its pokepaste, parses it, resolves sprites REUSING the warm sprite cache (only
 * unknown species hit PokeAPI), assembles the TeamDetail and caches it on disk.
 * Concurrent calls for the same id share one in-flight promise. Returns null for
 * an unknown id (route -> 404); throws on I/O failure (route -> 503).
 */

import type { TeamDetail, TeamsResponse } from "@pokemon-champions/shared";
import type { ResolvedSprite } from "../domain/assemble.js";
import { assembleTeamDetail } from "../domain/assemble.js";
import { parsePaste } from "../domain/paste.js";

export interface TeamDetailServiceDeps {
  getTeams: () => Promise<TeamsResponse>;
  fetchPokepaste: (url: string) => Promise<string>;
  resolveSprites: (species: string[]) => Promise<Map<string, ResolvedSprite>>;
  readSpriteCache: () => Promise<Map<string, ResolvedSprite>>;
  writeSpriteCache: (sprites: Map<string, ResolvedSprite>) => Promise<void>;
  resolveItemSprites: (items: string[]) => Promise<Map<string, string>>;
  readItemCache: () => Promise<Map<string, string>>;
  writeItemCache: (items: Map<string, string>) => Promise<void>;
  readDetailCache: (id: string) => Promise<TeamDetail | null>;
  writeDetailCache: (id: string, detail: TeamDetail) => Promise<void>;
}

export interface TeamDetailService {
  getTeamDetail: (id: string) => Promise<TeamDetail | null>;
}

export function createTeamDetailService(
  deps: TeamDetailServiceDeps,
): TeamDetailService {
  const inFlight = new Map<string, Promise<TeamDetail | null>>();

  async function build(id: string): Promise<TeamDetail | null> {
    const cached = await deps.readDetailCache(id);
    if (cached) return cached;

    const { teams } = await deps.getTeams();
    const team = teams.find((t) => t.id === id);
    if (!team) return null;

    const paste = await deps.fetchPokepaste(team.pokepasteUrl);
    const sets = parsePaste(paste);

    const wanted = [...new Set(sets.map((s) => s.species))];
    const spriteCache = await deps.readSpriteCache();
    const missing = wanted.filter((s) => !spriteCache.has(s));
    const fresh =
      missing.length > 0
        ? await deps.resolveSprites(missing)
        : new Map<string, ResolvedSprite>();
    const merged = new Map([...spriteCache, ...fresh]);
    if (missing.length > 0) await deps.writeSpriteCache(merged);

    const wantedItems = [
      ...new Set(sets.map((s) => s.item).filter((i): i is string => i !== null)),
    ];
    const itemCache = await deps.readItemCache();
    const missingItems = wantedItems.filter((i) => !itemCache.has(i));
    const freshItems =
      missingItems.length > 0
        ? await deps.resolveItemSprites(missingItems)
        : new Map<string, string>();
    const mergedItems = new Map([...itemCache, ...freshItems]);
    if (missingItems.length > 0) await deps.writeItemCache(mergedItems);

    const detail = assembleTeamDetail(id, sets, merged, mergedItems);
    if (detail.pokemon.length > 0) {
      await deps.writeDetailCache(id, detail);
    }
    return detail;
  }

  return {
    getTeamDetail(id) {
      const existing = inFlight.get(id);
      if (existing) return existing;
      const promise = build(id).finally(() => inFlight.delete(id));
      inFlight.set(id, promise);
      return promise;
    },
  };
}
