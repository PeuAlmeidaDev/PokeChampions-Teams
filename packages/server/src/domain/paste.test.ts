import { describe, it, expect } from "vitest";
import { parsePaste } from "./paste.js";

const FULL = `Incineroar @ Assault Vest
Ability: Intimidate
Tera Type: Grass
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Fake Out
- Knock Off
- Parting Shot
- Flare Blitz

Flutter Mane @ Booster Energy
Ability: Protosynthesis
Tera Type: Fairy
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Moonblast
- Shadow Ball
- Icy Wind
- Protect`;

describe("parsePaste", () => {
  it("parseia múltiplos sets separados por linha em branco", () => {
    const sets = parsePaste(FULL);
    expect(sets).toHaveLength(2);
  });

  it("mapeia os campos de um set completo", () => {
    const [inc] = parsePaste(FULL);
    expect(inc).toMatchObject({
      species: "Incineroar",
      item: "Assault Vest",
      ability: "Intimidate",
      nature: "Careful",
      teraType: "Grass",
      moves: ["Fake Out", "Knock Off", "Parting Shot", "Flare Blitz"],
    });
    expect(inc?.evs).toMatchObject({ hp: 252, atk: 4, spd: 252 });
  });

  it("tolera set parcial: sem item/EV/Tera vira null/{}", () => {
    const sets = parsePaste(`Amoonguss\nAbility: Regenerator\n- Spore`);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      species: "Amoonguss",
      item: null,
      teraType: null,
      evs: {},
      moves: ["Spore"],
    });
  });

  it("descarta lixo e segue com os sets válidos", () => {
    const sets = parsePaste(`\n\n   \n\nPikachu\n- Thunderbolt`);
    expect(sets).toHaveLength(1);
    expect(sets[0]?.species).toBe("Pikachu");
  });

  it("texto vazio devolve lista vazia", () => {
    expect(parsePaste("")).toEqual([]);
  });
});
