/**
 * Pure parser: pokepaste text -> our per-Pokémon config. Uses @pkmn/sets to
 * parse the Showdown format, then maps to our contract. No I/O. Graceful: a
 * malformed or species-less set is dropped, never crashing the rest (one bad
 * Pokémon must not take down the other five). Sprite is NOT resolved here —
 * that's the orchestrator's job (assembleTeamDetail).
 */

import { Sets } from "@pkmn/sets";
import type { PokemonSet } from "@pkmn/sets";
import type { DetailedPokemonSet } from "@pokemon-champions/shared";

export type ParsedSet = Omit<DetailedPokemonSet, "spriteUrl" | "itemSpriteUrl">;

const STATS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

function asNullableString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickStats(table: unknown): Record<string, number> {
  if (table === null || typeof table !== "object") return {};
  const src = table as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const s of STATS) {
    const v = src[s];
    if (typeof v === "number") out[s] = v;
  }
  return out;
}

export function parsePaste(text: string): ParsedSet[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const chunks = normalized
    .split(/\n[ \t]*\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const sets: ParsedSet[] = [];
  for (const chunk of chunks) {
    let parsed: Partial<PokemonSet<string>>;
    try {
      parsed = Sets.importSet(chunk);
    } catch {
      continue; // malformed set — skip, keep the rest
    }
    const species = asNullableString(parsed.species);
    if (!species) continue; // unusable without a species

    const moves = Array.isArray(parsed.moves)
      ? parsed.moves.filter((m): m is string => typeof m === "string" && m.length > 0)
      : [];

    sets.push({
      species,
      item: asNullableString(parsed.item),
      ability: asNullableString(parsed.ability),
      nature: asNullableString(parsed.nature),
      teraType: asNullableString(parsed.teraType),
      evs: pickStats(parsed.evs),
      ivs: pickStats(parsed.ivs),
      moves,
    });
  }
  return sets;
}
