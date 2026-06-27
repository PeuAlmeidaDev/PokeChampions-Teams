import type { JSX } from "react";
import type { DetailedPokemonSet } from "@pokemon-champions/shared";
import { PokemonSprite } from "./PokemonSprite.js";

const STAT_LABEL: Record<string, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};
const STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

/** "252 HP / 4 Atk / 252 SpD" — only stats with a positive value. */
function formatStats(stats: Record<string, number>): string {
  return STAT_ORDER.filter((s) => (stats[s] ?? 0) > 0)
    .map((s) => `${stats[s]} ${STAT_LABEL[s]}`)
    .join(" / ");
}

/**
 * One Pokémon's full config in the detail modal. Presentational only. Optional
 * fields (item/ability/nature/Tera/EVs) are omitted when missing so the UI never
 * shows "null". Sprite reuses PokemonSprite (our resolved URL).
 */
export function PokemonDetailCard({ set }: { set: DetailedPokemonSet }): JSX.Element {
  const evs = formatStats(set.evs);

  return (
    <article className="flex gap-3 rounded-lg border border-slate-700 bg-slate-800 p-3">
      <PokemonSprite species={set.species} spriteUrl={set.spriteUrl} />
      <div className="flex flex-col gap-0.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-100">{set.species}</span>
          {set.teraType && (
            <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-medium text-fuchsia-300">
              Tera {set.teraType}
            </span>
          )}
        </div>
        {set.item && <span className="text-slate-300">@ {set.item}</span>}
        {set.ability && <span className="text-slate-300">{set.ability}</span>}
        {set.nature && <span className="text-slate-300">{set.nature} Nature</span>}
        {evs && <span className="text-slate-400">{evs}</span>}
        {set.moves.length > 0 && (
          <span className="text-sky-300">{set.moves.join(" · ")}</span>
        )}
      </div>
    </article>
  );
}
