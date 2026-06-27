import type { TeamsResponse, Team } from "@pokemon-champions/shared";

/** Minimal Team for detail tests — only id + pokepasteUrl matter here. */
export function makeRawTeamResponse(partial: Pick<Team, "id" | "pokepasteUrl">): Team {
  return {
    id: partial.id,
    name: "T",
    ownerName: null,
    ownerHandle: null,
    tournament: null,
    rank: null,
    pokepasteUrl: partial.pokepasteUrl,
    pokemon: [],
  };
}

export function makeTeamsResponse(teams: Array<Pick<Team, "id" | "pokepasteUrl">>): TeamsResponse {
  return { fetchedAt: "2026-06-26T00:00:00.000Z", teams: teams.map(makeRawTeamResponse) };
}
