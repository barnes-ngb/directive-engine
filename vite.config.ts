import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  base: "./",
  publicDir: "datasets",
  build: {
    outDir: "../dist",
    emptyOutDir: true
  },
  server: {
    fs: {
      allow: [".."]
    }
  }
});
