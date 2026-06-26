import { describe, expect, it } from "vitest";
import {
  assembleTeams,
  PLACEHOLDER_SPRITE_URL,
  type ResolvedSprite,
} from "./assemble.js";
import type { RawTeam } from "./csv.js";

const team: RawTeam = {
  id: "MB1",
  name: "Sun Offense",
  ownerName: "Sun Bro",
  ownerHandle: "@sunbro",
  tournament: "Worlds 2026",
  rank: "Champion",
  pokepasteUrl: "https://pokepast.es/abc",
  species: ["Miraidon", "Floette-Eternal-Mega"],
};

describe("assembleTeams", () => {
  it("joins each species with its resolved sprite", () => {
    const sprites = new Map<string, ResolvedSprite>([
      ["Miraidon", { spriteUrl: "https://img/miraidon.png", dexId: 1008 }],
      ["Floette-Eternal-Mega", { spriteUrl: "https://img/floette.png", dexId: 670 }],
    ]);

    expect(assembleTeams([team], sprites)).toEqual([
      {
        id: "MB1",
        name: "Sun Offense",
        ownerName: "Sun Bro",
        ownerHandle: "@sunbro",
        tournament: "Worlds 2026",
        rank: "Champion",
        pokepasteUrl: "https://pokepast.es/abc",
        pokemon: [
          { species: "Miraidon", spriteUrl: "https://img/miraidon.png", dexId: 1008 },
          { species: "Floette-Eternal-Mega", spriteUrl: "https://img/floette.png", dexId: 670 },
        ],
      },
    ]);
  });

  it("falls back to a placeholder for an unresolved species (graceful degradation)", () => {
    const sprites = new Map<string, ResolvedSprite>([
      ["Miraidon", { spriteUrl: "https://img/miraidon.png", dexId: 1008 }],
    ]);

    const [result] = assembleTeams([team], sprites);

    expect(result?.pokemon[1]).toEqual({
      species: "Floette-Eternal-Mega",
      spriteUrl: PLACEHOLDER_SPRITE_URL,
      dexId: null,
    });
  });

  it("returns an empty list for no teams", () => {
    expect(assembleTeams([], new Map())).toEqual([]);
  });
});
