import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Opt-in bundle treemap: `pnpm build:analyze` (vite build --mode analyze).
    // Off for normal dev/build/CI so it never affects the shipped bundle.
    ...(mode === 'analyze'
      ? [
          visualizer({
            filename: 'stats.html',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  optimizeDeps: {
    include: ['@casso-ar/shared-types'],
  },
  build: {
    // pnpm workspace packages are symlinked, so their resolved real path
    // (packages/shared-types/dist) doesn't match Rollup's default
    // node_modules-only commonjs include pattern, and its CJS named
    // exports go undetected in production builds (works fine in dev,
    // where esbuild's dep pre-bundling handles CJS interop separately).
    commonjsOptions: { include: [/node_modules/, /packages\//] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Default 5000ms is smaller than the `waitFor(..., { timeout: 15_000 })`
    // some lazy-route/chart specs already need, so a starved worker's test was
    // killed before its own wait could finish. Align the per-test and per-hook
    // budget with the async-util timeout set in src/test/setup.ts.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
}));
