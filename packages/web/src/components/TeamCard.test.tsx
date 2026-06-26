import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TeamCard } from "./TeamCard.js";
import { makePokemon, makeTeam } from "../test/factories.js";

afterEach(cleanup);

describe("TeamCard", () => {
  it("shows name, rank, tournament, owner, all sprites and the paste link", () => {
    const team = makeTeam({
      name: "Sun Offense",
      rank: "2nd",
      tournament: "Ruler of Origin Tour",
      ownerName: "Kaito Arii",
      ownerHandle: "ub_slow",
      pokepasteUrl: "https://pokepast.es/abc",
      pokemon: [
        makePokemon({ species: "Charizard" }),
        makePokemon({ species: "Garchomp" }),
      ],
    });

    render(<TeamCard team={team} />);

    expect(screen.getByText("Sun Offense")).toBeTruthy();
    expect(screen.getByText("2nd")).toBeTruthy();
    expect(screen.getByText("Ruler of Origin Tour")).toBeTruthy();
    expect(screen.getByText("Kaito Arii · @ub_slow")).toBeTruthy();
    expect(screen.getByAltText("Charizard")).toBeTruthy();
    expect(screen.getByAltText("Garchomp")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /ver paste/i }).getAttribute("href"),
    ).toBe("https://pokepast.es/abc");
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

    render(<TeamCard team={team} />);

    expect(screen.getByText("Anon")).toBeTruthy();
    expect(screen.queryByText(/null/i)).toBeNull();
  });
});
