import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the Fastify server during dev (no CORS needed).
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
