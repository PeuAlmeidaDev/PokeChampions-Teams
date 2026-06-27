import { buildApp } from "./http/app.js";
import { createTeamsService } from "./ingest/orchestrator.js";
import { createTeamDetailService } from "./ingest/detail.js";
import { fetchSheetCsv } from "./ingest/sheet.js";
import { fetchPokepaste } from "./ingest/pokepaste.js";
import { resolveSprites } from "./ingest/sprites.js";
import { readSpriteCache, writeSpriteCache } from "./cache/sprites.js";
import { readDetailCache, writeDetailCache } from "./cache/detail.js";

// Entry point = the edge: the only place that reads the environment.
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const sheetUrl = process.env.SHEET_CSV_URL;
const pokeApiBaseUrl = process.env.POKEAPI_BASE_URL ?? "https://pokeapi.co/api/v2";
const spriteCachePath = process.env.SPRITE_CACHE_PATH ?? "data/cache/sprites.json";
const detailCacheDir = process.env.DETAIL_CACHE_DIR ?? "data/cache/details";

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

const detailService = createTeamDetailService({
  getTeams: service.getTeams,
  fetchPokepaste: (url) => fetchPokepaste(url),
  resolveSprites: (species) => resolveSprites(species, { baseUrl: pokeApiBaseUrl, logger }),
  readSpriteCache: () => readSpriteCache(spriteCachePath),
  writeSpriteCache: (sprites) => writeSpriteCache(spriteCachePath, sprites),
  readDetailCache: (id) => readDetailCache(detailCacheDir, id),
  writeDetailCache: (id, detail) => writeDetailCache(detailCacheDir, id, detail),
});

const app = buildApp({
  getTeams: service.getTeams,
  getTeamDetail: detailService.getTeamDetail,
});

app.listen({ port, host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
