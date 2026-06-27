import type { JSX } from "react";

/**
 * Controlled search input for filtering teams by Pokémon name. Presentational
 * only: the query lives in the parent (App owns the state); this component just
 * renders the input and reports changes via onChange. No filtering logic here.
 */
export function PokemonSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Buscar por Pokémon…"
      aria-label="Buscar por Pokémon"
      className="mb-4 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none sm:max-w-xs"
    />
  );
}
