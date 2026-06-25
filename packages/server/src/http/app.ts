import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { TeamsResponseSchema } from "@pokemon-champions/shared";
import { z } from "zod";
import { sampleTeams } from "../domain/sample.js";

/**
 * Builds the Fastify app fully configured but NOT listening. Keeping listen()
 * out of here lets tests drive routes via `app.inject(...)` without a socket.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  // zod is the source of truth at the HTTP border: validates requests and
  // serializes responses against the same schemas the rest of the app uses.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const api = app.withTypeProvider<ZodTypeProvider>();

  api.route({
    method: "GET",
    url: "/api/health",
    schema: {
      response: {
        200: z.object({ status: z.literal("ok") }),
      },
    },
    handler: async () => ({ status: "ok" as const }),
  });

  api.route({
    method: "GET",
    url: "/api/teams",
    schema: {
      response: {
        200: TeamsResponseSchema,
      },
    },
    // Thin handler: ask the domain for teams, stamp the clock at the border
    // (fetchedAt is an effect, kept out of the pure domain), respond. The data
    // source is the temporary sample seam — swap for real ingest later.
    handler: async () => ({
      fetchedAt: new Date().toISOString(),
      teams: sampleTeams(),
    }),
  });

  return app;
}
