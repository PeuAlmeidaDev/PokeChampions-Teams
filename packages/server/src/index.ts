import { buildApp } from "./http/app.js";
import { sampleTeams } from "./domain/sample.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp({
  getTeams: async () => ({ fetchedAt: new Date().toISOString(), teams: sampleTeams() }),
});

app.listen({ port, host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
