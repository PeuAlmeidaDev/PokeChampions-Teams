/**
 * Promotes the sheet-only `RawTeam` into the shared `Team` contract. Pure: no
 * I/O, no clock — same input, same output (server/CLAUDE.md). The fields we
 * cannot know yet (owner, tournament, sprites) are filled with explicit
 * null / empty rather than guessed; later slices replace them with real data.
 */

import type { Team } from "@pokemon-champions/shared";
import type { RawTeam } from "./csv.js";

export function assembleTeams(raw: RawTeam[]): Team[] {
  return raw.map((team) => ({
    id: team.id,
    name: team.name,
    ownerName: null,
    ownerHandle: null,
    tournament: null,
    rank: null,
    pokepasteUrl: team.pokepasteUrl,
    pokemon: [],
  }));
}
