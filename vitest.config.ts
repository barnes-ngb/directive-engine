import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "src/__tests__/**/*.test.ts",
      "src/presentation/**/*.test.ts",
      "src/viewer/**/*.test.ts",
      "src/test/**/*.test.ts",
      "test/**/*.test.ts"
    ]
  }
});
