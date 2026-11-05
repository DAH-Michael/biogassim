/// <reference types="vitest" />
import { defineConfig } from 'vite';

// Relative Pfade, damit der Build im Unterordner und im iframe läuft.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, sourcemap: false },
  test: { include: ['tests/**/*.test.ts'] },
});
