import type { FastifyInstance } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { TeamsResponseSchema, type TeamsResponse } from "@pokemon-champions/shared";
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
  app = buildApp({ getTeams: vi.fn().mockResolvedValue(sample) });
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/health" });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok" });
});

it("GET /api/teams returns what the ingest service produced", async () => {
  app = buildApp({ getTeams: vi.fn().mockResolvedValue(sample) });
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/teams" });

  expect(res.statusCode).toBe(200);
  const body = TeamsResponseSchema.parse(res.json());
  expect(body.teams[0]?.id).toBe("MB1");
});

it("GET /api/teams returns 503 when ingest fails", async () => {
  app = buildApp({ getTeams: vi.fn().mockRejectedValue(new Error("sheet down")) });
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/teams" });

  expect(res.statusCode).toBe(503);
});
