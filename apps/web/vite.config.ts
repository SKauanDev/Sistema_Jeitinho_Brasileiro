import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { devApiTarget } from "../../scripts/dev-api-target.mjs";

const apiTarget = devApiTarget();

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      strict: true,
      allow: [fileURLToPath(new URL(".", import.meta.url)), fileURLToPath(new URL("../../node_modules", import.meta.url))],
      deny: [".env", ".env.*", "**/.git/**", "**/.aws/**", "**/.codex/**", "**/anotações.*", "**/backup_database/**", "**/*.{crt,pem,key}"],
    },
    allowedHosts: [".ngrok-free.dev", ".ngrok-free.app"],
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, "") },
      "/socket.io": { target: apiTarget.replace(/^http/, "ws"), ws: true },
    },
  },
});
