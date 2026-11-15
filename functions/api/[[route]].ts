// Cloudflare Pages entry for the API. The app itself lives in server/src/app.ts (Hono + TypeScript).
import { handle } from 'hono/cloudflare-pages';
import app from '../../server/src/app';

export const onRequest = handle(app);
