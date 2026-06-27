import { describe, expect, it } from "vitest";
import { filterTeamsByPokemon } from "./filterTeams.js";
import { makePokemon, makeTeam } from "../test/factories.js";

const incineroar = makeTeam({
  id: "MB1",
  name: "Sun Offense",
  pokemon: [makePokemon({ species: "Incineroar" }), makePokemon({ species: "Pikachu" })],
});
const floette = makeTeam({
  id: "MB2",
  name: "Trick Room",
  pokemon: [makePokemon({ species: "Floette-Eternal-Mega" })],
});
const teams = [incineroar, floette];

describe("filterTeamsByPokemon", () => {
  it("returns all teams when the query is empty", () => {
    expect(filterTeamsByPokemon(teams, "")).toEqual(teams);
  });

  it("returns all teams when the query is only whitespace", () => {
    expect(filterTeamsByPokemon(teams, "   ")).toEqual(teams);
  });

  it("keeps only teams containing a matching Pokémon", () => {
    expect(filterTeamsByPokemon(teams, "Pikachu")).toEqual([incineroar]);
  });

  it("matches case-insensitively", () => {
    expect(filterTeamsByPokemon(teams, "incineroar")).toEqual([incineroar]);
  });

  it("matches a partial form name (substring)", () => {
    expect(filterTeamsByPokemon(teams, "floette")).toEqual([floette]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterTeamsByPokemon(teams, "  pikachu  ")).toEqual([incineroar]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterTeamsByPokemon(teams, "Charizard")).toEqual([]);
  });
});
