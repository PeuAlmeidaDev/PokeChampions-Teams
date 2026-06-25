import { describe, expect, it } from "vitest";
import { parseTeamsCsv } from "./csv.js";

describe("parseTeamsCsv", () => {
  it("locates columns by header, not position, and extracts the six species", () => {
    // Header order is deliberately shuffled: the real sheet moves columns around.
    const csv = [
      "Pokemon 1,Team Description,Owner,Pokemon 2,Team ID,Full Name,Pokepaste,Pokemon 3,Tournament,Pokemon 4,Placement,Pokemon 5,Pokemon 6",
      "Miraidon,Sun Offense,@sunbro,Flutter Mane,MB1,Sun Bro,https://pokepast.es/abc,Iron Hands,Worlds 2026,Landorus-Therian,Champion,Amoonguss,Rillaboom",
    ].join("\n");

    expect(parseTeamsCsv(csv)).toEqual([
      {
        id: "MB1",
        name: "Sun Offense",
        ownerName: "Sun Bro",
        ownerHandle: "@sunbro",
        tournament: "Worlds 2026",
        rank: "Champion",
        pokepasteUrl: "https://pokepast.es/abc",
        species: [
          "Miraidon",
          "Flutter Mane",
          "Iron Hands",
          "Landorus-Therian",
          "Amoonguss",
          "Rillaboom",
        ],
      },
    ]);
  });

  it("tolerates a partial row: missing optional fields become null, blank species are dropped", () => {
    const csv = [
      "Team ID,Team Description,Pokepaste,Pokemon 1,Pokemon 2",
      "MB2,Trick Room,https://pokepast.es/tr,Indeedee-F,",
    ].join("\n");

    expect(parseTeamsCsv(csv)).toEqual([
      {
        id: "MB2",
        name: "Trick Room",
        ownerName: null,
        ownerHandle: null,
        tournament: null,
        rank: null,
        pokepasteUrl: "https://pokepast.es/tr",
        species: ["Indeedee-F"],
      },
    ]);
  });
});
