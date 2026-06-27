import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import {
  TeamsResponseSchema,
  TeamDetailSchema,
  type TeamsResponse,
  type TeamDetail,
} from "@pokemon-champions/shared";
import { z } from "zod";

/** Everything the HTTP layer needs from the rest of the app, injected so tests
 * can drive routes without touching the network. */
export interface AppDeps {
  getTeams: () => Promise<TeamsResponse>;
  getTeamDetail: (id: string) => Promise<TeamDetail | null>;
  /** When set, serve this dir (the built SPA) statically with an index.html fallback. */
  webDistPath?: string;
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

  api.route({
    method: "GET",
    url: "/api/teams/:id/detail",
    schema: {
      params: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/) }),
      response: {
        200: TeamDetailSchema,
        404: z.object({ error: z.string() }),
        503: z.object({ error: z.string() }),
      },
    },
    // Thin handler: ask the detail service; null -> 404, throw -> 503.
    handler: async (req, reply) => {
      try {
        const detail = await deps.getTeamDetail(req.params.id);
        if (!detail) return reply.code(404).send({ error: "team not found" });
        return detail;
      } catch (err) {
        app.log.error(err);
        return reply.code(503).send({ error: "team detail temporarily unavailable" });
      }
    },
  });

  // Serve the built SPA in production (single process, no CORS). Opt-in: dev
  // leaves this unset (Vite serves the SPA), so the API runs alone.
  if (deps.webDistPath) {
    app.register(fastifyStatic, { root: deps.webDistPath, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      // /api misses stay JSON 404 (don't leak HTML into the API contract);
      // every other unmatched GET is a client route → serve the SPA shell.
      if (req.url.startsWith("/api")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.code(200).type("text/html").sendFile("index.html");
    });
  }

  return app;
}
