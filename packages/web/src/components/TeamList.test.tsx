import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TeamList } from "./TeamList.js";
import { makeTeam } from "../test/factories.js";

afterEach(cleanup);

describe("TeamList", () => {
  it("renders the name of every team it is given", () => {
    render(
      <TeamList
        teams={[
          makeTeam({ id: "MB1", name: "Sun Offense" }),
          makeTeam({ id: "MB2", name: "Trick Room Hard" }),
        ]}
      />,
    );

    expect(screen.getByText("Sun Offense")).toBeTruthy();
    expect(screen.getByText("Trick Room Hard")).toBeTruthy();
  });

  it("shows an empty state when there are no teams", () => {
    render(<TeamList teams={[]} />);

    expect(screen.getByText(/nenhum time/i)).toBeTruthy();
  });
});
