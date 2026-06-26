import { describe, expect, it } from "vitest";
import { spriteCandidates } from "./names.js";

describe("spriteCandidates", () => {
  it("puts a known override first", () => {
    // Floette-Eternal-Mega has no sprite of its own; fall back to floette-mega.
    expect(spriteCandidates("Floette-Eternal-Mega")[0]).toBe("floette-mega");
    expect(spriteCandidates("Palafin-Hero")[0]).toBe("palafin-hero");
  });

  it("maps Maushold-Four to its PokeAPI form (404-log finding from the live ingest)", () => {
    // The naive slug "maushold-four" and the "maushold" fallback both 404 on
    // PokeAPI; only "maushold-family-of-four" resolves. Caught by the sprite
    // miss log when exercising the real sheet.
    expect(spriteCandidates("Maushold-Four")[0]).toBe("maushold-family-of-four");
  });

  it("naive-slugs an ordinary name (lowercase, hyphen-separated)", () => {
    expect(spriteCandidates("Landorus-Therian")).toContain("landorus-therian");
    expect(spriteCandidates("Flutter Mane")).toContain("flutter-mane");
  });

  it("appends progressively shorter segment fallbacks, longest first", () => {
    const candidates = spriteCandidates("Staraptor-Mega");
    // naive slug before its shortened fallback
    expect(candidates.indexOf("staraptor-mega")).toBeLessThan(
      candidates.indexOf("staraptor"),
    );
    expect(candidates).toContain("staraptor");
  });

  it("de-duplicates while preserving order", () => {
    const candidates = spriteCandidates("Pikachu");
    expect(candidates).toEqual([...new Set(candidates)]);
    expect(candidates[0]).toBe("pikachu");
  });
});
