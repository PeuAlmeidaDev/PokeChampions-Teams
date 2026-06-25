import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTeams } from "./client.js";
import { makeTeamsResponse } from "../test/factories.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTeams", () => {
  it("returns the TeamsResponse re-validated against the shared contract", async () => {
    const body = makeTeamsResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => body })),
    );

    const result = await fetchTeams();

    expect(fetch).toHaveBeenCalledWith("/api/teams");
    expect(result.teams[0]?.id).toBe(body.teams[0]?.id);
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
