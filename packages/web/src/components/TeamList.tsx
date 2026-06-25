import type { JSX } from "react";
import type { Team } from "@pokemon-champions/shared";

/**
 * Presentational: receives ready teams via props and draws them. No fetch, no
 * API-URL building, no business logic (web/CLAUDE.md). For this slice it shows
 * names only; sprites and per-Pokémon config arrive in later slices.
 */
export function TeamList({ teams }: { teams: Team[] }): JSX.Element {
  if (teams.length === 0) {
    return <p>Nenhum time para mostrar.</p>;
  }

  return (
    <ul>
      {teams.map((team) => (
        <li key={team.id}>{team.name}</li>
      ))}
    </ul>
  );
}
