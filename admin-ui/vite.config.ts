import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5175, host: true },
  preview: { port: 5175 },
});
