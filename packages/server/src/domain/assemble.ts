/**
 * Promotes the sheet-only `RawTeam` into the shared `Team` contract by joining
 * each species with its resolved sprite. Pure: no I/O, no clock — same input,
 * same output (server/CLAUDE.md). A species with no resolved sprite degrades to
 * an explicit placeholder rather than crashing the response.
 */

import type { Team } from "@pokemon-champions/shared";
import type { RawTeam } from "./csv.js";

/** A sprite resolved (or not) for a single species. */
export interface ResolvedSprite {
  spriteUrl: string;
  dexId: number | null;
}

/** Sentinel sprite URL for species we could not map. The web maps it to a local asset. */
export const PLACEHOLDER_SPRITE_URL = "/placeholder-sprite.png";

export function assembleTeams(
  raw: RawTeam[],
  sprites: Map<string, ResolvedSprite>,
): Team[] {
  return raw.map((team) => ({
    id: team.id,
    name: team.name,
    ownerName: team.ownerName,
    ownerHandle: team.ownerHandle,
    tournament: team.tournament,
    rank: team.rank,
    pokepasteUrl: team.pokepasteUrl,
    pokemon: team.species.map((species) => {
      const resolved = sprites.get(species);
      return {
        species,
        spriteUrl: resolved?.spriteUrl ?? PLACEHOLDER_SPRITE_URL,
        dexId: resolved?.dexId ?? null,
      };
    }),
  }));
}
