import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PokemonSprite } from "./PokemonSprite.js";

afterEach(cleanup);

describe("PokemonSprite", () => {
  it("renders a lazy img with the sprite url and species as alt", () => {
    render(<PokemonSprite species="Charizard" spriteUrl="https://img/charizard.png" />);

    const img = screen.getByAltText("Charizard");
    expect(img.getAttribute("src")).toBe("https://img/charizard.png");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to a labelled box when the image fails to load", () => {
    render(<PokemonSprite species="Charizard" spriteUrl="https://broken/x.png" />);

    fireEvent.error(screen.getByAltText("Charizard"));

    // the <img> (alt) is gone, replaced by a text fallback carrying the name
    expect(screen.queryByAltText("Charizard")).toBeNull();
    expect(screen.getByText("Charizard")).toBeTruthy();
  });
});
