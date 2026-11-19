import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: { main: 'client/index.html', admin: 'client/admin.html', tiles: 'client/tiles.html' } } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
});
