import type { Team } from "@pokemon-champions/shared";

/**
 * Pure, client-side filter: keep teams that have at least one Pokémon whose
 * species matches the query (case-insensitive substring). Lives outside the
 * components so the matching logic is testable in isolation and the UI stays
 * presentational. An empty/whitespace query means "no filter" → all teams.
 */
export function filterTeamsByPokemon(teams: Team[], query: string): Team[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return teams;
  return teams.filter((team) =>
    team.pokemon.some((p) => p.species.toLowerCase().includes(needle)),
  );
}
