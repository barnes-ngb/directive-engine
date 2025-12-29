import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "demo/**/*.test.ts",
      "src/__tests__/**/*.test.ts",
      "src/test/**/*.test.ts",
      "test/**/*.test.ts"
    ]
  }
});
