import { describe, expect, it } from "vitest";
import { parseTeamsCsv } from "./csv.js";

describe("parseTeamsCsv", () => {
  it("parses a single team row into id, name and pokepaste url", () => {
    // Columns are located by header name, never by fixed position: the real
    // sheet shuffles columns around (see CLAUDE.md hurdle #3).
    const csv = [
      "Team ID,Team Description,Pokepaste",
      "MB1,Sun Offense,https://pokepast.es/abc",
    ].join("\n");

    const teams = parseTeamsCsv(csv);

    expect(teams).toEqual([
      { id: "MB1", name: "Sun Offense", pokepasteUrl: "https://pokepast.es/abc" },
    ]);
  });
});
