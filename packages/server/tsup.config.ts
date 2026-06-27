import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  // Bundle the internal workspace package — it ships raw .ts (exports ./src/index.ts),
  // so leaving it external makes the prod bundle import non-existent .js at runtime.
  // Real npm deps (fastify, zod, @fastify/static, …) stay external (node_modules at runtime).
  noExternal: ["@pokemon-champions/shared"],
});
