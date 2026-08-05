import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
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
  },
});
