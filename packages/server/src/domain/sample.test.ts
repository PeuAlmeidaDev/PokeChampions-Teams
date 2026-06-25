import { describe, expect, it } from "vitest";
import { TeamSchema } from "@pokemon-champions/shared";
import { sampleTeams } from "./sample.js";

describe("sampleTeams", () => {
  it("feeds the fixed sample through the real pipeline into valid Teams", () => {
    // This is the temporary seam standing in for ingest/. The test guards the
    // one thing that can rot: that the hand-written CSV still parses and
    // assembles into data the shared contract accepts. When real ingest lands,
    // this module (and test) die together.
    const teams = sampleTeams();

    expect(teams.length).toBeGreaterThan(0);
    for (const team of teams) {
      expect(() => TeamSchema.parse(team)).not.toThrow();
    }
  });
});
