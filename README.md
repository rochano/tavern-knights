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

กำลังย้ายเป็น Angular client-server ทีละเฟส (เฟส 1-2 เสร็จ: โครง Angular + API TypeScript; เฟส 3 เริ่มแล้ว: โค้ดเกมอยู่ใน bundle ของ Angular)

- `client/` Angular app (หน้าเกม). `client/src/index.html` = head/meta/SEO + หน้าจอโหลด, `client/src/app/play/` = markup + CSS ของจอเกม
- `client/src/game/legacy-game.ts` โค้ดเกม เป็นโมดูล TypeScript ที่ Angular bundle เป็น chunk แยก (ยังเป็นไฟล์เดียว จะแยกเป็นโมดูลทีละฉากต่อไป)
- `client/public/` ไฟล์ static: `art/` รูป, `audio/` เพลง, `sfx/` เสียง, `img/`, `about.html`, `guide/`, `robots.txt`, `sitemap.xml`, `llms.txt`, `_headers`
- `server/src/app.ts` API อันดับ (Hono + TypeScript), `server/migrations/` SQL ของ D1
- `functions/api/[[route]].ts` จุดเข้า Cloudflare Pages Function ที่เรียก server
- `shared/src/api.ts` types ของ API ที่ client และ server ใช้ร่วมกัน
- `tools/split-legacy.py` สคริปต์ที่ใช้แยก index.html เดิมเข้า Angular (ใช้ครั้งเดียว)

Credits: Rochano Developer Teams

## Languages / ภาษา
Thai + English. Auto-detected from the browser; change in Options > Language, or use `?lang=en` / `?lang=th`.
