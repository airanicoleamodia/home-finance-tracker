import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Mobile-first PWA. No extra plugins needed — manifest + service worker
// live in /public and are referenced from index.html.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false },
});
