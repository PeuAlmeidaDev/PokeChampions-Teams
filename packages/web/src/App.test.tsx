import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "./App.js";
import { makeTeam, makeTeamsResponse } from "./test/factories.js";

// App is the imperative shell: fetch -> state -> view. We stub only the
// unavoidable boundary — the network (`fetch`) — and let the real client
// (URL + schema re-validation) and the real components run. No mocking of our
// own code, so the test exercises the actual collaboration end to end.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("loads teams from the API and renders their names", async () => {
    const body = makeTeamsResponse({
      teams: [makeTeam({ id: "MB1", name: "Sun Offense" })],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => body })),
    );

    render(<App />);

    expect(await screen.findByText("Sun Offense")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/teams");
  });
});
