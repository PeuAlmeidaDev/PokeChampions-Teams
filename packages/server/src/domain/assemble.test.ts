import { describe, expect, it } from "vitest";
import {
  assembleTeams,
  assembleTeamDetail,
  PLACEHOLDER_SPRITE_URL,
  type ResolvedSprite,
} from "./assemble.js";
import type { RawTeam } from "./csv.js";
import type { ParsedSet } from "./paste.js";

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

describe("assembleTeamDetail", () => {
  const set: ParsedSet = {
    species: "Incineroar",
    item: "Assault Vest",
    ability: "Intimidate",
    nature: "Careful",
    teraType: "Grass",
    evs: { hp: 252 },
    ivs: {},
    moves: ["Fake Out"],
  };

  it("junta o sprite resolvido por espécie", () => {
    const sprites = new Map([["Incineroar", { spriteUrl: "https://img/inc.png", dexId: 727 }]]);
    const detail = assembleTeamDetail("MB1", [set], sprites, new Map());
    expect(detail.id).toBe("MB1");
    expect(detail.pokemon[0]?.spriteUrl).toBe("https://img/inc.png");
    expect(detail.pokemon[0]?.item).toBe("Assault Vest");
  });

  it("espécie sem sprite degrada para o placeholder", () => {
    const detail = assembleTeamDetail("MB1", [set], new Map(), new Map());
    expect(detail.pokemon[0]?.spriteUrl).toBe("/placeholder-sprite.png");
  });

  it("maps each item to its resolved item-sprite url, null when absent or unmapped", () => {
    const sets: ParsedSet[] = [
      { species: "Incineroar", item: "Assault Vest", ability: null, nature: null, teraType: null, evs: {}, ivs: {}, moves: [] },
      { species: "Flutter Mane", item: "Booster Energy", ability: null, nature: null, teraType: null, evs: {}, ivs: {}, moves: [] },
      { species: "Ditto", item: null, ability: null, nature: null, teraType: null, evs: {}, ivs: {}, moves: [] },
    ];
    const itemSprites = new Map([["Assault Vest", "https://img/assault-vest.png"]]);
    const detail = assembleTeamDetail("MB1", sets, new Map(), itemSprites);

    expect(detail.pokemon[0]?.itemSpriteUrl).toBe("https://img/assault-vest.png"); // resolved
    expect(detail.pokemon[1]?.itemSpriteUrl).toBeNull(); // item present but not in the map
    expect(detail.pokemon[2]?.itemSpriteUrl).toBeNull(); // no item at all
  });
});
