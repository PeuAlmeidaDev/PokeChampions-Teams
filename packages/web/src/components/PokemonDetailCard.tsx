import type { JSX } from "react";
import type { DetailedPokemonSet } from "@pokemon-champions/shared";
import { PokemonSprite } from "./PokemonSprite.js";
import { ItemSprite } from "./ItemSprite.js";

const STAT_LABEL: Record<string, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};
const STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

/** A VGC set carries up to 4 moves; the grid always reserves this many slots. */
const MOVE_SLOTS = 4;

/** "252 HP / 4 Atk / 252 SpD" — only stats with a positive value. */
function formatStats(stats: Record<string, number>): string {
  return STAT_ORDER.filter((s) => (stats[s] ?? 0) > 0)
    .map((s) => `${stats[s]} ${STAT_LABEL[s]}`)
    .join(" / ");
}

/**
 * One Pokémon's full config in the detail modal. Presentational only. Optional
 * fields (item/ability/nature/Tera/EVs) are omitted when missing so the UI never
 * shows "null". Moves render as a fixed 2×2 chip grid (padded to MOVE_SLOTS so
 * card height stays constant regardless of move-name length); truncation is
 * CSS-only, so the full name stays in the DOM and shows via the native `title`
 * tooltip. The card is h-full so cards in a modal row stretch to equal height.
 * The chip is the seam where the later PokeAPI slice adds per-type color + a
 * details tooltip. Sprite reuses PokemonSprite (our resolved URL).
 */
export function PokemonDetailCard({ set }: { set: DetailedPokemonSet }): JSX.Element {
  const evs = formatStats(set.evs);
  const emptyMoveSlots = Math.max(0, MOVE_SLOTS - set.moves.length);

  return (
    <article className="flex h-full gap-3 rounded-lg border border-slate-700 bg-slate-800 p-3">
      <PokemonSprite species={set.species} spriteUrl={set.spriteUrl} />
      <div className="flex flex-1 flex-col gap-0.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-100">{set.species}</span>
          {set.teraType && (
            <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-medium text-fuchsia-300">
              Tera {set.teraType}
            </span>
          )}
        </div>
        {set.item && (
          <span className="flex items-center gap-1 text-slate-300">
            {set.itemSpriteUrl && <ItemSprite url={set.itemSpriteUrl} alt={set.item} />}
            {set.item}
          </span>
        )}
        {set.ability && <span className="text-slate-300">{set.ability}</span>}
        {set.nature && <span className="text-slate-300">{set.nature} Nature</span>}
        {evs && <span className="text-slate-400">{evs}</span>}
        <ul className="mt-auto grid grid-cols-2 gap-1 pt-1">
          {set.moves.map((move, i) => (
            <li key={`${move}-${i}`} className="min-w-0">
              <span
                title={move}
                className="block truncate rounded bg-slate-700 px-2 py-1 text-xs text-slate-200"
              >
                {move}
              </span>
            </li>
          ))}
          {Array.from({ length: emptyMoveSlots }, (_, i) => (
            <li key={`empty-${i}`} aria-hidden className="min-w-0">
              {/* Invisible chip: reserves the same height as a real chip so a
                  partial set still fills the 2×2 grid and stays aligned. */}
              <span className="block rounded px-2 py-1 text-xs">&nbsp;</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
