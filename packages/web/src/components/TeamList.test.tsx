import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Team } from "@pokemon-champions/shared";
import { TeamList } from "./TeamList.js";

afterEach(cleanup);

function team(id: string, name: string): Team {
  return {
    id,
    name,
    ownerName: null,
    ownerHandle: null,
    tournament: null,
    rank: null,
    pokepasteUrl: `https://pokepast.es/${id}`,
    pokemon: [],
  };
}

describe("TeamList", () => {
  it("renders the name of every team it is given", () => {
    render(
      <TeamList teams={[team("MB1", "Sun Offense"), team("MB2", "Trick Room Hard")]} />,
    );

    expect(screen.getByText("Sun Offense")).toBeTruthy();
    expect(screen.getByText("Trick Room Hard")).toBeTruthy();
  });

  it("shows an empty state when there are no teams", () => {
    render(<TeamList teams={[]} />);

    expect(screen.getByText(/nenhum time/i)).toBeTruthy();
  });
});
