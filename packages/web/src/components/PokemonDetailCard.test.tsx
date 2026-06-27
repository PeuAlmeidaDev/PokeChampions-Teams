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
});
