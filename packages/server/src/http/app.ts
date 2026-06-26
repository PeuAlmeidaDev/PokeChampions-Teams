import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { TeamsResponseSchema, type TeamsResponse } from "@pokemon-champions/shared";
import { z } from "zod";

/** Everything the HTTP layer needs from the rest of the app, injected so tests
 * can drive routes without touching the network. */
export interface AppDeps {
  getTeams: () => Promise<TeamsResponse>;
}

/**
 * Builds the Fastify app fully configured but NOT listening. Keeping listen()
 * out of here lets tests drive routes via `app.inject(...)` without a socket.
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const api = app.withTypeProvider<ZodTypeProvider>();

  api.route({
    method: "GET",
    url: "/api/health",
    schema: { response: { 200: z.object({ status: z.literal("ok") }) } },
    handler: async () => ({ status: "ok" as const }),
  });

  api.route({
    method: "GET",
    url: "/api/teams",
    schema: {
      response: {
        200: TeamsResponseSchema,
        503: z.object({ error: z.string() }),
      },
    },
    // Thin handler: ask the ingest service for teams; turn a root-source failure
    // into 503 so the client can retry (the service self-recovers next call).
    handler: async (_req, reply) => {
      try {
        return await deps.getTeams();
      } catch (err) {
        app.log.error(err);
        return reply.code(503).send({ error: "teams temporarily unavailable" });
      }
    },
  });

  return app;
}
