import { defineConfig } from 'vite';

// ============================================================================
// Phase U1.1 — Vite Configuration (Relative base './' for Electron + Code Splitting)
// ============================================================================

export default defineConfig({
  base: './',
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
