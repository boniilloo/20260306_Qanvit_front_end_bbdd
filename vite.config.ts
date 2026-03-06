
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import type { ConfigEnv } from "vite";

// https://vitejs.dev/config/ 
export default defineConfig(({ mode }: ConfigEnv) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Let Vite forward /functions/* directly to the edge function runner
      "/functions": {
        target: "http://localhost:5173",
        changeOrigin: true,
        bypass: () => undefined          // <- Using undefined instead of false to match expected type
      },
      // Add proxy for /api/* endpoints
      "/api": {
        target: "http://localhost:5173",
        changeOrigin: true,
        bypass: () => undefined
      }
    }
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
