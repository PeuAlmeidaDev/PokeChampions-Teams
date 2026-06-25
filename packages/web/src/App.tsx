import { useEffect, useState, type JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { fetchTeams } from "./api/client.js";
import { TeamList } from "./components/TeamList.js";

/**
 * The web app's imperative shell: fetches teams once on mount, holds them in
 * state, and hands them to the presentational TeamList. All data access stays
 * behind api/ — this component only orchestrates and draws (web/CLAUDE.md).
 */
export function App(): JSX.Element {
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    let active = true;
    fetchTeams()
      .then((res) => {
        if (active) setTeams(res.teams);
      })
      .catch((err: unknown) => {
        // Degrade gracefully: a failed load leaves the empty state, never a
        // blank crash. Surfacing the error in the UI is a later slice.
        console.error("Failed to load teams", err);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <h1>Pokémon Champions</h1>
      <TeamList teams={teams} />
    </main>
  );
}
