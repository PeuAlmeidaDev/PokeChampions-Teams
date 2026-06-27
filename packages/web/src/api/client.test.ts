import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTeams, fetchTeamDetail } from "./client.js";
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

describe("fetchTeamDetail", () => {
  const detail = {
    id: "MB1",
    pokemon: [
      {
        species: "Pikachu",
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

  it("fetches and revalidates team detail against the shared contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => detail }),
    );

    const result = await fetchTeamDetail("MB1");

    expect(fetch).toHaveBeenCalledWith("/api/teams/MB1/detail");
    expect(result).toEqual(detail);
  });

  it("URL-encodes the team ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => detail }),
    );

    await fetchTeamDetail("MB 1");

    expect(fetch).toHaveBeenCalledWith("/api/teams/MB%201/detail");
  });

  it("throws when the API returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(fetchTeamDetail("MB1")).rejects.toThrow();
  });

  it("throws when the response violates the contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "MB1", pokemon: "not an array" }),
      }),
    );

    await expect(fetchTeamDetail("MB1")).rejects.toThrow();
  });
});
