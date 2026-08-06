import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

/** Missing /audio/* must 404 — SPA fallback returns HTML 200 and breaks Howler. */
function audioStrict404() {
  return {
    name: 'audio-strict-404',
    configureServer(server: { config: { publicDir: string }; middlewares: { use: Function } }) {
      server.middlewares.use(
        (req: { url?: string }, res: { statusCode: number; end: (s: string) => void }, next: () => void) => {
          const url = (req.url ?? '').split('?')[0];
          if (!url.startsWith('/audio/')) {
            next();
            return;
          }
          const file = path.join(server.config.publicDir, url.slice(1));
          if (!fs.existsSync(file)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          next();
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [audioStrict404()],
  server: { port: 5173, host: true },
  preview: { port: 5173 },
});
