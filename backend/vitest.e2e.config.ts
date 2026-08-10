import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/e2e/**/*.test.ts"],
    // E2E tests can take longer (file I/O, DB round-trips, mesh generation)
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Skip if SKIP_E2E is set or infra is not available
    passWithNoTests: true,
  },
});
