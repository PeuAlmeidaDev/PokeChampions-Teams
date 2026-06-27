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
      className="mb-4 w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none sm:max-w-xs"
    />
  );
}
