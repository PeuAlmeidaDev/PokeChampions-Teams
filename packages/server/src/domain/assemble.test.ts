import { describe, expect, it } from "vitest";
import { assembleTeams } from "./assemble.js";
import type { RawTeam } from "./csv.js";

describe("assembleTeams", () => {
  it("promotes a RawTeam to a Team, nulling the data we don't have yet", () => {
    // The first slice only knows id / name / pokepaste from the sheet. Sprites,
    // owner and tournament metadata arrive in later slices: until then the
    // contract is honoured with explicit null / empty, never invented data.
    const raw: RawTeam[] = [
      {
        id: "MB1",
        name: "Sun Offense",
        ownerName: null,
        ownerHandle: null,
        tournament: null,
        rank: null,
        pokepasteUrl: "https://pokepast.es/abc",
        species: [],
      },
    ];

    const teams = assembleTeams(raw);

    expect(teams).toEqual([
      {
        id: "MB1",
        name: "Sun Offense",
        ownerName: null,
        ownerHandle: null,
        tournament: null,
        rank: null,
        pokepasteUrl: "https://pokepast.es/abc",
        pokemon: [],
      },
    ]);
  });

  it("returns an empty list for no teams", () => {
    expect(assembleTeams([])).toEqual([]);
  });
});
