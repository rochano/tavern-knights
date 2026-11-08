# Tavern Knights: สามอัศวินต้มยำกุ้ง

เกมแอ็กชันเลื่อนฉากแนว 16-bit ผสมเกมบริหารร้านเหล้า เล่นในเบราว์เซอร์ได้เลย (ไฟล์เดียว HTML5 canvas)

A 16-bit side-scrolling action game mixed with a tavern-management mini-game. Runs in the browser.

เล่นออนไลน์ / Play online: https://rochano.github.io/tavern-knights/ (หลังเปิด GitHub Pages)

## วิธีเล่น / How to play

เปิด `play.html` ผ่านเว็บเซิร์ฟเวอร์ (เช่น GitHub Pages) เสียงเพลงและ SFX ต้องโหลดผ่าน http จึงจะเล่นได้ครบ

Serve the folder over http (e.g. GitHub Pages, or `python3 -m http.server`) and open `index.html` (game page) or `play.html` (the game).

| ปุ่ม | ทำอะไร |
|---|---|
| ← → | เดิน / เลือกจุดในร้าน |
| ↑ / Space | กระโดด |
| J / คลิก | โจมตี / ทำงาน |
| K / คลิกขวา | ท่าพิเศษ |
| L | ท่าประสาน (เกจเต็ม) |
| 1 2 3 | สลับอัศวิน |
| H | วิธีเล่น |
| Esc | หยุดเกม |

## ไฟล์ / Files

- `index.html` หน้าแนะนำเกม (SEO: meta, Open Graph, VideoGame schema)
- `play.html` ตัวเกม (รูปทั้งหมดฝังอยู่ในไฟล์)
- `img/` ภาพหน้าจอและกรอบไม้จากในเกม
- `robots.txt`, `sitemap.xml`, `llms.txt` สำหรับ Google และ AI search
- `audio/` เพลงประกอบ
- `sfx/` เสียงเอฟเฟกต์

Credits: Rochano Developer Teams
