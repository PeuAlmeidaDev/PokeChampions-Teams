import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PokemonSearch } from "./PokemonSearch.js";

afterEach(cleanup);

describe("PokemonSearch", () => {
  it("renders the current value", () => {
    render(<PokemonSearch value="pikachu" onChange={() => {}} />);

    expect(screen.getByRole("searchbox")).toHaveProperty("value", "pikachu");
  });

  it("calls onChange with the typed text", () => {
    const onChange = vi.fn();
    render(<PokemonSearch value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "incineroar" },
    });

    expect(onChange).toHaveBeenCalledWith("incineroar");
  });
});
