# Tavern Knights: สามอัศวินต้มยำกุ้ง

เกมแอ็กชันเลื่อนฉากแนว 16-bit ผสมเกมบริหารร้านเหล้า เล่นในเบราว์เซอร์ได้เลย (HTML5 canvas, Angular client + Cloudflare server)

A 16-bit side-scrolling action game mixed with a tavern-management mini-game. Runs in the browser.

เล่นออนไลน์ / Play online: https://tavern-knights.pages.dev/

ทดสอบก่อนขึ้นจริง / Staging: https://develop.tavern-knights.pages.dev/ (ดู / see## รันในเครื่อง / Run locally

```
npm install
npm start            # Angular dev server (game only) at http://localhost:4200
npm run dev:api      # build + serve the game and the API with a local database at http://localhost:8788
npm run typecheck    # server TypeScript check
```

เล่น |
| Esc | หยุดเกม |

## ไฟล์ / Files

เป็น Angular client-server แล้ว: โครง Angular + API TypeScript, โค้ดเกมแยกเป็นโมดูล TypeScript ที่มี type ครบ, หน้าเนื้อหา SEO ทำเป็น Angular และ prerender เป็น HTML ตอน build

- `client/` Angular app (หน้าเกม). `client/src/index.html` = head/meta/SEO + หน้าจอโหลด, `client/src/app/play/` = markup + CSS ของจอเกม
- `client/src/game/` โค้ดเกม (TypeScript, โหลดเป็น chunk แยก): `legacy-game.ts` ต่อทุกส่วนเข้าด้วยกันและวน loop, `scenes/` ฉากต่าง ๆ, `draw.ts` `sprites.ts` `touch.ts` `lang.ts` ฯลฯ
- `client/src/app/pages/` หน้า about และคู่มือ (ไทย/อังกฤษ) เนื้อหาอยู่ในไฟล์ .html ของแต่ละหน้า, head/meta/JSON-LD อยู่ใน `page-data.ts`. ตอน build Angular prerender เป็น HTML ล้วนที่ URL เดิม (ไม่มี JS ของ Angular), ดู `app.routes.server.ts` และ `scripts/postbuild.mjs`
- `client/public/` ไฟล์ static: `art/` รูป, `audio/` เพลง, `sfx/` เสียง, `img/`, `404.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, `_headers`
- `server/src/app.ts` API อันดับ (Hono + TypeScript), `server/migrations/` SQL ของ D1
- `functions/api/[[route]].ts` จุดเข้า Cloudflare Pages Function ที่เรียก server
- `shared/src/api.ts` types ของ API ที่ client และ server ใช้ร่วมกัน
- `tools/split-legacy.py` สคริปต์ที่ใช้แยก index.html เดิมเข้า Angular (ใช้ครั้งเดียว)

Credits: Rochano Developer Teams

## Languages / ภาษา
Thai + English. Auto-detected from the browser; change in Options > Language, or use `?lang=en` / `?lang=th`.
