import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "demo",
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: [resolve(__dirname, "src")],
    },
  },
});
