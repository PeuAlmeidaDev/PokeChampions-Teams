import { defineConfig } from "vitest/config";

// Root test runner: aggregates each package's own Vitest project so we run the
// whole suite with a single `pnpm test` while keeping per-package environments.
export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
});
