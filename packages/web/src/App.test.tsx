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
    // Singular count: one team reads "1 time campeão", not "1 times campeões".
    expect(screen.getByText("1 time campeão")).toBeTruthy();
  });

  it("pluralizes the count for more than one team", async () => {
    const body = makeTeamsResponse({
      teams: [makeTeam({ id: "MB1", name: "A" }), makeTeam({ id: "MB2", name: "B" })],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => body })),
    );

    render(<App />);

    expect(await screen.findByText("2 times campeões")).toBeTruthy();
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

  it("abre o modal e carrega o detalhe ao clicar num time", async () => {
    const detail = {
      id: "MB1",
      pokemon: [
        { species: "Incineroar", spriteUrl: "x", item: "Assault Vest", ability: "Intimidate", nature: "Careful", teraType: "Grass", evs: { hp: 252 }, ivs: {}, moves: ["Fake Out"] },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/detail")
          ? Promise.resolve({ ok: true, json: async () => detail })
          : Promise.resolve({ ok: true, json: async () => makeTeamsResponse({ teams: [makeTeam({ id: "MB1" })] }) }),
      ),
    );

    render(<App />);
    const card = await screen.findByRole("button", { name: /sun offense/i });
    fireEvent.click(card);
    expect(await screen.findByText("Incineroar")).toBeTruthy();
  });
});
