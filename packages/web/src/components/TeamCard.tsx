import type { JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { PokemonSprite } from "./PokemonSprite.js";

const TEAM_SIZE = 6;

/**
 * One champion team as a card. Sprites sit on top in a fixed-height band (padded
 * to 6 slots so the band — and everything below it — aligns across cards
 * regardless of how much metadata a team has). Below a divider, a description
 * block shows the team name plus labelled rows (result / event / trainer), each
 * omitted when null so the UI never shows "null". Dark theme.
 *
 * The whole card is a single absolute <button> that opens the detail modal; the
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

  // Pad to a constant slot count so the sprite band keeps the same height even
  // when a team has fewer than 6 Pokémon (partial paste) — keeps cards aligned.
  const emptySlots = Math.max(0, TEAM_SIZE - team.pokemon.length);

  return (
    <article className="relative flex h-full flex-col rounded-lg border border-slate-700 bg-slate-800 shadow-sm transition hover:border-violet-500/60 hover:shadow-lg hover:shadow-black/30">
      <button
        type="button"
        onClick={() => onOpenDetail(team.id)}
        className="absolute inset-0 z-0 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none"
        aria-label={team.name}
      />

      <ul className="pointer-events-none relative z-10 grid grid-cols-3 gap-2 p-4">
        {team.pokemon.map((p, i) => (
          <li key={`${p.species}-${i}`} className="flex flex-col items-center gap-1">
            <PokemonSprite species={p.species} spriteUrl={p.spriteUrl} />
            <span
              title={p.species}
              className="w-full truncate text-center text-xs text-slate-400"
            >
              {p.species}
            </span>
          </li>
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <li key={`empty-${i}`} aria-hidden className="flex flex-col items-center gap-1">
            {/* h-24 w-24 must match PokemonSprite's size; the empty name line
                reserves the same height as a populated cell so a fully-empty
                row doesn't shrink the band (keeps cards aligned). */}
            <div className="h-24 w-24" />
            <span className="text-xs">&nbsp;</span>
          </li>
        ))}
      </ul>

      <div className="pointer-events-none relative z-10 mt-auto flex flex-col gap-2 border-t border-slate-700 p-4">
        <h2 className="font-semibold text-slate-100">{team.name}</h2>
        <dl className="flex flex-col gap-1 text-sm">
          {team.rank && (
            <div className="flex items-center gap-2">
              <dt className="shrink-0 text-slate-400" aria-label="Resultado">🏆</dt>
              <dd className="font-medium text-amber-300">{team.rank}</dd>
            </div>
          )}
          {team.tournament && (
            <div className="flex items-center gap-2">
              <dt className="shrink-0 text-slate-400" aria-label="Evento">🗓️</dt>
              <dd className="text-slate-200">{team.tournament}</dd>
            </div>
          )}
          {owner && (
            <div className="flex items-center gap-2">
              <dt className="shrink-0 text-slate-400" aria-label="Treinador">👤</dt>
              <dd className="text-slate-200">{owner}</dd>
            </div>
          )}
        </dl>
        <span className="mt-1 text-sm font-medium text-violet-400">Ver detalhes →</span>
      </div>
    </article>
  );
}
