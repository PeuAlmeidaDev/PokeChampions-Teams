import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App.js";
import { makeTeam, makeTeamsResponse } from "./test/factories.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows loading, then the team grid with a count", async () => {
    const body = makeTeamsResponse({
      teams: [makeTeam({ id: "MB1", name: "Sun Offense" })],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => body })),
    );

    render(<App />);

    expect(screen.getByText(/carregando/i)).toBeTruthy();
    expect(await screen.findByText("Sun Offense")).toBeTruthy();
    expect(screen.getByText(/1 times? campe/i)).toBeTruthy();
  });

  it("shows an error state with a retry that refetches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeTeamsResponse({ teams: [makeTeam({ name: "Recovered" })] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText(/não foi possível/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(await screen.findByText("Recovered")).toBeTruthy();
  });
});
