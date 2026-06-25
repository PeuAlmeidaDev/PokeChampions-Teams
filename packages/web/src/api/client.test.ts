import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTeams } from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTeams", () => {
  it("returns the TeamsResponse re-validated against the shared contract", async () => {
    const body = {
      fetchedAt: "2026-06-25T01:16:53.100Z",
      teams: [
        {
          id: "MB1",
          name: "Sun Offense",
          ownerName: null,
          ownerHandle: null,
          tournament: null,
          rank: null,
          pokepasteUrl: "https://pokepast.es/sample-sun",
          pokemon: [],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => body })),
    );

    const result = await fetchTeams();

    expect(fetch).toHaveBeenCalledWith("/api/teams");
    expect(result.teams[0]?.id).toBe("MB1");
  });

  it("throws when the API returns a shape that violates the contract", async () => {
    // Anti-corruption layer: even our own backend is re-validated. A drift
    // between server and contract must fail loudly here, in dev, not render
    // garbage. See web/CLAUDE.md.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ teams: "not an array" }) })),
    );

    await expect(fetchTeams()).rejects.toThrow();
  });
});
