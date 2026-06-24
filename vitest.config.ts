import { defineConfig } from "vitest/config";

// Root test runner: aggregates each package's own Vitest project so we run the
// whole suite with a single `pnpm test` while keeping per-package environments.
export default defineConfig({
  test: {
    // Match each package's test config file explicitly — NOT "packages/*",
    // which also globs non-config files like packages/CLAUDE.md and breaks
    // vitest. web uses vite.config.ts; shared/server use vitest.config.ts.
    projects: ["packages/*/{vitest,vite}.config.ts"],
  },
});
