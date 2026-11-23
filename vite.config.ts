/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Vite options tailored for Tauri development (from the create-tauri-app template).
  // 1. Prevent Vite from obscuring Rust errors.
  clearScreen: false,
  // 2. Tauri expects a fixed port; fail if that port is not available.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    // 3. Do not watch `src-tauri`.
    watch: { ignored: ["**/src-tauri/**"] },
  },

  test: {
    projects: [
      {
        // React app: DOM environment + Testing Library / Tauri mock cleanup.
        extends: true,
        test: {
          name: "web",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        // Repository tooling (hooks, CI helpers): plain Node.
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/**/*.test.mjs", ".claude/**/*.test.mjs"],
        },
      },
    ],
  },
}));
