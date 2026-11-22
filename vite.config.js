import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5300 },
  build: { target: 'es2022' },
});
