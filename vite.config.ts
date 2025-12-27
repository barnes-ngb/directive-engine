import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "datasets",
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    fs: {
      allow: ["."]
    }
  }
});
