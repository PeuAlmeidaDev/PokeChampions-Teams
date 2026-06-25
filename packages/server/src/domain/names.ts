/**
 * Maps a Showdown-format species name to an ordered list of PokeAPI slug
 * candidates. Pure: no network. Sprite resolution tries each candidate in turn
 * until one returns a sprite, so order matters — most specific first.
 *
 * The pinned PokeAPI instance serves non-standard forms (CLAUDE.md hurdle #1),
 * so OVERRIDES is the source of truth for the cases naive slugging gets wrong.
 * A 404 during resolution means a mapping bug — fix it here (hurdle #6).
 */

// Showdown name (verbatim) → known-good PokeAPI slug. v1 seed; confirm via the
// 404 logs when exercising real ingest.
const OVERRIDES: Record<string, string> = {
  "Floette-Eternal-Mega": "floette-mega", // hurdle #2: no own sprite
  "Basculegion": "basculegion-male",
  "Basculegion-F": "basculegion-female",
  "Indeedee-F": "indeedee-female",
  "Maushold": "maushold-family-of-four",
  "Mimikyu": "mimikyu-disguised",
  "Palafin": "palafin-zero",
  "Palafin-Hero": "palafin-hero",
  "Aegislash": "aegislash-shield",
  "Tatsugiri": "tatsugiri-curly",
  "Eiscue": "eiscue-ice",
};

/** Lowercase, collapse any run of non-alphanumerics into a single hyphen. */
function naiveSlug(species: string): string {
  return species
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function spriteCandidates(species: string): string[] {
  const candidates: string[] = [];

  const override = OVERRIDES[species];
  if (override) candidates.push(override);

  const slug = naiveSlug(species);
  candidates.push(slug);

  // Segment fallbacks: drop trailing "-segment" pieces, longest first.
  // "staraptor-mega" -> "staraptor". Helps forms the instance lacks.
  const parts = slug.split("-");
  for (let len = parts.length - 1; len >= 1; len--) {
    candidates.push(parts.slice(0, len).join("-"));
  }

  return [...new Set(candidates)];
}
