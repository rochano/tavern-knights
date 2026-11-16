// Tells Bing (and other IndexNow search engines) which pages changed, so they
// re-read them now instead of on their next crawl. Run after a deploy:
//   node tools/indexnow.mjs <sitemap.xml> <key-file-url> [--wait]
// The key file must be live at <key-file-url> and contain only the key.
// --wait first waits until the key file is reachable (up to 10 minutes),
// for hosts that deploy on their own after a push (Cloudflare Pages).
import { readFileSync } from "node:fs";

const [sitemapPath, keyUrl, flag] = process.argv.slice(2);
if (!sitemapPath || !keyUrl) {
  console.error("usage: node tools/indexnow.mjs <sitemap.xml> <key-file-url> [--wait]");
  process.exit(2);
}
const key = keyUrl.split("/").pop().replace(/\.txt$/, "");
const urls = [...readFileSync(sitemapPath, "utf8").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
if (!urls.length) {
  console.error("no <loc> entries in " + sitemapPath);
  process.exit(1);
}
const host = new URL(urls[0]).host;

async function keyLive() {
  try {
    const r = await fetch(keyUrl, { cache: "no-store" });
    return r.ok && (await r.text()).trim() === key;
  } catch {
    return false;
  }
}

if (flag === "--wait") {
  // Give the host time to publish this push, then make sure the key is served.
  await new Promise((r) => setTimeout(r, 120_000));
  let ok = false;
  for (let i = 0; i < 16 && !(ok = await keyLive()); i++) await new Promise((r) => setTimeout(r, 30_000));
  if (!ok) {
    console.error("key file not reachable at " + keyUrl);
    process.exit(1);
  }
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation: keyUrl, urlList: urls }),
});
console.log(`IndexNow: ${res.status} for ${urls.length} URLs on ${host}`);
// 200 = accepted, 202 = accepted while the key is being checked.
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
