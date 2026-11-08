// Copies the web game from the repo root into apps/www for Capacitor (iOS/Android) and Electron (Steam).
// The live site keeps working as-is; only the copy in www/ is changed:
//  - Google Fonts are swapped for the bundled copies in apps/fonts (works offline)
//  - Google Analytics is removed unless KEEP_ANALYTICS=1 (simpler store privacy labels)
//  - window.TK_APP = 'ios' | 'android' | 'desktop' hint is added for platform tweaks
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apps = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(apps, '..');
const www = join(apps, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

for (const dir of ['art', 'audio', 'sfx']) {
  if (existsSync(join(root, dir))) cpSync(join(root, dir), join(www, dir), { recursive: true });
}
cpSync(join(apps, 'fonts'), join(www, 'fonts'), { recursive: true });
// loading screen frames (the rest of img/ is website screenshots)
cpSync(join(root, 'img'), join(www, 'img'), { recursive: true, filter: (src) => !/\.jpe?g$/i.test(src) });

let html = readFileSync(join(root, 'index.html'), 'utf8');
const before = html.length;

// 1) Fonts: drop Google Fonts links, use bundled fonts.css
html = html.replace(/<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>\s*/g, '');
html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*">\s*/g, '');
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<link rel="stylesheet" href="fonts/fonts.css">');

// 2) Analytics
if (process.env.KEEP_ANALYTICS !== '1') {
  html = html.replace(/<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js[^"]*"><\/script>\s*/g, '');
  html = html.replace(/<script>window\.dataLayer=window\.dataLayer\|\|\[\];function gtag\(\)[^<]*<\/script>\s*/g, '');
}

// 3) Web-only links that make no sense inside an app
html = html.replace('<a href="/about.html">', '<a href="https://tavern-knights.pages.dev/about.html">');

// 4) Platform hint (Capacitor sets window.Capacitor before page scripts run)
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">
<script>window.TK_APP=(window.Capacitor&&window.Capacitor.getPlatform&&window.Capacitor.getPlatform())||(navigator.userAgent.includes('Electron')?'desktop':'web');</script>`);

if (/fonts\.googleapis\.com\/css/.test(html)) throw new Error('Google Fonts link still present: update build-web.mjs');
writeFileSync(join(www, 'index.html'), html);
console.log(`www/ ready (${(before / 1024).toFixed(0)} KB -> ${(html.length / 1024).toFixed(0)} KB index.html, analytics ${process.env.KEEP_ANALYTICS === '1' ? 'kept' : 'removed'})`);
