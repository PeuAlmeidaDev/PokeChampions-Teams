import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, expect, it } from "vitest";
import { TeamsResponseSchema } from "@pokemon-champions/shared";
import { buildApp } from "./app.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

it("GET /api/health returns ok", async () => {
  const res = await app.inject({ method: "GET", url: "/api/health" });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: "ok" });
});

it("GET /api/teams returns the sample teams stamped with fetchedAt", async () => {
  const res = await app.inject({ method: "GET", url: "/api/teams" });

  expect(res.statusCode).toBe(200);
  // Re-validate the wire shape against the shared contract: the route must
  // serialize exactly what `web` will re-parse on the other side.
  const body = TeamsResponseSchema.parse(res.json());
  expect(body.teams).toHaveLength(3);
  expect(body.teams[0]?.id).toBe("MB1");
  // fetchedAt is the clock, stamped at the HTTP border (not in the pure
  // domain). We can't assert an exact value, only that it's a real instant.
  expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
});
