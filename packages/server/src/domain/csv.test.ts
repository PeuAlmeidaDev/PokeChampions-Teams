import { describe, expect, it } from "vitest";
import { parseTeamsCsv } from "./csv.js";

describe("parseTeamsCsv (live sheet shape)", () => {
  it("skips banners, reads metadata and the 6 species from the copypasta block", () => {
    // Fixture mirrors the real sheet structure: 2 banner rows, then the header,
    // then data. Columns are in the same relative order as the live sheet
    // (Team ID=0, Description=1, Full Name=2, Pokepaste=3, Tournament / Event=4,
    //  Rank=5, Owner=6, Pokemon Text for Copypasta=7, blank×5=8..12).
    const csv = [
      "VGCPastes Repository,,,,,,,,,,,,,", // banner 1
      "Click here for updates,,,,,,,,,,,,,", // banner 2
      "Team ID,Team Description,Full Name,Pokepaste,Tournament / Event,Rank,Owner,Pokemon Text for Copypasta,,,,,",
      // Team Description contains a comma → MUST be quoted for RFC4180
      'MB259,"Ruler of Origin, 2nd Place",Kaito Arii,https://pokepast.es/abc,Ruler of Origin Tour,2nd,ub_slow,Metagross-Mega,Charizard,Toxapex,Grimmsnarl,Garchomp,Hydreigon',
      "", // trailing blank row → must be dropped
    ].join("\n");

    expect(parseTeamsCsv(csv)).toEqual([
      {
        id: "MB259",
        name: "Ruler of Origin, 2nd Place",
        ownerName: "Kaito Arii",
        ownerHandle: "ub_slow",
        tournament: "Ruler of Origin Tour",
        rank: "2nd",
        pokepasteUrl: "https://pokepast.es/abc",
        species: [
          "Metagross-Mega",
          "Charizard",
          "Toxapex",
          "Grimmsnarl",
          "Garchomp",
          "Hydreigon",
        ],
      },
    ]);
  });

  it("handles a quoted field containing an embedded newline", () => {
    // The "Replica Code" cell in the real sheet spans physical lines —
    // csv-parse must re-assemble the logical record across line boundaries.
    const csv = [
      "banner,,,,,,,,,,,,,",
      "banner2,,,,,,,,,,,,,",
      "Team ID,Team Description,Full Name,Pokepaste,Tournament / Event,Rank,Owner,Pokemon Text for Copypasta,,,,,",
      // \n inside the double-quoted Team Description field is an embedded newline
      'MB1,"line one\nline two",Ana,https://pokepast.es/x,Cup,1st,ana_h,Pikachu,Mimikyu,Incineroar,Rillaboom,Amoonguss,Urshifu',
    ].join("\n");

    const teams = parseTeamsCsv(csv);
    expect(teams).toHaveLength(1);
    expect(teams[0]?.name).toBe("line one\nline two");
    expect(teams[0]?.species).toHaveLength(6);
  });

  it("sets optional fields to null when their column is absent from the sheet header", () => {
    // Regression: opt() must return null (not undefined/empty) for absent columns.
    // Header deliberately omits "Owner" (ownerHandle) and "Rank" — they collapse to null.
    const csv = [
      "banner1,,,",
      "banner2,,,",
      // No "Owner" or "Rank" column
      "Team ID,Team Description,Full Name,Pokepaste,Pokemon Text for Copypasta,,,,,",
      "MB1,Arceus,Ash,https://pokepast.es/x,Pikachu,Raichu,Gengar,Mewtwo,Dragonite,Charizard",
    ].join("\n");

    const teams = parseTeamsCsv(csv);
    expect(teams).toHaveLength(1);
    // Absent columns become null
    expect(teams[0]?.ownerHandle).toBeNull();
    expect(teams[0]?.rank).toBeNull();
    // Present fields are still populated
    expect(teams[0]?.id).toBe("MB1");
    expect(teams[0]?.ownerName).toBe("Ash");
    expect(teams[0]?.species).toHaveLength(6);
  });
});
