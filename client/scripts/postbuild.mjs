// After `ng build`: Angular writes each prerendered route as <route>/index.html. The about page has
// always lived at /about.html, so move about.html/index.html to about.html. index.csr.html (the
// client-only shell Angular emits for non-prerendered routes) is not served on Cloudflare Pages.
import { existsSync, renameSync, rmSync } from 'node:fs';

const out = new URL('../dist/browser/', import.meta.url);
const dir = new URL('about.html/', out), file = new URL('about.html/index.html', out), tmp = new URL('about.html.tmp', out);
if (existsSync(file)) { renameSync(file, tmp); rmSync(dir, { recursive: true }); renameSync(tmp, new URL('about.html', out)); }
rmSync(new URL('index.csr.html', out), { force: true });
