/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// @tauri-apps/cli sets TAURI_DEV_HOST when serving to a physical device.
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Prevent Vite from clobbering Rust compiler errors in the terminal.
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // Tauri rebuilds the Rust side itself; don't let Vite watch it.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Two separate entry points = two windows that share the same bundle/data layer.
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        quick: resolve(__dirname, "quick.html"),
      },
    },
  },

  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
