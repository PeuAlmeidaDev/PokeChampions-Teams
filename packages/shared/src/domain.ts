import { z } from "zod";

/**
 * Shared domain contract between the server (which produces it) and the web
 * client (which consumes and re-validates it). Single source of truth: if the
 * server changes the shape, the client's parse fails loudly in dev.
 *
 * Scope: first slice ("lista de times com sprites"). Per-Pokémon config
 * (item / ability / nature / EVs / IVs / Tera / moves) is intentionally NOT
 * modeled yet — it arrives in the team-detail slice. See plan.
 */

/** A single Pokémon as shown on a team card (sprite + name only, for now). */
export const PokemonSetSchema = z.object({
  /** Showdown-format name exactly as authored in the sheet, e.g. "Floette-Eternal-Mega". */
  species: z.string(),
  /** Resolved PokeAPI sprite URL, or a placeholder when the name could not be mapped. */
  spriteUrl: z.string(),
  /** National dex / form id when resolved, else null (unmapped name). */
  dexId: z.number().int().nullable(),
});
export type PokemonSet = z.infer<typeof PokemonSetSchema>;

/** A champion team as displayed in the grid. */
export const TeamSchema = z.object({
  /** Team ID from the sheet, e.g. "MB200". */
  id: z.string(),
  /** Display name (sheet "Team Description"). */
  name: z.string(),
  /** Owner's real name (sheet "Full Name"), when present. */
  ownerName: z.string().nullable(),
  /** Owner's handle (sheet "Owner"), when present. */
  ownerHandle: z.string().nullable(),
  /** Tournament / event, when present. */
  tournament: z.string().nullable(),
  /** Placement, e.g. "Champion", when present. */
  rank: z.string().nullable(),
  /** Source pokepaste URL (config link from the sheet). */
  pokepasteUrl: z.string(),
  /** The team's Pokémon. Usually 6, but we tolerate fewer (bad/partial paste). */
  pokemon: z.array(PokemonSetSchema),
});
export type Team = z.infer<typeof TeamSchema>;

/** Response body of `GET /api/teams`. */
export const TeamsResponseSchema = z.object({
  /** ISO-8601 timestamp of when the underlying data was ingested. */
  fetchedAt: z.string(),
  teams: z.array(TeamSchema),
});
export type TeamsResponse = z.infer<typeof TeamsResponseSchema>;

/**
 * Per-Pokémon configuration, shown in the team-detail modal. Fetched on demand
 * from the team's pokepaste (not part of the grid contract). Every config field
 * is optional/partial: real pastes omit EVs/IVs/Tera (hurdle #4). The sprite is
 * resolved by OUR pipeline (PokeAPI + cache), never taken from the pokepaste.
 */
export const DetailedPokemonSetSchema = z.object({
  species: z.string(),
  spriteUrl: z.string(),
  item: z.string().nullable(),
  ability: z.string().nullable(),
  nature: z.string().nullable(),
  teraType: z.string().nullable(),
  evs: z.record(z.string(), z.number()),
  ivs: z.record(z.string(), z.number()),
  moves: z.array(z.string()),
});
export type DetailedPokemonSet = z.infer<typeof DetailedPokemonSetSchema>;

/** Response body of `GET /api/teams/:id/detail`. */
export const TeamDetailSchema = z.object({
  id: z.string(),
  pokemon: z.array(DetailedPokemonSetSchema),
});
export type TeamDetail = z.infer<typeof TeamDetailSchema>;
