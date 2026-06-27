import { useState, type JSX } from "react";

/**
 * Small held-item icon. Presentational: the URL is already resolved by the
 * server (PokeAPI item sprite) and arrives via props. On load error it removes
 * itself so the card degrades to the item name only (graceful degradation),
 * mirroring PokemonSprite's onError fallback.
 */
export function ItemSprite({ url, alt }: { url: string; alt: string }): JSX.Element | null {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={url}
      alt={alt}
      width={24}
      height={24}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-6 w-6 shrink-0 object-contain"
    />
  );
}
