import { defineConfig } from 'vite';

export default defineConfig({
  // Set base to relative paths so Tauri loads bundled assets correctly using local protocols
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    // Prevent minification issues with Three.js classes if any, and speed up build
    minify: 'esbuild',
    sourcemap: false
  },
  server: {
    port: 3000,
    strictPort: true
  }
});
