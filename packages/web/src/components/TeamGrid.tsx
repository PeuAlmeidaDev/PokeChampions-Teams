import type { JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { TeamCard } from "./TeamCard.js";

/**
 * Presentational grid of team cards. Receives ready teams via props (no fetch).
 * Responsive: one column on small screens, more as width allows.
 */
export function TeamGrid({
  teams,
  onOpenDetail,
}: {
  teams: Team[];
  onOpenDetail: (id: string) => void;
}): JSX.Element {
  if (teams.length === 0) {
    return <p className="text-slate-500">Nenhum time para mostrar.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {teams.map((team) => (
        <li key={team.id}>
          <TeamCard team={team} onOpenDetail={onOpenDetail} />
        </li>
      ))}
    </ul>
  );
}
