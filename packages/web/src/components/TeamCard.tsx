import type { JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { PokemonSprite } from "./PokemonSprite.js";

/**
 * One champion team as a card: metadata header + a 3-column sprite grid. The
 * whole card is a single button that opens the detail modal (the modal now shows
 * the full config, so we no longer link out to the external paste). Presentational
 * only. Optional fields (rank, tournament, owner) are omitted when null so the UI
 * never shows "null".
 *
 * An absolute-positioned <button> covers the card and calls onOpenDetail; the
 * content sits above it as pointer-events-none, so any click lands on the button.
 */
export function TeamCard({
  team,
  onOpenDetail,
}: {
  team: Team;
  onOpenDetail: (id: string) => void;
}): JSX.Element {
  const owner = [team.ownerName, team.ownerHandle ? `@${team.ownerHandle}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="relative flex h-full flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpenDetail(team.id)}
        className="absolute inset-0 z-0 rounded-lg focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
        aria-label={team.name}
      />
      <header className="pointer-events-none relative z-10 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-slate-900">{team.name}</h2>
          {team.rank && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {team.rank}
            </span>
          )}
        </div>
        {team.tournament && (
          <p className="text-sm text-slate-600">{team.tournament}</p>
        )}
        {owner && <p className="text-sm text-slate-500">{owner}</p>}
      </header>

      <ul className="pointer-events-none relative z-10 grid grid-cols-3 gap-2">
        {team.pokemon.map((p, i) => (
          <li key={`${p.species}-${i}`} className="flex flex-col items-center gap-1">
            <PokemonSprite species={p.species} spriteUrl={p.spriteUrl} />
            <span
              title={p.species}
              className="w-full truncate text-center text-xs text-slate-600"
            >
              {p.species}
            </span>
          </li>
        ))}
      </ul>

      <span className="pointer-events-none relative z-10 mt-auto text-sm font-medium text-sky-600">
        Ver detalhes →
      </span>
    </article>
  );
}
