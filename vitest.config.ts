import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// TypeScript's paths mapping does not automatically apply to Vitest/Vite.
// Keep @/ imports in existing tests and runtime source resolved from repo root.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Next.js uses jsx=preserve; Vitest/Vite must lower TSX before import analysis.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
});
