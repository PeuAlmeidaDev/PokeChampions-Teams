import { describe, expect, it } from "vitest";
import { TeamSchema, DetailedPokemonSetSchema, TeamDetailSchema } from "./index.js";

describe("TeamSchema", () => {
  it("parses a minimal valid team", () => {
    const team = TeamSchema.parse({
      id: "MB1",
      name: "Test Team",
      ownerName: null,
      ownerHandle: null,
      tournament: null,
      rank: null,
      pokepasteUrl: "https://pokepast.es/abc",
      pokemon: [],
    });

    expect(team.id).toBe("MB1");
    expect(team.pokemon).toEqual([]);
  });

  it("rejects a team missing required fields", () => {
    expect(() => TeamSchema.parse({ id: "MB1" })).toThrow();
  });
});

describe("DetailedPokemonSetSchema", () => {
  it("aceita um set completo", () => {
    const set = {
      species: "Incineroar",
      spriteUrl: "https://img/incineroar.png",
      item: "Assault Vest",
      ability: "Intimidate",
      nature: "Careful",
      teraType: "Grass",
      evs: { hp: 252, atk: 4, spd: 252 },
      ivs: {},
      moves: ["Fake Out", "Knock Off", "Parting Shot", "Flare Blitz"],
    };
    expect(DetailedPokemonSetSchema.parse(set)).toEqual(set);
  });

  it("aceita um set parcial (campos opcionais null/vazios)", () => {
    const set = {
      species: "Flutter Mane",
      spriteUrl: "/placeholder-sprite.png",
      item: null,
      ability: null,
      nature: null,
      teraType: null,
      evs: {},
      ivs: {},
      moves: [],
    };
    expect(() => DetailedPokemonSetSchema.parse(set)).not.toThrow();
  });
});

describe("TeamDetailSchema", () => {
  it("valida um detalhe de time", () => {
    const detail = {
      id: "MB1",
      pokemon: [
        {
          species: "Incineroar",
          spriteUrl: "x",
          item: null,
          ability: null,
          nature: null,
          teraType: null,
          evs: {},
          ivs: {},
          moves: [],
        },
      ],
    };
    expect(TeamDetailSchema.parse(detail).id).toBe("MB1");
  });
});
