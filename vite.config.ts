import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "demo",
  base: "./",
  publicDir: "public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "demo/index.html"),
        viewer: resolve(__dirname, "demo/viewer.html")
      }
    }
  },
  server: {
    fs: {
      allow: [".."]
    }
  }
});
