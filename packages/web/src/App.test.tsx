import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { TeamsResponse } from "@pokemon-champions/shared";

// Mock the data door: App is the shell that wires fetch -> state -> view. We
// test that wiring, not the network (the client has its own tests).
const fetchTeams = vi.fn<() => Promise<TeamsResponse>>();
vi.mock("./api/client.js", () => ({ fetchTeams: () => fetchTeams() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { App } = await import("./App.js");

describe("App", () => {
  it("loads teams from the API and renders their names", async () => {
    fetchTeams.mockResolvedValue({
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
    });

    render(<App />);

    expect(await screen.findByText("Sun Offense")).toBeTruthy();
  });
});
