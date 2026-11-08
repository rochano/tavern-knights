// Store screenshots straight from the game. Usage (from apps/): npm run web && node scripts/screenshots.cjs
// Needs Playwright (npm i -D playwright && npx playwright install chromium) if it isn't installed globally.
const { chromium } = require('playwright');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const WWW = path.join(__dirname, '..', 'www'); const OUT = path.join(__dirname, '..', 'store', 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => {
  const f = path.join(WWW, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!f.startsWith(WWW) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
const SIZES = { steam_play_1920x1080: [1920, 1080], iphone69_2796x1290: [2796, 1290], ipad13_2752x2064: [2752, 2064] };
(async () => {
  await new Promise(ok => server.listen(8765, ok));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const lang of ['th', 'en']) for (const [sz, [w, h]] of Object.entries(SIZES)) {
    const touch = !sz.startsWith('steam');
    const page = await browser.newPage({ viewport: { width: w / (touch ? 2 : 1), height: h / (touch ? 2 : 1) }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
    await page.goto(`http://localhost:8765/index.html?lang=${lang}`);
    await page.waitForFunction(() => window.__tk && !document.getElementById('tk-loader'), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const shot = async (n) => page.screenshot({ path: `${OUT}/${lang}_${sz}_${n}.jpg`, type: 'jpeg', quality: 90 });
    await shot('1_title');
    await page.evaluate(() => { __tk.scene = 'map'; __tk.step(30); }); await page.waitForTimeout(400); await shot('2_map');
    await page.evaluate(() => { __tk.startStage(0); __tk.step(60); }); 
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(2600);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('j'); await page.waitForTimeout(120); }
    await page.keyboard.up('ArrowRight'); await shot('3_stage');
    await page.evaluate(() => { __tk.S.gauge = 100; }); await page.keyboard.press('k'); await page.waitForTimeout(450); await shot('4_special');
    await page.evaluate(() => { __tk.startTavern(); }); await page.waitForTimeout(6000); await shot('5_tavern');
    await page.evaluate(() => { __tk.scene = 'alchemy'; __tk.step(20); }); await page.waitForTimeout(800); await shot('6_alchemy');
    await page.close();
  }
  await browser.close(); server.close();
  console.log('screenshots in', OUT);
})();
