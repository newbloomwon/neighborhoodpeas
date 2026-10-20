import { defineConfig } from "vitest/config";

// Person F's accessibility tests (jsdom + Testing Library). Person C's tests run with node --test.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom", globals: true, include: ["tests/person-f/**/*.test.tsx"] },
});
