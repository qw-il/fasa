import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function copyWasm(dest: string) {
  const src = path.resolve("node_modules/@mediapipe/tasks-vision/wasm");
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function mediapipeWasm(): Plugin {
  return {
    name: "mediapipe-wasm",
    configureServer() {
      copyWasm(path.resolve("public/wasm"));
    },
    closeBundle() {
      copyWasm(path.resolve("dist/wasm"));
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeWasm()],
  server: { host: "127.0.0.1", port: 5173 },
});
