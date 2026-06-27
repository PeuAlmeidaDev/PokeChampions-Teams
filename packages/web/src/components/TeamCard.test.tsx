import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TeamCard } from "./TeamCard.js";
import { makePokemon, makeTeam } from "../test/factories.js";

afterEach(cleanup);

describe("TeamCard", () => {
  it("shows name, rank, tournament, owner, all sprites and a detail affordance", () => {
    const team = makeTeam({
      name: "Sun Offense",
      rank: "2nd",
      tournament: "Ruler of Origin Tour",
      ownerName: "Kaito Arii",
      ownerHandle: "ub_slow",
      pokemon: [
        makePokemon({ species: "Charizard" }),
        makePokemon({ species: "Garchomp" }),
      ],
    });

    render(<TeamCard team={team} onOpenDetail={() => {}} />);

    expect(screen.getByText("Sun Offense")).toBeTruthy();
    expect(screen.getByText("2nd")).toBeTruthy();
    expect(screen.getByText("Ruler of Origin Tour")).toBeTruthy();
    expect(screen.getByText("Kaito Arii · @ub_slow")).toBeTruthy();
    expect(screen.getByAltText("Charizard")).toBeTruthy();
    expect(screen.getByAltText("Garchomp")).toBeTruthy();
    // Each sprite is labelled with the Pokémon's name on the main screen.
    expect(screen.getByText("Charizard")).toBeTruthy();
    expect(screen.getByText("Garchomp")).toBeTruthy();
    // The card shows a "Ver detalhes" cue and no longer links out to the paste.
    expect(screen.getByText(/ver detalhes/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /ver paste/i })).toBeNull();
  });

  it("omits optional fields that are null (never renders 'null')", () => {
    const team = makeTeam({
      name: "Anon",
      rank: null,
      tournament: null,
      ownerName: null,
      ownerHandle: null,
      pokemon: [],
    });

    render(<TeamCard team={team} onOpenDetail={() => {}} />);

    expect(screen.getByText("Anon")).toBeTruthy();
    expect(screen.queryByText(/null/i)).toBeNull();
  });

  it("chama onOpenDetail com o id ao clicar no card", () => {
    const onOpenDetail = vi.fn();
    render(<TeamCard team={makeTeam({ id: "MB7" })} onOpenDetail={onOpenDetail} />);
    fireEvent.click(screen.getByRole("button", { name: /sun offense/i }));
    expect(onOpenDetail).toHaveBeenCalledWith("MB7");
  });
});
