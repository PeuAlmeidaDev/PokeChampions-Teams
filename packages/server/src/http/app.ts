import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

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

  return app;
}
