import type { JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { PokemonSprite } from "./PokemonSprite.js";

/**
 * One champion team as a card: metadata header + a 3-column sprite grid + a link
 * to the source paste. Presentational only. Optional fields (rank, tournament,
 * owner) are omitted when null so the UI never shows "null".
 *
 * An absolute-positioned <button> captures card clicks and calls onOpenDetail;
 * header/sprite areas are pointer-events-none (click falls through to the button);
 * the paste <a> sits above (z-10) with stopPropagation so it stays independently
 * clickable without triggering the modal.
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
        className="absolute inset-0 z-0 rounded-lg"
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
          <li key={`${p.species}-${i}`} className="flex justify-center">
            <PokemonSprite species={p.species} spriteUrl={p.spriteUrl} />
          </li>
        ))}
      </ul>

      <a
        href={team.pokepasteUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 mt-auto text-sm text-sky-600 hover:underline"
      >
        ver paste →
      </a>
    </article>
  );
}
