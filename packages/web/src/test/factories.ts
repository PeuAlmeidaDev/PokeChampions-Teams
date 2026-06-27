import type { DetailedPokemonSet, PokemonSet, Team, TeamsResponse, TeamDetail } from "@pokemon-champions/shared";

/**
 * Test-only factories for the shared contract. One place to build a minimal
 * valid Team / TeamsResponse so tests don't hand-roll all fields each time —
 * when the contract grows (sprites, per-Pokémon config), only this file
 * changes, and the drift between fixtures can't happen. Each call overrides
 * just the fields the test cares about.
 */

export function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "MB1",
    name: "Sun Offense",
    ownerName: null,
    ownerHandle: null,
    tournament: null,
    rank: null,
    pokepasteUrl: "https://pokepast.es/sample",
    pokemon: [],
    ...overrides,
  };
}

export function makeTeamsResponse(
  overrides: Partial<TeamsResponse> = {},
): TeamsResponse {
  return {
    fetchedAt: "2026-06-25T01:16:53.100Z",
    teams: [makeTeam()],
    ...overrides,
  };
}

export function makePokemon(overrides: Partial<PokemonSet> = {}): PokemonSet {
  return {
    species: "Pikachu",
    spriteUrl: "https://img/pikachu.png",
    dexId: 25,
    ...overrides,
  };
}

export function makeDetailedPokemon(
  overrides: Partial<DetailedPokemonSet> = {},
): DetailedPokemonSet {
  return {
    species: "Incineroar",
    spriteUrl: "https://img/incineroar.png",
    item: "Assault Vest",
    ability: "Intimidate",
    nature: "Careful",
    teraType: "Grass",
    evs: { hp: 252, atk: 4, spd: 252 },
    ivs: {},
    moves: ["Fake Out", "Knock Off", "Parting Shot", "Flare Blitz"],
    ...overrides,
  };
}

export function makeTeamDetail(overrides: Partial<TeamDetail> = {}): TeamDetail {
  return {
    id: "MB1",
    pokemon: [makeDetailedPokemon()],
    ...overrides,
  };
}
