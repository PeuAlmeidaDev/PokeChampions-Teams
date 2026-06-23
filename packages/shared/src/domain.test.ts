import { describe, expect, it } from "vitest";
import { TeamSchema } from "./index.js";

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
