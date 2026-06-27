import { buildApp } from "./http/app.js";
import { createTeamsService } from "./ingest/orchestrator.js";
import { createTeamDetailService } from "./ingest/detail.js";
import { fetchSheetCsv } from "./ingest/sheet.js";
import { fetchPokepaste } from "./ingest/pokepaste.js";
import { resolveSprites } from "./ingest/sprites.js";
import { resolveItemSprites } from "./ingest/items.js";
import { readSpriteCache, writeSpriteCache } from "./cache/sprites.js";
import { readItemCache, writeItemCache } from "./cache/items.js";
import { readDetailCache, writeDetailCache } from "./cache/detail.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Entry point = the edge: the only place that reads the environment.
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const sheetUrl = process.env.SHEET_CSV_URL;
const pokeApiBaseUrl = process.env.POKEAPI_BASE_URL ?? "https://pokeapi.co/api/v2";
const spriteCachePath = process.env.SPRITE_CACHE_PATH ?? "data/cache/sprites.json";
const itemCachePath = process.env.ITEM_CACHE_PATH ?? "data/cache/items.json";
const detailCacheDir = process.env.DETAIL_CACHE_DIR ?? "data/cache/details";

// Resolve the built SPA dir from THIS file's location (works in dev via tsx and
// in prod from dist/), overridable by env. Only serve it when it exists — in
// dev `web/dist` is absent (Vite serves the SPA), so the API runs alone.
const webDistCandidate =
  process.env.WEB_DIST_PATH ??
  resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const webDistPath = existsSync(webDistCandidate) ? webDistCandidate : undefined;
if (!webDistPath) {
  console.warn(`[web] ${webDistCandidate} not found — serving API only (dev/Vite mode)`);
}

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
  resolveItemSprites: (items) => resolveItemSprites(items, { baseUrl: pokeApiBaseUrl, logger }),
  readItemCache: () => readItemCache(itemCachePath),
  writeItemCache: (items) => writeItemCache(itemCachePath, items),
  readDetailCache: (id) => readDetailCache(detailCacheDir, id),
  writeDetailCache: (id, detail) => writeDetailCache(detailCacheDir, id, detail),
});

const app = buildApp({
  getTeams: service.getTeams,
  getTeamDetail: detailService.getTeamDetail,
  webDistPath,
});

app.listen({ port, host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
