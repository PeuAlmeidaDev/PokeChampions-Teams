import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PokemonDetailCard } from "./PokemonDetailCard.js";
import { makeDetailedPokemon } from "../test/factories.js";

afterEach(cleanup);

describe("PokemonDetailCard", () => {
  it("mostra os campos de configuração", () => {
    render(<PokemonDetailCard set={makeDetailedPokemon()} />);
    expect(screen.getByText("Incineroar")).toBeTruthy();
    expect(screen.getByText(/Assault Vest/)).toBeTruthy();
    expect(screen.getByText(/Intimidate/)).toBeTruthy();
    expect(screen.getByText("252 HP / 4 Atk / 252 SpD")).toBeTruthy();
    expect(screen.getByText(/Fake Out/)).toBeTruthy();
  });

  it("omite campos ausentes (nunca mostra 'null')", () => {
    const { container } = render(
      <PokemonDetailCard
        set={makeDetailedPokemon({ item: null, teraType: null, nature: null, evs: {} })}
      />,
    );
    expect(container.textContent).not.toContain("null");
  });

  it("renderiza cada golpe como um chip próprio (não uma string única)", () => {
    render(<PokemonDetailCard set={makeDetailedPokemon()} />);
    // Exact-match getByText: only passes if each move is its own element.
    // The old joined string "Fake Out · Knock Off · …" fails an exact match.
    for (const move of ["Fake Out", "Knock Off", "Parting Shot", "Flare Blitz"]) {
      expect(screen.getByText(move)).toBeTruthy();
    }
  });
});
