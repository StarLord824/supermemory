import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: "../../../dist/ui/app",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:4141",
    },
  },
});
