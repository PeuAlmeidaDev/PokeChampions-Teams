import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TeamsResponseSchema,
  TeamDetailSchema,
  type TeamsResponse,
} from "@pokemon-champions/shared";
import { buildApp } from "./app.js";

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

const sample: TeamsResponse = {
  fetchedAt: "2026-06-25T00:00:00.000Z",
  teams: [
    {
      id: "MB1",
      name: "Sun",
      ownerName: null,
      ownerHandle: null,
      tournament: null,
      rank: null,
      pokepasteUrl: "https://pokepast.es/a",
      pokemon: [],
    },
  ],
};

it("GET /api/health returns ok", async () => {
  app = buildApp({
    getTeams: vi.fn().mockResolvedValue(sample),
    getTeamDetail: vi.fn().mockResolvedValue(null),
  });
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/health" });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok" });
});

it("GET /api/teams returns what the ingest service produced", async () => {
  app = buildApp({
    getTeams: vi.fn().mockResolvedValue(sample),
    getTeamDetail: vi.fn().mockResolvedValue(null),
  });
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/teams" });

  expect(res.statusCode).toBe(200);
  const body = TeamsResponseSchema.parse(res.json());
  expect(body.teams[0]?.id).toBe("MB1");
});

it("GET /api/teams returns 503 when ingest fails", async () => {
  app = buildApp({
    getTeams: vi.fn().mockRejectedValue(new Error("sheet down")),
    getTeamDetail: vi.fn().mockResolvedValue(null),
  });
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/teams" });

  expect(res.statusCode).toBe(503);
});

const sampleDetail = {
  id: "MB1",
  pokemon: [
    {
      species: "Pikachu",
      spriteUrl: "x",
      itemSpriteUrl: null,
      item: null,
      ability: null,
      nature: null,
      teraType: null,
      evs: {},
      ivs: {},
      moves: [],
    },
  ],
};

describe("GET /api/teams/:id/detail", () => {
  it("200 com o detalhe", async () => {
    app = buildApp({
      getTeams: vi.fn().mockResolvedValue(sample),
      getTeamDetail: async () => sampleDetail,
    });
    const res = await app.inject({ method: "GET", url: "/api/teams/MB1/detail" });
    expect(res.statusCode).toBe(200);
    expect(TeamDetailSchema.parse(res.json()).id).toBe("MB1");
  });

  it("404 quando o serviço devolve null", async () => {
    app = buildApp({
      getTeams: vi.fn().mockResolvedValue(sample),
      getTeamDetail: async () => null,
    });
    const res = await app.inject({ method: "GET", url: "/api/teams/NOPE/detail" });
    expect(res.statusCode).toBe(404);
  });

  it("503 quando o serviço lança", async () => {
    app = buildApp({
      getTeams: vi.fn().mockResolvedValue(sample),
      getTeamDetail: async () => {
        throw new Error("pokepaste down");
      },
    });
    const res = await app.inject({ method: "GET", url: "/api/teams/MB1/detail" });
    expect(res.statusCode).toBe(503);
  });
});

function makeWebDist(): string {
  const dir = mkdtempSync(join(tmpdir(), "webdist-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>spa</title>");
  return dir;
}

describe("SPA serving (webDistPath set)", () => {
  it("serves index.html at /", async () => {
    app = buildApp({
      getTeams: vi.fn().mockResolvedValue(sample),
      getTeamDetail: vi.fn().mockResolvedValue(null),
      webDistPath: makeWebDist(),
    });
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>spa</title>");
  });

  it("falls back to index.html for an unknown non-/api route (client routing)", async () => {
    app = buildApp({
      getTeams: vi.fn().mockResolvedValue(sample),
      getTeamDetail: vi.fn().mockResolvedValue(null),
      webDistPath: makeWebDist(),
    });
    const res = await app.inject({ method: "GET", url: "/team/MB1" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>spa</title>");
  });

  it("keeps /api/* misses as JSON 404 (no HTML leak)", async () => {
    app = buildApp({
      getTeams: vi.fn().mockResolvedValue(sample),
      getTeamDetail: vi.fn().mockResolvedValue(null),
      webDistPath: makeWebDist(),
    });
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json()).toHaveProperty("error");
  });
});
