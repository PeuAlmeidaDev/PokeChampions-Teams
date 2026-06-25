import { buildApp } from "./http/app.js";
import { createTeamsService } from "./ingest/orchestrator.js";
import { fetchSheetCsv } from "./ingest/sheet.js";
import { resolveSprites } from "./ingest/sprites.js";
import { readSpriteCache, writeSpriteCache } from "./cache/sprites.js";

// Entry point = the edge: the only place that reads the environment.
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const sheetUrl = process.env.SHEET_CSV_URL;
const pokeApiBaseUrl = process.env.POKEAPI_BASE_URL ?? "https://pokeapi.co/api/v2";
const spriteCachePath = process.env.SPRITE_CACHE_PATH ?? "data/cache/sprites.json";

if (!sheetUrl) {
  console.error("SHEET_CSV_URL is required");
  process.exit(1);
}

const logger = { warn: (msg: string) => console.warn(msg) };

const service = createTeamsService({
  fetchSheetCsv: () => fetchSheetCsv(sheetUrl),
  resolveSprites: (species) => resolveSprites(species, { baseUrl: pokeApiBaseUrl, logger }),
  readSpriteCache: () => readSpriteCache(spriteCachePath),
  writeSpriteCache: (sprites) => writeSpriteCache(spriteCachePath, sprites),
  logger,
});

const app = buildApp({ getTeams: service.getTeams });

app.listen({ port, host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
