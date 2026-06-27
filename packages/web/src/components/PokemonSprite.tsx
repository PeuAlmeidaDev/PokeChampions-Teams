import { useState, type JSX } from "react";

/**
 * One Pokémon sprite. Presentational: the URL is already resolved by the server
 * (PokeAPI front_default) and arrives via props. On load error it degrades to a
 * labelled box rather than a broken-image icon — covers both a dead URL and the
 * server's placeholder sentinel with one path.
 */
export function PokemonSprite({
  species,
  spriteUrl,
}: {
  species: string;
  spriteUrl: string;
}): JSX.Element {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={species}
        className="flex h-24 w-24 items-center justify-center rounded bg-slate-700 p-1 text-center text-[10px] leading-tight text-slate-300"
      >
        {species}
      </div>
    );
  }

  return (
    <img
      src={spriteUrl}
      alt={species}
      width={96}
      height={96}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-24 w-24 object-contain"
    />
  );
}
