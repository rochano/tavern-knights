// @ts-nocheck
// Tavern Knights game code, moved from the old single-file index.html (migration phase 3).
// It runs as one module for now; scenes are split out into typed modules one at a time.
// Everything on screen is drawn on the canvas from the Gemini art sheets.

import { I18N_EN, TOUCH_TXT } from './i18n/en';
import { createNet } from './net';
import { SFX, SFX_BUF, VOL, audio, bgmSync as bgmPlay, noise, setVol, startAudio } from './audio';
import { DEFAULT_SAVE, loadSave, writeSave } from './save';
import { KEYMAP, keys, press, pressed, release } from './input';
import { createAlchemy } from './scenes/alchemy';
import { createMap } from './scenes/map';
import { createRanking } from './scenes/ranking';
import { createTitle } from './scenes/title';
import { CREW_ART_SRC, ENEMY_ART_SRC, FX_ART_SRC, HERO_ATLAS, HERO_ATLAS_SRC, HERO_HI_SRC, UI_ART_SRC } from './data/art';

let started = false;

/** Starts the game on the #game canvas. Call once, after the game screen's markup is in the page. */
export function startGame(): void {
if (started) return;
started = true;
const W = 400, H = 225, GROUND = 190;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');

let LANG = (() => { try { const q = new URLSearchParams(location.search).get('lang'); if (q) return q === 'en' ? 'en' : 'th'; const v = localStorage.getItem('tk-lang'); if (v === 'en' || v === 'th') return v; } catch (e) {} return /^th/i.test(navigator.language || 'th') ? 'th' : 'en'; })();
const _TH = /[฀-๿]/, _trC = new Map(); let _trF = null;
function tr(s) {
  if (LANG === 'th' || typeof s !== 'string' || !_TH.test(s) || s === 'กานม' || s.charCodeAt(0) === 0x2060) return s;
  let r = _trC.get(s); if (r !== undefined) return r;
  r = I18N_EN[s];
  if (r === undefined) { const nums = [], k = s.replace(/\d+/g, m => (nums.push(m), '#')), t = I18N_EN[k]; if (t !== undefined) { let i = 0; r = t.replace(/#/g, () => nums[i++]); } }
  if (r === undefined) { if (!_trF) _trF = Object.keys(I18N_EN).filter(k => !k.includes('#')).sort((a, b) => b.length - a.length); r = s; for (const f of _trF) if (r.includes(f)) r = r.split(f).join(I18N_EN[f]); if (_TH.test(r)) (window.__trMiss = window.__trMiss || new Set()).add(s); }
  _trC.set(s, r); return r;
}
let tpOnTxt = false;
function touchT(s) { if (!tpOnTxt || typeof s !== 'string') return s; const r = TOUCH_TXT[s]; if (r !== undefined) return r; return s.startsWith('J/คลิก: ') ? 'แตะ: ' + s.slice(8) : s; }
{ const ft = ctx.fillText.bind(ctx), mt = ctx.measureText.bind(ctx);
  // align by hand: some mobile in-app browsers (iOS Facebook/LINE webviews) ignore canvas textAlign, which left-aligned centred menus
  ctx.fillText = (s, x, y, m) => { const t = tr(touchT(s)), a = ctx.textAlign;
    if (a === 'center' || a === 'right' || a === 'end') { let w = mt(t).width; if (m !== undefined) w = Math.min(w, m); ctx.textAlign = 'left'; x -= a === 'center' ? w / 2 : w; if (m === undefined) ft(t, x, y); else ft(t, x, y, m); ctx.textAlign = a; return; }
    if (m === undefined) ft(t, x, y); else ft(t, x, y, m); };
  ctx.measureText = s => mt(tr(touchT(s))); }
const _domTh = new WeakMap();
function applyLangDom() {
  document.documentElement.lang = LANG;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { if (n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) continue; if (!_domTh.has(n)) { if (!_TH.test(n.nodeValue)) continue; _domTh.set(n, n.nodeValue); } const o = _domTh.get(n); n.nodeValue = LANG === 'th' ? o : tr(o.trim()) === o.trim() ? o : o.replace(o.trim(), tr(o.trim())); }
}
// analytics: sends game events to Google Analytics (gtag) and gstats when loaded; events before gstats loads are replayed from __track
function track(name, params) { try { const p = Object.assign({ lang: LANG }, params || {}); if (window.gtag) window.gtag('event', name, p); if (window.gstats && window.gstats.__ready) window.gstats.capture(name, p); (window.__track = window.__track || []).push([name, p]); } catch (e) {} }
/* ------------------------------------------------ online ranking (phase 1) */
// Talks to functions/api (Cloudflare Pages Function + D1). Same origin on the web (develop -> staging DB, main -> production DB);
// the store apps (app:// or capacitor://) use production. Everything fails soft: with no network or no database NET.on
// becomes false and the game shows its offline lines instead.
const NET = createNet(() => { for (const k in keys) keys[k] = false; });
const NET_BOARDS = [['stage1_score', 'คะแนนด่าน 1'], ['stage1_time', 'เวลาผ่านด่าน 1'], ['tavern_gold', 'รายได้ร้านในคืนเดียว']];
function netVal(b, v) { if (b === 'stage1_time') { const t = v / 1000, m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); } return b === 'tavern_gold' ? v + 'g' : String(v); }
// one line for the results screens: null when offline (the screen keeps its own line)
function netLine(net, boards) {
  if (!net || net.state === 'off') return null;
  if (net.state === 'send') return { str: 'กำลังส่งคะแนนขึ้นตารางอันดับ...', col: '#bba8ba' };
  if (net.state === 'rejected') return { str: 'คะแนนรอบนี้ไม่ผ่านการตรวจ จึงไม่ขึ้นตารางอันดับ', col: '#ff8a7a' };
  const r = boards.map(b => net.boards[b] && net.boards[b].week).filter(Boolean); if (!r.length) return null;
  const best = r.some(x => x.newBest);
  const str = boards.length > 1 ? 'อันดับสัปดาห์นี้: คะแนนที่ ' + r[0].rank + ' · เวลาที่ ' + (r[1] ? r[1].rank : '-') : 'อันดับรายได้สัปดาห์นี้: ที่ ' + r[0].rank;
  return { str: best ? str + ' · สถิติใหม่!' : str, col: '#9be15d' };
}
function setLang(l) { if (l !== LANG) track('language_change', { to: l }); LANG = l; _trC.clear(); try { localStorage.setItem('tk-lang', l); } catch (e) {} applyLangDom(); if (typeof btnMute !== 'undefined') btnMute.textContent = tr('เสียง: ') + tr(audio.muted ? 'ปิด' : 'เปิด'); if (typeof btnReset !== 'undefined') btnReset.textContent = tr('ล้างเซฟ'); }
ctx.imageSmoothingEnabled = false;

const FONT = '"Pixelify Sans","Courier New",monospace';
const THAI = '"Mitr","Noto Sans Thai",sans-serif';

/* ------------------------------------------------------------------ save */
let save = loadSave();
function persist() { writeSave(save); }

/* ----------------------------------------------------------------- audio */
/* Music and SFX live in audio.ts; the game only says which track fits the current scene. */
function initAudio() { startAudio(); }
function bgmWant() {
  if (scene === 'title' && titleScene.panel === 'credits') return 'ending';
  if (scene === 'results') return 'ending';
  if (scene === 'title' || scene === 'map') return 'title';
  if (scene === 'stage') { if (S && S.boss) return S.boss.dead ? null : 'boss'; return S && S.n === 2 ? 'stage2' : 'stage1'; }
  if (scene === 'alchemy') return 'stage2';
  if (scene === 'tavern') return 'tavern';
  return null;
}
function bgmSync() { bgmPlay(bgmWant(), scene === 'stage' && !!S && !!S.paused); }
let hitKind = 'melee';

/* ----------------------------------------------------------------- input */
{ const hd = document.querySelector('header'); let ht = 0; const show = () => { hd.classList.add('show'); clearTimeout(ht); ht = setTimeout(() => hd.classList.remove('show'), 2200); }; window.addEventListener('mousemove', e => { if (e.clientY < 70) show(); }); window.addEventListener('touchstart', e => { if (e.touches[0] && e.touches[0].clientY < 70) show(); }, { passive: true }); }
setTimeout(function styleTools() { const u = UI_ART_SRC.big.frame_dark; document.querySelectorAll('button.tool').forEach(b => { b.style.background = 'none'; b.style.border = '9px solid transparent'; b.style.borderImage = `url(${u}) 40 44 fill / 9px 11px stretch`; b.style.padding = '0 4px'; b.style.borderRadius = '0'; b.style.color = '#f6ead2'; b.style.textShadow = '0 1px 0 #000'; }); }, 0);
window.addEventListener('keydown', e => { if (e.target && e.target.id === 'nameIn') { if (e.key === 'Enter') { e.preventDefault(); ranking.nameDone(true); } else if (e.key === 'Escape') { e.preventDefault(); ranking.nameDone(false); } return; } const a = KEYMAP[e.code]; if (!a) return; e.preventDefault(); if (a === 'mute' && !e.repeat) toggleMute(); press(a); });
window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) release(a); });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
cv.addEventListener('pointerdown', () => { if (!ranking.nameEdit) cv.focus(); initAudio(); pressed.click = true; });
document.querySelectorAll('#touch button').forEach(b => {
  const a = b.dataset.k;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); press(a); });
  const up = e => { e.preventDefault(); release(a); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
});
const btnMute = document.getElementById('btnMute');
function toggleMute() { audio.muted = !audio.muted; btnMute.textContent = tr('เสียง: ') + tr(audio.muted ? 'ปิด' : 'เปิด'); }
btnMute.addEventListener('click', () => { initAudio(); toggleMute(); });
const btnReset = document.getElementById('btnReset');
let resetArm = 0;
btnReset.addEventListener('click', () => {
  if (Date.now() - resetArm < 3000) { save = structuredClone(DEFAULT_SAVE); persist(); scene = 'title'; btnReset.textContent = tr('ล้างแล้ว'); resetArm = 0; setTimeout(() => btnReset.textContent = tr('ล้างเซฟ'), 1500); }
  else { resetArm = Date.now(); btnReset.textContent = tr('กดอีกครั้งเพื่อยืนยัน'); setTimeout(() => { if (resetArm) btnReset.textContent = tr('ล้างเซฟ'); }, 3000); }
});
setLang(LANG);
const anyConfirm = () => pressed.ok || pressed.click || pressed.atk;

/* --------------------------------------------------------------- sprites */
const spriteCache = new Map();
function scale2x(src) {
  const w = src.width, h = src.height, sd = src.getContext('2d').getImageData(0, 0, w, h), a = new Uint32Array(sd.data.buffer);
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const g = c.getContext('2d');
  const od = g.createImageData(w * 2, h * 2), o = new Uint32Array(od.data.buffer), W2 = w * 2;
  const at = (x, y) => a[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = a[y * w + x], A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== B) e0 = A;
    if (A === B && A !== C && B !== D) e1 = B;
    if (D === C && D !== B && C !== A) e2 = C;
    if (B === D && B !== A && D !== C) e3 = D;
    const i = y * 2 * W2 + x * 2; o[i] = e0; o[i + 1] = e1; o[i + W2] = e2; o[i + W2 + 1] = e3;
  }
  g.putImageData(od, 0, 0); return c;
}
/* volume shading: lighten pixels just under a top edge, darken pixels just over a bottom edge */
function shade(c, outline = true, amt = 0.2) {
  const w = c.width, h = c.height, g = c.getContext('2d'), d = g.getImageData(0, 0, w, h), p = d.data, src = new Uint8ClampedArray(p);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0 && !(src[(y * w + x) * 4] === 27 && src[(y * w + x) * 4 + 1] === 16 && src[(y * w + x) * 4 + 2] === 32);
  const edgeDepth = Math.max(1, Math.round(w / 40));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (!solid(x, y)) continue;
    let k = 0;
    for (let n = 1; n <= edgeDepth; n++) { if (!solid(x, y - n) || !solid(x - n, y)) { k = amt; break; } if (!solid(x, y + n) || !solid(x + n, y)) { k = -amt; break; } }
    if (k > 0) { for (let j = 0; j < 3; j++) p[i + j] = src[i + j] + (255 - src[i + j]) * k; }
    else if (k < 0) { for (let j = 0; j < 3; j++) p[i + j] = src[i + j] * (1 + k); }
  }
  if (outline) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (src[i + 3] > 0) continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < w && Y < h && src[(Y * w + X) * 4 + 3] > 0; });
      if (nb) { p[i] = 27; p[i + 1] = 16; p[i + 2] = 32; p[i + 3] = 255; }
    }
  }
  g.putImageData(d, 0, 0); return c;
}
function makeSprite(rows, pal, scale = 2) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  let c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const col = pal[r[x]]; if (!col) continue; g.fillStyle = col; g.fillRect(x, y, 1, 1); } });
  c = scale2x(c); if (scale >= 2) c = scale2x(c);
  shade(c, false, 0.16);
  c.lw = w * scale; c.lh = h * scale; return c;
}
function flip(c) { const f = document.createElement('canvas'); f.width = c.width; f.height = c.height; f.lw = c.lw; f.lh = c.lh; const g = f.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return f; }
const LW = c => c.lw || c.width, LH = c => c.lh || c.height;
function dimg(img, x, y, w, h) { if (w === undefined && img.ox) { x -= img.ox; y -= img.oy; } ctx.drawImage(img, x, y, w === undefined ? LW(img) : w, h === undefined ? LH(img) : h); }
const tintCache = new WeakMap();
/* Full version switch: the free web demo (tavern-knights.pages.dev) only has Stage 1. Store/Steam builds set window.TK_FULL = true; the develop site and localhost act as full so new stages can be tested. */
const DEV_HOST = /^(localhost|127\.|develop\.)/.test(location.hostname);
const FULL = window.TK_FULL === true || DEV_HOST;
function stage2Open() { return FULL && (DEV_HOST || !!(save && save.stages && save.stages[1])); }
/* temporary Stage 2 look: existing sheet art re-coloured with a canvas filter until the W1-W8 Art Kit sheets arrive */
const recolCache = new Map();
function recol(c, f) {
  if (!c) return c; let m = recolCache.get(c); if (!m) { m = new Map(); recolCache.set(c, m); }
  if (m.has(f)) return m.get(f);
  const t = document.createElement('canvas'); t.width = c.width || c.naturalWidth; t.height = c.height || c.naturalHeight; t.lw = c.lw; t.lh = c.lh; t.padL = c.padL; t.ox = c.ox; t.oy = c.oy;
  const g = t.getContext('2d'); g.filter = f; g.drawImage(c, 0, 0); g.filter = 'none';
  m.set(f, t); return t;
}
function tinted(c, color) {
  let m = tintCache.get(c); if (!m) { m = new Map(); tintCache.set(c, m); }
  if (m.has(color)) return m.get(color);
  const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.lw = c.lw; t.lh = c.lh; const g = t.getContext('2d');
  g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  m.set(color, t); return t;
}
function sprite(key, rows, pal, scale = 2) {
  if (!spriteCache.has(key)) { const r = makeSprite(rows, pal, scale); spriteCache.set(key, { r, l: flip(r) }); }
  return spriteCache.get(key);
}
const BASE = { k: '#1b1020', s: '#f3c58e', S: '#c98e5a', b: '#5a3a22', B: '#2e1d12', w: '#f6efe0', W: '#cfc4b0', e: '#1b1020' };

const KNIGHTS = [
  { id: 'arthur', th: 'อาเธอร์', name: 'Arthur', role: 'the Dishwasher', color: '#d8452e', pal: { a: '#9fb2cc', A: '#5b6b86', r: '#d8452e', L: '#4a5670' },
    body: ['......rrr.....', '.....rrkkkk...', '....kkaaaaak..', '...kaaaaaaaak.', '...kaAkssssk..', '...kaksskskk..', '....kssssssk..', '...krrrrrrrk..', '..kaaaaaaaak..', '..kaAaaaaAak..', '..ksAaaaaAsk..', '...kbbbbbbk...'] },
  { id: 'rosemary', th: 'โรสแมรี่', name: 'Rosemary', role: 'the Chef', color: '#e8833a', pal: { a: '#e8833a', A: '#a85520', h: '#9b3b22', L: '#7a3e1e' },
    body: ['....wwwww.....', '...wwwwwwwk...', '...wwwwwwwk...', '...kkkkkkkk...', '..khhssssk....', '..khsskskk....', '..khhssssk....', '...kkssssk....', '..kaaaaaaak...', '..kaawwwwak...', '..ksawwwwask..', '...kbbbbbk....'] },
  { id: 'percival', th: 'เพอร์ซิวาล', name: 'Percival', role: 'the Mage', color: '#6a9aff', pal: { g: '#3f8f5a', G: '#285c3a', a: '#7ec8e3', y: '#f2d24b', h: '#e9c46a', L: '#2f5d3e' },
    body: ['.........yy...', '...kkkkkkyy...', '..kggggggGk...', '.kggggggggGk..', '..khsssssk....', '..khskskkk....', '..khssssk.....', '...kssssk.....', '..kGaaaaGk....', '.kgGaaaaGgk...', '.kgsaaaasgk...', '..kgbbbbgk....'] },
];
const LEGS = {
  stand: ['....kLk.kLk...', '....kLk.kLk...', '....kBk.kBk...', '...kBBk.kBBk..'],
  run1: ['...kLk...kLk..', '..kLk.....kLk.', '.kBk.......kBk', '.kBBk......kBk'],
  run2: ['.....kLkLk....', '.....kLLLk....', '.....kBBBk....', '....kBBBBk....'],
  jump: ['...kLk..kLk...', '..kLk....kLk..', '..kBk.....kBk.', '..kk.......kk.'],
};
/* Knights are painted at 72x88 real pixels (36x44 world units), facing right, then shaded and outlined. */
function paintKnight(i, frame) {
  const id = KNIGHTS[i].id;
  const c = document.createElement('canvas'); c.width = 72; c.height = 88; const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const E = (cx, cy, rx, ry, col) => { g.fillStyle = col; for (let y = -ry; y <= ry; y++) { const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) ** 2))); g.fillRect(cx - half, cy + y, half * 2 + 1, 1); } };
  const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(q => g.lineTo(q[0], q[1])); g.closePath(); g.fill(); };
  const b = frame === 'run2' ? 1 : 0;
  const LOOK = {
    arthur: { skin: '#f0bf8a', hair: '#6b3b1e', pants: '#3e3a44', boot: '#6b4226', top: '#c0392b' },
    rosemary: { skin: '#f6d2b0', hair: '#9a5a32', pants: '#f4f0ea', boot: '#1f1a24', top: '#24202c' },
    percival: { skin: '#f0bf8a', hair: '#7a4a2a', pants: '#24407a', boot: '#5a3a22', top: '#3a5ab0' },
  }[id];
  const legs = { stand: [[27, 60, 18, 0], [38, 60, 18, 0]], run1: [[21, 60, 15, -5], [42, 59, 14, 5]], run2: [[31, 60, 18, 0], [35, 60, 15, 2]], jump: [[25, 58, 12, -5], [40, 57, 11, 5]] }[frame];
  // behind: tail / lute / cape
  if (id === 'rosemary') { g.strokeStyle = LOOK.hair; g.lineWidth = 4; g.beginPath(); g.moveTo(26, 56 + b); g.quadraticCurveTo(8, 58, 10, 40); g.quadraticCurveTo(11, 33, 6, 30); g.stroke(); R(4, 28, 4, 4, '#f6efe0'); }
  if (id === 'percival') { poly([[26, 38 + b], [14, 74], [32, 74]], '#24407a'); }
  if (id === 'arthur') { poly([[26, 40 + b], [16, 62], [30, 60]], '#8e2a20'); }
  // back arm
  const armBack = id === 'arthur' ? '#9aa0aa' : id === 'rosemary' ? '#1f1a24' : '#2c4a96';
  R(23, 40 + b, 7, 14, armBack); E(26, 56 + b, 4, 4, '#d9a873');
  // legs
  legs.forEach(([x, y, len, off], n) => {
    const dark = n === 0;
    const pc = id === 'arthur' ? (dark ? '#6f747e' : '#9aa0aa') : dark ? shadeHex(LOOK.pants, -0.22) : LOOK.pants;
    R(x, y, 9, len, pc);
    if (id === 'arthur') for (let yy = y + 1; yy < y + len; yy += 3) for (let xx = x + 1 + (yy % 2); xx < x + 8; xx += 3) R(xx, yy, 1, 1, '#5a5e68');
    const bx = x + (off > 0 ? off : off) - 1, by = y + len - 2;
    R(bx, by, 12, 8, dark ? shadeHex(LOOK.boot, -0.25) : LOOK.boot); R(bx + 7, by + 3, 6, 5, dark ? shadeHex(LOOK.boot, -0.25) : LOOK.boot);
    R(bx, by, 12, 2, dark ? shadeHex(LOOK.boot, -0.1) : shadeHex(LOOK.boot, 0.2));
  });
  // torso
  if (id === 'arthur') {
    R(24, 38 + b, 28, 24, '#9aa0aa'); for (let yy = 39 + b; yy < 62 + b; yy += 3) for (let xx = 25 + (yy % 2); xx < 52; xx += 3) R(xx, yy, 1, 1, '#6f747e');
    R(28, 38 + b, 20, 26, LOOK.top); R(28, 38 + b, 20, 2, '#e85a48'); R(28, 62 + b, 20, 2, '#8e2a20');
    // flame emblem
    R(36, 45 + b, 4, 9, '#f2c94c'); R(34, 49 + b, 8, 4, '#f2c94c'); R(37, 43 + b, 2, 3, '#ffe9a0'); R(36, 50 + b, 4, 3, '#ff8a3d');
    R(24, 56 + b, 28, 3, '#5a3a22'); R(36, 56 + b, 5, 3, '#c9a24a');
  } else if (id === 'rosemary') {
    R(26, 38 + b, 24, 20, LOOK.top);
    poly([[24, 56 + b], [52, 56 + b], [56, 66 + b], [20, 66 + b]], LOOK.top);
    R(30, 42 + b, 16, 22, '#f6f2ea'); poly([[28, 58 + b], [48, 58 + b], [50, 65 + b], [26, 65 + b]], '#f6f2ea'); R(28, 64 + b, 22, 1, '#d8d0c4');
    R(30, 37 + b, 16, 4, '#f6f2ea'); R(35, 39 + b, 6, 4, '#c0283a'); R(37, 40 + b, 2, 2, '#ff6a6a');
    R(26, 50 + b, 24, 2, '#f6f2ea');
  } else {
    R(25, 38 + b, 26, 22, LOOK.top);
    poly([[24, 58 + b], [52, 58 + b], [57, 77], [19, 77]], LOOK.top); R(19, 75, 38, 2, '#c9a24a');
    R(37, 40 + b, 2, 36, '#c9a24a'); R(25, 38 + b, 26, 3, '#5a7ad0');
    E(30, 38 + b, 7, 3, '#24407a'); E(46, 38 + b, 5, 3, '#24407a');
    R(24, 55 + b, 28, 3, '#7a4a2a'); R(36, 55 + b, 4, 3, '#c9a24a');
    R(29, 45 + b, 3, 3, '#bfe8ff'); R(30, 44 + b, 1, 5, '#bfe8ff'); R(28, 46 + b, 5, 1, '#bfe8ff');
  }
  // head
  const hx = 39, hy = 25 + b;
  if (id === 'rosemary') { E(hx - 1, hy - 1, 15, 14, LOOK.hair); R(hx - 15, hy, 6, 14, LOOK.hair); }
  E(hx, hy + 1, 12, 12, LOOK.skin);
  // ear
  E(hx - 9, hy + 3, 2, 3, shadeHex(LOOK.skin, -0.12));
  // eyes (big, anime-ish)
  const eyeCol = id === 'rosemary' ? '#3a7ad0' : id === 'percival' ? '#2f8a4a' : '#5a3a22';
  [[hx + 1, hy], [hx + 8, hy]].forEach(([ex, ey]) => { R(ex, ey - 2, 4, 6, '#1b1020'); R(ex, ey, 4, 3, eyeCol); R(ex, ey - 2, 2, 2, '#ffffff'); });
  R(hx + 2, hy - 5, 4, 1, shadeHex(LOOK.hair, -0.2)); R(hx + 8, hy - 5, 4, 1, shadeHex(LOOK.hair, -0.2));
  R(hx - 1, hy + 6, 3, 1, '#f08a7a'); R(hx + 11, hy + 6, 2, 1, '#f08a7a');
  if (id === 'arthur') { R(hx + 4, hy + 8, 5, 2, '#7a2a1a'); R(hx + 5, hy + 8, 3, 1, '#fff'); } else R(hx + 5, hy + 8, 3, 1, '#7a3a2a');
  if (id === 'arthur') {
    E(hx - 1, hy - 8, 13, 6, LOOK.hair); R(hx - 13, hy - 8, 6, 14, LOOK.hair);
    poly([[hx - 4, hy - 12], [hx + 14, hy - 10], [hx + 12, hy - 3], [hx + 6, hy - 6], [hx + 2, hy - 3], [hx - 2, hy - 6]], LOOK.hair);
    poly([[hx - 6, hy - 13], [hx - 2, hy - 18], [hx + 2, hy - 13]], LOOK.hair); poly([[hx + 3, hy - 13], [hx + 9, hy - 17], [hx + 9, hy - 11]], LOOK.hair);
  } else if (id === 'rosemary') {
    poly([[hx - 12, hy - 8], [hx + 13, hy - 8], [hx + 14, hy - 1], [hx + 8, hy - 4], [hx + 3, hy - 1], [hx - 2, hy - 4], [hx - 6, hy], [hx - 12, hy]], LOOK.hair);
    R(hx - 11, hy - 12, 22, 4, '#f6f2ea'); for (let k = 0; k < 5; k++) R(hx - 10 + k * 5, hy - 14, 3, 2, '#f6f2ea');
    poly([[hx - 11, hy - 10], [hx - 7, hy - 24], [hx - 1, hy - 11]], LOOK.hair); poly([[hx - 9, hy - 12], [hx - 7, hy - 20], [hx - 4, hy - 12]], '#f0a0b0');
    poly([[hx + 3, hy - 11], [hx + 10, hy - 24], [hx + 13, hy - 9]], LOOK.hair); poly([[hx + 6, hy - 12], [hx + 9.5, hy - 20], [hx + 11, hy - 11]], '#f0a0b0');
  } else {
    E(hx - 1, hy - 7, 13, 7, LOOK.hair); R(hx - 13, hy - 7, 6, 15, LOOK.hair);
    poly([[hx - 6, hy - 12], [hx + 14, hy - 9], [hx + 13, hy - 1], [hx + 9, hy - 5], [hx + 5, hy - 2], [hx + 1, hy - 6], [hx - 3, hy - 3]], LOOK.hair);
    poly([[hx - 10, hy - 11], [hx - 14, hy - 17], [hx - 4, hy - 13]], LOOK.hair); poly([[hx + 4, hy - 13], [hx + 12, hy - 15], [hx + 10, hy - 9]], LOOK.hair);
  }
  // front arm reaching to the hand at (58,46)
  const sleeve = id === 'arthur' ? '#9aa0aa' : id === 'rosemary' ? '#1f1a24' : '#3a5ab0';
  R(44, 40 + b, 9, 8, sleeve); R(50, 43 + b, 7, 6, sleeve); if (id === 'rosemary') R(52, 43 + b, 4, 6, '#f6f2ea');
  E(58, 46 + b, 4, 4, LOOK.skin);
  // arthur's shield on the back arm
  if (id === 'arthur') { E(22, 52 + b, 10, 12, '#8a5a2e'); E(22, 52 + b, 8, 10, '#a8723a'); R(14, 51 + b, 17, 2, '#6b4226'); E(22, 52 + b, 3, 3, '#c9c9d4'); }
  shade(c, true, 0.18);
  c.lw = 36; c.lh = 44; return c;
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1, 7), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  const f = v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return '#' + [f(r), f(gg), f(b)].map(v => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');
}
/* Hero frames are cut from the user's character sheet (atlas cells 200x120 px = 100x60 world units, feet at 50,58.5). */
const heroAtlas = new Image(); let heroReady = false;
heroAtlas.onload = () => { heroReady = true; for (const k of [...spriteCache.keys()]) if (/^(kn|head)/.test(k)) spriteCache.delete(k); };
heroAtlas.src = HERO_ATLAS_SRC;
/* hi-res hero frames from the user's per-knight Gemini sheets (E1-E3), 4 px per world unit, same cell layout as the atlas */
const HERO_HI = {}; let heroHiReady = false;
function gearLook() { return save.up.legend ? 5 : 1 + Math.min(3, Math.max(save.up.blade || 0, save.up.stew || 0)); }
function gearId(id) { if (!heroHiReady) return id; if (save.up.legend && HERO_HI[id + '5_stand']) return id + '5'; for (let l = 1 + Math.min(3, Math.max(save.up.blade || 0, save.up.stew || 0)); l > 1; l--) if (HERO_HI[id + l + '_stand']) return id + l; return id; }
(() => { const ks = Object.keys(HERO_HI_SRC); let n = ks.length; ks.forEach(k => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); c.lw = im.width / RES; c.lh = im.height / RES; c.hero = true; c.padL = k.endsWith('_head') ? 0 : (c.lw - 100) / 2; c.ox = k.endsWith('_head') ? 0 : 32 + c.padL; c.oy = k.endsWith('_head') ? 0 : c.lh - 45; HERO_HI[k] = c; if (--n === 0) { heroHiReady = true; for (const key of [...spriteCache.keys()]) if (/^(kn|head)/.test(key)) spriteCache.delete(key); } }; im.src = HERO_HI_SRC[k]; }); })();
function atlasCanvas(key, ox, oy) {
  const [x, y, w, h] = HERO_ATLAS[key]; const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(heroAtlas, x, y, w, h, 0, 0, w, h); c.lw = w / 2; c.lh = h / 2; c.ox = ox; c.oy = oy; c.hero = true; return c;
}
function knightSprite(i, frame) {
  const id = KNIGHTS[i].id;
  if (heroHiReady && HERO_HI[id + '_stand']) {
    const gid = gearId(id), nm = HERO_HI[gid + '_' + frame] ? frame : 'stand', key = 'kn' + i + gid + 'hi' + nm;
    if (!spriteCache.has(key)) { const r = HERO_HI[gid + '_' + nm], l = flip(r); l.ox = r.ox; l.oy = r.oy; l.padL = r.padL; l.hero = true; spriteCache.set(key, { r, l }); }
    return spriteCache.get(key);
  }
  if (heroReady) {
    const name = HERO_ATLAS[id + '_' + frame] ? frame : ({ run1: 'run1', run2: 'run3', atk2: 'atk1', atk3: 'atk1' }[frame] || 'stand');
    const key = 'kn' + i + name;
    if (!spriteCache.has(key)) { const r = atlasCanvas(id + '_' + name, 32, 15); const l = flip(r); l.ox = 32; l.oy = 15; l.hero = true; spriteCache.set(key, { r, l }); }
    return spriteCache.get(key);
  }
  const key = 'pk' + i + frame;
  if (!spriteCache.has(key)) { const r = paintKnight(i, HERO_ATLAS ? (['stand', 'run1', 'run2', 'jump'].includes(frame) ? frame : 'stand') : frame); spriteCache.set(key, { r, l: flip(r) }); }
  return spriteCache.get(key);
}
function knightHead(i) {
  const key = (heroReady ? 'head' : 'phead') + i + (heroHiReady ? gearId(KNIGHTS[i].id) : '');
  if (!spriteCache.has(key)) {
    let c;
    if (heroHiReady && HERO_HI[gearId(KNIGHTS[i].id) + '_head']) c = HERO_HI[gearId(KNIGHTS[i].id) + '_head'];
    else if (heroReady) c = atlasCanvas(KNIGHTS[i].id + '_head', 0, 0);
    else { const src = knightSprite(i, 'stand').r; c = document.createElement('canvas'); c.width = 52; c.height = 44; c.getContext('2d').drawImage(src, -12, 0); c.lw = 26; c.lh = 22; }
    spriteCache.set(key, { r: c, l: flip(c) });
  }
  return spriteCache.get(key);
}

const SPR = {
  sporeling: [ ['...kkkkkk...', '..kppwpppk..', '.kpppppwppk.', 'kpwpppppppPk', 'kppppwpppPPk', 'kkkkkkkkkkkk', '...kccccck..', '...kcecek...', '...kcccck...', '...kcccck...', '..kkk.kkk...'],
               ['...kkkkkk...', '..kppwpppk..', '.kpppppwppk.', 'kpwpppppppPk', 'kppppwpppPPk', 'kkkkkkkkkkkk', '...kccccck..', '...kcecek...', '...kcccck...', '...kcccck...', '...kkk.kkk..'] ],
  sporelingPal: { k: '#1b1020', p: '#a056c9', P: '#6c2f8f', w: '#f1e3ff', c: '#efe2c4', e: '#1b1020' },
  moth: [ ['k.........k', 'kk.......kk', 'kmmk...kmmk', 'kmMmkekmMmk', '.kmmkkkmmk.', '..kmmkmmk..', '...k...k...'],
          ['...........', '...........', 'kkk.....kkk', 'kmMmkekmMmk', 'kmmmkkkmmmk', '.kkk...kkk.', '...........'] ],
  mothPal: { k: '#1b1020', m: '#7ad37a', M: '#3f8f3f', e: '#ffe36b' },
  puff: [ ['....kkkk....', '..kkggggkk..', '.kggGggggGk.', 'kggggGgggggk', 'kgekggggekgk', 'kggggkkggggk', '.kggggggggk.', '..kkkkkkkk..'] ],
  puffPal: { k: '#1b1020', g: '#c9b34e', G: '#8e7a2a', e: '#fff' },
  mimic: [ ['.kkkkkkkkkk.', 'kbbbbbbbbbbk', 'kbyybbbbyybk', 'kkkkkkkkkkkk', 'kbbbbyybbbbk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk'],
           ['.kkkkkkkkkk.', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk', 'kwkwkwkwkwkk', 'k.r.r.r.r.rk', 'kwkwkwkwkwkk', 'kbbbbyybbbbk', 'kkkkkkkkkkkk'] ],
  mimicPal: { k: '#1b1020', b: '#9c6a3c', y: '#f2c94c', w: '#fff', r: '#c0283a' },
  beer: ['.wwwww..', 'wwwwwwk.', 'kyyyyykk', 'kyYyyyk.k', 'kyyyyykk', 'kyyYyyk.', 'kyyyyyk.', '.kkkkk..'],
  beerPal: { w: '#fffbea', y: '#f2b134', Y: '#ffd76a', k: '#1b1020' },
  glowcap: ['..kkkk..', '.kggggk.', 'kgGggGgk', 'kkkkkkkk', '...kck..', '...kck..', '..kkkk..'],
  glowcapPal: { k: '#1b1020', g: '#7cf5c8', G: '#e8fff6', c: '#efe2c4' },
  truffle: ['..kkkk..', '.kttTtk.', 'kttttTtk', 'ktTttttk', 'kttttTtk', '.kttttk.', '..kkkk..'],
  trufflePal: { k: '#1b1020', t: '#6d4a33', T: '#e8c76a' },
  ale: ['..kk....', '.kwwk...', '.kwwk...', 'krrrrk..', 'krRrrk..', 'krrrrk..', 'krrrrk..', '.kkkk...'],
  alePal: { k: '#1b1020', w: '#e9dcc0', r: '#d8452e', R: '#ff9a7a' },
  coin: ['.kkkk.', 'kyyYyk', 'kyYyyk', 'kyyyyk', '.kkkk.'],
  coinPal: { k: '#5a3a00', y: '#f2c94c', Y: '#fff2b0' },
  bowl: ['.ssss...', 'srrrrs..', 'kooook..', '.kwwk...', '..kk....'],
  bowlPal: { s: '#ffffffaa', r: '#e2552e', o: '#efe2c4', w: '#c9b79a', k: '#1b1020' },
  heart: ['.kk.kk.', 'krrkrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'],
  heartPal: { k: '#1b1020', r: '#e2483b' },
  crown: ['k.k.k.k', 'kykykyk', 'kyyyyyk', 'kyryyrk', 'kkkkkkk'],
  crownPal: { k: '#1b1020', y: '#f2c94c', r: '#c0283a' },
  ember: ['...k...', '..kok..', '.kooOk.', 'koOOook', 'kooOook', '.kooOk.', '..kkk..'],
  emberPal: { k: '#1b1020', o: '#ff6b2c', O: '#ffd35a' },
  chili: ['....kk..', '...kgk..', '..kkrk..', '.krrrk..', 'krrRrk..', 'krRrk...', 'krrk....', '.kk.....'],
  chiliPal: { k: '#1b1020', g: '#3cbf5a', r: '#e2382c', R: '#ff8a7a' },
  essence: ['..kkk...', '..kwk...', '.kpppk..', 'kpPpppk.', 'kppPppk.', 'kpppppk.', '.kkkkk..'],
  essencePal: { k: '#1b1020', w: '#e9dcc0', p: '#b064d8', P: '#f1e3ff' },
  heartC: ['.kk.kk.', 'krrkrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'],
  heartCPal: { k: '#1b1020', r: '#555' },
  cthulhu: ['.kkkkk..', 'krrRrrk.', 'krRrrrk.', 'krrrrrk.', '.krrrk..', 'k.k.k.k.', 'k.k.k.k.'],
  cthulhuPal: { k: '#1b1020', r: '#3a8a8a', R: '#9ff' },
  feather: ['.....kk.', '....kwk.', '...kwwk.', '..kwwk..', '.kwwk...', '.kwk....', 'kk......'],
  featherPal: { k: '#1b1020', w: '#d8f0ff' },
};
/* Painted icons: drawn with paths in a 16x16 design space, hard-edged, then shaded and outlined. */
function paintCanvas(lw, lh, design, fn) {
  const sc = (lw * 2) / design; const c = document.createElement('canvas'); c.width = lw * 2; c.height = lh * 2; const g = c.getContext('2d');
  g.scale(sc, sc);
  const H2 = {
    E: (x, y, rx, ry, col, a0 = 0, a1 = Math.PI * 2) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, a0, a1); g.fill(); },
    P: (pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); },
    R: (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); },
    L: (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); },
    Q: (x0, y0, cx, cy, x1, y1, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke(); },
    g,
  };
  fn(H2);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 100 ? 255 : 0; g.putImageData(d, 0, 0);
  shade(c, true, 0.16); c.lw = lw; c.lh = lh; return c;
}
const starAt = (H2, x, y, r, col) => { const pts = []; for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } H2.P(pts, col); };
const ICON_PAINT = {
  beer: ({ E, R, Q }) => { Q(11, 7, 15, 9, 11, 12, 1.6, '#e8c070'); R(3, 6, 8, 8.5, '#f2a72a'); R(4, 7, 2, 7, '#ffd36a'); R(3, 13.5, 8, 1.5, '#d8902a'); E(4, 5.5, 2, 1.8, '#fffbea'); E(7, 4.8, 2.4, 2, '#fffbea'); E(10, 5.6, 1.8, 1.6, '#fffbea'); R(9, 6, 1.2, 2.5, '#fffbea'); },
  lucky: (H2) => { ICON_PAINT.beer(H2); starAt(H2, 13, 3, 2.6, '#ffe14a'); starAt(H2, 2, 11, 1.8, '#ffe14a'); },
  chili: ({ P, Q, E }) => { Q(11, 3, 12, 1.5, 13, 2, 1.4, '#3cbf5a'); P([[10, 3], [12, 4], [11, 9], [7, 13], [3, 14.5], [5, 12], [8, 8]], '#e2382c'); E(9.5, 6, 0.8, 1.6, '#ff9a7a'); },
  glowcap: ({ E, R }) => { R(6.5, 8, 3, 6, '#efe2c4'); E(8, 8, 6.5, 5, '#4ad86a', Math.PI, 0); R(1.5, 8, 13, 1.5, '#2a9a48'); E(5, 5.5, 1.2, 1, '#e8fff0'); E(9.5, 4.5, 1.4, 1.1, '#e8fff0'); E(12, 7, 0.9, 0.8, '#e8fff0'); },
  coin: ({ E }) => { E(8, 8, 6, 6, '#e8a81c'); E(8, 8, 4.5, 4.5, '#f2c94c'); E(7, 6.5, 1.5, 2.5, '#fff2b0'); },
  bag: ({ E, P, R }) => { E(8, 10.5, 5.5, 4.5, '#b07a32'); P([[6, 6], [10, 6], [11, 3], [5, 3]], '#b07a32'); R(5.5, 5.5, 5, 1.2, '#7a4a1a'); E(7, 9, 1.5, 2, '#d8a050'); },
  chest: ({ R }) => { R(2, 6, 12, 8, '#8a5a2e'); R(2, 4, 12, 3, '#a8723a'); R(2, 6.5, 12, 1.2, '#f2c94c'); R(3, 4, 1.5, 10, '#f2c94c'); R(11.5, 4, 1.5, 10, '#f2c94c'); R(7, 7, 2, 3, '#f2c94c'); },
  essence: ({ E, R }) => { R(4, 9, 2, 5, '#efe2c4'); R(10, 8, 2, 6, '#efe2c4'); R(7, 6, 2.5, 8, '#efe2c4'); E(5, 9, 3.5, 3, '#d8452e', Math.PI, 0); E(11, 8, 3.5, 3, '#d8452e', Math.PI, 0); E(8, 6, 4.5, 4, '#e8553a', Math.PI, 0); E(7, 4, 0.9, 0.8, '#fff'); E(9.5, 4.5, 0.8, 0.7, '#fff'); E(11.5, 6.5, 0.7, 0.6, '#fff'); E(4, 7.5, 0.7, 0.6, '#fff'); },
  cork: ({ R, E }) => { R(4, 2, 5, 7, '#b07a48'); E(6.5, 2, 2.5, 1, '#d8a070'); R(8, 9, 5, 5, '#9a6a3a'); E(10.5, 9, 2.5, 1, '#c89060'); },
  feather: ({ P, L }) => { P([[13, 2], [9, 3], [4, 9], [3, 13], [7, 12], [12, 6]], '#f2c94c'); L([[13, 2], [2, 14.5]], 0.8, '#b07a1a'); P([[11, 4], [12, 5], [8, 8]], '#fff2b0'); },
  kraken: ({ E, P, L }) => { E(6, 8, 3.8, 4, '#c0283a'); E(10, 8, 3.8, 4, '#c0283a'); P([[2.5, 9], [13.5, 9], [8, 15]], '#c0283a'); L([[7, 4], [6, 1.5]], 1.6, '#3a6ad8'); L([[10, 4], [11, 1.5]], 1.6, '#d8452e'); E(6, 7, 1.2, 1.6, '#ff8a8a'); L([[9, 7], [10, 10], [9, 12]], 0.7, '#3a6ad8'); },
  cthulhu: (H2) => ICON_PAINT.kraken(H2),
  truffle: ({ E }) => { E(8, 9, 5.5, 4.5, '#5a3a24'); E(6, 7.5, 2, 1.5, '#7a5a3a'); E(10, 10, 0.7, 0.7, '#e8c76a'); E(5, 10.5, 0.6, 0.6, '#e8c76a'); E(9, 6.5, 0.6, 0.6, '#e8c76a'); },
  ember: ({ P, E }) => { P([[8, 1.5], [12, 7], [12, 11], [8, 14.5], [4, 11], [4, 7], [6.5, 5]], '#ff6b2c'); P([[8, 6], [10.5, 9.5], [8, 13], [5.5, 9.5]], '#ffd35a'); E(8, 10, 1, 1.5, '#fff6c0'); },
  crown: ({ P, R, E }) => { P([[2, 12], [2, 5], [5, 8], [8, 3], [11, 8], [14, 5], [14, 12]], '#f2c94c'); R(2, 11, 12, 2, '#d8a01c'); E(8, 9.5, 1.2, 1.2, '#c0283a'); E(4.5, 10, 0.9, 0.9, '#4fb3d9'); E(11.5, 10, 0.9, 0.9, '#4fb3d9'); },
  ale: ({ R, E }) => { R(6.5, 1.5, 3, 3.5, '#e9dcc0'); R(6, 1, 4, 1, '#8a6a4a'); E(8, 10, 5, 5, '#d8452e'); E(6.5, 8.5, 1.5, 2, '#ff9a7a'); },
  bowl: ({ E, R }) => { E(8, 8, 7, 5.5, '#9aa0aa', 0, Math.PI); R(5, 13, 6, 1.5, '#6f747e'); E(8, 8, 7, 2, '#e2552e'); E(5.5, 7.5, 1.5, 1, '#ff9a7a'); E(10, 7.6, 1.6, 1, '#ff9a7a'); R(8, 6, 1.5, 1.5, '#c6e86a'); R(12, 4, 0.8, 3.5, '#9be15d'); },
  salt: ({ P, E }) => { P([[2, 13], [8, 4], [14, 13]], '#e8f0f8'); E(6, 10, 1, 0.8, '#ffffff'); E(9, 8, 0.8, 0.7, '#ffffff'); },
  crystal: ({ P }) => { P([[8, 1], [12, 6], [10, 14], [6, 14], [4, 6]], '#8ad8ff'); P([[8, 1], [8, 14], [6, 14], [4, 6]], '#5ab0e8'); },
  tentacle: ({ Q, E }) => { Q(5, 14, 2, 6, 9, 3, 3.2, '#b06ad8'); Q(9, 3, 14, 1, 13, 6, 2.4, '#b06ad8'); E(6, 10, 0.8, 0.8, '#f0c0ff'); E(5.5, 7, 0.7, 0.7, '#f0c0ff'); },
  milk: ({ R, P, E }) => { R(4, 5, 8, 9.5, '#f6f6f6'); P([[4, 5], [8, 1.5], [12, 5]], '#dcdce8'); E(8, 9.5, 2.2, 2, '#9fc8ff'); },
  spoon: ({ E, L }) => { L([[4, 14], [9.5, 6.5]], 1.6, '#e8a81c'); E(11, 4.5, 2.8, 3.6, '#f2c94c'); E(10.5, 3.6, 1, 1.4, '#fff2b0'); },
  bell: ({ P, E, R }) => { P([[3, 12], [4, 7], [8, 3], [12, 7], [13, 12]], '#f2c94c'); R(2, 11.5, 12, 1.6, '#d8a01c'); E(8, 14, 1.5, 1.2, '#d8a01c'); R(7.3, 1, 1.4, 2.5, '#d8a01c'); E(6, 7, 1, 2, '#fff2b0'); },
  obsidian: ({ R, E }) => { R(5, 3, 6, 10, '#5a2a8a'); E(8, 3, 3, 1.2, '#8a5ac8'); R(6, 4, 1.4, 8, '#9a6ad8'); },
  ribs: ({ E, R }) => { E(8, 11, 7, 3.5, '#e8e0d0'); E(8, 9.5, 5.5, 3.2, '#8a3a1a'); for (let k = 0; k < 4; k++) R(4 + k * 2.6, 7, 1, 5, '#f6efe0'); },
  pudding: ({ E, P }) => { E(8, 13, 6.5, 2, '#e8e0d0'); P([[4, 12.5], [5.5, 6], [10.5, 6], [12, 12.5]], '#f2c066'); E(8, 6, 2.6, 1.3, '#8a4a1a'); },
  drink: ({ P, R, L }) => { P([[4, 4], [12, 4], [11, 14], [5, 14]], '#9fd8ff'); P([[4.5, 7], [11.6, 7], [11, 14], [5, 14]], '#4a8ae8'); L([[9, 1.5], [10, 9]], 1, '#ff6ac8'); R(5.5, 8, 1.2, 4, '#c8ecff'); },
  heart: ({ E, P }) => { E(5.5, 6, 3.5, 3.5, '#e2483b'); E(10.5, 6, 3.5, 3.5, '#e2483b'); P([[2.2, 7], [13.8, 7], [8, 14]], '#e2483b'); E(5, 5, 1, 1, '#ffb0a0'); },
  st_fire: ({ P, E }) => { P([[8, 1], [12.5, 8], [11.5, 13], [8, 15], [4.5, 13], [3.5, 8], [6, 5]], '#ff5a1c'); P([[8, 6], [10.5, 10], [8, 14], [5.5, 10]], '#ffd35a'); },
  st_freeze: ({ L }) => { for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; L([[8 - Math.cos(a) * 6.5, 8 - Math.sin(a) * 6.5], [8 + Math.cos(a) * 6.5, 8 + Math.sin(a) * 6.5]], 1.6, '#bff4ff'); } },
  st_slow: ({ E, g }) => { E(8, 8, 6.5, 6.5, '#2a5ad8'); E(8, 8, 5, 5, '#5a9aff'); g.fillStyle = '#ffffff'; g.font = '700 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S', 8, 8.5); },
  st_dizzy: ({ E, L }) => { E(8, 8, 6.5, 6.5, '#ff8a3a'); L([[5, 6], [6, 7], [5, 8]], 0.9, '#1b1020'); L([[11, 6], [10, 7], [11, 8]], 0.9, '#1b1020'); L([[5.5, 11.5], [8, 10.5], [10.5, 11.5]], 0.9, '#1b1020'); },
  st_poison: ({ E, R }) => { E(8, 7, 6, 5.5, '#5ad84a'); R(5, 10, 6, 4, '#5ad84a'); E(5.8, 7, 1.6, 1.8, '#1b1020'); E(10.2, 7, 1.6, 1.8, '#1b1020'); R(6, 12, 1, 2, '#1b1020'); R(9, 12, 1, 2, '#1b1020'); },
  happy: ({ E, L }) => { E(8, 8, 6.5, 6.5, '#ffd84a'); E(5.8, 6.5, 0.9, 1.2, '#1b1020'); E(10.2, 6.5, 0.9, 1.2, '#1b1020'); L([[4.8, 9.5], [8, 12], [11.2, 9.5]], 1, '#1b1020'); },
};
const icon = (name, scale = 2) => {
  const key = 'ic_' + name + scale;
  if (!spriteCache.has(key)) {
    let r;
    if (uiArtReady && UI_ICON[name]) { const src = UI_ICON[name][scale > 1 ? 1 : 0]; if (scale === 1 || scale === 2) r = src; else { r = document.createElement('canvas'); r.width = r.height = RES * 8 * scale; const g = r.getContext('2d'); g.drawImage(src, 0, 0, r.width, r.height); r.lw = r.lh = 8 * scale; } }
    else if (ICON_PAINT[name]) r = paintCanvas(8 * scale, 8 * scale, 16, ICON_PAINT[name]);
    else r = makeSprite(SPR[name], SPR[name + 'Pal'], scale);
    spriteCache.set(key, { r, l: flip(r) });
  }
  return spriteCache.get(key).r;
};

const PAINTED_ENEMY = {
  sporeling: f => paintCanvas(24, 22, 24, ({ E, R, P, L }) => {
    const st = f ? 1 : 0;
    E(8 - st, 20.5, 3.5, 1.8, '#7a2a1a'); E(16 + st, 20.5, 3.5, 1.8, '#7a2a1a');
    E(12, 15, 7.5, 6, '#f08a3a'); E(12, 17, 4.5, 3, '#ffb070');
    E(12, 9, 11, 7.5, '#9a4ad0', Math.PI, 0); P([[1, 9], [23, 9], [21, 11], [3, 11]], '#7a2ab0');
    E(7, 5, 1.8, 1.4, '#f08a3a'); E(13, 3.5, 2, 1.5, '#f08a3a'); E(18, 6, 1.6, 1.3, '#f08a3a'); E(10, 8, 1.2, 1, '#f08a3a');
    E(9.5, 14, 1.4, 1.6, '#1b1020'); E(14.5, 14, 1.4, 1.6, '#1b1020'); E(9.2, 13.6, 0.5, 0.5, '#fff'); E(14.2, 13.6, 0.5, 0.5, '#fff');
    L([[7.5, 11.8], [10.5, 12.8]], 0.9, '#1b1020'); L([[16.5, 11.8], [13.5, 12.8]], 0.9, '#1b1020'); L([[10, 18], [12, 17.2], [14, 18]], 0.9, '#1b1020');
  }),
  mimic: f => paintCanvas(28, 22, 28, ({ E, R, P }) => {
    if (!f) { R(2, 9, 24, 12, '#8a5a2e'); R(2, 4, 24, 6, '#a8723a'); E(14, 4, 12, 2.5, '#b8824a', Math.PI, 0); R(2, 9, 24, 1.6, '#f2c94c'); R(4, 3, 2, 18, '#f2c94c'); R(22, 3, 2, 18, '#f2c94c'); R(12.5, 9.5, 3, 4, '#f2c94c'); }
    else {
      R(2, 13, 24, 8, '#8a5a2e'); R(2, 13, 24, 1.4, '#f2c94c'); P([[2, 12], [26, 12], [24, 1], [4, 1]], '#a8723a'); R(4, 1, 2, 11, '#f2c94c'); R(22, 1, 2, 11, '#f2c94c');
      R(4, 8, 20, 6, '#5a0a1a'); E(14, 12, 6, 2.5, '#e05a7a');
      for (let k = 0; k < 6; k++) { P([[5 + k * 3.2, 8], [8 + k * 3.2, 8], [6.5 + k * 3.2, 11]], '#fff8e8'); P([[5 + k * 3.2, 14], [8 + k * 3.2, 14], [6.5 + k * 3.2, 11.5]], '#fff8e8'); }
      E(9, 5, 1.5, 1.5, '#ffe14a'); E(19, 5, 1.5, 1.5, '#ffe14a');
    }
  }),
};
/* enemy + boss frames cut from the user's Gemini sheet (faces right; l = right-facing, r = flipped) */
const ENEMY_ART = {}; let enemyArtReady = false;
(() => { const ks = Object.keys(ENEMY_ART_SRC); let n = ks.length; ks.forEach(k => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); c.lw = im.width / RES; c.lh = im.height / RES; ENEMY_ART[k] = { l: c, r: flip(c) }; if (--n === 0) enemyArtReady = true; }; im.src = ENEMY_ART_SRC[k]; }); })();
function enemyArtFor(e, frame) {
  if (!enemyArtReady) return null;
  let k = null;
  if (e.type === 'sporeling') k = e.flash > 0 ? 'walker_hurt' : (Math.abs(e.vx) < 4 ? 'walker_idle' : (frame ? 'walker_w2' : 'walker_w1'));
  else if (e.type === 'moth') k = e.flash > 0 ? 'moth_hurt' : (frame ? 'moth_down' : 'moth_up');
  else if (e.type === 'puff') k = e.puffT ? 'puff_inflate' : e.flash > 0 ? 'puff_ball' : (frame ? 'puff_walk' : 'puff_idle');
  else if (e.type === 'mimic') k = e.state === 'sleep' ? 'mimic_sleep' : (frame ? 'mimic_hop' : 'mimic_mouth');
  let fl = null;
  if (e.type === 'keg') { k = e.state === 'charge' || e.state === 'wind' ? 'mimic_mouth' : Math.abs(e.vx) > 4 ? (frame ? 'mimic_hop' : 'mimic_sleep') : 'mimic_sleep'; fl = 'sepia(0.5) brightness(0.95)'; }
  else if (e.type === 'bat') { k = e.flash > 0 ? 'moth_hurt' : (frame ? 'moth_down' : 'moth_up'); fl = 'hue-rotate(60deg) saturate(1.3) brightness(0.9)'; }
  else if (e.type === 'grape' || e.type === 'grapelet') { k = e.flash > 0 ? 'puff_ball' : e.squashT ? 'puff_inflate' : (frame ? 'puff_walk' : 'puff_idle'); fl = 'hue-rotate(200deg) saturate(1.5)'; }
  else if (e.type === 'imp') { k = e.flash > 0 ? 'walker_hurt' : e.throwT ? 'walker_w2' : (Math.abs(e.vx) < 4 ? 'walker_idle' : (frame ? 'walker_w2' : 'walker_w1')); fl = 'hue-rotate(140deg) saturate(1.3)'; }
  if (!k || !ENEMY_ART[k]) return null;
  const spr = fl ? { l: recol(ENEMY_ART[k].l, fl), r: recol(ENEMY_ART[k].r, fl) } : ENEMY_ART[k];
  return { key: k, spr, hurt: /hurt|ball/.test(k) };
}
/* crew, customers and robber cut from the user's Gemini sheet B (all face right: l = native, r = flipped) */
const CREW_ART = {}; let crewArtReady = false;
(() => { const ks = Object.keys(CREW_ART_SRC); let n = ks.length; ks.forEach(k => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); c.lw = im.width / RES; c.lh = im.height / RES; CREW_ART[k] = { l: c, r: flip(c) }; if (--n === 0) crewArtReady = true; }; im.src = CREW_ART_SRC[k]; }); })();
/* attack FX, wall, chests and tavern props cut from the user's Gemini sheet C (native art faces right: n = native, f = flipped) */
const FX_ART = {}; let fxArtReady = false;
(() => { const ks = Object.keys(FX_ART_SRC); let n = ks.length; ks.forEach(k => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); c.lw = im.width / RES; c.lh = im.height / RES; FX_ART[k] = { n: c, f: flip(c) }; if (--n === 0) fxArtReady = true; }; im.src = FX_ART_SRC[k]; }); })();
function fxImg(k, face = 1) { const a = FX_ART[k]; return a ? (face < 0 ? a.f : a.n) : null; }
function fxC(k, cx, cy, face = 1, s = 1) { const im = fxImg(k, face); if (!im) return false; const w = LW(im) * s, h = LH(im) * s; ctx.drawImage(im, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h); return true; }
function fxB(k, cx, by, face = 1, s = 1) { const im = fxImg(k, face); if (!im) return false; const w = LW(im) * s, h = LH(im) * s; ctx.drawImage(im, Math.round(cx - w / 2), Math.round(by - h), w, h); return true; }
/* item icons, tavern/map icons, bar frames, dialog box and crew busts cut from the user's Gemini sheet D */
const UI_ICON = {}, UI_BIG = {}; let uiArtReady = false;
(() => {
  const mk = (srcUri, done) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); c.lw = im.width / RES; c.lh = im.height / RES; done(c); }; im.src = srcUri; };
  const ik = Object.keys(UI_ART_SRC.icons), bk = Object.keys(UI_ART_SRC.big); let n = ik.length * 2 + bk.length;
  const fin = () => { if (--n === 0) { uiArtReady = true; for (const key of [...spriteCache.keys()]) if (key.startsWith('ic_')) spriteCache.delete(key); } };
  ik.forEach(k => { UI_ICON[k] = []; UI_ART_SRC.icons[k].forEach((u, i) => mk(u, c => { UI_ICON[k][i] = c; fin(); })); });
  bk.forEach(k => mk(UI_ART_SRC.big[k], c => { UI_BIG[k] = c; fin(); }));
})();
function uiIcon(k, cx, cy, size) { const a = UI_ICON[k]; if (!uiArtReady || !a) return false; const im = size > 10 ? a[1] : a[0]; ctx.drawImage(im, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size); return true; }
function uiBig(k, cx, cy, s = 1) { const im = UI_BIG[k]; if (!uiArtReady || !im) return false; const w = LW(im) * s, h = LH(im) * s; ctx.drawImage(im, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h); return true; }
/* crisp UI frames: sheet-D frames re-sampled to their true pixel grid (1 art pixel each), drawn as 9-slices at a whole number of screen pixels per art pixel */
const PXF_SRC = {"frame_dark": "art/ee9f33c9cd83.webp", "frame_blue": "art/73185bb01f97.webp", "dialog": "art/181d43739390.webp", "e6_btn_n": "art/99b0ba4aeb21.webp", "e6_btn_s": "art/21f3017ae152.webp", "e6_btn_d": "art/7bd29faefd84.webp", "e6_window": "art/b1560977b03e.webp"}, PXF = {};
for (const k in PXF_SRC) { const im = new Image(); im.onload = () => { const H = im.height, mid = 3; im.T = Math.floor((H - mid) / 2); im.B = H - mid - im.T; im.L = im.R = k === 'dialog' ? 11 : 8; if (k === 'dialog') im.T = im.B = 11; if (k.startsWith('e6_btn')) { im.L = im.R = 10; im.T = 6; im.B = 6; } if (k === 'e6_window') { im.L = im.R = 20; im.T = im.B = 22; } PXF[k] = im; }; im.src = PXF_SRC[k]; }
const POOL_SQ = 0.55;
const E7_SRC = {"pit": "art/4c5078272bc3.webp", "pool": "art/6e7c374915d9.webp", "bub0": "art/bb0d5088bfe2.webp", "bub1": "art/f9fd734cc78a.webp", "bub2": "art/5be9cbb147c5.webp"}, E7 = {};
for (const k in E7_SRC) { const im = new Image(); im.onload = () => { E7[k] = im; }; im.src = E7_SRC[k]; }
const E5_SRC = {"pool": "art/47a623b8d4ef.webp", "shock": "art/28a6c5a024c6.webp", "spore": "art/6de6171bdaa1.webp", "mug": "art/f37aef6cbe64.webp"}, E5 = {};
for (const k in E5_SRC) { const im = new Image(); im.onload = () => { E5[k] = im; }; im.src = E5_SRC[k]; }
const TRAY_SRC = {"tray_empty": "art/2fec1f9ad44c.webp", "tray_beer": "art/cf5a1de7dacc.webp", "tray_mix": "art/6972664d1dbc.webp"}, TRAY = {};
for (const k in TRAY_SRC) { const im = new Image(); im.onload = () => { TRAY[k] = im; }; im.src = TRAY_SRC[k]; }
const pxFor = im => im === UI_BIG.frame_dark ? PXF.frame_dark : im === UI_BIG.frame_blue ? PXF.frame_blue : im === UI_BIG.dialog ? PXF.dialog : null;
function pxSlice(p, x, y, w, h, u) {
  const sn = v => Math.round(v * RES) / RES; x = sn(x); y = sn(y); w = sn(w); h = sn(h);
  const uh = Math.min(u, w / (p.L + p.R), h / (p.T + p.B)), uq = Math.max(1, Math.floor(uh * RES)) / RES;
  const sx = [0, p.L, p.width - p.R, p.width], sy = [0, p.T, p.height - p.B, p.height];
  const dx = [x, x + p.L * uq, x + w - p.R * uq, x + w], dy = [y, y + p.T * uq, y + h - p.B * uq, y + h];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const dw = dx[i + 1] - dx[i], dh = dy[j + 1] - dy[j]; if (dw > 0 && dh > 0) ctx.drawImage(p, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dw, dh); }
  return uq;
}
function pxUnit(h) { return h >= 14 ? 1 : h >= 10.5 ? 0.75 : 0.5; }
function slice3(im, x, y, w, h, cap) {
  const p = pxFor(im); if (p) { pxSlice(p, x, y, w, h, pxUnit(h)); return; } const k = h / im.height, c = cap * k, sw = im.width; ctx.drawImage(im, 0, 0, cap, im.height, x, y, c, h); ctx.drawImage(im, cap, 0, sw - 2 * cap, im.height, x + c, y, w - 2 * c, h); ctx.drawImage(im, sw - cap, 0, cap, im.height, x + w - c, y, c, h); }
function frameBar(k, x, y, w, h, frac, col, hi) {
  const im = UI_BIG[k]; if (!uiArtReady || !im) return false;
  const p = pxFor(im); let ix, iy, iw, ih; const f = clamp(frac, 0, 1);
  if (p) { const u = pxSlice(p, x, y, w, h, pxUnit(h)); ix = x + 7 * u; iy = y + 4 * u; iw = w - 14 * u; ih = h - 8 * u; }
  else { slice3(im, x, y, w, h, 22 * im.height / 40); const q = h / 40; ix = x + 12 * q; iy = y + 8.5 * q; iw = w - 24 * q; ih = h - 17 * q; }
  rect(ix, iy, iw * f, ih, col); if (hi) rect(ix, iy, iw * f, Math.max(1, ih * 0.3), hi);
  return { ix, iy, iw, ih };
}
function nineBox(k, x, y, w, h, b = 16, d = 6) {
  const im = UI_BIG[k]; if (!uiArtReady || !im) return false;
  if (k === 'dialog' && PXF.e6_window) { pxSlice(PXF.e6_window, x, y, w, h, h >= 150 ? 0.75 : 0.5); return true; }
  const pp = pxFor(im); if (pp) { pxSlice(pp, x, y, w, h, h >= 60 ? 1.25 : 1); return true; }
  b = b * im.height / 96; const sw = im.width, sh = im.height, sx = [0, b, sw - b, sw], sy = [0, b, sh - b, sh], dx = [x, x + d, x + w - d, x + w], dy = [y, y + d, y + h - d, y + h];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ctx.drawImage(im, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]);
  return true;
}
const CUST_KEYS = ['cust_dwarf', 'cust_mug', 'cust_elf', 'cust_archer', 'cust_merchant', 'cust_bard', 'cust_noble', 'cust_lady'];
const enemySprite = (type, frame) => {
  const key = 'en_' + type + frame;
  if (!spriteCache.has(key)) {
    let r;
    if (PAINTED_ENEMY[type]) r = PAINTED_ENEMY[type](frame % 2);
    else r = makeSprite(SPR[type][frame % SPR[type].length], SPR[type + 'Pal']);
    spriteCache.set(key, { r, l: flip(r) });
  }
  return spriteCache.get(key);
};
const thiefSprite = f => {
  const key = 'thief' + f;
  if (!spriteCache.has(key)) spriteCache.set(key, { r: paintCanvas(24, 34, 24, ({ E, R, P, L }) => {
    const st = f ? 2 : 0;
    R(7 - st, 25, 4, 7, '#4a3020'); R(13 + st, 25, 4, 7, '#4a3020'); R(5 - st, 31, 6, 3, '#2a1a10'); R(13 + st, 31, 6, 3, '#2a1a10');
    R(6, 14, 12, 12, '#7a5030'); R(6, 21, 12, 2, '#3a2416'); R(5, 14, 14, 3, '#3a8a4a');
    E(12, 8.5, 5.5, 5.5, '#e8b080'); E(12, 5, 6, 3, '#6a3a1a', Math.PI, 0); R(6.5, 8, 11, 3, '#3a8a4a'); E(10, 9.5, 0.8, 0.8, '#1b1020'); E(14, 9.5, 0.8, 0.8, '#1b1020');
    L([[18, 18], [23, 10]], 1.4, '#d8dce8'); R(16.5, 17.5, 3, 1.2, '#c9a24a');
    E(4, 20, 4, 4.5, '#c9a24a'); R(2.5, 15, 3, 2, '#8a6a2a'); E(4, 21, 1, 1, '#fff2b0');
  }), l: null });
  const o = spriteCache.get(key); if (!o.l) o.l = flip(o.r); return o;
};
/* --------------------------------------------------------------- helpers */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const RES = 4; // canvas px per world unit (world is 400x225)
const hp = v => Math.round(v * RES) / RES;
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(hp(x), hp(y), hp(w), hp(h)); }
function text(str, x, y, opt = {}) {
  ctx.font = `${opt.weight || 600} ${opt.size || 10}px ${opt.thai ? THAI : FONT}`;
  ctx.textAlign = opt.align || 'left'; ctx.textBaseline = opt.base || 'top';
  if (opt.shadow !== false) { ctx.fillStyle = opt.shadowColor || '#1b1020'; ctx.fillText(str, hp(x) + 0.5, hp(y) + 0.5); }
  ctx.fillStyle = opt.color || '#f6ead2'; ctx.fillText(str, hp(x), hp(y));
}
// text whose visual middle (cap height for Latin/digits, consonant body for Thai) sits exactly on cy, so it lines up with icons and bars
const _midCache = {};
function textC(str, x, cy, opt = {}) {
  const size = opt.size || 10, font = `${opt.weight || 600} ${size}px ${opt.thai ? THAI : FONT}`, key = font;
  if (_midCache[key] === undefined) { ctx.font = font; ctx.textBaseline = 'alphabetic'; const m = ctx.measureText(opt.thai ? 'กานม' : 'H08x'); _midCache[key] = m.actualBoundingBoxAscent / 2; }
  text(str, x, cy + _midCache[key], Object.assign({}, opt, { base: 'alphabetic' }));
}
function uiBtn(x, y, w, h, on, c1, c2, c3, c4) {
  const e6 = PXF[on === 'off' ? 'e6_btn_d' : on ? 'e6_btn_s' : 'e6_btn_n']; if (e6) { pxSlice(e6, x, y, w, h, clamp(Math.round(h / 25 * RES) / RES, 0.5, 1)); return; }
  const im = uiArtReady && UI_BIG[on ? 'frame_blue' : 'frame_dark'];
  if (im) { let cap = 22 * im.height / 40; const k = h / im.height; if (2 * cap * k > w - 1) cap = (w - 1) / 2 / k; slice3(im, x, y, w, h, cap); return; }
  rect(x, y, w, h, on ? c1 : c2); rect(x + 0.5, y + 0.5, w - 1, h - 1, on ? c3 : c4);
}
function panel(x, y, w, h, fill = '#221727ee', edge = '#f2a93b') {
  if (uiArtReady && UI_BIG.dialog) { if (h >= 24) { nineBox('dialog', x - 1, y - 1, w + 2, h + 2, 16, Math.min(7, h / 3)); return; } uiBtn(x, y, w, h, false); return; }
  rect(x, y, w, h, edge); rect(x + 1, y + 1, w - 2, h - 2, '#1b1020'); rect(x + 2, y + 2, w - 4, h - 4, fill); }
function bar(x, y, w, h, frac, col, back = '#1b1020') { rect(x, y, w, h, '#1b1020'); rect(x + 1, y + 1, w - 2, h - 2, back); rect(x + 1, y + 1, Math.max(0, (w - 2) * clamp(frac, 0, 1)), h - 2, col); }

let shake = 0;
function addShake(v) { shake = Math.max(shake, v); }

/* ================================================================ STAGE 1 */
const LEVEL_W = 3120, ARENA = 2720;
function knightMax() { return 100 + 25 * save.up.stew; }
function dmgMul() { return (1 + 0.2 * save.up.blade + (save.up.legend ? 0.5 : 0)) * (S && S.buff ? 1.3 : 1); }

let S = null;
function startStage(checkpoint, n) {
  n = n || (S && S.n) || 1;
  track(checkpoint ? 'stage_retry' : 'stage_start', { stage: n });
  const prevS = checkpoint ? S : null;
  const prevLoot = S && checkpoint ? S.loot : null, prevKills = S && checkpoint ? S.kills : 0, prevWall = S && checkpoint ? S.wall.broken : false, prevVault = S && checkpoint ? S.vaultOpened : false;
  S = {
    n, t: 0, camX: 0, paused: false, pits: [], shelf: null,
    p: { x: 40, y: GROUND - 36, w: 18, h: 36, vx: 0, vy: 0, face: 1, onGround: true, inv: 0, atkT: 0, atkCd: 0, combo: 0, comboT: 0, special: null, swapCd: 0, anim: 0, lunge: 0, kbT: 0 },
    knights: KNIGHTS.map(() => ({ hp: knightMax(), max: knightMax(), down: false })), active: 0,
    gauge: save.up.brew ? 50 : 0,
    enemies: [], projs: [], hits: [], pickups: [], parts: [], texts: [],
    platforms: [
      { x: 300, y: 152, w: 64 }, { x: 420, y: 124, w: 64 }, { x: 770, y: 146, w: 80 }, { x: 900, y: 116, w: 64 },
      { x: 1160, y: 162, w: 48 }, { x: 1600, y: 146, w: 72 }, { x: 1720, y: 116, w: 72 },
      { x: 2100, y: 150, w: 90 }, { x: 2250, y: 120, w: 64 }, { x: 2400, y: 150, w: 80 },
    ],
    solids: [ { x: 1240, y: 138, w: 200, h: 12, kind: 'slab' }, { x: 1424, y: 150, w: 16, h: 40, kind: 'rock' } ],
    wall: { x: 1240, y: 150, w: 16, h: 40, broken: prevWall },
    vaultOpened: prevVault,
    pools: [ { x: 620, w: 70 }, { x: 1520, w: 60 }, { x: 1990, w: 70 } ],
    boss: null, bossOn: false, bossIntro: 0, kills: prevKills,
    loot: prevLoot || { glowcap: 0, truffle: 0, crown: 0, ember: 0, chili: 0 }, buff: false, ko: 0,
    sup: { bart: save.tools && save.tools.bell ? 3 : 2, bartCd: 0, gorn: null },
    ult: null, banner: null, end: null, speech: null, score: 0, hint: null, checkpoint: !!checkpoint, poolT: 0,
  };
  S.net = n !== 1 ? null : prevS ? prevS.net : NET.start('stage'); S.netT0 = prevS ? (prevS.netT0 || 0) + prevS.t : 0;
  if (save.buff && !checkpoint) { S.buff = true; save.buff = false; persist(); S.gauge = Math.min(100, S.gauge + 50); }
  if (save.drink && !checkpoint) { save.drink = false; persist(); S.gauge = 100; }
  if (n === 2) layoutStage2(!!checkpoint, prevWall, prevVault);
  if (!S.wall.broken) S.solids.push(S.wall);
  const E = (type, x, y) => S.enemies.push(makeEnemy(type, x, y));
  if (n === 2) { if (checkpoint) { S.p.x = ARENA - 120; S.camX = ARENA - 260; } }
  else if (checkpoint) {
    S.p.x = ARENA - 120; S.camX = ARENA - 260;
  } else {
    [250, 520, 700, 990, 1100, 1660, 1830, 2160, 2320, 2520].forEach(x => E('sporeling', x));
    [560, 1010, 1700, 2210, 2470].forEach(x => E('moth', x, rnd(80, 110)));
    [860, 1480, 2360].forEach(x => E('puff', x));
    E('mimic', 1950);
    const P = (type, x, y) => S.pickups.push({ type, x, y, w: 16, h: 16, bob: Math.random() * 6 });
    P('glowcap', 326, 132); P('beer', 446, 102); P('glowcap', 924, 96); P('ale', 1612, 126); P('beer', 1748, 94); P('glowcap', 2272, 100); P('glowcap', 2600, 170); P('beer', 1300, 116); P('chili', 790, 124); P('chili', 1745, 70); P('chili', 2420, 128);
    if (!S.vaultOpened) S.pickups.push({ type: 'chest', x: 1330, y: 174, w: 24, h: 16, bob: 0 });
  }
  scene = 'stage';
  S.banner = n === 2 ? { text: checkpoint ? 'Back to the cellar!' : 'STAGE 2', sub: checkpoint ? 'Baron von Barrel awaits' : 'ดันเจี้ยนไวน์โบราณ · Ancient Wine Dungeon', t: 2.2 }
    : { text: checkpoint ? 'Back to the throne!' : 'STAGE 1', sub: checkpoint ? 'King Shroomba awaits' : 'ป่าเห็ดพิษ · Poison Mushroom Forest', t: 2.2 };
}

/* ================================================================ STAGE 2: Ancient Wine Dungeon
   pits you jump over, sticky wine puddles, a dirt mound only the Mole can dig (vault),
   a high cellar shelf only the Pixie can reach, and the boss Baron von Barrel */
function layoutStage2(checkpoint, prevWall, prevVault) {
  S.platforms = [
    { x: 300, y: 150, w: 64 }, { x: 430, y: 122, w: 56 }, { x: 800, y: 146, w: 72 }, { x: 930, y: 118, w: 64 },
    { x: 1540, y: 150, w: 72 }, { x: 2140, y: 150, w: 72 }, { x: 2290, y: 120, w: 64 }, { x: 2440, y: 146, w: 72 },
  ];
  S.shelf = { x: 1730, y: 70, w: 96, got: prevVault && S.shelf ? S.shelf.got : false };
  S.platforms.push(S.shelf);
  S.pits = [{ x: 600, w: 46 }, { x: 1040, w: 50 }, { x: 2010, w: 50 }];
  S.pools = [{ x: 700, w: 60 }, { x: 1640, w: 64 }, { x: 2560, w: 60 }];
  S.loot = Object.assign({ cork: 0 }, S.loot);
  if (checkpoint) return;
  S.enemies = [];
  const E = (type, x, y) => S.enemies.push(makeEnemy(type, x, y));
  [260, 520, 880, 1150, 1700, 1900, 2240, 2500].forEach(x => E('keg', x));
  [480, 980, 1600, 2180, 2420].forEach(x => E('bat', x, rnd(78, 108)));
  [760, 1480, 2330].forEach(x => E('grape', x));
  [1120, 1960, 2600].forEach(x => E('imp', x));
  const P = (type, x, y) => S.pickups.push({ type, x, y, w: 16, h: 16, bob: Math.random() * 6 });
  S.pickups = [];
  P('glowcap', 326, 130); P('beer', 452, 100); P('chili', 824, 124); P('glowcap', 954, 96); P('ale', 1564, 128); P('beer', 1300, 116); P('chili', 2164, 128); P('beer', 2314, 98); P('glowcap', 2466, 124); P('ale', 2640, 170);
  if (!S.vaultOpened) S.pickups.push({ type: 'chest', x: 1330, y: 174, w: 24, h: 16, bob: 0 });
  S.pickups.push({ type: 'shelfchest', x: S.shelf.x + 36, y: S.shelf.y - 16, w: 24, h: 16, bob: 0 });
}
function overPit(x, w) { return S.pits.some(pt => x + w / 2 > pt.x + 2 && x + w / 2 < pt.x + pt.w - 2); }
function pitAhead(e, d) { const fx = d > 0 ? e.x + e.w + 6 : e.x - 6; return S.pits.some(pt => fx > pt.x && fx < pt.x + pt.w); }

function makeEnemy(type, x, y) {
  const base = { type, x, y: 0, vx: 0, vy: 0, face: -1, hp: 20, max: 20, w: 20, h: 22, t: Math.random() * 2, flash: 0, burn: 0, slow: 0, freeze: 0, kbT: 0, dead: false, cd: rnd(0.5, 2), state: 'idle', anim: 0, active: false, contact: 8 };
  if (type === 'sporeling') Object.assign(base, { hp: 22, max: 22, w: 20, h: 20 });
  if (type === 'moth') Object.assign(base, { hp: 14, max: 14, w: 20, h: 12, homeY: y, contact: 7 });
  if (type === 'puff') Object.assign(base, { hp: 34, max: 34, w: 22, h: 16, heavyish: true, contact: 6 });
  if (type === 'mimic') Object.assign(base, { hp: 60, max: 60, w: 24, h: 20, state: 'sleep', contact: 12 });
  if (type === 'keg') Object.assign(base, { hp: 30, max: 30, w: 22, h: 22, contact: 10 });
  if (type === 'bat') Object.assign(base, { hp: 16, max: 16, w: 20, h: 12, homeY: y, contact: 8 });
  if (type === 'grape') Object.assign(base, { hp: 28, max: 28, w: 20, h: 18, contact: 8 });
  if (type === 'grapelet') Object.assign(base, { hp: 8, max: 8, w: 12, h: 10, contact: 5, cd: rnd(0.3, 0.8) });
  if (type === 'imp') Object.assign(base, { hp: 22, max: 22, w: 18, h: 20, contact: 7, cd: rnd(1, 2) });
  base.y = type === 'moth' || type === 'bat' ? y : GROUND - base.h;
  return base;
}

function activeK() { return S.knights[S.active]; }
function kid() { return KNIGHTS[S.active].id; }

function swapTo(i) {
  const p = S.p;
  if (i === S.active || S.knights[i].down || p.swapCd > 0 || S.ult) return;
  if (p.special && p.special.type === 'tempest') p.special = null;
  S.active = i; p.swapCd = 0.3; p.inv = Math.max(p.inv, 0.25); p.atkT = 0;
  for (let n = 0; n < 10; n++) S.parts.push({ x: p.x + 9 + rnd(-10, 10), y: p.y + rnd(0, 30), vx: rnd(-40, 40), vy: rnd(-60, -10), life: 0.4, max: 0.4, col: '#fff6d8', size: 3 });
  S.texts.push({ x: p.x + 9, y: p.y - 6, str: KNIGHTS[i].name + '!', col: KNIGHTS[i].color, life: 0.7 });
  SFX.swap();
}
function cycle(d) { for (let n = 1; n <= 3; n++) { const i = (S.active + d * n + 3) % 3; if (!S.knights[i].down) { swapTo(i); return; } } }

function addGauge(v) { const before = S.gauge; S.gauge = clamp(S.gauge + v, 0, 100); if (before < 100 && S.gauge >= 100) S.texts.push({ x: S.p.x + 9, y: S.p.y - 14, str: 'GAUGE MAX!', col: '#7fd6ff', life: 1 }); }

/* mouse aim: a click in a stage stores the cursor's world point; shots fired within 0.25 s fly toward it (kept in front of the knight, at most ~50 degrees up or down) */
let stickVec = null; // mobile joystick direction (-1..1), used to aim shots when no tap aim is fresh
function aimEnemy(sx, sy, face, px, py, rad) { /* nearest live monster on the facing side; with px/py, only ones within rad of that point */
  let best = null, bd = 1e9;
  for (const e of S.enemies) { if (e.dead || !e.active || e.state === 'sleep') continue; const ex = e.x + e.w / 2, ey = e.y + e.h * 0.5, dx = ex - sx; if (dx * face < 4 || Math.abs(dx) > W * 0.95) continue;
    const d = px === undefined ? Math.abs(dx) + Math.abs(ey - sy) * 0.6 : Math.hypot(ex - px, ey - py) - Math.max(e.w, e.h) / 2; if (px !== undefined && d > rad) continue; if (d < bd) { bd = d; best = [ex, ey]; } }
  return best;
}
function aimVel(sx, sy, speed, face) {
  const a = S.aim, tap = a && S.t - a.t <= 0.25;
  const vec = (dx, dy) => { if (dx * face < 10) dx = 10 * face; const lim = Math.abs(dx) * 1.2; dy = Math.max(-lim, Math.min(lim, dy)); const l = Math.hypot(dx, dy) || 1; return [speed * dx / l, speed * dy / l]; };
  const stickAim = () => { let dx = Math.max(Math.abs(stickVec.dx), 0.35) * face, dy = stickVec.dy; const lim = Math.abs(dx) * 1.2; dy = Math.max(-lim, Math.min(lim, dy)); const l = Math.hypot(dx, dy) || 1; return [speed * dx / l, speed * dy / l]; };
  if (document.body.classList.contains('tp-on')) {
    /* touch: shots lock onto monsters. A tap snaps to the monster near the tap, otherwise to the nearest one on the facing side.
       With no monster in front the shot flies straight ahead; the joystick never tilts shots, since a thumb drifts while running. */
    const t = (tap && aimEnemy(sx, sy, face, a.x, a.y, 70)) || aimEnemy(sx, sy, face);
    if (t) return vec(t[0] - sx, t[1] - sy);
    return [speed * face, 0];
  }
  if (!tap && stickVec && Math.abs(stickVec.dy) > 0.18) return stickAim();
  if (!tap) return [speed * face, 0];
  return vec(a.x - sx, a.y - sy);
}
function doAttack() {
  const p = S.p, m = dmgMul(), id = kid();
  if (id === 'arthur') {
    p.combo = p.comboT > 0 ? (p.combo + 1) % 3 : 0; p.comboT = 0.55;
    const heavy = p.combo === 2;
    p.atkT = heavy ? 0.26 : 0.18; p.atkCd = heavy ? 0.34 : 0.2;
    const w = heavy ? 30 : 26;
    S.hits.push({ x: p.face > 0 ? p.x + p.w - 2 : p.x - w + 2, y: p.y + 2, w, h: 24, dmg: (heavy ? 20 : 12) * m, kb: heavy ? 280 : 110, delay: 0.04, t: 0.1, set: new Set(), status: null, from: p.x + 9 });
    if (heavy) p.lunge = 0.14;
    SFX.slash();
  } else if (id === 'rosemary') {
    p.atkT = 0.24; p.atkCd = 0.26;
    S.hits.push({ x: p.face > 0 ? p.x + p.w - 4 : p.x - 22, y: p.y + 4, w: 26, h: 26, dmg: 7 * m, kb: 90, delay: 0.03, t: 0.12, set: new Set(), status: null, from: p.x + 9 });
    const sx = p.x + (p.face > 0 ? p.w + 6 : -18), [svx, svy] = aimVel(sx + 7, p.y + 18, 270, p.face);
    S.projs.push({ type: 'star', owner: 'p', x: sx, y: p.y + 10, w: 14, h: 16, vx: svx, vy: svy, aim: !!svy, dmg: 7 * m, status: null, life: 0.42, pierce: true, set: new Set() });
    SFX.arrow();
  } else {
    p.atkT = 0.2; p.atkCd = 0.36;
    const bx = p.x + (p.face > 0 ? p.w : -14), [bvx, bvy] = aimVel(bx + 7, p.y + 20, 300, p.face);
    S.projs.push({ type: 'bolt', owner: 'p', x: bx, y: p.y + 14, w: 14, h: 12, vx: bvx, vy: bvy, aim: !!bvy, dmg: 10 * m, status: 'slow', life: 1.1, pierce: false, set: new Set() });
    SFX.arrow();
  }
}

function doSpecial() {
  const p = S.p, m = dmgMul(), id = kid();
  if (S.gauge < 50 || p.special) return;
  S.gauge -= 50; SFX.special(); addShake(3);
  const names = { arthur: 'Flame Wave!', rosemary: 'Tomyumkung Power!', percival: 'Meteor Shower!' };
  const lines = { arthur: 'คลื่นเพลิง! เผามันให้เกรียม!', rosemary: 'พลังแห่งต้มยำกุ้ง! เมี้ยว!', percival: 'คาถาฝนดาวตก!' };
  say(KNIGHTS[S.active].th, lines[id] + '  (' + names[id] + ')');
  if (id === 'arthur') {
    p.atkT = 0.3; p.special = { type: 'skillet', t: 0.3 };
    S.projs.push({ type: 'firewave', owner: 'p', x: p.x + (p.face > 0 ? p.w : -34), y: p.y - 8, w: 34, h: 40, vx: 250 * p.face, vy: 0, dmg: 42 * m, status: 'burn', life: 1.1, pierce: true, set: new Set() });
  } else if (id === 'rosemary') {
    p.special = { type: 'tomyum', t: 0.7, fired: false }; p.inv = Math.max(p.inv, 0.7);
  } else {
    p.special = { type: 'rain', t: 1.0, spawn: 0, dir: p.face, ox: p.x };
  }
}

function doUltimate() {
  if (S.gauge < 100 || S.ult) return;
  if (S.knights.filter(k => !k.down).length < 1) return;
  S.gauge = 0; S.ult = { t: 0, hit: false }; SFX.ult(); say('อาเธอร์', 'พลังแห่งต้มยำกุ้ง! ย้ากกก!', 2.6);
}

function say(who, line, t = 2.2) { if (S) S.speech = { who, line, t }; }
function hurtEnemy(e, dmg, kb, status, fromX, gauge = true) {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.1;
  if (kb && !e.heavy) { e.vx = Math.sign(e.x + e.w / 2 - fromX || 1) * kb; e.kbT = 0.18; if (e.type !== 'moth') e.vy = -80; }
  if (status === 'burn') e.burn = 3.5;
  if (status === 'slow') e.slow = 2.5;
  if (status === 'freeze') e.freeze = e.heavy ? 0.5 : 1.6;
  if (gauge) addGauge(4);
  if (dmg >= 30) { S.texts.push({ x: e.x + e.w / 2, y: e.y - 18, str: 'HIT!', col: '#ffb347', life: 0.6, big: true }); S.fx = S.fx || []; S.fx.push({ type: 'spark', x: e.x + e.w / 2, y: e.y + e.h / 2, t: 0.3 }); }
  S.texts.push({ dmg: true, size: dmg >= 30 ? 13 : 10, x: e.x + e.w / 2 + rnd(-4, 4), y: e.y - 4, str: String(Math.round(dmg)), col: dmg >= 30 ? '#7dff6a' : status === 'burn' ? '#ffb347' : status ? '#9fe8ff' : '#fff6c0', life: 0.6 });
  for (let n = 0; n < 5; n++) S.parts.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: rnd(-90, 90), vy: rnd(-90, 30), life: 0.3, max: 0.3, col: status === 'burn' ? '#ff8a3d' : status ? '#bff4ff' : '#fff3b0', size: 2 });
  if (hitKind === 'shot') SFX.hitShot(); else SFX.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  if (e.type === 'boss') { bossDefeated(e); return; }
  S.kills++; S.score += e.type === 'mimic' ? 500 : 100; S.fx = S.fx || []; S.fx.push({ type: 'boom', x: e.x + e.w / 2, y: e.y + e.h / 2, t: 0.6 });
  for (let n = 0; n < 12; n++) S.parts.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: rnd(-120, 120), vy: rnd(-140, 20), life: 0.6, max: 0.6, col: pick(['#a056c9', '#f1e3ff', '#7ad37a', '#c9b34e']), size: 3, grav: true });
  const r = Math.random();
  if (e.type === 'grape') [-1, 0, 1].forEach(d => { const g = makeEnemy('grapelet', e.x + 4 + d * 8); g.active = true; g.vy = -180; g.vx = d * 60; g.kbT = 0.25; S.enemies.push(g); });
  if (e.type === 'grapelet') return;
  if (e.type === 'mimic') { [0, 1, 2].forEach(i => S.pickups.push({ type: 'glowcap', x: e.x + i * 10, y: e.y - 10, w: 16, h: 16, vy: -150, bob: 0, drop: true })); S.pickups.push({ type: 'beer', x: e.x + 4, y: e.y - 20, w: 16, h: 16, vy: -180, drop: true, bob: 0 }); }
  else if (r < 0.28) S.pickups.push({ type: 'beer', x: e.x, y: e.y - 6, w: 16, h: 16, vy: -150, drop: true, bob: 0 });
  else if (r < 0.48) S.pickups.push({ type: 'glowcap', x: e.x, y: e.y - 6, w: 16, h: 16, vy: -150, drop: true, bob: 0 });
}

function hurtPlayer(dmg, fromX) {
  const p = S.p;
  if (p.inv > 0 || S.ult || S.end) return;
  const k = activeK();
  k.hp -= dmg; p.inv = 1.0; p.kbT = 0.2; p.vx = Math.sign(p.x + 9 - fromX || -p.face) * 160; p.vy = -170; p.onGround = false;
  addShake(4); SFX.hurt();
  S.texts.push({ dmg: true, size: 11, x: p.x + 9, y: p.y - 4, str: String(Math.round(dmg)), col: '#ff4a3a', life: 0.7 });
  if (k.hp <= 0) {
    k.hp = 0; k.down = true; S.ko++; S.corpse = { i: S.active, x: p.x, y: p.y, face: p.face, t: 1.4 };
    const next = [1, 2].map(d => (S.active + d) % 3).find(i => !S.knights[i].down);
    S.texts.push({ x: p.x + 9, y: p.y - 18, str: KNIGHTS[S.active].name + ' is down!', col: '#ff6b6b', life: 1.4, big: true });
    if (next === undefined) { gameOver(); return; }
    S.p.swapCd = 0; swapTo(next); p.inv = 1.5;
  }
}

function gameOver() { scene = 'gameover'; overT = 0; }
let overT = 0;

function bossDefeated(b) {
  if (S.n === 2) {
    addShake(8); SFX.boom();
    S.loot.cork++; S.score += 6000; say('บารอนฟอนบาร์เรล', 'ไวน์ร้อยปีของข้า... เสียของหมดเลย!', 2.5);
    const frozen = b.freeze > 0 || b.slow > 0;
    if (frozen) S.loot.cork++;
    S.end = { t: 0, ember: frozen };
    track('boss_defeated', { stage: 2, boss: 'baron_von_barrel', ember: frozen ? 1 : 0, time_s: Math.round(S.t) });
    for (let n = 0; n < 60; n++) S.parts.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: rnd(-220, 220), vy: rnd(-260, 40), life: 1.2, max: 1.2, col: pick(['#8a2040', '#c8304a', '#ffd35a', '#a0703a']), size: 4, grav: true });
    return;
  }
  addShake(8); SFX.boom();
  S.loot.crown++; S.score += 5000; say('ราชาเห็ด', 'ไม่นะ... มงกุฎของข้า...', 2.5);
  const ember = b.burn > 0;
  if (ember) S.loot.ember++;
  S.end = { t: 0, ember };
  track('boss_defeated', { stage: 1, boss: 'king_shroomba', ember: ember ? 1 : 0, time_s: Math.round(S.t) });
  for (let n = 0; n < 60; n++) S.parts.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: rnd(-220, 220), vy: rnd(-260, 40), life: 1.2, max: 1.2, col: pick(['#a056c9', '#f1e3ff', '#ffd35a', '#ff6b2c']), size: 4, grav: true });
}

function spawnBoss() {
  if (S.n === 2) { S.boss = { type: 'boss', x: ARENA + 280, y: -100, w: 70, h: 66, vx: 0, vy: 0, face: -1, hp: 560, max: 560, heavy: true, flash: 0, burn: 0, slow: 0, freeze: 0, kbT: 0, dead: false, state: 'intro', t: 2.2, contact: 14, hops: 0, onGround: false, squash: 0, bounces: 0 }; S.enemies.push(S.boss); return; }
  S.boss = { type: 'boss', x: ARENA + 280, y: -100, w: 76, h: 70, vx: 0, vy: 0, face: -1, hp: 460, max: 460, heavy: true, flash: 0, burn: 0, slow: 0, freeze: 0, kbT: 0, dead: false, state: 'intro', t: 2.2, contact: 14, hops: 0, onGround: false, squash: 0 };
  S.enemies.push(S.boss);
}

function updateBaron(b, dt) {
  const p = S.p, f = b.freeze > 0 ? 0 : b.slow > 0 ? 0.55 : 1, phase2 = b.hp < b.max * 0.5;
  b.vy += 900 * dt; b.y += b.vy * dt; b.x += b.vx * dt * (f || 0);
  b.squash = Math.max(0, b.squash - dt * 3);
  if (b.y + b.h >= GROUND) {
    if (!b.onGround && b.vy > 200) {
      addShake(b.state === 'intro' ? 6 : 5); SFX.boom(); b.squash = 1;
      if (b.state === 'air') [-1, 1].forEach(d => S.projs.push({ type: 'wave', owner: 'e', x: b.x + b.w / 2 - 8 + d * 30, y: GROUND - 14, w: 16, h: 14, vx: d * (phase2 ? 200 : 160), vy: 0, dmg: 12, life: 2.2 }));
    }
    b.y = GROUND - b.h; b.vy = 0; b.onGround = true; if (b.state !== 'roll') b.vx = 0;
  } else b.onGround = false;
  if (b.state === 'roll' && (b.x <= ARENA + 4 || b.x >= ARENA + W - b.w - 4)) { b.vx = -b.vx; b.bounces--; addShake(4); SFX.boom(); b.x = clamp(b.x, ARENA + 5, ARENA + W - b.w - 5); if (b.bounces <= 0) { b.state = 'idle'; b.vx = 0; b.t = phase2 ? 0.7 : 1.1; } }
  b.x = clamp(b.x, ARENA + 4, ARENA + W - b.w - 4);
  b.contact = b.state === 'roll' ? 18 : 14;
  if (f === 0) return;
  b.t -= dt * f;
  if (b.state !== 'air' && b.state !== 'roll') b.face = p.x + 9 < b.x + b.w / 2 ? -1 : 1;
  switch (b.state) {
    case 'intro': if (b.t <= 0 && b.onGround) { b.state = 'idle'; b.t = 0.8; } break;
    case 'idle':
      if (b.t <= 0) {
        const kegs = S.enemies.filter(e => !e.dead && e.type === 'keg').length, r = Math.random();
        if (r < 0.34) { b.state = 'curl'; b.t = 0.55; }
        else if (r < 0.66) { b.state = 'spray'; b.t = 0.6; }
        else if (r < 0.86 || !phase2 || kegs >= 2) { b.state = 'crouch'; b.t = phase2 ? 0.3 : 0.45; b.hops = phase2 ? 2 : 1; }
        else { b.state = 'summon'; b.t = 0.6; }
      }
      break;
    case 'curl': if (b.t <= 0) { b.state = 'roll'; b.vx = b.face * (phase2 ? 290 : 240); b.bounces = phase2 ? 3 : 2; SFX.special(); } break;
    case 'roll': if (Math.random() < 0.5) S.parts.push({ x: b.x + b.w / 2 - b.face * 30, y: GROUND - 3, vx: -b.vx * 0.2, vy: rnd(-40, -10), life: 0.4, max: 0.4, col: '#8a7a6a', size: 3 }); break;
    case 'crouch':
      if (b.t <= 0) { b.state = 'air'; b.vy = -430; b.onGround = false; const tx = clamp(p.x + 9 - b.w / 2, ARENA + 4, ARENA + W - b.w - 4); b.vx = (tx - b.x) / 0.95; SFX.jump(); }
      break;
    case 'air':
      if (b.onGround) { b.hops--; if (b.hops > 0) { b.state = 'crouch'; b.t = 0.2; } else { b.state = 'idle'; b.t = phase2 ? 0.55 : 0.9; } }
      break;
    case 'spray':
      if (b.t <= 0) {
        const n = phase2 ? 9 : 6;
        for (let i = 0; i < n; i++) S.projs.push({ type: 'wine', owner: 'e', x: b.x + b.w / 2 + b.face * 20, y: b.y + b.h * 0.55, w: 9, h: 9, vx: b.face * (110 + i * 26), vy: -120 - (i % 3) * 50, grav: 420, dmg: 10, life: 3 });
        noise(0.25, 0.06); b.state = 'idle'; b.t = phase2 ? 0.6 : 1.0;
      }
      break;
    case 'summon':
      if (b.t <= 0) { [-1, 1].forEach(d => { const e = makeEnemy('keg', clamp(b.x + b.w / 2 + d * 70, ARENA + 10, ARENA + W - 30)); e.active = true; e.vy = -200; S.enemies.push(e); }); SFX.special(); b.state = 'idle'; b.t = 0.9; }
      break;
  }
}

function updateBoss(b, dt) {
  if (S.n === 2) { updateBaron(b, dt); return; }
  const p = S.p, f = b.freeze > 0 ? 0 : b.slow > 0 ? 0.55 : 1, phase2 = b.hp < b.max * 0.5;
  b.vy += 900 * dt; b.y += b.vy * dt; b.x += b.vx * dt * (f || 0);
  b.squash = Math.max(0, b.squash - dt * 3);
  if (b.y + b.h >= GROUND) {
    if (!b.onGround && b.vy > 200) {
      addShake(b.state === 'intro' ? 6 : 5); SFX.boom(); b.squash = 1;
      if (b.state === 'air') {
        [-1, 1].forEach(d => S.projs.push({ type: 'wave', owner: 'e', x: b.x + b.w / 2 - 8 + d * 30, y: GROUND - 14, w: 16, h: 14, vx: d * (phase2 ? 200 : 160), vy: 0, dmg: 12, life: 2.2 }));
      }
    }
    b.y = GROUND - b.h; b.vy = 0; b.onGround = true; b.vx = 0;
  } else b.onGround = false;
  b.x = clamp(b.x, ARENA + 4, ARENA + W - b.w - 4);
  if (f === 0) return;
  b.t -= dt * f;
  if (b.state !== 'air') b.face = p.x + 9 < b.x + b.w / 2 ? -1 : 1;
  switch (b.state) {
    case 'intro': if (b.t <= 0 && b.onGround) { b.state = 'idle'; b.t = 0.8; } break;
    case 'idle':
      if (b.t <= 0) {
        const minions = S.enemies.filter(e => !e.dead && e.type === 'sporeling').length;
        const r = Math.random();
        if (r < 0.42) { b.state = 'crouch'; b.t = phase2 ? 0.28 : 0.42; b.hops = phase2 ? 2 : 1; }
        else if (r < 0.78 || minions >= 3) { b.state = 'spray'; b.t = 0.55; }
        else { b.state = 'summon'; b.t = 0.6; }
      }
      break;
    case 'crouch':
      if (b.t <= 0) {
        b.state = 'air'; b.vy = -430; b.onGround = false;
        const tx = clamp(p.x + 9 - b.w / 2, ARENA + 4, ARENA + W - b.w - 4);
        b.vx = (tx - b.x) / 0.95; SFX.jump();
      }
      break;
    case 'air':
      if (b.onGround) { b.hops--; if (b.hops > 0) { b.state = 'crouch'; b.t = 0.2; } else { b.state = 'idle'; b.t = phase2 ? 0.55 : 0.9; } }
      break;
    case 'spray':
      if (b.t <= 0) {
        const n = phase2 ? 8 : 5;
        for (let i = 0; i < n; i++) S.projs.push({ type: 'spore', owner: 'e', x: b.x + b.w / 2, y: b.y + 10, w: 10, h: 10, vx: b.face * rnd(50, 210), vy: rnd(-330, -180), grav: 420, dmg: 10, life: 3 });
        noise(0.25, 0.06); b.state = 'idle'; b.t = phase2 ? 0.6 : 1.0;
      }
      break;
    case 'summon':
      if (b.t <= 0) {
        [-1, 1].forEach(d => { const e = makeEnemy('sporeling', clamp(b.x + b.w / 2 + d * 70, ARENA + 10, ARENA + W - 30)); e.active = true; e.vy = -200; S.enemies.push(e); });
        SFX.special(); b.state = 'idle'; b.t = 0.9;
      }
      break;
  }
}

function updateEnemy(e, dt) {
  const p = S.p, px = p.x + p.w / 2, ex = e.x + e.w / 2, dx = px - ex;
  if (!e.active) { if (e.x < S.camX + W + 40 && e.x > S.camX - 80) e.active = true; else return; }
  if (e.type === 'boss') { updateBoss(e, dt); return; }
  const f = e.freeze > 0 ? 0 : e.slow > 0 ? 0.4 : 1;
  e.anim += dt * f; e.t += dt;
  if (e.kbT > 0) { e.kbT -= dt; e.x += e.vx * dt; e.vx *= 0.9; }
  if (e.type === 'sporeling') {
    if (e.kbT <= 0) { e.vx = Math.abs(dx) < 230 ? Math.sign(dx) * 42 * f : 0; e.x += e.vx * dt; if (e.vx) e.face = Math.sign(e.vx); }
    e.vy += 900 * dt; e.y += e.vy * dt; if (e.y + e.h > GROUND) { e.y = GROUND - e.h; e.vy = 0; }
  } else if (e.type === 'keg') {
    e.cd -= dt * f;
    if (e.kbT <= 0) {
      if (e.state === 'charge') { e.chT -= dt; if (e.chT <= 0 || pitAhead(e, e.vx)) { e.state = 'idle'; e.cd = rnd(1.4, 2.2); e.vx = 0; } }
      else if (e.state === 'wind') { e.chT -= dt * f; e.vx = 0; if (e.chT <= 0) { e.state = 'charge'; e.vx = e.face * 175; e.chT = 0.75; } }
      else { e.vx = Math.abs(dx) < 230 ? Math.sign(dx) * 36 * f : 0; if (e.vx) e.face = Math.sign(e.vx); if (Math.abs(dx) < 120 && Math.abs(p.y - e.y) < 40 && e.cd <= 0 && f > 0) { e.state = 'wind'; e.chT = 0.4; e.face = Math.sign(dx) || 1; } }
      if (pitAhead(e, e.vx)) e.vx = 0;
      e.x += e.vx * dt * (e.state === 'charge' ? f : 1);
    }
    e.contact = e.state === 'charge' ? 14 : 10;
    e.vy += 900 * dt; e.y += e.vy * dt; if (e.y + e.h > GROUND && !overPit(e.x, e.w)) { e.y = GROUND - e.h; e.vy = 0; }
  } else if (e.type === 'grape' || e.type === 'grapelet') {
    e.cd -= dt * f; const onG = e.y + e.h >= GROUND - 0.5;
    if (onG && e.kbT <= 0) { e.vx = 0; if (e.cd <= 0 && f > 0 && Math.abs(dx) < 240) { const d = Math.sign(dx) || 1; if (!pitAhead(e, d)) { e.vy = e.type === 'grape' ? -250 : -190; e.vx = d * (e.type === 'grape' ? 70 : 85); e.face = d; } e.cd = e.type === 'grape' ? rnd(0.9, 1.3) : rnd(0.5, 0.8); e.squashT = 0.15; } }
    if (e.kbT <= 0) e.x += e.vx * dt * f;
    e.squashT = Math.max(0, (e.squashT || 0) - dt);
    e.vy += 900 * dt; e.y += e.vy * dt; if (e.y + e.h > GROUND && !overPit(e.x, e.w)) { if (e.vy > 120) e.squashT = 0.15; e.y = GROUND - e.h; e.vy = 0; }
  } else if (e.type === 'imp') {
    e.cd -= dt * f; e.face = Math.sign(dx) || 1;
    if (e.kbT <= 0) { const want = Math.abs(dx) < 110 ? -1 : Math.abs(dx) > 190 ? 1 : 0; e.vx = want * Math.sign(dx) * 40 * f; if (pitAhead(e, e.vx)) e.vx = 0; e.x += e.vx * dt; }
    if (e.cd <= 0 && Math.abs(dx) < 260 && f > 0) { e.cd = rnd(2, 2.6); e.throwT = 0.3; const tt = 0.9; S.projs.push({ type: 'bottle', owner: 'e', x: ex - 4, y: e.y - 2, w: 8, h: 8, vx: dx / tt, vy: -250, grav: 500, dmg: 10, life: 3 }); }
    if (e.throwT) e.throwT = Math.max(0, e.throwT - dt);
    e.vy += 900 * dt; e.y += e.vy * dt; if (e.y + e.h > GROUND && !overPit(e.x, e.w)) { e.y = GROUND - e.h; e.vy = 0; }
  } else if (e.type === 'moth' || e.type === 'bat') {
    e.cd -= dt * f;
    if (e.state === 'idle') {
      if (e.kbT <= 0) { e.x += Math.sign(dx) * 26 * f * dt; e.y = e.homeY + Math.sin(e.t * 3) * 10; }
      e.face = Math.sign(dx) || 1;
      if (Math.abs(dx) < 130 && e.cd <= 0 && f > 0) { e.state = 'dive'; const ang = Math.atan2(p.y + 12 - e.y, dx); e.dvx = Math.cos(ang) * 170; e.dvy = Math.sin(ang) * 170; e.dt = 0.9; }
    } else if (e.state === 'dive') {
      e.x += e.dvx * dt * f; e.y += e.dvy * dt * f; e.dt -= dt * f;
      if (e.dt <= 0 || e.y > GROUND - 14) { e.state = 'back'; }
    } else { e.y += (e.homeY - e.y) * dt * 2 * f; if (Math.abs(e.y - e.homeY) < 3) { e.state = 'idle'; e.cd = rnd(1.4, 2.4); } }
  } else if (e.type === 'puff') {
    e.cd -= dt * f; e.face = Math.sign(dx) || 1;
    if (e.cd <= 0 && Math.abs(dx) < 260) { e.cd = 2.6; e.puffT = 0.3; S.projs.push({ type: 'cloud', owner: 'e', x: ex - 6, y: e.y - 4, w: 12, h: 12, vx: Math.sign(dx) * 80, vy: -10, dmg: 9, life: 3 }); noise(0.15, 0.04); }
    if (e.puffT) e.puffT = Math.max(0, e.puffT - dt);
  } else if (e.type === 'mimic') {
    if (e.state === 'sleep') { if (Math.abs(dx) < 54 && Math.abs(p.y - e.y) < 40) { e.state = 'awake'; S.texts.push({ x: ex, y: e.y - 14, str: 'MIMIC!', col: '#ff6b6b', life: 1, big: true }); SFX.hurt(); } }
    else {
      e.face = Math.sign(dx) || 1; e.cd -= dt * f;
      if (e.cd <= 0 && e.y + e.h >= GROUND - 1) { e.vy = -260; e.vx = Math.sign(dx) * 90; e.cd = 0.9; }
      e.vy += 900 * dt; e.y += e.vy * dt; if (e.kbT <= 0) e.x += e.vx * dt * f;
      if (e.y + e.h > GROUND) { e.y = GROUND - e.h; e.vy = 0; e.vx = 0; }
    }
  }
  if (e.x < 0) e.x = 0;
  if (S.bossOn && (e.type === 'sporeling' || e.type === 'keg')) e.x = clamp(e.x, ARENA, ARENA + W - e.w);
  if (e.y > H + 30 && !e.dead) { e.dead = true; S.kills++; S.score += 100; } /* fell into a pit */
}

function updateStage(dt) {
  if (pressed.pause) S.paused = !S.paused;
  if (S.paused) { if (pressed['ui:shelp']) { help = 'stage'; return; } if (pressed.ok || pressed.click || pressed['ui:sresume']) S.paused = false; return; }
  S.t += dt;
  const p = S.p;
  if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
  if (S.speech) { S.speech.t -= dt; if (S.speech.t <= 0) S.speech = null; }

  /* ultimate cinematic freezes the world */
  if (S.ult) {
    const u = S.ult; u.t += dt;
    if (!u.hit && u.t > 0.75) {
      u.hit = true; addShake(10); SFX.boom();
      S.enemies.forEach(e => { if (!e.dead && e.active && e.x + e.w > S.camX - 10 && e.x < S.camX + W + 10) hurtEnemy(e, 150 * dmgMul(), 200, 'burn', p.x + 9, false); });
      S.projs = S.projs.filter(pr => pr.owner === 'p');
      for (let n = 0; n < 80; n++) S.parts.push({ x: S.camX + W / 2 + rnd(-40, 40), y: 150, vx: rnd(-300, 300), vy: rnd(-320, -60), life: 1.2, max: 1.2, col: pick(['#e2552e', '#ff9a3d', '#ffd35a', '#7ad37a', '#fff']), size: 4, grav: true });
    }
    if (u.t > 2.1) S.ult = null;
    updateParticles(dt);
    return;
  }

  /* swapping + actions */
  if (pressed.k1) swapTo(0); if (pressed.k2) swapTo(1); if (pressed.k3) swapTo(2);
  if (pressed.next) cycle(1); if (pressed.prev) cycle(-1);
  p.swapCd = Math.max(0, p.swapCd - dt); p.inv = Math.max(0, p.inv - dt); p.atkCd = Math.max(0, p.atkCd - dt); p.atkT = Math.max(0, p.atkT - dt); p.comboT = Math.max(0, p.comboT - dt);
  S.sup.bartCd = Math.max(0, S.sup.bartCd - dt);
  const busy = p.special && p.special.type === 'tempest';
  if (!S.end) {
    if (pressed.atk && p.atkCd <= 0 && !busy) doAttack();
    if (pressed.sp) doSpecial();
    if (pressed.ult) doUltimate();
    if (pressed.sup) callSupport();
  }

  /* movement */
  const id = kid(), sticky = S.n === 2 && p.onGround && p.y + p.h >= GROUND - 1 && S.pools.some(pl => p.x + p.w > pl.x + 4 && p.x < pl.x + pl.w - 4);
  const speed = (id === 'rosemary' ? 122 : id === 'percival' ? 96 : 104) * (sticky ? 0.45 : 1);
  if (sticky && !S.stickyTold) { S.stickyTold = true; S.texts.push({ x: p.x + 9, y: p.y - 8, str: 'ไวน์เหนียว! เดินช้าลง', col: '#ff8aa0', life: 1.2 }); }
  let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (S.end) dir = 0;
  if (p.kbT > 0) { p.kbT -= dt; }
  else if (busy) { p.vx = p.face * 210; }
  else if (p.lunge > 0) { p.lunge -= dt; p.vx = p.face * 230; }
  else { p.vx = dir * speed * (p.atkT > 0 && p.onGround && id === 'percival' ? 0.3 : 1); if (dir) p.face = dir; }
  if (pressed.up && p.onGround && !S.end && !S.lift) { p.vy = sticky ? -270 : -335; p.onGround = false; SFX.jump(); }
  if (!keys.up && p.vy < -140) p.vy = -140;
  p.vy = Math.min(p.vy + 900 * dt, 520);
  if (S.lift) { /* the Pixie carries the knight up to the high shelf */
    const L = S.lift; L.t += dt; p.vx = 0; p.vy = 0; p.inv = Math.max(p.inv, 0.3);
    const tx = S.shelf.x + 14, ty = S.shelf.y - p.h; p.x += (tx - p.x) * Math.min(1, dt * 2.5); p.y += (ty - 6 - p.y) * Math.min(1, dt * 2.2);
    if (L.t > 1.4) { p.x = tx; p.y = ty; p.onGround = true; S.lift = null; say('พิกซี่', 'ถึงแล้ว! ตรงนี้มีหีบลับด้วยนะ~'); }
  } else moveBody(p, dt);
  if (S.n === 2 && p.y > H + 20) { /* fell into a pit */
    const pt = S.pits.find(q => p.x + p.w / 2 > q.x - 20 && p.x + p.w / 2 < q.x + q.w + 20) || S.pits[0];
    p.x = pt.x - 28; p.y = GROUND - p.h - 30; p.vx = 0; p.vy = 0; p.face = 1;
    const k = activeK(); k.hp = Math.max(1, k.hp - 15); p.inv = 1.2; addShake(3); SFX.hurt();
    S.texts.push({ x: p.x + 9, y: p.y - 8, str: '-15 ตกหลุม!', col: '#ff6b6b', life: 1 });
  }
  const leftBound = S.bossOn ? ARENA : Math.max(0, S.camX - 4);
  const rightBound = S.bossOn ? ARENA + W : LEVEL_W;
  p.x = clamp(p.x, leftBound, rightBound - p.w);
  p.anim += dt * (Math.abs(p.vx) > 1 ? 1 : 0);

  /* specials over time */
  if (p.special) {
    const sp = p.special; sp.t -= dt;
    if (sp.type === 'tempest') {
      sp.tick -= dt;
      if (sp.tick <= 0) { sp.tick = 0.09; S.hits.push({ x: p.x - 18, y: p.y - 4, w: p.w + 36, h: 36, dmg: 7 * dmgMul(), kb: 70, delay: 0, t: 0.05, set: new Set(), status: null, from: p.x + 9, noGauge: true }); }
      if (Math.random() < 0.8) S.parts.push({ x: p.x + 9 + rnd(-20, 20), y: p.y + rnd(0, 30), vx: rnd(-60, 60), vy: rnd(-40, 0), life: 0.25, max: 0.25, col: pick(['#ffd35a', '#e8833a', '#fff']), size: 2 });
    } else if (sp.type === 'tomyum') {
      if (Math.random() < 0.9) { const a = Math.random() * 6.28; S.parts.push({ x: p.x + 9 + p.face * 16 + Math.cos(a) * 14, y: p.y + 14 + Math.sin(a) * 14, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40, life: 0.3, max: 0.3, col: pick(['#ffd35a', '#fff', '#ff9a3d']), size: 2 }); }
      if (!sp.fired && sp.t < 0.25) { sp.fired = true; S.projs.push({ type: 'bowl', owner: 'p', x: p.x + 9 + p.face * 70 - 22, y: -40, w: 44, h: 30, vx: 0, vy: 420, dmg: 0, life: 2, pierce: true, set: new Set() }); }
    } else if (sp.type === 'rain') {
      sp.spawn -= dt;
      while (sp.spawn <= 0) { sp.spawn += 0.06; S.projs.push({ type: 'icefall', owner: 'p', x: sp.ox + sp.dir * rnd(20, 230), y: rnd(-30, -6), w: 10, h: 10, vx: sp.dir * 60, vy: 340, dmg: 14 * dmgMul(), status: 'freeze', life: 1.2, pierce: false, set: new Set() }); }
    }
    if (sp.t <= 0) p.special = null;
  }

  /* poison pools */
  S.poolT -= dt;
  if (S.n !== 2 && p.onGround && p.y + p.h >= GROUND - 1 && S.pools.some(pl => p.x + p.w > pl.x + 4 && p.x < pl.x + pl.w - 4) && S.poolT <= 0) { S.poolT = 0.5; S.poisonT = 0.6; const k = activeK(); if (p.inv <= 0) { k.hp = Math.max(1, k.hp - 6); S.texts.push({ x: p.x + 9, y: p.y - 4, str: '-6 poison', col: '#9be15d', life: 0.6 }); SFX.hurt(); } }

  /* hitboxes */
  for (const h of S.hits) {
    h.delay -= dt; if (h.delay > 0) continue; h.t -= dt;
    for (const e of S.enemies) if (!e.dead && e.active && !h.set.has(e) && overlap(h, e)) { h.set.add(e); hurtEnemy(e, h.dmg, h.kb, h.status, h.from, !h.noGauge); }
    if (h.noGauge && h.set.size) addGauge(0.6 * h.set.size);
  }
  S.hits = S.hits.filter(h => h.delay > 0 || h.t > 0);

  /* enemies */
  for (const e of S.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt); e.slow = Math.max(0, e.slow - dt); e.freeze = Math.max(0, e.freeze - dt);
    if (e.burn > 0) { e.burn -= dt; e.burnTick = (e.burnTick || 0) - dt; if (e.burnTick <= 0) { e.burnTick = 0.5; e.hp -= 3; S.texts.push({ x: e.x + e.w / 2, y: e.y - 2, str: '3', col: '#ffb347', life: 0.4 }); if (e.hp <= 0) killEnemy(e); } }
    if (e.dead) continue;
    updateEnemy(e, dt);
    if (e.active && !e.dead && e.freeze <= 0 && overlap(p, e) && !(e.type === 'mimic' && e.state === 'sleep') && !(e.type === 'boss' && e.state === 'intro')) hurtPlayer(e.contact, e.x + e.w / 2);
  }
  S.enemies = S.enemies.filter(e => !e.dead || e === S.boss);

  /* projectiles */
  for (const pr of S.projs) {
    pr.life -= dt;
    if (pr.grav) pr.vy += pr.grav * dt;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (pr.aim && pr.y + pr.h > GROUND + 6) pr.life = 0;
    if (pr.owner === 'p') {
      for (const e of S.enemies) if (!e.dead && e.active && !pr.set.has(e) && overlap(pr, e)) { pr.set.add(e); hitKind = 'shot'; hurtEnemy(e, pr.dmg, pr.type === 'firewave' ? 160 : 40, pr.status, pr.x - pr.vx, true); hitKind = 'melee'; if (!pr.pierce) { pr.life = 0; break; } }
      if (pr.type === 'bowl' && pr.y + pr.h >= GROUND) {
        pr.life = 0; addShake(7); SFX.boom();
        const zone = { x: pr.x - 40, y: GROUND - 70, w: pr.w + 80, h: 70 };
        S.enemies.forEach(e => { if (!e.dead && e.active && overlap(zone, e)) hurtEnemy(e, 48 * dmgMul(), 220, 'burn', pr.x + pr.w / 2); });
        for (let n = 0; n < 50; n++) S.parts.push({ x: pr.x + pr.w / 2 + rnd(-20, 20), y: GROUND - 20, vx: rnd(-220, 220), vy: rnd(-300, -60), life: 1, max: 1, col: pick(['#e2552e', '#ff8a3d', '#ffd35a', '#7ad37a', '#c6e86a', '#ff4a3a', '#fff']), size: pick([2, 3, 4]), grav: true });
        S.fx = S.fx || []; S.fx.push({ type: 'bowl', x: pr.x, t: 0.9 });
      }
      if (pr.type === 'icefall' && pr.y > GROUND - pr.h) { pr.life = 0; for (let n = 0; n < 3; n++) S.parts.push({ x: pr.x, y: GROUND - 2, vx: rnd(-50, 50), vy: rnd(-60, -10), life: 0.3, max: 0.3, col: '#bff4ff', size: 2 }); }
      if (pr.type === 'firewave' && Math.random() < 0.7) S.parts.push({ x: pr.x + rnd(0, pr.w), y: pr.y + rnd(0, pr.h), vx: -pr.vx * 0.1, vy: rnd(-60, -10), life: 0.35, max: 0.35, col: pick(['#ff6b2c', '#ffd35a', '#e2483b']), size: 3 });
    } else {
      if (overlap(pr, p)) { hurtPlayer(pr.dmg, pr.x); if (pr.type !== 'wave') pr.life = 0; }
      if ((pr.type === 'bottle' || pr.type === 'wine') && pr.y + pr.h > GROUND && !overPit(pr.x, pr.w)) { pr.life = 0; for (let n = 0; n < (pr.type === 'bottle' ? 7 : 3); n++) S.parts.push({ x: pr.x + 4, y: GROUND - 3, vx: rnd(-60, 60), vy: rnd(-90, -20), life: 0.45, max: 0.45, col: pick(pr.type === 'bottle' ? ['#7ad37a', '#c8304a', '#e8fff0'] : ['#c8304a', '#8a2040']), size: 2, grav: true }); if (pr.type === 'bottle') noise(0.08, 0.05); }
      if (pr.type === 'spore' && pr.y + pr.h > GROUND) { pr.life = 0; for (let n = 0; n < 4; n++) S.parts.push({ x: pr.x + 5, y: GROUND - 3, vx: rnd(-40, 40), vy: rnd(-50, -10), life: 0.4, max: 0.4, col: '#c88ae8', size: 2 }); }
    }
  }
  S.projs = S.projs.filter(pr => pr.life > 0 && pr.x > S.camX - 80 && pr.x < S.camX + W + 80);

  /* pickups */
  for (const it of S.pickups) {
    if (it.drop) { it.vy += 700 * dt; it.y += it.vy * dt; if (it.y + it.h > GROUND && !(S.pits.length && overPit(it.x, it.w))) { it.y = GROUND - it.h; it.vy = 0; it.drop = false; } if (it.y > H + 20) it.got = true; }
    it.bob += dt;
    if (it.got || !overlap(p, it)) continue;
    if (it.type === 'shelfchest') { if (!S.shelf.got) { S.shelf.got = true; SFX.chest(); S.loot.glowcap += 2; S.loot.chili += 2; addGauge(40); S.score += 800; S.texts.push({ x: it.x + 12, y: it.y - 20, str: 'หีบบนชั้นลับ! +SP', col: '#e8c76a', life: 2, big: true }); } continue; }
    if (it.type === 'chest' && S.n === 2) { if (!S.vaultOpened) { S.vaultOpened = true; SFX.chest(); it.got = true; S.loot.truffle++; S.loot.cork++; S.score += 800; S.texts.push({ x: it.x + 12, y: it.y - 20, str: '100-Year Vintage Cork!', col: '#e8c76a', life: 2, big: true }); SFX.ult(); } continue; }
    if (it.type === 'chest') { if (!S.vaultOpened) { S.vaultOpened = true; SFX.chest(); it.got = true; S.loot.truffle++; S.loot.glowcap += 2; S.texts.push({ x: it.x + 12, y: it.y - 20, str: 'Truffle of Ages!', col: '#e8c76a', life: 2, big: true }); SFX.ult(); } continue; }
    it.got = true; SFX.coin(); S.score += it.type === 'glowcap' ? 50 : 20;
    if (it.type === 'beer') { addGauge(save.tools.lucky ? 55 : 35); S.texts.push({ x: it.x + 8, y: it.y - 6, str: 'เบียร์วุ้น! +SP', col: '#ffd76a', life: 0.9 }); }
    if (it.type === 'chili') { S.loot.chili++; S.texts.push({ x: it.x + 8, y: it.y - 6, str: '+1 พริกเม็ดใหญ่', col: '#ff6b4a', life: 0.9 }); }
    if (it.type === 'glowcap') { S.loot.glowcap++; S.texts.push({ x: it.x + 8, y: it.y - 6, str: '+1 Glowcap', col: '#7cf5c8', life: 0.9 }); }
    if (it.type === 'ale') { const k = activeK(); k.hp = Math.min(k.max, k.hp + 40); S.texts.push({ x: it.x + 8, y: it.y - 6, str: '+40 HP', col: '#ff9a7a', life: 0.9 }); }
  }
  S.pickups = S.pickups.filter(it => !it.got || it.type === 'chest' || it.type === 'shelfchest');

  /* support crew */
  const g = S.sup.gorn;
  if (g) {
    g.t += dt;
    if (g.state === 'run') { g.x += 230 * dt; if (g.x + 24 >= S.wall.x - 2) { g.state = 'smash'; g.t = 0; } }
    else if (g.state === 'smash') { if (g.t > 0.25 && !S.wall.broken) breakWall(); if (g.t > 0.9) g.state = 'leave'; }
    else { g.x -= 260 * dt; if (g.x < S.camX - 60) S.sup.gorn = null; }
  }
  S.hint = null;
  if (S.n === 2) {
    if (!S.wall.broken && Math.abs(p.x - S.wall.x) < 110 && !g) S.hint = save.crew.includes('mole') ? 'กด C เรียกตุ่นมาขุดกองดิน!' : 'กองดินขวางทาง... ต้องพาตุ่นมา (เลือกที่แผนที่โลก)';
    else if (nearShelf() && !S.lift) S.hint = save.crew.includes('pixie') ? 'กด C เรียกพิกซี่พาบินขึ้นชั้นบน!' : 'ชั้นบนสูงเกินกระโดด... ต้องพาพิกซี่มา';
  }
  else if (!S.wall.broken && Math.abs(p.x - S.wall.x) < 110 && !g) S.hint = save.crew.includes('gorn') ? 'กด C เรียกเชฟกอร์นมาทุบกำแพงร้าว!' : 'กำแพงร้าว... ต้องพาเชฟกอร์นมา (เลือกที่แผนที่โลก)';

  /* boss trigger */
  if (!S.bossOn && p.x > ARENA + 60) { S.bossOn = true; spawnBoss();
    if (S.n === 2) { S.banner = { text: 'BARON VON BARREL', sub: 'บารอนแห่งถังไวน์', t: 2.2, boss: true }; say('บารอนฟอนบาร์เรล', 'ใครบังอาจย่องเข้าห้องเก็บไวน์ของข้า! ชิมนี่ซะ!', 3); }
    else { S.banner = { text: 'KING SHROOMBA', sub: 'ราชาเห็ดสปอร์พิษ', t: 2.2, boss: true }; say('ราชาเห็ด', 'ใครกล้าบุกป่าเห็ดของข้า! จงกลายเป็นปุ๋ยซะ!', 3); } }

  /* camera */
  const camMin = document.body.classList.contains('tp-on') ? -110 : 0; /* touch: keep the knight clear of the joystick */
  const target = S.bossOn ? ARENA : clamp(p.x - 150 + p.face * 20, camMin, LEVEL_W - W);
  if (S.t < 0.05 && camMin < 0 && S.camX === 0) S.camX = target;
  S.camX += (target - S.camX) * Math.min(1, dt * (S.bossOn ? 4 : 6));
  if (!S.bossOn) S.camX = Math.max(S.camX, Math.min(target, S.camX));

  updateParticles(dt);

  if (S.end) { S.end.t += dt; if (S.end.t > 3) finishStage(); }
}

function moveBody(p, dt) {
  const prevBottom = p.y + p.h;
  p.x += p.vx * dt;
  for (const s of S.solids) if (overlap(p, s)) { if (p.vx > 0) p.x = s.x - p.w; else if (p.vx < 0) p.x = s.x + s.w; }
  p.y += p.vy * dt;
  p.onGround = false;
  if (p.y + p.h >= GROUND && !(S.pits.length && overPit(p.x, p.w)) && prevBottom <= GROUND + 4) { p.y = GROUND - p.h; p.vy = 0; p.onGround = true; }
  if (p.vy >= 0) for (const pl of S.platforms) if (p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2 && prevBottom <= pl.y + 1 && p.y + p.h >= pl.y) { p.y = pl.y - p.h; p.vy = 0; p.onGround = true; }
  for (const s of S.solids) if (overlap(p, s)) {
    if (p.vy >= 0 && prevBottom <= s.y + 2) { p.y = s.y - p.h; p.vy = 0; p.onGround = true; }
    else if (p.vy < 0) { p.y = s.y + s.h; p.vy = 0; }
  }
}

function nearShelf() { const p = S.p; return S.shelf && !S.shelf.got && p.y > S.shelf.y && p.x + p.w > S.shelf.x - 30 && p.x < S.shelf.x + S.shelf.w + 30; }
function callSupport() {
  const p = S.p;
  if (S.n === 2) {
    if (!S.wall.broken && Math.abs(p.x - S.wall.x) < 110 && !S.sup.gorn && save.crew.includes('mole')) { S.sup.gorn = { x: S.camX - 30, t: 0, state: 'run', mole: true }; say('ตุ่น', 'ขุดดินเป็นงานถนัดของข้าเอง!'); SFX.select(); return; }
    if (nearShelf() && !S.lift && save.crew.includes('pixie')) { S.lift = { t: 0 }; say('พิกซี่', 'จับมือไว้นะ! บินแล้ว~'); SFX.select(); return; }
  } else
  if (!S.wall.broken && Math.abs(p.x - S.wall.x) < 110 && !S.sup.gorn && save.crew.includes('gorn')) {
    S.sup.gorn = { x: S.camX - 30, t: 0, state: 'run' };
    say('เชฟกอร์น', 'หลีกไป! พุงพลุ้ยมาแล้ว!'); SFX.select();
    return;
  }
  if (!save.crew.includes('bart')) { if (S.n === 2 && !save.crew.includes('bart')) { S.texts.push({ x: p.x + 9, y: p.y - 10, str: 'ไม่มีอะไรให้ลูกทีมช่วยตรงนี้', col: '#bba8ba', life: 0.8 }); return; } S.texts.push({ x: p.x + 9, y: p.y - 10, str: 'ไม่ได้พาบาร์ตเฒ่ามา', col: '#bba8ba', life: 0.8 }); return; }
  if (S.sup.bart > 0 && S.sup.bartCd <= 0) {
    S.sup.bart--; S.sup.bartCd = 4;
    S.pickups.push({ type: 'ale', x: p.x + p.face * 30, y: p.y - 40, w: 16, h: 16, vy: -120, drop: true, bob: 0 });
    say('บาร์ตเฒ่า', 'รับไปเลยไอ้หนู! เบียร์ฟื้นพลัง!'); SFX.select();
  } else { S.texts.push({ x: p.x + 9, y: p.y - 10, str: S.sup.bart <= 0 ? 'Old Bart is out of ale' : 'Bart is pouring...', col: '#bba8ba', life: 0.8 }); }
}

function breakWall() {
  S.wall.broken = true; S.solids = S.solids.filter(s => s !== S.wall);
  addShake(6); SFX.boom();
  for (let n = 0; n < 30; n++) S.parts.push({ x: S.wall.x + rnd(0, 16), y: S.wall.y + rnd(0, 40), vx: rnd(-40, 200), vy: rnd(-220, -40), life: 0.9, max: 0.9, col: pick(['#7b6a5e', '#a39282', '#4a3f38']), size: 3, grav: true });
  if (S.n === 2) for (let n = 0; n < 20; n++) S.parts.push({ x: S.wall.x + rnd(0, 16), y: S.wall.y + rnd(10, 40), vx: rnd(-60, 160), vy: rnd(-180, -40), life: 0.8, max: 0.8, col: pick(['#7a5a3a', '#5a3e28', '#9a7a52']), size: 3, grav: true });
  S.texts.push({ x: S.wall.x + 40, y: S.wall.y - 10, str: S.n === 2 ? 'Secret tunnel!' : 'Secret vault!', col: '#e8c76a', life: 1.6, big: true });
}

function updateParticles(dt) {
  for (const q of S.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.grav) q.vy += 500 * dt; }
  S.parts = S.parts.filter(q => q.life > 0);
  for (const t of S.texts) { t.life -= dt; t.y -= 18 * dt; }
  S.texts = S.texts.filter(t => t.life > 0);
}

let results = null;
function finishStage() {
  for (const k in S.loot) save.ing[k] = (save.ing[k] || 0) + S.loot[k];
  save.runs++; persist();
  const stars = 1 + (S.t < 300 ? 1 : 0) + (S.ko === 0 ? 1 : 0), hearts = (S.vaultOpened ? 1 : 0) + (S.end.ember ? 1 : 0);
  const prev = save.stages[S.n] || { stars: 0, hearts: 0 }; save.stages[S.n] = { stars: Math.max(prev.stars, stars), hearts: Math.max(prev.hearts, hearts) }; persist();
  results = { n: S.n, time: S.t, kills: S.kills, loot: Object.assign({}, S.loot), vault: S.vaultOpened, ember: S.end.ember, t: 0, stars, hearts, score: S.score, net: S.net ? NET.finish(S.net, { score: S.score, timeMs: Math.round(((S.netT0 || 0) + S.t) * 1000), kills: S.kills }) : null };
  scene = 'results';
}

/* -------------------------------------------------------- stage drawing */
const hash = i => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const stars = Array.from({ length: 70 }, (_, i) => ({ x: hash(i) * W, y: hash(i + 99) * 110, ph: hash(i + 7) * 6 }));
const flies = Array.from({ length: 26 }, (_, i) => ({ x: hash(i + 300) * 520, y: 70 + hash(i + 400) * 115, ph: hash(i + 500) * 6, s: 0.5 + hash(i + 600) * 0.5 }));
function glow(x, y, r, col, a = 0.5) { const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
function shroom(x, baseY, h, capW, capH, stem, cap, under, spots, glowCol) {
  ctx.fillStyle = stem; ctx.beginPath(); ctx.moveTo(x - capW * 0.1, baseY); ctx.quadraticCurveTo(x - capW * 0.02, baseY - h * 0.5, x - capW * 0.08, baseY - h); ctx.lineTo(x + capW * 0.08, baseY - h); ctx.quadraticCurveTo(x + capW * 0.16, baseY - h * 0.5, x + capW * 0.11, baseY); ctx.fill();
  if (glowCol) glow(x, baseY - h, capW * 0.9, glowCol, 0.28);
  ctx.fillStyle = under; ctx.beginPath(); ctx.ellipse(x, baseY - h + 1, capW / 2, capH * 0.35, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = cap; ctx.beginPath(); ctx.ellipse(x, baseY - h, capW / 2, capH, 0, Math.PI, 0); ctx.quadraticCurveTo(x, baseY - h + capH * 0.3, x - capW / 2, baseY - h); ctx.fill();
  if (spots) { ctx.fillStyle = spots; for (let k = 0; k < 4; k++) { const a = Math.PI + 0.5 + k * 0.6; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * capW * 0.32, baseY - h + Math.sin(a) * capH * 0.55, capW * 0.06, capH * 0.12, 0, 0, 7); ctx.fill(); } }
}
/* Environment art cut from the user's environment sheet (grid lines removed, backgrounds keyed out). */
const ENV_SRC={title_clean:"art/7e37ff8cac34.jpg",cellar2:"art/559c329846ee.jpg",tav2:"art/97f217a03440.jpg",arena:"art/a46905011e86.webp",ground2:"art/8fa63bc34a04.webp",plat2:"art/1de7f53ed7d5.webp",midbg:"art/003ce3dd268f.webp",farbg:"art/b16db0e3d121.jpg",title:"art/55d67ed13c86.jpg",sky:"art/91695c65291a.webp",trees:"art/08bd5ffeb7b3.webp",fungi:"art/36ab70487458.webp",groundstrip:"art/abde28010105.webp",platform:"art/c34d5b0aa1c8.webp",tavern:"art/7f6d45704aea.webp",cellar:"art/9c447fcc6c3a.webp",map:"art/f1237e09a557.jpg",};
const ENV = {};
const STAGE_POS_IMG = [[121, 47], [208, 48], [266, 60], [140, 140], [246, 113], [309, 34]];
for (const k in ENV_SRC) { const im = new Image(); im.onload = () => { ENV[k] = im; if (k === 'map') STAGES.forEach((st, i) => { st.x = STAGE_POS_IMG[i][0]; st.y = STAGE_POS_IMG[i][1]; }); }; im.src = ENV_SRC[k]; }
function tileX(img, par, camX, y, w, h) { const off = ((camX * par) % w + w) % w; for (let x = -off; x < W; x += w) ctx.drawImage(img, Math.round(x), y, w, h); }
function drawForestBg(camX, t) {
  if (ENV.sky && ENV.trees && ENV.fungi) {
    rect(0, 0, W, H, '#10293d');
    if (ENV.farbg) tileX(ENV.farbg, 0.08, camX, 0, 800, 225);
    else { tileX(ENV.sky, 0.05, camX, 0, 1050, 150); tileX(ENV.trees, 0.18, camX, GROUND - 128, 497, 84); }
    const fog2 = ctx.createLinearGradient(0, 110, 0, GROUND); fog2.addColorStop(0, 'rgba(40,140,150,0)'); fog2.addColorStop(1, 'rgba(60,170,170,0.3)'); ctx.fillStyle = fog2; ctx.fillRect(0, 110, W, GROUND - 110);
    if (ENV.midbg) tileX(ENV.midbg, 0.42, camX, GROUND + 4 - 198, 794, 198); else tileX(ENV.fungi, 0.42, camX, GROUND - 64, 373, 67);
    ctx.fillStyle = ENV.midbg ? 'rgba(6,20,30,0.26)' : ENV.farbg ? 'rgba(6,20,30,0.12)' : 'rgba(6,20,30,0.3)'; ctx.fillRect(0, 0, W, GROUND);
  } else {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#061a2a'); g.addColorStop(0.45, '#0c3446'); g.addColorStop(1, '#13505a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const s2 of stars) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s2.ph)); rect(s2.x, s2.y, 0.5, 0.5, '#d8fff8'); } ctx.globalAlpha = 1;
  glow(330, 34, 46, 'rgba(180,255,240,A)', 0.25); ctx.fillStyle = '#e4fff6'; ctx.beginPath(); ctx.arc(330, 34, 13, 0, 7); ctx.fill(); ctx.fillStyle = '#bfe8dc'; ctx.beginPath(); ctx.arc(326, 31, 3, 0, 7); ctx.arc(335, 38, 2, 0, 7); ctx.fill();
  // far canopy trunks
  for (let i = -1; i < 9; i++) { const seed = Math.floor(camX * 0.1 / 60) + i, x = i * 60 - ((camX * 0.1) % 60); ctx.fillStyle = '#0a2836'; ctx.fillRect(x + 20, 0, 10 + hash(seed) * 8, GROUND); ctx.beginPath(); ctx.ellipse(x + 26, 18 + hash(seed + 3) * 20, 40, 22, 0, 0, 7); ctx.fill(); }
  // far mushrooms
  for (let i = -1; i < 8; i++) { const seed = Math.floor(camX * 0.18 / 70) + i, x = i * 70 - ((camX * 0.18) % 70) + 35; shroom(x, GROUND, 50 + hash(seed) * 40, 44 + hash(seed + 1) * 20, 16, '#123c4a', '#17495a', '#123c4a', null, null); }
  const fog = ctx.createLinearGradient(0, 100, 0, GROUND); fog.addColorStop(0, 'rgba(40,140,150,0)'); fog.addColorStop(1, 'rgba(60,170,170,0.35)'); ctx.fillStyle = fog; ctx.fillRect(0, 100, W, GROUND - 100);
  // mid glowing mushrooms
  const pal = [['#2fd8c8', '#9ffff2', 'rgba(80,255,230,A)'], ['#38a8e8', '#bfe8ff', 'rgba(90,190,255,A)'], ['#7ad85a', '#d8ffb0', 'rgba(140,255,110,A)']];
  for (let i = -1; i < 7; i++) {
    const seed = Math.floor(camX * 0.38 / 95) + i, x = i * 95 - ((camX * 0.38) % 95) + 40, P = pal[Math.abs(seed) % 3];
    shroom(x, GROUND, 40 + hash(seed + 5) * 45, 40 + hash(seed + 6) * 26, 15, '#1d5a64', P[0], '#16444e', P[1], P[2]);
  }
  }
  // cave arch near the boss arena
  const ax = ARENA + 250 - camX * 0.6 - (ARENA * 0.4 - 0);
  const caveX = (ARENA + 120 - camX) * 0.55 + 140;
  if (ENV.arena) { const x0 = ARENA - camX - 13; if (x0 < W) ctx.drawImage(ENV.arena, Math.round(x0), 0, 427, 240); }
  else if (caveX > -120 && caveX < W + 120) {
    ctx.fillStyle = '#2a4450'; ctx.beginPath(); ctx.ellipse(caveX, GROUND, 70, 90, 0, Math.PI, 0); ctx.fill();
    for (let k = 0; k < 9; k++) { const a = Math.PI + k * (Math.PI / 8); ctx.fillStyle = k % 2 ? '#3e5c66' : '#4a6a72'; ctx.beginPath(); ctx.ellipse(caveX + Math.cos(a) * 58, GROUND + Math.sin(a) * 78, 14, 11, a, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#071820'; ctx.beginPath(); ctx.ellipse(caveX, GROUND, 40, 58, 0, Math.PI, 0); ctx.fill();
  }
  // fireflies
  for (const f of flies) { const x = ((f.x - camX * 0.7 * f.s) % 520 + 520) % 520 - 60, y = f.y + Math.sin(t * 1.3 + f.ph) * 8; const a = 0.5 + 0.5 * Math.sin(t * 3 + f.ph); glow(x, y, 6, 'rgba(200,255,140,A)', 0.5 * a); rect(x, y, 1, 1, '#f0ffc0'); }
}
function drawGround(camX) {
  if (ENV.groundstrip) {
    const g2 = ctx.createLinearGradient(0, GROUND, 0, H); g2.addColorStop(0, '#3a2a1c'); g2.addColorStop(1, '#120c08'); ctx.fillStyle = g2; ctx.fillRect(0, GROUND, W, H - GROUND);
    if (ENV.ground2) { ctx.fillStyle = '#21150e'; ctx.fillRect(0, GROUND + 20, W, H - GROUND - 20); tileX(ENV.ground2, 1, camX, GROUND - 7, 564, 40); } else tileX(ENV.groundstrip, 1, camX, GROUND - 5, 100, 24);
  } else {
  const g = ctx.createLinearGradient(0, GROUND, 0, H); g.addColorStop(0, '#2a3a2a'); g.addColorStop(1, '#101a14'); ctx.fillStyle = g; ctx.fillRect(0, GROUND, W, H - GROUND);
  rect(0, GROUND, W, 4, '#3cbf5a'); rect(0, GROUND + 4, W, 2, '#25803c');
  const off = camX % 8;
  for (let x = -off - 8; x < W + 8; x += 2) { const i = Math.floor((x + camX) / 2); const hgt = 1.5 + hash(i) * 4; rect(x, GROUND - hgt + 1, 1, hgt, hash(i + 1) > 0.5 ? '#5ad86a' : '#3cbf5a'); }
  for (let x = -((camX) % 40) - 40; x < W + 40; x += 40) { const i = Math.floor((x + camX) / 40); rect(x + hash(i) * 30, GROUND + 10 + hash(i + 2) * 18, 3 + hash(i + 3) * 3, 2, '#3a4a3a'); if (hash(i + 9) > 0.55) { const fx = x + hash(i + 4) * 36; glow(fx + 2, GROUND - 3, 8, 'rgba(90,255,230,A)', 0.35); rect(fx, GROUND - 5, 4, 2, '#7ff5e8'); rect(fx + 1.5, GROUND - 3, 1, 3, '#d8f8f0'); } }
  }
  for (const pl of S.pools) {
    const x = pl.x - camX; if (x > W || x + pl.w < 0) continue;
    glow(x + pl.w / 2, GROUND, pl.w * 0.6, 'rgba(170,80,255,A)', 0.12);
    if (E7.pit) { // E7 pit + liquid only (Gemini's own grass removed so the stage grass surrounds it), colour-graded to the night scene
      const bw = pl.w + 8, bh = bw * E7.pit.height / E7.pit.width * POOL_SQ, bx = x - 4, by = GROUND - 3;
      dimg(E7.pit, Math.round(bx * RES) / RES, by, bw, bh);
      for (let i = 0; i < 2; i++) { const ph = (S.t * 0.8 + i * 0.5 + pl.x * 0.013) % 1, fr = Math.min(2, Math.floor(ph * 4)); if (ph > 0.75) continue; const im = E7['bub' + fr]; if (!im) continue;
        const ux = 0.3 + 0.4 * ((Math.floor(S.t * 0.8 + i * 0.5 + pl.x) * 0.618 + i * 0.37) % 1), w = im.width / 8; dimg(im, bx + bw * ux - w / 2, by + bh * 0.2 - im.height / 8, w, im.height / 8); }
    } else
    if (E5.pool) { const wob = Math.sin(S.t * 3 + pl.x) * 0.6; dimg(E5.pool, x - 5, GROUND - 4 + wob * 0.3, pl.w + 10, 13 - wob); }
    else { rect(x, GROUND - 2, pl.w, 9, '#8a4ad8'); rect(x + 2, GROUND, pl.w - 4, 7, '#5a2a9a'); }
  }
}
/* temporary Stage 2 scenery: the alchemy cellar art (G6) darkened as a tiled far wall, stage props recoloured to stone and wine */
const F_STONE = 'grayscale(1) sepia(0.28) brightness(0.62) contrast(1.1)', F_WINE = 'hue-rotate(70deg) saturate(1.5) brightness(0.8)', F_DIRT = 'sepia(0.9) saturate(1.3) brightness(0.8)';
function drawDungeonBg(camX, t) {
  rect(0, 0, W, H, '#140c10');
  if (ENV.cellar2) { const im = recol(ENV.cellar2, 'brightness(0.42) saturate(0.7) sepia(0.25)'); tileX(im, 0.12, camX, -18, 400, 225); }
  const fog = ctx.createLinearGradient(0, 90, 0, GROUND); fog.addColorStop(0, 'rgba(80,20,30,0)'); fog.addColorStop(1, 'rgba(110,30,40,0.28)'); ctx.fillStyle = fog; ctx.fillRect(0, 90, W, GROUND - 90);
  if (ENV.cellar2) { const x0 = ARENA - camX - 20; if (x0 < W) { ctx.drawImage(recol(ENV.cellar2, 'brightness(0.6) saturate(1.2) hue-rotate(-12deg)'), Math.round(x0), -10, 440, 248); const gr = ctx.createLinearGradient(x0, 0, x0 + 60, 0); gr.addColorStop(0, '#140c10'); gr.addColorStop(1, 'rgba(20,12,16,0)'); ctx.fillStyle = gr; ctx.fillRect(x0, 0, 60, H); } }
}
function drawStageBg(n, camX, t) { if (n === 2) drawDungeonBg(camX, t); else drawForestBg(camX, t); }
function drawDungeonGround(camX) {
  ctx.fillStyle = '#16100e'; ctx.fillRect(0, GROUND, W, H - GROUND);
  if (ENV.ground2) tileX(recol(ENV.ground2, F_STONE), 1, camX, GROUND - 7, 564, 40);
  for (const pt of S.pits) { const x = pt.x - camX; if (x > W || x + pt.w < 0) continue;
    const g = ctx.createLinearGradient(0, GROUND - 8, 0, H); g.addColorStop(0, '#0a0608'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(Math.round(x), GROUND - 7, pt.w, H - GROUND + 7); }
  for (const pl of S.pools) { const x = pl.x - camX; if (x > W || x + pl.w < 0 || !E7.pit) continue;
    const im = recol(E7.pit, F_WINE), bw = pl.w + 8, bh = bw * im.height / im.width * POOL_SQ, bx = x - 4, by = GROUND - 3;
    glow(x + pl.w / 2, GROUND, pl.w * 0.6, 'rgba(200,40,70,A)', 0.12); dimg(im, Math.round(bx * RES) / RES, by, bw, bh); }
}
function drawStageWorld() {
  const cx = Math.round(S.camX);
  drawStageBg(S.n, cx, S.t);
  if (S.n === 2) drawDungeonGround(cx); else drawGround(cx);
  ctx.save(); ctx.translate(-cx, 0);
  // arena markers
  if (!ENV.arena) { rect(ARENA - 6, GROUND - 60, 6, 60, '#2b1a2a'); rect(ARENA - 14, GROUND - 70, 22, 12, '#8a3a4a'); }
  // platforms
  for (const pl of S.platforms) { if (pl.x - cx > W || pl.x + pl.w - cx < 0) continue;
    if (ENV.plat2) { const im = S.n === 2 ? recol(ENV.plat2, F_STONE) : ENV.plat2, y = pl.y - 2, h = 16, cw = 7, mw = 13.75;
      const nr = pl.w > 70 ? 2 : 1; for (let k = 0; k < nr; k++) { const rx = pl.x + pl.w * (k + 1) / (nr + 1) - 13.9; ctx.drawImage(im, 0, 60, 111, 59, rx, y + 15, 27.75, 14.75); }
      ctx.drawImage(im, 0, 0, 28, 64, pl.x - 2, y, cw, h); ctx.drawImage(im, 83, 0, 28, 64, pl.x + pl.w - 5, y, cw, h);
      for (let x = pl.x + 5; x < pl.x + pl.w - 5; x += mw) { const ww = Math.min(mw, pl.x + pl.w - 5 - x); ctx.drawImage(im, 28, 0, 55 * ww / mw, 64, x, y, ww, h); }
      continue; }
    if (ENV.platform) { const im = ENV.platform, y = pl.y - 2, h = 14; ctx.drawImage(im, 0, 0, 14, 24, pl.x - 2, y, 8, h); ctx.drawImage(im, 14, 0, 42, 24, pl.x + 6, y, pl.w - 12, h); ctx.drawImage(im, 56, 0, 14, 24, pl.x + pl.w - 6, y, 8, h); continue; }
    rect(pl.x + 4, pl.y + 6, 3, GROUND - pl.y - 6, '#2a4a40'); rect(pl.x + pl.w - 7, pl.y + 6, 3, GROUND - pl.y - 6, '#2a4a40');
    rect(pl.x - 0.5, pl.y - 0.5, pl.w + 1, 8, '#1b1020'); rect(pl.x, pl.y, pl.w, 7, '#8a5a32'); for (let k = 0; k < pl.w; k += 12) rect(pl.x + k, pl.y + 1, 0.5, 6, '#5a3a22'); rect(pl.x, pl.y + 3.5, pl.w, 0.5, '#a8723a');
    rect(pl.x, pl.y, pl.w, 2, '#3cbf5a'); for (let k = 3; k < pl.w - 3; k += 7) rect(pl.x + k, pl.y + 2, 1.5, 1 + hash(pl.x + k) * 4, '#2a9a48'); }
  // mound
  const m = S.solids.find(s => s.kind === 'slab');
  if (ENV.plat2 && fxArtReady) { // vault roof = G3 mossy platform art; open alcove behind (no code-drawn room)
    const im = S.n === 2 ? recol(ENV.plat2, F_STONE) : ENV.plat2, y = m.y - 2, h = 16, cw = 7, mw = 13.75;
    ctx.drawImage(im, 0, 0, 28, 64, m.x - 2, y, cw, h); ctx.drawImage(im, 83, 0, 28, 64, m.x + m.w - 5, y, cw, h);
    for (let x = m.x + 5; x < m.x + m.w - 5; x += mw) { const ww = Math.min(mw, m.x + m.w - 5 - x); ctx.drawImage(im, 28, 0, 55 * ww / mw, 64, x, y, ww, h); }
    for (let k = 0; k < 3; k++) ctx.drawImage(im, 0, 60, 111, 59, m.x + 30 + k * 60, y + 15, 27.75, 14.75);
  } else {
  rect(m.x, m.y, m.w, m.h, '#4a6a72'); for (let x = m.x; x < m.x + m.w; x += 10) { rect(x, m.y + 2, 9.5, 4.5, '#5a7c84'); rect(x + 5, m.y + 7, 9.5, 4.5, '#3e5c66'); } rect(m.x, m.y, m.w, 3, '#3cbf5a');
  rect(1424, 150, 16, 40, '#4a6a72'); for (let y = 152; y < 190; y += 6) rect(1425, y, 14, 5, y % 12 ? '#5a7c84' : '#3e5c66');
  rect(1256, 150, 168, 40, S.wall.broken ? '#0e2228' : '#1e3a42');
  if (S.wall.broken) { for (let x = 1262; x < 1420; x += 20) rect(x, 154, 2, 2, '#7cf5c8'); }
  }
  if (fxArtReady && S.n === 2) { const w = S.wall, ok = fxImg('wall_ok', 1), rb = fxImg('rubble', 1);
    if (ok) { const im = recol(ok, F_STONE); ctx.drawImage(im, Math.round(1432 - LW(im) / 2), Math.round(GROUND + 1 - LH(im)), LW(im), LH(im)); }
    if (rb) { const im = recol(rb, F_DIRT), k = w.broken ? 0.8 : 1.9; ctx.drawImage(im, Math.round(w.x + w.w / 2 - LW(im) * k / 2), Math.round(GROUND + 2 - LH(im) * k), LW(im) * k, LH(im) * k); } }
  else if (fxArtReady) { const w = S.wall; fxB('wall_ok', 1432, GROUND + 1); if (!w.broken) fxB('wall_crack', w.x + w.w / 2, GROUND + 1); else fxB('rubble', w.x + w.w / 2, GROUND + 2); }
  else if (!S.wall.broken) {
    const w = S.wall; rect(w.x, w.y, w.w, w.h, '#6a8a90'); for (let y = w.y; y < w.y + w.h; y += 8) rect(w.x, y + 7, w.w, 1, '#3e5c66');
    ctx.strokeStyle = '#2a1e1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w.x + 3, w.y + 4); ctx.lineTo(w.x + 9, w.y + 14); ctx.lineTo(w.x + 5, w.y + 22); ctx.lineTo(w.x + 12, w.y + 34); ctx.moveTo(w.x + 9, w.y + 14); ctx.lineTo(w.x + 14, w.y + 18); ctx.stroke();
  }
  // pickups
  for (const it of S.pickups) {
    if (it.type === 'shelfchest') { if (fxArtReady) fxB(S.shelf.got ? 'chest_open' : 'chest', it.x + 12, it.y + 17); continue; }
    if (it.type === 'chest') {
      if (fxArtReady) { fxB(S.vaultOpened ? 'chest_open' : 'chest', it.x + 12, it.y + 17); continue; }
      if (S.wall.broken || true) { const open = S.vaultOpened; rect(it.x, it.y + (open ? 4 : 0), 24, open ? 12 : 16, '#1b1020'); rect(it.x + 1, it.y + 1 + (open ? 4 : 0), 22, (open ? 10 : 14), '#c08a3c'); rect(it.x + 1, it.y + 6, 22, 2, '#f2c94c'); if (!open) rect(it.x + 10, it.y + 5, 4, 5, '#f2c94c'); }
      continue;
    }
    const y = it.y + (it.drop ? 0 : Math.sin(it.bob * 3) * 2);
    dimg(icon(it.type), Math.round(it.x), Math.round(y));
  }
  // enemies
  for (const e of S.enemies) { if ((e.dead && e !== S.boss) || !e.active && e.type !== 'mimic') continue; if (e.x - cx > W + 20 || e.x + e.w - cx < -20) continue; drawEnemy(e); }
  // projectiles
  for (const pr of S.projs) drawProj(pr);
  if (S.fx) { for (const f of S.fx) { f.t -= 1 / 60;
    if (f.type === 'bowl' && fxArtReady) { ctx.globalAlpha = clamp(f.t * 2, 0, 1); fxB('tomyum', f.x + 22, GROUND + 4, 1, 0.8 + (0.9 - f.t) * 0.4); }
    else if (f.type === 'bowl') { ctx.globalAlpha = clamp(f.t * 2, 0, 1); drawTomyumBowl(f.x + 22, GROUND, 1 + (0.9 - f.t) * 0.3); }
    else if (f.type === 'boom' && fxArtReady) { const k = 1 - f.t / 0.6; const fr = k < 0.12 ? 'b_spark' : k < 0.3 ? 'b_small' : k < 0.55 ? 'b_big' : 'b_smoke'; if (k >= 0.55) ctx.globalAlpha = clamp((1 - k) / 0.45, 0, 1); fxC(fr, f.x, f.y - (k >= 0.55 ? (k - 0.55) * 20 : 0)); }
    else if (f.type === 'spark' && fxArtReady) { const k = 1 - f.t / 0.3; ctx.globalAlpha = clamp(1 - k * 0.8, 0, 1); fxC('hit', f.x, f.y, 1, 0.55 + k * 0.5); }
    else if (f.type === 'boom') { const k = 1 - f.t / 0.6; if (k < 0.45) { const r = 4 + k * 30; glow(f.x, f.y, r * 1.6, 'rgba(255,170,60,A)', 0.8); ctx.fillStyle = '#ff6b2c'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.8, 0, 7); ctx.fill(); ctx.fillStyle = '#ffd35a'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.5, 0, 7); ctx.fill(); } else { ctx.globalAlpha = clamp(f.t * 3, 0, 1); for (let n = 0; n < 6; n++) { const a = n * 1.05 + f.x; ctx.fillStyle = n % 2 ? '#3a2a2a' : '#5a4040'; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * k * 14, f.y + Math.sin(a) * k * 12 - k * 6, 3 + k * 3, 0, 7); ctx.fill(); rect(f.x + Math.cos(a + 0.5) * k * 22, f.y + Math.sin(a + 0.5) * k * 20, 1.5, 1.5, '#ffd35a'); } } }
    else if (f.type === 'spark') { const k = 1 - f.t / 0.3; ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 1.2; for (let n = 0; n < 8; n++) { const a = n * Math.PI / 4; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * (4 + k * 10), f.y + Math.sin(a) * (4 + k * 10)); ctx.lineTo(f.x + Math.cos(a) * (8 + k * 16), f.y + Math.sin(a) * (8 + k * 16)); ctx.stroke(); } }
    ctx.globalAlpha = 1; } S.fx = S.fx.filter(f => f.t > 0); }
  // gorn
  if (S.sup.gorn) { if (S.sup.gorn.mole) drawBustHelper('mole', 'MOLE', S.sup.gorn.x + 15, GROUND - 6, S.sup.gorn.state === 'smash' ? Math.sin(S.t * 40) * 2 : Math.abs(Math.sin(S.t * 14)) * -2, S.sup.gorn.state === 'leave'); else drawGorn(S.sup.gorn); }
  if (S.lift) drawBustHelper('pixie', 'PIXIE', S.p.x + S.p.w / 2, S.p.y - 2, Math.sin(S.t * 12) * 2, false);
  if (S.corpse) { const c = S.corpse; c.t -= 1 / 60; const hasDead = heroReady && HERO_ATLAS[KNIGHTS[c.i].id + '_dead']; if (hasDead) { const ds = knightSprite(c.i, 'dead'); ctx.globalAlpha = clamp(c.t, 0, 1); ctx.drawImage(c.face > 0 ? ds.r : ds.l, Math.round(c.x + 9 - 50 - (ds.r.padL || 0)), Math.round(GROUND - (ds.r.lh - 1.5)), ds.r.lw, ds.r.lh); ctx.globalAlpha = 1; if (c.t <= 0) S.corpse = null; } else { const spr = knightSprite(c.i, 'stand'); const img = c.face > 0 ? spr.r : spr.l; ctx.save(); ctx.globalAlpha = clamp(c.t, 0, 1); ctx.translate(c.x + 9, GROUND - 6); ctx.rotate(-c.face * Math.PI / 2 * clamp((1.4 - c.t) * 4, 0, 1)); dimg(img, -18, -38); ctx.restore(); ctx.globalAlpha = 1; if (c.t <= 0) S.corpse = null; } }
  // player
  drawPlayer();
  if (S.poisonT > 0) { S.poisonT -= 1 / 60; dimg(icon('st_poison', 1), S.p.x + 5, S.p.y - 20 + Math.sin(S.t * 8)); }
  // particles
  for (const q of S.parts) { ctx.globalAlpha = clamp(q.life / q.max, 0, 1); rect(q.x, q.y, q.size, q.size, q.col); }
  ctx.globalAlpha = 1;
  for (const t of S.texts) { ctx.globalAlpha = clamp(t.life * 2, 0, 1); if (t.dmg) { outlined(t.str, t.x, t.y, t.size, t.col); continue; } text(t.str, t.x, t.y, { thai: /[\u0E00-\u0E7F]/.test(t.str), align: 'center', size: t.big ? 11 : 9, color: t.col, weight: 700 }); }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPlayer() {
  const p = S.p, i = S.active, id = KNIGHTS[i].id;
  if (p.inv > 0 && p.inv < 0.9 && Math.floor(p.inv * 20) % 2 === 0 && !p.special) return;
  let frame = Math.floor(S.t * 2) % 2 ? 'idle2' : 'stand';
  if (p.special && p.special.type !== 'skillet') frame = 'spec';
  else if (p.atkT > 0) frame = id === 'arthur' ? (p.special && p.special.type === 'skillet' ? 'atk3' : ['atk1', 'atk2', 'atk3'][p.combo || 0]) : (id === 'rosemary' ? (heroHiReady && HERO_HI.rosemary_atk3 ? ['atk1', 'atk2', 'atk3'][p.combo || 0] : p.combo % 2 ? 'atk2' : 'atk1') : 'atk1');
  else if (!p.onGround) frame = 'jump';
  else if (Math.abs(p.vx) > 1) frame = 'run' + (1 + Math.floor(p.anim * 10) % 4);
  const spr = knightSprite(i, frame); const img = p.face > 0 ? spr.r : spr.l;
  if (img.hero) { ctx.drawImage(img, Math.round(p.x + p.w / 2 - 50 - (img.padL || 0)), Math.round(p.y + p.h - (img.lh - 1.5)), img.lw, img.lh); }
  else dimg(img, Math.round(p.x + p.w / 2 - LW(img) / 2), Math.round(p.y + p.h - LH(img)));
  if (id === 'arthur' && p.atkT > 0 && fxArtReady && !HERO_HI.arthur_atk1 && !(p.special && p.special.type === 'skillet')) { const heavy = p.combo === 2; ctx.globalAlpha = clamp(p.atkT / (heavy ? 0.2 : 0.14), 0, 1); fxC(heavy ? 'crescent' : 'slash', p.x + p.w / 2 + p.face * 22, p.y + 14, p.face, heavy ? 1 : 0.85); ctx.globalAlpha = 1; }
  if (id === 'percival' && (p.atkT > 0 || (p.special && p.special.type === 'rain'))) { const hx = p.x + p.w / 2 + p.face * 12, hy = p.y + 4; for (let k = 0; k < 3; k++) { const a = S.t * 8 + k * 2.1; rect(hx + Math.cos(a) * 8, hy + Math.sin(a) * 8, 1.5, 1.5, '#bff4ff'); } }
}

function drawEnemy(e) {
  if (e.type === 'boss') { drawBoss(e); return; }
  let img;
  const frame = e.type === 'mimic' ? (e.state === 'sleep' ? 0 : (Math.floor(e.t * 6) % 2)) : Math.floor(e.anim * 6) % 2;
  const art = enemyArtFor(e, frame);
  const spr = art ? art.spr : enemySprite(e.type, frame);
  img = e.face > 0 ? spr.l : spr.r;
  if (e.type === 'mimic' && e.state === 'sleep') img = spr.r;
  if (e.flash > 0 && !(art && art.hurt)) img = tinted(img, art ? '#ffffffaa' : '#ffffff');
  else if (e.freeze > 0) img = tinted(img, '#a8ecffcc');
  else if (e.burn > 0 && Math.floor(S.t * 10) % 2) img = tinted(img, '#ff8a3d99');
  else if (e.slow > 0) img = tinted(img, '#7fd6ff66');
  const sc = e.type === 'grapelet' ? 0.55 : e.type === 'keg' ? 0.9 : 1;
  const dx = Math.round(e.x + e.w / 2 - LW(img) * sc / 2), dy = Math.round(e.y + e.h - LH(img) * sc);
  if (sc !== 1) dimg(img, dx, dy, LW(img) * sc, LH(img) * sc); else dimg(img, dx, dy);
  if (e.type === 'puff' && e.puffT && enemyArtReady) { const cl = ENEMY_ART.puff_cloud.l, k = 0.35 + e.puffT; ctx.globalAlpha = Math.min(1, e.puffT * 4); dimg(cl, e.x + e.w / 2 - LW(cl) * k / 2, e.y - LH(cl) * k * 0.7, LW(cl) * k, LH(cl) * k); ctx.globalAlpha = 1; }
  else if (e.type === 'puff' && e.puffT) { ctx.fillStyle = '#e8d8ff88'; ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y - 2, 6 + e.puffT * 10, 0, 7); ctx.fill(); }
  if (e.burn > 0 && Math.random() < 0.4) S.parts.push({ x: e.x + rnd(0, e.w), y: e.y + rnd(0, e.h), vx: 0, vy: -40, life: 0.3, max: 0.3, col: '#ff8a3d', size: 2 });
  const sts = [e.burn > 0 && 'st_fire', e.freeze > 0 && 'st_freeze', e.slow > 0 && 'st_slow'].filter(Boolean); sts.forEach((n, k) => dimg(icon(n, 1), e.x + e.w / 2 - sts.length * 4.5 + k * 9, e.y - 16));
  if (e.hp < e.max && e.type !== 'mimic' && e.type !== 'grapelet' || (e.type === 'mimic' && e.state !== 'sleep' && e.hp < e.max)) bar(e.x, e.y - 6, e.w, 3, e.hp / e.max, '#e2483b');
}

const bossCanvas = (() => {
  /* painted with paths at 2x (224x208 real), alpha-thresholded, shaded and outlined; drawn at 112x104 world units, facing left */
  const make = (squash, angry) => {
    const c = document.createElement('canvas'); c.width = 224; c.height = 208; const g = c.getContext('2d');
    g.scale(2, 2);
    const ell = (x, y, rx, ry, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
    const lg = (y0, y1, a, b2) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, b2); return gr; };
    const sq = 1 - squash * 0.08, sx = 1 + squash * 0.08;
    g.translate(56, 104); g.scale(sx, sq); g.translate(-56, -104);
    // legs
    ell(40, 96, 11, 8, angry ? '#8a2240' : '#8e2a6a'); ell(74, 96, 11, 8, angry ? '#8a2240' : '#8e2a6a');
    // back arm (resting)
    g.strokeStyle = angry ? '#c0405a' : '#c8508a'; g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); g.moveTo(84, 62); g.quadraticCurveTo(100, 70, 96, 86); g.stroke();
    ell(96, 88, 6, 5, angry ? '#c0405a' : '#c8508a');
    // body
    ell(57, 70, 31, 28, lg(44, 98, angry ? '#e0405a' : '#d85aa0', angry ? '#f08a3a' : '#f0904a'));
    ell(57, 78, 18, 15, angry ? '#f8a070' : '#f8aa78');
    // face
    g.fillStyle = '#1b1020';
    [[40, 60], [62, 60]].forEach(([x, y]) => { ell(x + 4, y + 4, 6, 4.5, '#1b1020'); ell(x + 4, y + 4, 4.5, 3.2, angry ? '#ff4a3a' : '#ffd84a'); ell(x + 3.4, y + 4.4, 1.6, 1.8, '#1b1020'); });
    g.fillStyle = '#1b1020'; g.beginPath(); g.moveTo(36, 56); g.lineTo(50, 61); g.lineTo(49, 63.5); g.lineTo(35, 59); g.fill();
    g.beginPath(); g.moveTo(76, 56); g.lineTo(62, 61); g.lineTo(63, 63.5); g.lineTo(77, 59); g.fill();
    g.beginPath(); g.moveTo(44, 80); g.quadraticCurveTo(57, 70, 70, 80); g.lineTo(68, 82); g.quadraticCurveTo(57, 75, 46, 82); g.fill();
    g.fillStyle = '#fff'; g.fillRect(50, 75.5, 3, 3); g.fillRect(61, 75.5, 3, 3);
    // reaching arm toward the player (left)
    g.strokeStyle = angry ? '#c0405a' : '#c8508a'; g.lineWidth = 10; g.beginPath(); g.moveTo(32, 64); g.quadraticCurveTo(18, 58, 10, 64); g.stroke();
    ell(8, 66, 7, 6, angry ? '#c0405a' : '#c8508a'); g.lineWidth = 3; [[2, 60], [0, 66], [3, 72]].forEach(([x, y]) => { g.beginPath(); g.moveTo(6, 66); g.lineTo(x, y); g.stroke(); });
    // cap
    g.fillStyle = lg(8, 52, angry ? '#b04ad8' : '#a85ae0', angry ? '#5a1a7a' : '#5e2a96'); g.beginPath(); g.ellipse(56, 40, 52, 30, 0, Math.PI, 0); g.quadraticCurveTo(100, 54, 56, 52); g.quadraticCurveTo(12, 54, 4, 40); g.fill();
    g.fillStyle = '#e07a9a'; g.beginPath(); g.moveTo(10, 44); g.quadraticCurveTo(56, 60, 102, 44); g.quadraticCurveTo(56, 54, 10, 44); g.fill();
    [[24, 30, 7], [46, 18, 6], [70, 22, 8], [90, 34, 5], [56, 38, 4], [14, 40, 3.5], [34, 42, 3]].forEach(([x, y, r]) => { ell(x, y, r, r * 0.8, '#f08a3a'); ell(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.4, '#ffc070'); });
    // crown
    g.save(); g.translate(62, 10); g.rotate(0.12);
    g.fillStyle = '#f2c94c'; g.beginPath(); g.moveTo(-16, 6); g.lineTo(-16, -6); g.lineTo(-10, 0); g.lineTo(-5, -10); g.lineTo(0, -1); g.lineTo(5, -10); g.lineTo(10, 0); g.lineTo(16, -6); g.lineTo(16, 6); g.closePath(); g.fill();
    g.fillStyle = '#fff2b0'; g.fillRect(-15, 1, 30, 2); ell(-5, 3, 2.2, 2.2, '#c0283a'); ell(5, 3, 2.2, 2.2, '#c0283a'); ell(0, -3, 2, 2, '#4fb3d9');
    g.restore();
    // pixelate: hard alpha, then shade + outline
    const d = g.getImageData(0, 0, 224, 208); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0; g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(d, 0, 0);
    shade(c, true, 0.15);
    c.lw = 112; c.lh = 104; return c;
  };
  const o = { idle: make(0, false), squash: make(1, false), idleA: make(0, true), squashA: make(1, true) };
  for (const k of Object.keys(o)) o[k + 'R'] = flip(o[k]);
  return o;
})();
function drawBoss(b) {
  const angry = b.hp < b.max * 0.5;
  if (enemyArtReady) {
    let k = 'boss_idle';
    if (b.dead) k = 'boss_dead';
    else if (b.state === 'spray') k = 'boss_spit';
    else if (b.squash > 0.4) k = 'boss_slam';
    else if (b.state === 'crouch' || b.state === 'summon' || b.state === 'air') k = 'boss_fists';
    else if (Math.abs(b.vx) > 5 || b.state === 'intro') k = Math.floor(S.t * 4) % 2 ? 'boss_stomp' : 'boss_idle';
    if (S.n === 2) { if (b.state === 'curl' || b.state === 'roll') k = 'boss_fists'; else if (b.state === 'spray') k = 'boss_spit'; }
    let spr = ENEMY_ART[k]; if (S.n === 2) spr = { l: recol(spr.l, 'sepia(1) saturate(2.2) hue-rotate(-15deg) brightness(0.85)'), r: recol(spr.r, 'sepia(1) saturate(2.2) hue-rotate(-15deg) brightness(0.85)') };
    let im = b.face > 0 ? spr.l : spr.r;
    if (S.n === 2 && b.state === 'roll') { ctx.save(); ctx.translate(Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2 + 4)); ctx.rotate(S.t * 14 * Math.sign(b.vx || 1)); const w = LW(im) * 0.75, h = LH(im) * 0.75; ctx.drawImage(b.flash > 0 ? tinted(im, '#ffffffaa') : im, -w / 2, -h / 2, w, h); ctx.restore(); return; }
    if (b.flash > 0) im = tinted(im, '#ffffffaa'); else if (b.freeze > 0) im = tinted(im, '#a8ecff99'); else if (b.burn > 0 && Math.floor(S.t * 10) % 2) im = tinted(im, '#ff8a3d77'); else if (angry) im = tinted(im, '#ff203822');
    const wob = b.state === 'spray' ? Math.sin(S.t * 50) * 1.5 : 0;
    const cxOff = k === 'boss_spit' ? (b.face > 0 ? 1 : -1) * (LW(im) - LW(ENEMY_ART.boss_idle.l)) / 2 : 0;
    dimg(im, Math.round(b.x + b.w / 2 - LW(im) / 2 + cxOff + wob), Math.round(b.y + b.h - LH(im) + 3));
    if (b.burn > 0 && Math.random() < 0.6) S.parts.push({ x: b.x + rnd(0, b.w), y: b.y + rnd(0, b.h), vx: 0, vy: -50, life: 0.4, max: 0.4, col: pick(['#ff8a3d', '#ffd35a']), size: 3 });
    return;
  }
  let img = bossCanvas[((b.state === 'crouch' || b.squash > 0.4) ? 'squash' : 'idle') + (angry ? 'A' : '') + (b.face > 0 ? 'R' : '')];
  if (b.flash > 0) img = tinted(img, '#ffffffcc'); else if (b.freeze > 0) img = tinted(img, '#a8ecff99'); else if (b.burn > 0 && Math.floor(S.t * 10) % 2) img = tinted(img, '#ff8a3d77');
  const wob = b.state === 'spray' ? Math.sin(S.t * 50) * 2 : 0;
  dimg(img, Math.round(b.x + b.w / 2 - 56 + wob), Math.round(b.y + b.h - 102));
  if (b.state === 'spray') { ctx.fillStyle = '#d4a8ff66'; ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + 4, 10 + (0.55 - b.t) * 30, 0, 7); ctx.fill(); }
  if (b.burn > 0 && Math.random() < 0.6) S.parts.push({ x: b.x + rnd(0, b.w), y: b.y + rnd(0, b.h), vx: 0, vy: -50, life: 0.4, max: 0.4, col: pick(['#ff8a3d', '#ffd35a']), size: 3 });
}

function drawProj(pr) {
  if (pr.type === 'bottle' || pr.type === 'wine') { /* temporary: reuse the poison-pool bubble art recoloured until card W7 arrives */
    const im = E7.bub0 ? recol(E7.bub0, pr.type === 'bottle' ? 'hue-rotate(200deg) saturate(1.4)' : F_WINE) : null;
    if (im) { const sz = pr.type === 'bottle' ? 11 : 9; ctx.save(); ctx.translate(pr.x + pr.w / 2, pr.y + pr.h / 2); ctx.rotate(S.t * 10); ctx.drawImage(im, -sz / 2, -sz / 2, sz, sz); ctx.restore(); }
    return;
  }
  if (fxArtReady) {
    const f = Math.sign(pr.vx) || 1;
    if (pr.type === 'bolt') { glow(pr.x + pr.w / 2, pr.y + pr.h / 2, 12, 'rgba(120,200,255,A)', 0.5); if (pr.vy) { ctx.save(); ctx.translate(pr.x + pr.w / 2, pr.y + pr.h / 2); ctx.rotate(Math.atan2(pr.vy, Math.abs(pr.vx)) * f); fxC('icebolt', -f * 4, 0, f); ctx.restore(); } else fxC('icebolt', pr.x + pr.w / 2 - f * 4, pr.y + pr.h / 2, f); return; }
    if (pr.type === 'icefall') { glow(pr.x + 5, pr.y + 5, 12, 'rgba(255,150,60,A)', 0.5); fxB('meteor', pr.x + 5, pr.y + 12, pr.vx > 0 ? -1 : 1); return; }
    if (pr.type === 'star') { glow(pr.x + pr.w / 2, pr.y + pr.h / 2, 12, 'rgba(255,230,120,A)', 0.5); fxC('star', pr.x + pr.w / 2 - f * 5, pr.y + pr.h / 2, f); return; }
    if (pr.type === 'firewave') { glow(pr.x + pr.w / 2, pr.y + pr.h / 2, 30, 'rgba(255,120,40,A)', 0.45); fxB('flame', pr.x + pr.w / 2, pr.y + pr.h + 2, f, 1 + Math.sin(S.t * 24) * 0.05); return; }
  }
  if (pr.type === 'bolt') { const f = Math.sign(pr.vx); glow(pr.x + pr.w / 2, pr.y + 4, 12, 'rgba(120,200,255,A)', 0.6); for (let k = 0; k < 4; k++) rect(pr.x + pr.w / 2 - f * k * 4, pr.y + 3 - k * 0.3, 4 - k * 0.6, 2, k ? '#7fd6ff' : '#ffffff'); ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.arc(pr.x + pr.w / 2 + f * 2, pr.y + 4, 3, 0, 7); ctx.fill(); }
  else if (pr.type === 'icefall') { glow(pr.x + 5, pr.y + 5, 12, 'rgba(140,220,255,A)', 0.6); ctx.strokeStyle = '#bff4ff88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pr.x + 5, pr.y + 5); ctx.lineTo(pr.x + 5 - pr.vx * 0.06, pr.y + 5 - pr.vy * 0.06); ctx.stroke(); drawStar(pr.x + 5, pr.y + 5, 5, '#e8fbff', S.t * 8); }
  else if (pr.type === 'star') { glow(pr.x + 6, pr.y + 6, 12, 'rgba(255,230,120,A)', 0.55); drawStar(pr.x + 6, pr.y + 6, 5.5, '#ffe66b', S.t * 12); for (let k = 1; k < 4; k++) rect(pr.x + 6 - Math.sign(pr.vx) * k * 5, pr.y + 6 + Math.sin(S.t * 20 + k) * 2, 1.5, 1.5, '#fff6c0'); }
  else if (pr.type === 'bowl') { drawTomyumBowl(pr.x + pr.w / 2, pr.y + pr.h, 1); }
  else if (pr.type === 'firewave') {
    const f = Math.sign(pr.vx);
    for (let i = 0; i < 5; i++) { ctx.strokeStyle = ['#e2483b', '#ff6b2c', '#ff9a3d', '#ffd35a', '#fff6c8'][i]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pr.x + pr.w / 2 - f * 10 + f * i * 2, pr.y + pr.h / 2, 18 - i * 2, f > 0 ? -1.2 : Math.PI - 1.2 + 0.3, f > 0 ? 1.2 : Math.PI + 1.2 - 0.3 + 0.0, false); ctx.stroke(); }
  }
  else if (pr.type === 'spore' && E5.spore) { const im = E5.spore, w = 26, h = im.height * w / im.width; ctx.save(); ctx.translate(pr.x + pr.w / 2, pr.y + pr.h / 2); ctx.rotate(Math.atan2(pr.vy || 0, pr.vx || 1)); ctx.drawImage(im, -w * 0.686, -h * 0.416, w, h); ctx.restore(); }
  else if (pr.type === 'spore') { rect(pr.x, pr.y, pr.w, pr.h, '#1b1020'); rect(pr.x + 1, pr.y + 1, pr.w - 2, pr.h - 2, '#c88ae8'); rect(pr.x + 3, pr.y + 2, 2, 2, '#f1e3ff'); }
  else if (pr.type === 'cloud' && enemyArtReady) { const cl = ENEMY_ART.puff_cloud[pr.vx > 0 ? 'r' : 'l'], k = 0.2 + Math.sin(S.t * 10) * 0.01; dimg(cl, pr.x + 6 - LW(cl) * k / 2, pr.y + 6 - LH(cl) * k / 2, LW(cl) * k, LH(cl) * k); }
  else if (pr.type === 'cloud') { ctx.fillStyle = '#d9c86acc'; ctx.beginPath(); ctx.arc(pr.x + 6, pr.y + 6, 6 + Math.sin(S.t * 10) * 1, 0, 7); ctx.fill(); rect(pr.x + 3, pr.y + 4, 2, 2, '#fff8c0'); }
  else if (pr.type === 'wave' && E5.shock) { const im = E5.shock, f = Math.sign(pr.vx) || 1, w = 46 + Math.sin(S.t * 30) * 2, h = im.height * w / im.width; ctx.save(); ctx.translate(f > 0 ? pr.x + pr.w + 4 : pr.x - 4, GROUND + 2); ctx.scale(f, 1); ctx.drawImage(im, -w, -h, w, h); ctx.restore(); }
  else if (pr.type === 'wave') { for (let i = 0; i < 4; i++) rect(pr.x + i * 4, pr.y + 14 - (6 + ((i + Math.floor(S.t * 20)) % 3) * 3), 3, 6 + ((i + Math.floor(S.t * 20)) % 3) * 3, i % 2 ? '#c88ae8' : '#f1e3ff'); }
}

function drawStar(x, y, r, col, rot = 0) {
  ctx.fillStyle = '#1b1020'; starPath(x, y, r + 1, rot); ctx.fill(); ctx.fillStyle = col; starPath(x, y, r, rot); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 0.5, y - 1.5, 1, 1);
}
function starPath(x, y, r, rot) { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = rot + k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
function drawTomyumBowl(cx, by, sc) {
  if (heroReady) { const b = HERO_ATLAS.bowl, w = 56 * sc, h = w * b[3] / b[2]; ctx.drawImage(heroAtlas, b[0], b[1], b[2], b[3], cx - w / 2, by - h, w, h); return; }
  ctx.save(); ctx.translate(cx, by); ctx.scale(sc, sc);
  ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(0, -16, 25, 17, 0, 0, Math.PI); ctx.fill(); rect(-9, -2, 18, 3, '#1b1020');
  ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.ellipse(0, -16, 24, 16, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#c9ced8'; ctx.beginPath(); ctx.ellipse(-8, -10, 9, 6, 0, 0, Math.PI); ctx.fill(); rect(-8, -2, 16, 2, '#6f747e');
  ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(0, -16, 25, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#e2552e'; ctx.beginPath(); ctx.ellipse(0, -16, 23, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.ellipse(-6, -17, 8, 1.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff9a7a'; ctx.beginPath(); ctx.arc(-10, -18, 4, Math.PI * 0.2, Math.PI * 1.6); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff7a5a'; ctx.stroke();
  ctx.beginPath(); ctx.arc(8, -18, 3.5, Math.PI * 1.2, Math.PI * 2.6); ctx.stroke();
  rect(-2, -21, 3, 3, '#c6e86a'); rect(-1.5, -20.5, 2, 2, '#f0ffd0'); rect(13, -20, 4, 1.5, '#e2182a'); rect(-18, -20, 2, 6, '#9be15d'); rect(15, -27, 2, 8, '#9be15d'); rect(3, -21, 4, 1.5, '#3cbf5a');
  ctx.restore();
}
/* temporary Pixie/Mole helpers in stages: their map bust art until stage sprites from card F1 are cut */
function drawBustHelper(id, label, cx, by, bob, flipX) {
  const bi = uiArtReady && UI_BIG['bust_' + id]; if (!bi) return;
  const sz = 30; ctx.save(); ctx.translate(Math.round(cx), Math.round(by + bob)); if (flipX) ctx.scale(-1, 1); ctx.drawImage(bi, -sz / 2, -sz, sz, sz); ctx.restore();
  text(label, cx, by - sz - 9 + bob, { align: 'center', size: 8, color: id === 'pixie' ? '#ffb0e0' : '#e8c79a' });
}
function drawGorn(g) {
  const x = Math.round(g.x), y = GROUND - 40, bump = g.state === 'smash' && g.t < 0.4 ? 6 : 0;
  if (crewArtReady) {
    const gi = CREW_ART[g.state === 'smash' ? 'gorn_chop' : 'gorn_idle'][g.state === 'leave' ? 'r' : 'l'];
    const hop = g.state === 'smash' ? 0 : Math.abs(Math.sin(S.t * 14)) * 2;
    dimg(gi, Math.round(x + 15 - LW(gi) / 2 + bump), Math.round(GROUND - LH(gi) - hop));
    text('GORN', x + 15, GROUND - LH(gi) - 8, { align: 'center', size: 8, color: '#9be15d' });
    return;
  }
  rect(x + 2 + bump, y + 10, 26, 24, '#1b1020'); rect(x + 3 + bump, y + 11, 24, 22, '#6aa84f'); rect(x + 8 + bump, y + 18, 18, 14, '#f6efe0');
  rect(x + 6 + bump, y, 18, 12, '#1b1020'); rect(x + 7 + bump, y + 1, 16, 10, '#6aa84f'); rect(x + 7 + bump, y - 6, 16, 7, '#f6efe0');
  rect(x + 17 + bump, y + 4, 2, 2, '#1b1020'); rect(x + 19 + bump, y + 8, 3, 3, '#fff');
  rect(x + 6 + bump, y + 34, 6, 6, '#3a2416'); rect(x + 18 + bump, y + 34, 6, 6, '#3a2416');
  text('GORN', x + 15, y - 16, { align: 'center', size: 8, color: '#9be15d' });
}

function knightAtk() { return Math.round((KNIGHTS[S.active].id === 'arthur' ? 12 : KNIGHTS[S.active].id === 'rosemary' ? 8 : 10) * dmgMul() * (S.buff ? 1.3 : 1)); }
function drawStageHud() {
  const k = activeK();
  // POWER / SPECIAL
  panel(4, 4, 156, 26, '#1b1020ee', '#8a5a2e');
  rect(7, 7, 34, 9, '#a8241c'); text('POWER', 9, 7.5, { size: 8, weight: 700, color: '#fff' });
  if (!frameBar('frame_dark', 41, 5, 117, 12.5, k.hp / k.max, '#e2382c', '#ff8a7a')) { bar(42, 7, 114, 9, k.hp / k.max, '#e2382c', '#3a1010'); rect(43, 8, 112 * clamp(k.hp / k.max, 0, 1), 2, '#ff8a7a'); }
  rect(7, 18, 34, 9, '#1c4a8a'); text('SPECIAL', 8, 18.5, { size: 7, weight: 700, color: '#fff' });
  const full = S.gauge >= 100;
  const fb = frameBar('frame_blue', 41, 16.5, 87, 12.5, S.gauge / 100, full ? (Math.floor(S.t * 8) % 2 ? '#bff4ff' : '#3fa9e0') : '#3fa9e0', '#9fe4ff');
  if (fb) rect(fb.ix + fb.iw / 2, fb.iy, 0.5, fb.ih, '#f6ead2'); else { bar(42, 18, 84, 9, S.gauge / 100, full ? (Math.floor(S.t * 8) % 2 ? '#bff4ff' : '#3fa9e0') : '#3fa9e0', '#0c1a30'); rect(84, 18, 0.5, 9, '#f6ead2'); }
  text(full ? 'MAX' : Math.floor(S.gauge) + '%', 130, 18.5, { size: 8, weight: 700, color: full ? '#bff4ff' : '#7fd6ff' });
  // party
  for (let i = 0; i < 3; i++) {
    const kk = S.knights[i], x = 6 + i * 36, y = 34, act = i === S.active;
    rect(x - 1, y - 1, 34, 26, act ? '#f2a93b' : '#3a2a40'); rect(x, y, 32, 24, '#0c1418ee');
    ctx.globalAlpha = kk.down ? 0.3 : 1; dimg(knightHead(i).r, x + 4, y - 1, 24, 20); ctx.globalAlpha = 1;
    text(String(i + 1), x + 1.5, y + 0.5, { size: 7, color: act ? '#f2a93b' : '#8a9a9a', weight: 700 });
    bar(x + 2, y + 19, 28, 4, kk.hp / kk.max, kk.hp / kk.max > 0.35 ? '#6ad36a' : '#e2483b');
    if (kk.down) text('KO', x + 16, y + 6, { size: 9, align: 'center', color: '#ff6b6b', weight: 700 });
  }
  text('พลัง: ' + knightAtk(), 6, 62, { size: 8, thai: true, color: '#ffd76a' });
  text('ดาบ Tier ' + (1 + save.up.blade + (save.up.legend ? 1 : 0)), 56, 62, { size: 8, thai: true, color: '#bfe8ff' });
  if (S.buff) text('บัฟต้มยำ ATK+30%', 6, 73, { size: 7, thai: true, color: '#ff9a5a' });
  // right column
  const m = Math.floor(S.t / 60), sec = Math.floor(S.t % 60);
  text(S.n === 2 ? 'Wine Dungeon' : 'Mushroom Forest', 394, 4, { size: 10, align: 'right', weight: 700 });
  text('เวลา: ' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0'), 394, 17, { size: 8, align: 'right', thai: true, color: '#ffd76a' });
  text('คะแนน: ' + S.score, 394, 28, { size: 8, align: 'right', thai: true, color: '#ffd76a' });
  dimg(icon('glowcap', 1), 300, 41); textC('' + S.loot.glowcap, 310, 41 + LH(icon('glowcap', 1)) / 2, { size: 8 });
  dimg(icon('chili', 1), 322, 41); textC('' + S.loot.chili, 332, 41 + LH(icon('chili', 1)) / 2, { size: 8 });
  const rare = S.n === 2 ? 'cork' : 'truffle'; dimg(icon(rare, 1), 344, 41); textC('' + (S.loot[rare] || 0), 354, 41 + LH(icon(rare, 1)) / 2, { size: 8 });
  dimg(icon('ale', 1), 366, 41); textC('' + S.sup.bart, 376, 41 + LH(icon('ale', 1)) / 2, { size: 8, color: S.sup.bart ? '#f6ead2' : '#6a5a6a' });
  text('ลูกทีม: ' + crewLabel() + ' (C)', 394, 52, { size: 7, align: 'right', thai: true, color: '#bfe8ff' });
  // stage tag bottom-left
  text(S.n === 2 ? 'ด่านที่ 2: ดันเจี้ยนไวน์โบราณ' : 'ด่านที่ 1: ป่าเห็ดพิษ', 6, 202, { size: 8, thai: true, color: '#f6ead2' });
  if (!S.bossOn) { rect(6, 196, 90, 1.5, '#1b1020aa'); rect(6, 196, 90 * clamp(S.p.x / ARENA, 0, 1), 1.5, '#f2a93b'); }
  // hint
  if (S.hint) { const w = 236; panel(W / 2 - w / 2, 76, w, 16, '#173a2aee', '#9be15d'); text(S.hint, W / 2, 79.5, { size: 8, align: 'center', color: '#d8ffc0', thai: true }); }
  // boss gauge bottom-right
  if (S.boss && !S.boss.dead && S.boss.state !== 'intro') {
    text(S.n === 2 ? 'บารอนฟอนบาร์เรล' : 'ราชาเห็ด', 394, 182, { size: 10, align: 'right', thai: true, weight: 600 });
    if (!frameBar('frame_dark', 296, 194, 102, 16, S.boss.hp / S.boss.max, '#e2382c', '#ff8a7a')) { panel(300, 197, 96, 12, '#1b1020ee', '#c9a24a'); bar(302, 199, 92, 8, S.boss.hp / S.boss.max, '#e2382c', '#3a1010'); }
  }
  // speech box
  if (S.speech) {
    const sp = S.speech; if (!nineBox('dialog', 94, 166, 212, 38, 16, 7)) panel(96, 168, 208, 34, '#05080cf2', '#f6f2ea');
    ctx.font = `600 10px ${THAI}`; const nameW = ctx.measureText(sp.who + ': ').width;
    text(sp.who + ':', 104, 174, { size: 10, thai: true, color: '#ffd84a' });
    wrapText(sp.line, 104 + nameW, 174, 296 - nameW - 104, 12, { size: 10, thai: true });
    if (Math.floor(S.t * 3) % 2) { ctx.fillStyle = '#f6f2ea'; ctx.beginPath(); ctx.moveTo(292, 193); ctx.lineTo(298, 196); ctx.lineTo(292, 199); ctx.fill(); }
  }
  // banner
  if (S.banner) {
    const b = S.banner, a = clamp(Math.min(b.t, 2.2 - b.t) * 3, 0, 1);
    ctx.globalAlpha = a; if (!nineBox('dialog', 64, 90, 272, 48, 16, 8)) rect(0, 92, W, 44, b.boss ? '#2a103acc' : '#05141acc');
    text(b.text, W / 2, 97, { size: 20, align: 'center', color: b.boss ? '#e8a8ff' : '#f2a93b', weight: 700 });
    text(b.sub, W / 2, 119, { size: 11, align: 'center', color: '#f6ead2', thai: true, weight: 400 });
    ctx.globalAlpha = 1;
  }
  if (S.end && S.end.t > 0.6) {
    const a = clamp((S.end.t - 0.6) * 2, 0, 1); ctx.globalAlpha = a;
    rect(0, 84, W, 54, '#05141add');
    text('ปราบราชาเห็ดสำเร็จ!', W / 2, 88, { size: 16, align: 'center', color: '#f2a93b', weight: 600, thai: true });
    text(S.end.ember ? 'ดรอปลับ: Ember Spore (ปราบตอนติดไฟ!)' : 'ได้รับ: Shroom Crown', W / 2, 114, { size: 10, align: 'center', thai: true, color: S.end.ember ? '#ffb347' : '#f6ead2' });
    ctx.globalAlpha = 1;
  }
  controlStrip(S.bossOn ? null : null);
  if (S.paused) { rect(0, 0, W, H, '#0d0812aa'); if (!nineBox('dialog', 110, 74, 180, 62, 16, 8)) panel(110, 74, 180, 62, '#1b120cf2', '#8a5a2e'); text('หยุดชั่วคราว', W / 2, 84, { size: 18, align: 'center', color: '#f2a93b', thai: true, weight: 600 }); if (tpOnTxt) { [['เล่นต่อ', 'sresume'], ['วิธีเล่น', 'shelp']].forEach(([lb, id], k) => { const x = 122 + k * 80; btn(id, x, 108, 76, 19); uiBtn(x, 108, 76, 19, k === 0, '#f2a93b', '#3a2a20', '#5a3a12', '#1b120c'); textC(lb, x + 38, 117.5, { size: 8.5, align: 'center', thai: true, color: k === 0 ? '#ffe9b0' : '#cfc0b0' }); }); } else text('กด P หรือ Enter เพื่อเล่นต่อ', W / 2, 114, { size: 9, align: 'center', thai: true }); }
}
function outlined(str, x, y, size, col) {
  ctx.font = `700 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#1b1020';
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) ctx.fillText(str, x + dx * 0.8, y + dy * 0.8);
  ctx.fillStyle = col; ctx.fillText(str, x, y); ctx.fillStyle = '#ffffff55'; ctx.fillText(str, x - 0.3, y - 0.4);
}
function wrapText(str, x, y, maxW, lh, opt) {
  str = tr(str);
  ctx.font = `${opt.weight || 600} ${opt.size || 10}px ${opt.thai ? THAI : FONT}`;
  let words = str.split(' '), line = '', yy = y;
  if (window.Intl && Intl.Segmenter) { const sg = new Intl.Segmenter('th', { granularity: 'word' }); words = words.flatMap((w, i) => { const parts = ctx.measureText(w).width > maxW ? [...sg.segment(w)].map(p => p.segment) : [w]; return i ? ['\u0001' + parts[0], ...parts.slice(1)] : parts; }); }
  for (let w of words) { let sep = ''; if (w[0] === '\u0001') { sep = ' '; w = w.slice(1); } else if (!window.Intl || !Intl.Segmenter) sep = ' '; const test = line ? line + sep + w : w; if (ctx.measureText(test).width > maxW && line) { text(line, x, yy, opt); line = w; yy += lh; } else line = test; }
  if (line) text(line, x, yy, opt);
  return yy + lh;
}
/* key labels: arrow glyphs use the bold Thai UI font (the pixel font draws them hairline-thin) */
const KEY_AR = { '←': 'ar_left', '→': 'ar_right', '↑': 'ar_up', '↓': 'ar_down' };
function keyToks(k) { return k.split(/([←→↑↓])/).filter(t => t && t !== ' '); }
function keyLabelW(k, size, font) { ctx.font = `700 ${size}px ${font || FONT}`; const ts = keyToks(k); return ts.reduce((w, t, i) => w + (KEY_AR[t] ? size * 0.95 : (ctx.font = `700 ${size}px ${font || FONT}`, ctx.measureText(t).width)) + (i ? size * 0.25 : 0), 0); }
function keyLabel(k, cx, cy, size, opt) {
  const ts = keyToks(k); if (ts.length === 1 && !KEY_AR[ts[0]]) { textC(k, cx, cy, Object.assign({ size, align: 'center', weight: 700 }, opt)); return; }
  const font = opt && opt.thai ? THAI : FONT; let x = cx - keyLabelW(k, size, font) / 2;
  ts.forEach((t, i) => { if (i) x += size * 0.25; if (KEY_AR[t]) { const w = size * 0.95, rot = { '↑': 0, '→': Math.PI / 2, '↓': Math.PI, '←': -Math.PI / 2 }[t]; ctx.save(); ctx.translate(x + w / 2, cy); ctx.rotate(rot); textC('↑', 0, 0, Object.assign({ size: size * 1.2, align: 'center', weight: 700 }, opt, { thai: true })); ctx.restore(); x += w; } else { ctx.font = `700 ${size}px ${font}`; const w = ctx.measureText(t).width; textC(t.trim(), x + w / 2, cy, Object.assign({ size, align: 'center', weight: 700 }, opt)); x += w; } });
}
function controlStrip() { controlStripCustom(null); }
function controlStripCustom(custom) {
  if (document.body.classList.contains('tp-on')) return;
  if (!(uiArtReady && UI_BIG.frame_dark && (slice3(UI_BIG.frame_dark, -6, 212, W + 12, 13, 44), true))) rect(0, 213, W, 12, '#05080cd8');
  const items = custom ? custom : scene === 'tavern'
    ? [['← →', 'เดิน'], ['1 2 3', 'สลับคน'], ['J / คลิก', 'ทำงาน'], ['Space / K', 'สกิล'], ['Esc', 'หยุด/ออก'], ['H', 'วิธีเล่น']]
    : [['← →', 'เดิน'], ['↑ / W', 'กระโดด'], ['J / คลิก', 'โจมตี'], ['Space / K', 'ท่าพิเศษ'], ['L', 'ท่าประสาน'], ['1 2 3', 'สลับตัว'], ['C', 'ลูกทีม'], ['H', 'วิธีเล่น']];
  let x = 6;
  for (const [k, d] of items) {
    const kw = keyLabelW(k, 7) + 5;
    uiBtn(x - 1, 214.5, kw + 2, 9.5, false, '', '#2a3a44', '', '#2a3a44'); keyLabel(k, x + kw / 2, 219.25, 7, { shadow: false });
    ctx.font = `400 7px ${THAI}`; const dw = ctx.measureText(d).width;
    textC(d, x + kw + 3, 219.25, { size: 7, thai: true, weight: 400, color: '#cfe0e4', shadow: false });
    x += kw + dw + 9;
  }
}

function drawUltimate() {
  const u = S.ult; if (!u) return;
  const t = u.t;
  ctx.fillStyle = `rgba(20,6,10,${Math.min(0.7, t * 2)})`; ctx.fillRect(0, 0, W, H);
  // three knights pose
  for (let i = 0; i < 3; i++) { const spr = knightSprite(i, 'jump').r; const x = 70 + i * 40, y = 158 - Math.min(1, t * 3) * 20 - (i === 1 ? 10 : 0); dimg(spr, x, y); }
  // pot falls
  const py = Math.min(1, t / 0.75); const cy = -80 + py * py * 200;
  const cx = 250;
  if (fxArtReady) { if (u.hit) { const k = t - 0.75; fxB('tip', cx, 200, 1, 1); ctx.globalAlpha = clamp(2 - k * 1.4, 0, 1); fxB('wave', W + 120 - k * 360, H + 6, 1, 1); ctx.globalAlpha = 1; } else fxB('boil', cx, cy + 90, 1, 1); }
  else if (true) { drawTomyumBowl(cx, cy + 60, 2.3); for (let i = 0; i < 6; i++) { ctx.globalAlpha = 0.5; rect(cx - 40 + i * 16 + Math.sin(t * 8 + i) * 4, cy - 10 - ((t * 40 + i * 9) % 30), 4, 8, '#f6efe0'); } ctx.globalAlpha = 1; }
  if (u.hit) { const s = Math.max(0, 1 - (t - 0.75) * 1.4); ctx.globalAlpha = s * 0.55; rect(0, 0, W, H, '#ffd35a'); ctx.globalAlpha = 1; }
  if (t > 0.3) {
    text('ULTIMATE TAVERN COMBO', W / 2, 84, { size: 14, align: 'center', color: '#ffd35a', weight: 700 });
    text('หม้อต้มยำมหาภัยกระทะเหล็กเดือด!', W / 2, 102, { size: 14, align: 'center', color: '#ff8a5a', thai: true, weight: 600 });
  }
}

/* ============================================================ NIGHT SHIFT */
const STATIONS = [ { kind: 'kitchen', x: 61 }, { kind: 'sink', x: 120 }, { kind: 'seat', x: 172 }, { kind: 'seat', x: 203 }, { kind: 'seat', x: 234 }, { kind: 'seat', x: 265 }, { kind: 'taps', x: 300 } ];
const HOME = [1, 0, 6];
const ARROWS = ['up', 'down', 'left', 'right'];
const ARROW_GLYPH = { up: '↑', down: '↓', left: '←', right: '→' };
let T = null;
function startTavern() {
  track('tavern_start');
  T = {
    t: 0, dur: 80, sel: 6, active: 2, kpos: HOME.map(h => STATIONS[h].x), seats: [0, 1, 2, 3].map(() => ({ cust: null, dirty: false, cleanT: 0 })),
    gold: 0, served: 0, angry: 0, kicked: 0, beers: [], dishes: [], bowls: 4, pile: 0, pour: null, cook: null, harpCd: 0, harpT: 0, robber: null, fire: null,
    spawnT: 1.5, texts: [], parts: [], usedGlow: 0, washT: 0, bonkT: 0,
    events: [ { at: rnd(16, 22), type: 'vip' }, { at: rnd(32, 38), type: 'robber' }, { at: rnd(50, 56), type: 'fire' } ],
    banner: { text: 'NIGHT SHIFT', sub: 'กะดึกที่ร้าน The Tipsy Dragon เริ่มแล้ว!', t: 2.4 }, over: false, overT: 0,
  };
  T.net = NET.start('tavern');
  scene = 'tavern';
}
const CUST_LOOKS = [ { skin: '#f3c58e', hair: '#5a3a22', coat: '#4a5670' }, { skin: '#c98e5a', hair: '#1b1020', coat: '#6a4a2a' }, { skin: '#f6d7b8', hair: '#e9c46a', coat: '#3f6a8a' }, { skin: '#8d5a3a', hair: '#2e1d12', coat: '#5a6a3a' }, { skin: '#7ad37a', hair: '#3f8f3f', coat: '#6a3a5a' }, { skin: '#b7a1d6', hair: '#6c2f8f', coat: '#3a5a5a' } ];
function newCustomer(type) {
  const look = pick(CUST_LOOKS);
  const order = Math.random() < 0.55 ? 'beer' : 'dish';
  const pat = type === 'vip' ? 16 : 22;
  return { type, order: type === 'rowdy' ? null : order, pat, max: pat, look, t: 0, bob: Math.random() * 6, rowdyT: 14 };
}
function tText(str, x, y, col, big) { T.texts.push({ str, x, y, col, life: 1.2, big }); }
const kidT = () => KNIGHTS[T.active].id;
function tavernHint() {
  const st = STATIONS[T.sel], id = kidT();
  if (T.cook) return 'กดลูกศร หรือคลิกปุ่มลูกศร ให้ตรงตอนโน้ตเข้าวงกลม!';
  if (T.pour) return 'กด J หรือคลิกอีกครั้งให้หยุดในแถบทอง';
  if (st.kind === 'kitchen') return id === 'rosemary' ? (T.fire ? (TOUCH_DEV ? 'รัวปุ่มสกิลดับไฟ!' : 'รัว K ดับไฟ!') : T.bowls <= 0 ? 'ไม่มีจานสะอาด! ให้อาเธอร์ล้างจาน' : 'J/คลิก: ปรุงอาหาร (มินิเกมจังหวะ)') : 'สลับเป็นโรสแมรี่ (2) เพื่อทำอาหาร';
  if (st.kind === 'sink') return id === 'arthur' ? (T.pile ? 'J/คลิก: ล้างจาน (เหลือ ' + T.pile + ' ใบ)' : 'อ่างว่าง ไปเก็บจานที่โต๊ะ') : 'อาเธอร์ (1) ล้างจานที่นี่';
  if (st.kind === 'taps') return id === 'percival' ? 'J/คลิก: รินเบียร์วุ้น' : 'สลับเป็นเพอร์ซิวาล (3) เพื่อรินเบียร์';
  const seat = T.seats[T.sel - 2], c = seat.cust;
  if (seat.dirty && !c) return id === 'arthur' ? 'J/คลิก: เก็บจานไปล้าง' : 'โต๊ะสกปรก: ให้อาเธอร์ (1) เก็บ';
  if (c && c.type === 'rowdy') return id === 'arthur' ? 'J/คลิก: เคาะกระทะเรียกสติขี้เมา!' : 'ขี้เมาอาละวาด! อาเธอร์ (1) หรือ K พิณ';
  if (c && c.order) return id === 'percival' ? 'J/คลิก: เสิร์ฟ' + (c.order === 'beer' ? 'เบียร์' : 'อาหาร') : 'เพอร์ซิวาล (3) เป็นคนเสิร์ฟ';
  return 'K: ' + (id === 'percival' ? 'ดีดพิณสงบลูกค้า' : id === 'arthur' ? 'จับโจร' : 'ดับไฟ');
}
function tavernAlert() {
  const msgs = { vip: 'ลูกค้า VIP กำลังจะเดินเข้าร้าน!', robber: 'มีโจรด้อม ๆ มองหน้าร้าน! อาเธอร์เตรียมตัว', fire: 'เตาไฟเริ่มมีควันขึ้นแล้ว!' };
  if (T.robber && !T.robber.caught) return 'โจรบุกปล้นร้าน! สลับเป็นอาเธอร์ (1) แล้วกด K';
  if (T.fire) return TOUCH_DEV ? 'เตาไฟไหม้! แตะที่ครัว แล้วรัวปุ่มสกิล (สีส้ม)' : 'เตาไฟไหม้! โรสแมรี่ (2) ไปที่ครัวแล้วรัว K';
  const ev = T.events.find(e => !e.done && T.t > e.at - 3.5); if (ev) return msgs[ev.type];
  const angry = T.seats.filter(s => s.cust && s.cust.order && !s.cust.leaving && s.cust.pat / s.cust.max < 0.35).length;
  if (angry) return 'ลูกค้า ' + angry + ' คนเริ่มหัวร้อน! เสิร์ฟด่วน หรือดีดพิณ';
  return null;
}

function updateTavern(dt) {
  if (T.over) { T.overT += dt; if (T.overT > 0.8 && anyConfirm()) { scene = 'alchemy'; alchemy.enter(); } return; }
  if (pressed.pause) { T.paused = !T.paused; T.pauseSel = 0; }
  if (T.paused) {
    if (pressed.up || pressed.down) { T.pauseSel = 1 - (T.pauseSel || 0); SFX.select(); }
    const quit = () => { const back = T.fromTitle ? 'title' : 'map'; T = null; scene = back; if (back === 'title') titleScene.panel = null; SFX.select(); };
    if (pressed['ui:tquit']) { quit(); return; }
    if (pressed['ui:tresume']) { T.paused = false; return; }
    if (pressed['ui:thelp']) { help = 'tavern'; return; }
    if (pressed.ok || pressed.atk) { if (T.pauseSel === 1) { quit(); return; } T.paused = false; }
    return;
  }
  T.t += dt;
  if (T.banner) { T.banner.t -= dt; if (T.banner.t <= 0) T.banner = null; }
  T.washT = Math.max(0, T.washT - dt); T.bonkT = Math.max(0, T.bonkT - dt); T.harpT = Math.max(0, T.harpT - dt);
  if (!T.cook) {
    if (pressed.k1 || pressed.k2 || pressed.k3 || pressed.next || pressed.prev) {
      const nt = pressed.k1 ? 0 : pressed.k2 ? 1 : pressed.k3 ? 2 : (T.active + (pressed.next ? 1 : 2)) % 3;
      if (nt !== T.active) { T.active = nt; T.pour = null; SFX.swap(); }
    }
    if (!T.pour) { if (pressed.left) { T.sel = Math.max(0, T.sel - 1); SFX.step(); } if (pressed.right) { T.sel = Math.min(6, T.sel + 1); SFX.step(); } }
  }
  for (let i = 0; i < 3; i++) { const target = i === T.active ? STATIONS[T.sel].x : STATIONS[HOME[i]].x; T.kpos[i] += (target - T.kpos[i]) * Math.min(1, dt * (i === T.active ? 14 : 5)); }
  if (T.click !== undefined) {
    const i = T.click; T.click = undefined;
    if (!T.cook && !T.pour) {
      const kind = STATIONS[i].kind; let who = kind === 'kitchen' ? 1 : kind === 'sink' ? 0 : kind === 'taps' ? 2 : -1;
      if (who < 0) { const seat = T.seats[i - 2], c = seat.cust; if (c && c.type === 'rowdy' && !c.leaving) who = 0; else if (c && c.order && !c.leaving) who = 2; else if (seat.dirty && !c) who = 0; }
      if (who >= 0 && who !== T.active) { T.active = who; SFX.swap(); }
      if (T.sel !== i) { T.sel = i; SFX.step(); }
      pressed.atk = true;
    }
  }
  for (const a of ARROWS) if (pressed['ui:qa_' + a]) pressed[a] = true;
  T.harpCd = Math.max(0, T.harpCd - dt);
  const st = STATIONS[T.sel], id = kidT();

  if (T.cook) {
    const c = T.cook; c.time += dt;
    const nx = n => 132 + (n.t0 - c.time) * 80;
    const press = ARROWS.find(a => pressed[a]);
    const next = c.notes.find(n => n.res === undefined);
    if (press && next) {
      const d = Math.abs(nx(next) - 132);
      if (d <= 16) { next.res = press === next.dir ? (d <= 6 ? 2 : 1) : 0; c.flash = { txt: next.res === 2 ? 'Perfect!' : next.res === 1 ? 'Good' : 'Miss', t: 0.4 }; next.res ? SFX.note(next.dir, next.res === 2) : SFX.fail(); }
      else if (d < 40) { next.res = 0; c.flash = { txt: 'เร็วไป!', t: 0.4 }; SFX.fail(); }
    }
    c.notes.forEach(n => { if (n.res === undefined && nx(n) < 132 - 16) { n.res = 0; c.flash = { txt: 'Miss', t: 0.4 }; SFX.fail(); } });
    if (c.flash) { c.flash.t -= dt; if (c.flash.t <= 0) c.flash = null; }
    if (c.notes.every(n => n.res !== undefined)) finishCook();
  } else if (T.pour) {
    T.pour.v += dt / 1.3;
    if (pressed.atk || T.pour.v > 1.15) finishPour();
  } else if (pressed.atk) {
    if (st.kind === 'kitchen') {
      if (id !== 'rosemary') tText('โรสแมรี่เท่านั้นที่ทำอาหาร!', st.x, 96, '#bba8ba');
      else if (T.fire) tText('ครัวไฟไหม้อยู่!', st.x, 96, '#ff6b2c');
      else if (T.bowls <= 0) { tText('ไม่มีจานสะอาด!', st.x, 96, '#ff9a7a'); SFX.fail(); }
      else if (T.dishes.length >= 3) tText('ช่องส่งอาหารเต็ม', st.x, 96, '#bba8ba');
      else { const glow = save.ing.glowcap > 0; T.cook = { notes: Array.from({ length: 5 }, (_, k) => ({ dir: pick(ARROWS), t0: 0.9 + k * 0.55 })), time: 0, glow }; SFX.select(); }
    } else if (st.kind === 'sink') {
      if (id !== 'arthur') tText('อาเธอร์คนล้างจาน!', st.x, 110, '#bba8ba');
      else if (!T.pile) tText('ไม่มีจานรอล้าง', st.x, 110, '#bba8ba');
      else { T.pile--; T.bowls++; T.washT = 0.25; SFX.pour(); for (let n = 0; n < 6; n++) T.parts.push({ x: st.x + rnd(-8, 8), y: 128, vx: rnd(-30, 30), vy: rnd(-60, -20), life: 0.5, max: 0.5, col: '#bfe8ff' }); tText('จานสะอาด +1', st.x, 104, '#cfe8ff'); }
    } else if (st.kind === 'taps') {
      if (id !== 'percival') tText('เพอร์ซิวาลเป็นคนรินเบียร์!', st.x, 96, '#bba8ba');
      else if (T.beers.length >= 3) tText('ถาดเต็มแล้ว', st.x, 96, '#bba8ba');
      else { T.pour = { v: 0 }; SFX.pour(); }
    } else seatAction(T.seats[T.sel - 2], st);
  }
  if (pressed.sp && !T.cook && !T.pour) {
    if (id === 'percival') {
      if (T.harpCd > 0) tText('พิณยังไม่พร้อม ' + Math.ceil(T.harpCd) + ' วิ', T.kpos[2], 140, '#bba8ba');
      else { T.harpCd = 12; T.harpT = 1.4; SFX.harp(); tText('บทเพลงสงบใจ ♪', T.kpos[2], 136, '#7fd6ff', true); T.seats.forEach(s => { if (s.cust) { if (s.cust.type === 'rowdy') { s.cust.leaving = 'calm'; } else s.cust.pat = Math.min(s.cust.max, s.cust.pat + s.cust.max * 0.4); } }); for (let n = 0; n < 18; n++) T.parts.push({ x: T.kpos[2], y: 160, vx: rnd(-140, 60), vy: rnd(-90, -20), life: 1.1, max: 1.1, col: '#7fd6ff', note: true }); }
    } else if (id === 'arthur') {
      if (T.robber && !T.robber.caught) { T.robber.caught = true; T.robber.t = 0; T.gold += 10; SFX.punch(); addShake(5); T.bonkT = 0.3; tText('จับโจรได้! +10g', T.robber.x, 150, '#f2c94c', true); }
      else tText('ยังไม่มีโจร...', T.kpos[0], 150, '#bba8ba');
    } else {
      if (T.fire && st.kind === 'kitchen') { T.fire.hp--; SFX.pour(); for (let n = 0; n < 5; n++) T.parts.push({ x: 34 + rnd(-14, 14), y: 92, vx: rnd(-30, 30), vy: rnd(-60, -20), life: 0.5, max: 0.5, col: '#cfe8ff' }); if (T.fire.hp <= 0) { T.fire = null; tText('ดับไฟแล้ว!', 34, 90, '#7fd6ff', true); SFX.serve(); } }
      else tText(T.fire ? 'ไปที่ครัวก่อน!' : 'ไม่มีไฟให้ดับ', T.kpos[1], 150, '#bba8ba');
    }
  }

  const rowdyNear = T.seats.some(s => s.cust && s.cust.type === 'rowdy' && !s.cust.leaving);
  const drain = (rowdyNear ? 1.5 : 1) * (T.fire ? 1.35 : 1);
  T.seats.forEach((s, i) => {
    const c = s.cust, sx = STATIONS[i + 2].x;
    if (s.cleanT > 0) { s.cleanT -= dt; if (s.cleanT <= 0) s.dirty = false; }
    if (!c) return;
    c.t += dt; c.bob += dt;
    if (c.leaving) { c.leaveT = (c.leaveT || 0) + dt; if (c.leaveT > 0.6) { s.cust = null; s.dirty = c.leaving !== 'calm'; } return; }
    if (c.type === 'rowdy') {
      c.rowdyT -= dt;
      if (c.rowdyT <= 0) { c.leaving = 'smash'; T.gold = Math.max(0, T.gold - 6); tText('ขี้เมาทุบแก้ว! -6g', sx, 70, '#ff6b6b'); SFX.fail(); }
      return;
    }
    c.pat -= dt * drain;
    if (c.pat <= 0) { c.leaving = 'angry'; T.angry++; tText('ช้าจริง! ไม่กินแล้ว!', sx, 66, '#ff6b6b'); SFX.fail(); }
  });

  T.spawnT -= dt;
  if (T.spawnT <= 0 && T.t < T.dur - 4) {
    T.spawnT = Math.max(2.4, rnd(3.6, 5.4) - T.t * 0.03);
    const free = T.seats.map((s, i) => i).filter(i => !T.seats[i].cust && !T.seats[i].dirty);
    if (free.length) { const i = pick(free); T.seats[i].cust = newCustomer(Math.random() < 0.15 ? 'rowdy' : 'normal'); }
  }
  for (const ev of T.events) {
    if (ev.done || T.t < ev.at) continue;
    ev.done = true;
    if (ev.type === 'vip') {
      const free = T.seats.map((s, i) => i).filter(i => !T.seats[i].cust);
      const i = free.length ? pick(free) : 1; T.seats[i].dirty = false; T.seats[i].cust = newCustomer('vip');
      T.banner = { text: 'VIP!', sub: 'ท่านหญิงแมรีโกลด์มาแล้ว จ่ายสองเท่า อย่าให้รอนาน!', t: 2.2 }; SFX.ult();
    } else if (ev.type === 'robber') { T.robber = { x: -10, caught: false, t: 0 }; SFX.hurt(); }
    else if (ev.type === 'fire') { T.fire = { hp: 6, t: 12 }; SFX.boom(); }
  }
  if (T.robber) {
    const r = T.robber;
    if (r.caught) { r.t += dt; if (r.t > 1) T.robber = null; }
    else { r.x += 40 * dt; if (r.x > 380) { const loss = Math.round(T.gold * 0.4); T.gold -= loss; tText('โดนปล้น! -' + loss + 'g', 370, 140, '#ff6b6b', true); SFX.fail(); T.robber = null; } }
  }
  if (T.fire) { T.fire.t -= dt; if (T.fire.t <= 0) { T.fire = null; T.gold = Math.max(0, T.gold - 10); tText('ไฟไหม้จนมอด ค่าซ่อม -10g', 80, 90, '#ff6b6b', true); } if (Math.random() < 0.6) T.parts.push({ x: 34 + rnd(-16, 16), y: 100, vx: rnd(-10, 10), vy: rnd(-60, -30), life: 0.5, max: 0.5, col: pick(['#ff6b2c', '#ffd35a', '#e2483b']) }); }
  for (const q of T.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; }
  T.parts = T.parts.filter(q => q.life > 0);
  for (const t of T.texts) { t.life -= dt; t.y -= 16 * dt; }
  T.texts = T.texts.filter(t => t.life > 0);
  if (T.t >= T.dur) endTavern();
}

function seatAction(seat, st) {
  const id = kidT(), c = seat.cust;
  if (id === 'arthur') {
    if (c && c.type === 'rowdy' && !c.leaving) { c.leaving = 'thrown'; T.kicked++; T.gold += 4; addShake(4); SFX.punch(); T.bonkT = 0.3; tText('โป๊ง! สร่างเมาซะ! +4g', st.x, 66, '#f2c94c', true); return; }
    if (seat.dirty && !c) { seat.cleanT = 0.3; T.pile += 1; SFX.pour(); for (let n = 0; n < 8; n++) T.parts.push({ x: st.x + rnd(-14, 14), y: 126, vx: rnd(-30, 30), vy: rnd(-60, -20), life: 0.5, max: 0.5, col: '#fff' }); tText('เก็บจานไปอ่าง', st.x, 108, '#cfe8ff'); return; }
    tText('ตรงนี้ไม่มีงาน', st.x, 108, '#bba8ba'); return;
  }
  if (id === 'percival') {
    if (!c || !c.order || c.leaving) { tText(seat.dirty ? 'อาเธอร์เป็นคนเก็บโต๊ะ' : 'ไม่มีออเดอร์', st.x, 108, '#bba8ba'); return; }
    const stock = c.order === 'beer' ? T.beers : T.dishes;
    if (!stock.length) { tText(c.order === 'beer' ? 'ยังไม่ได้รินเบียร์!' : 'อาหารยังไม่เสร็จ!', st.x, 108, '#ff9a7a'); SFX.fail(); return; }
    stock.sort((a, b) => b.q - a.q); const item = stock.shift();
    const base = c.order === 'beer' ? 6 : item.glow ? 16 : 9;
    const pay = Math.round(base * item.q * (c.type === 'vip' ? 2 : 1) * (c.pat / c.max > 0.5 ? 1.25 : 1) * (save.tools.spoon ? 1.2 : 1));
    T.gold += pay; T.served++; c.leaving = 'happy'; SFX.coin();
    tText('+' + pay + 'g', st.x, 62, '#f2c94c', true);
    for (let n = 0; n < 6; n++) T.parts.push({ x: st.x, y: 80, vx: rnd(-50, 50), vy: rnd(-80, -30), life: 0.7, max: 0.7, col: '#f2c94c' });
    return;
  }
  tText('โรสแมรี่ต้องอยู่ในครัว', st.x, 108, '#bba8ba');
}
function finishPour() {
  const v = T.pour.v; T.pour = null; let q, label;
  if (v > 1) { tText('ล้นแก้ว! เสียของ', 368, 108, '#ff6b6b'); SFX.fail(); return; }
  if (v >= 0.74 && v <= 0.92) { q = 1.4; label = 'รินเป๊ะ!'; } else if (v >= 0.5) { q = 1; label = 'รินพอดี'; } else { q = 0.6; label = 'ฟองล้วน...'; }
  T.beers.push({ q }); tText(label, 368, 108, q > 1 ? '#ffd76a' : '#f6ead2'); SFX.serve();
}
function finishCook() {
  const c = T.cook; T.cook = null;
  const pts = c.notes.reduce((a, n) => a + n.res, 0);
  const q = pts >= 9 ? 1.5 : pts >= 6 ? 1.2 : pts >= 3 ? 1 : 0.6;
  const glow = c.glow && save.ing.glowcap > 0; if (glow) { save.ing.glowcap--; T.usedGlow++; }
  T.bowls--; T.dishes.push({ q, glow });
  tText((pts >= 9 ? 'สุดยอด! ' : pts < 3 ? 'ไหม้นิดหน่อย... ' : '') + (glow ? 'ต้มยำกุ้งพญามังกร' : 'ข้าวผัดร้าน'), 60, 98, glow ? '#ff9a5a' : '#f6ead2', true);
  SFX.serve();
}
let night = null;
function endTavern() {
  T.over = true; T.overT = 0;
  track('tavern_end', { gold: T.gold, served: T.served, angry: T.angry });
  const stars = clamp(Math.round((T.served * 1 - T.angry * 1.5) / 4), 0, 5);
  save.gold += T.gold; save.best = Math.max(save.best, T.gold); persist();
  night = { gold: T.gold, served: T.served, angry: T.angry, kicked: T.kicked, stars, usedGlow: T.usedGlow, net: NET.finish(T.net, { gold: T.gold }) };
}

function drawTavern() {
  const t = T.t;
  if (ENV.tav2) { ctx.drawImage(ENV.tav2, 0, 0, W, H); ctx.fillStyle = 'rgba(20,10,5,0.16)'; ctx.fillRect(0, 0, W, H);
    textC('The Tipsy Dragon', 230, 38, { size: 10, align: 'center', color: '#5a2e14', weight: 700, shadow: false }); textC('โรงเตี๊ยมมังกรเมา', 230, 51, { size: 7.5, align: 'center', thai: true, color: '#6a3a1c', shadow: false }); }
  else if (ENV.tavern) { ctx.drawImage(ENV.tavern, 0, 0, W, H); ctx.fillStyle = 'rgba(20,10,5,0.28)'; ctx.fillRect(0, 0, W, H); } else {
  // room
  rect(0, 0, W, H, '#2a1a12');
  for (let y = 16; y < 120; y += 10) for (let x = (y / 10) % 2 ? -12 : 0; x < W; x += 24) { rect(x + 0.5, y + 0.5, 23, 9, '#4a2e1e'); rect(x + 0.5, y + 0.5, 23, 1, '#5e3c26'); }
  for (const bx of [116, 340]) { rect(bx, 16, 6, 104, '#3a2416'); rect(bx + 1, 16, 1, 104, '#5a3a22'); }
  [[132, 26], [292, 26]].forEach(([x, y]) => { rect(x, y, 36, 28, '#1b1020'); const sk = ctx.createLinearGradient(0, y, 0, y + 28); sk.addColorStop(0, '#0c1a40'); sk.addColorStop(1, '#2a3a70'); ctx.fillStyle = sk; ctx.fillRect(x + 2, y + 2, 32, 24); rect(x + 17, y + 2, 2, 24, '#1b1020'); rect(x + 2, y + 13, 32, 2, '#1b1020'); rect(x + 8, y + 6, 1, 1, '#fff'); rect(x + 26, y + 19, 1, 1, '#fff'); });
  panel(178, 20, 104, 30, '#5a3a22', '#f2a93b');
  text('The Tipsy Dragon', 230, 23, { size: 10, align: 'center', color: '#ffd76a', weight: 700 });
  text('โรงเตี๊ยมมังกรเมา', 230, 35, { size: 7, align: 'center', thai: true, weight: 400 });
  for (const sx of [178, 236]) { rect(sx - 2, 66, 50, 2.5, '#2b1b14'); for (let k = 0; k < 6; k++) { const c = ['#3f8f5a', '#a056c9', '#c0392b', '#f2b134', '#4fb3d9', '#7cf5c8'][k]; rect(sx + k * 8, 55, 5, 11, '#1b1020'); rect(sx + k * 8 + 0.5, 57, 4, 8.5, c); rect(sx + k * 8 + 1, 57.5, 1, 4, '#ffffff66'); } }
  for (const lx of [70, 230, 350]) { rect(lx, 16, 0.5, 52, '#1b1020'); rect(lx - 5, 68, 11, 6, '#f2a93b'); glow(lx, 74, 46, 'rgba(255,190,90,A)', 0.22); }
  }
  // kitchen
  if (!fxArtReady) { rect(4, 58, 64, 62, '#1b1020'); rect(5, 59, 62, 60, T.fire ? '#4a1a10' : '#2a1a14'); }
  if (ENV.tav2) glow(61, 108, 22, 'rgba(255,120,40,A)', 0.3); else if (fxArtReady) { glow(36, 108, 22, 'rgba(255,120,40,A)', 0.4); fxB('stove', 36, 120, 1, 0.92); } else {
  rect(10, 96, 52, 22, '#4a4a55'); rect(10, 96, 52, 2, '#6a6a75'); glow(36, 98, 20, 'rgba(255,120,40,A)', 0.4);
  for (let k = 0; k < 5; k++) rect(16 + k * 9, 92 - Math.abs(Math.sin(t * 8 + k)) * 3, 4, 3 + Math.abs(Math.sin(t * 8 + k)) * 3, k % 2 ? '#ff6b2c' : '#ffd35a');
  ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.ellipse(36, 90, 14, 5, 0, 0, Math.PI); ctx.fill(); rect(50, 88, 10, 2, '#5a3a22'); }
  text('ครัว', 61, 84, { size: 7, align: 'center', thai: true, color: '#e8833a' });
  T.dishes.forEach((d, k) => dimg(icon('bowl', 2), 34 + k * 17, 128));
  // sink + dish pile
  if (ENV.tav2) {} else if (fxArtReady) fxB('sink', 92, 121); else {
  rect(74, 92, 36, 28, '#1b1020'); rect(75, 93, 34, 26, '#5a6a72'); rect(78, 95, 28, 10, '#2a4a5a'); rect(78, 95, 28, 3, '#6ab8d8');
  rect(90, 80, 2, 12, '#9aa0aa'); rect(90, 80, 8, 2, '#9aa0aa'); }
  for (let k = 0; k < Math.min(T.pile, 6); k++) dimg(icon('bowl2', 1), 100 + (k % 3) * 9, 112 - Math.floor(k / 3) * 6);
  text('อ่างล้างจาน', 120, 90, { size: 6, align: 'center', thai: true, color: '#cfe8ff' });
  text('จานสะอาด ' + T.bowls, 120, 81, { size: 6, align: 'center', thai: true, color: T.bowls ? '#9be15d' : '#ff6b6b' });
  // taps
  if (!fxArtReady) { rect(344, 60, 50, 60, '#1b1020'); rect(345, 61, 48, 58, '#2a1a14'); }
  if (ENV.tav2 && fxArtReady) fxB('taps', 292, 109, 1, 0.9); else if (fxArtReady) fxB('taps', 369, 119, 1, 0.9); else {
  for (let k = 0; k < 3; k++) { rect(350 + k * 14, 66, 8, 18, '#c08a3c'); rect(351 + k * 14, 67, 2, 16, '#e8b86a'); rect(353 + k * 14, 84, 2, 8, '#d8d8e0'); }
  rect(346, 100, 46, 14, '#5a3a22'); }
  text('ก๊อกเบียร์', 292, 58, { size: 6, align: 'center', thai: true, color: '#ffd76a' });
  T.beers.forEach((b, k) => dimg(icon('beer', 1), 280 + k * 8, 108));
  if (!ENV.tavern && !ENV.tav2) {
  // floor
  const fl = ctx.createLinearGradient(0, 120, 0, H); fl.addColorStop(0, '#6a4428'); fl.addColorStop(1, '#3a2416'); ctx.fillStyle = fl; ctx.fillRect(0, 120, W, H - 120);
  for (let x = 0; x < W; x += 30) rect(x, 120, 0.5, H - 120, '#4a2e1c');
  for (let y = 140; y < H; y += 20) rect(0, y, W, 0.5, '#4a2e1c');
  }
  // customers + counter
  T.seats.forEach((s, k) => drawCustomer(s, STATIONS[k + 2].x));
  if (ENV.tav2) { const k = ENV.tav2.width / W; ctx.drawImage(ENV.tav2, 159 * k, 104 * k, 151 * k, 54 * k, 159, 104, 151, 54); ctx.fillStyle = 'rgba(20,10,5,0.16)'; ctx.fillRect(159, 104, 151, 54); }
  else { rect(126, 126, 214, 24, '#1b1020'); rect(127, 127, 212, 6, '#a86a3a'); rect(127, 127, 212, 1.5, '#d89a5a'); rect(127, 133, 212, 16, '#7a4a2a');
  for (let x = 134; x < 336; x += 26) rect(x, 136, 1, 11, '#5a3a22'); }
  T.seats.forEach((s, k) => { const x = STATIONS[k + 2].x; if (s.dirty) { dimg(icon('bowl2', 1), x - 12, 114); dimg(icon('bowl', 1), x - 1, 115); if (s.cleanT > 0 && fxArtReady) { ctx.globalAlpha = clamp(s.cleanT / 0.3, 0, 1); fxB('dust', x, 128, 1, 0.5); ctx.globalAlpha = 1; } } });
  // robber
  if (T.robber) {
    const r = T.robber, x = Math.round(r.x), y = r.caught ? 186 : 160 + Math.abs(Math.sin(t * 10)) * 2;
    if (r.caught) { ctx.save(); ctx.translate(x + 12, 196); ctx.rotate(-Math.PI / 2); if (crewArtReady) { const ri = CREW_ART.robber_a.l; dimg(ri, -LW(ri) / 2, -LH(ri) + 6); } else dimg(thiefSprite(0).r, -17, -24); ctx.restore(); text('โอ๊ย!', x + 14, 172, { size: 8, align: 'center', thai: true }); dimg(icon('st_dizzy', 1), x + 22, 176); }
    else { if (crewArtReady) { const ri = CREW_ART.robber_b.l; dimg(ri, x - 2, 199 - LH(ri) - Math.abs(Math.sin(t * 10)) * 2); } else dimg(thiefSprite(Math.floor(t * 8) % 2).r, x - 2, 164); text('โจรป่า', x + 10, 154, { size: 6.5, align: 'center', thai: true, color: '#ff9a7a' }); }
  }
  // knights
  for (let i = 0; i < 3; i++) {
    const x = T.kpos[i], act = i === T.active, moving = Math.abs((act ? STATIONS[T.sel].x : STATIONS[HOME[i]].x) - x) > 2;
    const target = act ? STATIONS[T.sel].x : STATIONS[HOME[i]].x;
    const spr = knightSprite(i, moving ? (Math.floor(t * 10) % 2 ? 'run1' : 'run2') : 'stand');
    const face = target >= x || !moving ? 1 : -1;
    ctx.globalAlpha = act ? 1 : 0.85;
    dimg(face > 0 ? spr.r : spr.l, Math.round(x - 18), 156 - (i === 0 && T.bonkT > 0 ? 3 : 0));
    ctx.globalAlpha = 1;
    if (i === 2 && (T.beers.length || T.dishes.length)) { const tr = TRAY[T.dishes.length ? 'tray_mix' : 'tray_beer'], tw = 22; if (tr) { const th = tr.height * tw / tr.width; dimg(tr, Math.round((x + 12 - tw / 2) * RES) / RES, Math.round((178.5 - th) * RES) / RES, tw, th); } }
    if (i === 2 && T.harpT > 0) { ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 6, 182); ctx.quadraticCurveTo(x + 16, 168, x + 8, 160); ctx.stroke(); for (let k = 0; k < 3; k++) rect(x + 8 + k * 2, 164 + k, 0.5, 16 - k * 3, '#fff6c0'); }
    if (i === 0 && T.bonkT > 0) { ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.arc(x + 14, 160, 6, 0, 7); ctx.fill(); text('โป๊ง!', x + 20, 146, { size: 8, thai: true, color: '#ffd76a' }); }
    if (i === 0 && T.washT > 0) for (let k = 0; k < 3; k++) rect(x + 8 + k * 3, 166 - k * 2, 2, 2, '#bfe8ff');
    if (act) { ctx.fillStyle = '#f2a93b'; ctx.beginPath(); ctx.moveTo(x - 4, 148); ctx.lineTo(x + 4, 148); ctx.lineTo(x, 153); ctx.fill(); text(KNIGHTS[i].th, x, 140, { size: 7, align: 'center', thai: true, color: KNIGHTS[i].color }); }
  }
  // fire
  if (T.fire && fxArtReady) { glow(61, 90, 40, 'rgba(255,90,30,A)', 0.5); fxB('fire', 45, 116, 1, 0.55 + Math.sin(t * 13) * 0.05); fxB('fire', 79, 116, -1, 0.55 + Math.sin(t * 11 + 1) * 0.05); fxB('fire', 61, 118, Math.sin(t * 6) > 0 ? 1 : -1, 0.85 + Math.sin(t * 15) * 0.06); bar(35, 74, 52, 5, T.fire.hp / 6, '#ff6b2c'); }
  else if (T.fire) { for (let k = 0; k < 7; k++) { const fx = 10 + k * 8, fh = 12 + Math.abs(Math.sin(t * 12 + k)) * 16; rect(fx, 96 - fh, 6, fh, k % 2 ? '#ff6b2c' : '#ffd35a'); } glow(36, 80, 40, 'rgba(255,90,30,A)', 0.5); bar(10, 66, 52, 5, T.fire.hp / 6, '#ff6b2c'); }
  for (const q of T.parts) { ctx.globalAlpha = clamp(q.life / q.max, 0, 1); if (q.note) text('♪', q.x, q.y, { size: 9, color: q.col, shadow: false }); else rect(q.x, q.y, 2, 2, q.col); }
  ctx.globalAlpha = 1;
  for (const tx of T.texts) { ctx.globalAlpha = clamp(tx.life * 2, 0, 1); text(tx.str, tx.x, tx.y, { size: tx.big ? 9 : 7.5, align: 'center', color: tx.col, thai: true, weight: 600 }); }
  ctx.globalAlpha = 1;

  // rhythm QTE
  if (T.cook) {
    const c = T.cook; panel(84, 20, 232, 88, '#140d18f4', '#e8833a');
    text('โรสแมรี่ปรุง: ' + (c.glow ? 'ต้มยำกุ้งพญามังกร' : 'ข้าวผัดร้าน'), 92, 23, { size: 8, thai: true, color: '#ffb070' });
    for (let k = 0; k < 5; k++) rect(96, 42 + k * 6, 212, 0.5, '#5a4a5a');
    ctx.strokeStyle = '#f2a93b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(132, 54, 10, 0, 7); ctx.stroke();
    glow(132, 54, 14, 'rgba(242,169,59,A)', 0.25);
    c.notes.forEach(n => {
      const x = 132 + (n.t0 - c.time) * 80; if (x > 312 || x < 90) return;
      const col = n.res === undefined ? '#ffd76a' : n.res === 2 ? '#9be15d' : n.res === 1 ? '#7fd6ff' : '#ff6b6b';
      ctx.globalAlpha = n.res === undefined ? 1 : 0.5;
      if (uiArtReady && UI_BIG['ar_' + n.dir]) { if (n.res !== undefined) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, 54, 11, 0, 7); ctx.fill(); } uiBig(n.res === 0 ? 'ar_silver' : 'ar_' + n.dir, x, 54, 1); if (n.res === 0) { ctx.globalAlpha = 0.6; text(ARROW_GLYPH[n.dir], x, 49, { size: 9, align: 'center', weight: 700, color: '#1b1020', shadow: false }); } }
      else {
      ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(x, 54, 9, 7, -0.3, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, 54, 8, 6, -0.3, 0, 7); ctx.fill();
      rect(x + 7, 34, 1, 20, '#1b1020'); text(ARROW_GLYPH[n.dir], x, 48, { size: 10, align: 'center', weight: 700, color: '#1b1020', shadow: false }); }
      ctx.globalAlpha = 1;
    });
    ARROWS.forEach((d, k) => { const bx = 164 + k * 24, by = 92; if (uiArtReady && UI_BIG['ar_' + d]) uiBig('ar_' + d, bx, by, 0.85); btn('qa_' + d, bx - 11, by - 11, 22, 22); });
    if (c.flash) text(c.flash.txt, 132, 66, { size: 8, align: 'center', thai: true, color: c.flash.txt === 'Perfect!' ? '#9be15d' : c.flash.txt === 'Good' ? '#7fd6ff' : '#ff6b6b' });
  }
  if (T.pour) {
    const v = clamp(T.pour.v, 0, 1.15);
    if (E5.mug) { // E5 glass mug: beer rises inside it, gold band = target (0.74-0.92)
      const im = E5.mug, mh = 62, k = mh / 586, mw = im.width / im.height * mh, mx = 318, my = 108;
      const bot = my + 380 * k, top = bot - Math.min(v, 1.15) * 265 * k;
      rect(mx + 32 * k, top, (290 - 32) * k, bot - top, v > 1 ? '#e8503a' : '#f2b134'); rect(mx + 32 * k, top, (290 - 32) * k, 2, '#fffbea');
      ctx.drawImage(im, mx, my, mw, mh);
    } else {
    panel(320, 116, 20, 60, '#140d18f4', '#ffd76a'); rect(324, 120, 12, 52, '#140d18');
    rect(324, 120 + 52 * (1 - 0.92), 12, 52 * (0.92 - 0.74), '#6a5a12');
    rect(324, 172 - 52 * Math.min(1, v), 12, 52 * Math.min(1, v), v > 1 ? '#ff6b6b' : '#f2b134'); rect(324, 172 - 52 * Math.min(1, v), 12, 2, '#fffbea'); }
  }
  // top HUD
  if (!(uiArtReady && UI_BIG.frame_dark && (slice3(UI_BIG.frame_dark, -6, -1, W + 12, 16.5, 44), true))) rect(0, 0, W, 15, '#0c0810ec');
  textC('กะดึก', 6, 7.5, { size: 8, thai: true, color: '#bfa0ff' });
  const left = Math.max(0, T.dur - T.t), frac = clamp(T.t / T.dur, 0, 1);
  if (!frameBar('frame_blue', 33, 1.5, 172, 12, 1 - frac, left < 10 ? '#e2483b' : '#7a5ad8', left < 10 ? '#ff9a8a' : '#b8a2ff')) bar(36, 4, 170, 7, 1 - frac, left < 10 ? '#e2483b' : '#7a5ad8', '#1a1030');
  textC(Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'), 212, 7.5, { size: 9, color: left < 10 ? '#ff6b6b' : '#f6ead2', weight: 700 });
  dimg(icon('glowcap', 1), 250, 4); textC('x' + save.ing.glowcap, 260, 4 + LH(icon('glowcap', 1)) / 2, { size: 8, color: '#7cf5c8' });
  textC('จาน ' + T.bowls + '/' + (T.bowls + T.pile + T.dishes.length), 284, 7.5, { size: 7, thai: true, color: '#cfe8ff' });
  dimg(icon('coin', 2), 336, 2); textC(String(T.gold), 350, 2 + LH(icon('coin', 2)) / 2, { size: 11, color: '#f2c94c', weight: 700 });
  // alert / hint bar
  const alert = tavernAlert();
  if (alert) { const on = Math.floor(t * 4) % 2; rect(0, 198, W, 15, on ? '#7a1a10ee' : '#4a1a10ee'); rect(0, 198, W, 1, '#ffb347'); if (uiArtReady) { uiIcon('alert', 10, 205.5, 11); uiIcon('alert', W - 10, 205.5, 11); } text((uiArtReady ? '' : '⚠ ') + alert, W / 2, 200, { size: 8.5, align: 'center', thai: true, color: '#ffe0a0' }); }
  else { if (!(uiArtReady && UI_BIG.frame_dark && (slice3(UI_BIG.frame_dark, -6, 197.5, W + 12, 15, 44), true))) rect(0, 198, W, 15, '#0c0810d8'); text(KNIGHTS[T.active].th + ': ' + tavernHint(), W / 2, 200, { size: 8, align: 'center', thai: true, color: '#f6ead2' }); }
  controlStrip();
  if (T.banner) { const b = T.banner, a = clamp(Math.min(b.t, 2) * 3, 0, 1); ctx.globalAlpha = a; if (!nineBox('dialog', 70, 82, 260, 44, 16, 8)) rect(0, 84, W, 40, '#1b1020dd'); text(b.text, W / 2, 87, { size: 16, align: 'center', color: '#f2a93b', weight: 700 }); text(b.sub, W / 2, 108, { size: 9, align: 'center', thai: true }); ctx.globalAlpha = 1; }
  if (T.paused) { rect(0, 0, W, H, '#0d0812cc'); const tph = tpOnTxt ? 122 : 98; if (!nineBox('dialog', 120, 62, 160, tph, 16, 8)) panel(120, 62, 160, tph, '#1b120cf4', '#f2a93b'); text('หยุดชั่วคราว', W / 2, 70, { size: 16, align: 'center', color: '#f2a93b', thai: true });
    [['เล่นต่อ', 'tresume'], [T.fromTitle ? 'ออกจากร้าน (กลับหน้าแรก)' : 'ออกจากร้าน (กลับแผนที่)', 'tquit']].concat(tpOnTxt ? [['วิธีเล่น', 'thelp']] : []).forEach(([lb, id], k) => { const y = 98 + k * 24, sel = (T.pauseSel || 0) === k; btn(id, 136, y, 128, 19); uiBtn(136, y, 128, 19, sel, '#f2a93b', '#3a2a20', '#5a3a12', '#1b120c'); textC(lb, W / 2, y + 9.5, { size: 8.5, align: 'center', thai: true, color: sel ? '#ffe9b0' : '#cfc0b0' }); });
    text('↑↓ เลือก · Enter ตกลง · Esc เล่นต่อ', W / 2, tpOnTxt ? 170 : 146, { size: 6.5, align: 'center', thai: true, color: '#bba8ba', weight: 400 }); }
  if (T.over && night) {
    rect(0, 0, W, H, '#0d0812cc'); panel(80, 24, 240, 170);
    text('ปิดร้าน! สรุปกะดึก', W / 2, 30, { size: 13, align: 'center', color: '#f2a93b', thai: true });
    const rows = [['รายได้', night.gold + 'g'], ['เสิร์ฟสำเร็จ', night.served], ['ลูกค้าหัวร้อนเดินออก', night.angry], ['ขี้เมาที่ถูกเคาะ', night.kicked], ['ต้มยำกุ้งพญามังกร', night.usedGlow]];
    rows.forEach(([a, b2], k) => { text(a, 100, 56 + k * 15, { size: 9, thai: true }); text(String(b2), 300, 56 + k * 15, { size: 10, align: 'right', color: '#ffd76a' }); });
    for (let k = 0; k < 5; k++) text('★', 160 + k * 20, 131, { size: 16, align: 'center', color: k < night.stars ? '#f2c94c' : '#3a2a40', shadow: k < night.stars });
    const nl = netLine(night.net, ['tavern_gold']); if (nl) text(nl.str, W / 2, 149, { size: 9, align: 'center', thai: true, color: nl.col, weight: 700 });
    if (T.overT > 0.8) text('Enter / แตะ: ไปห้องปรุงยา & ตีเหล็ก', W / 2, 162, { size: 9, align: 'center', thai: true, color: Math.floor(T.overT * 2) % 2 ? '#f6ead2' : '#bba8ba' });
  }
}
function fxDrawBub(k, cx, cy) { return uiBig(k, cx, cy, 0.95); }
function angryFace(x, y) {
  if (uiIcon('angry', x, y, 14)) return;
  ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.fill(); ctx.fillStyle = '#ff6a3a'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill();
  rect(x - 3.5, y - 2.5, 2.5, 1, '#1b1020'); rect(x + 1, y - 2.5, 2.5, 1, '#1b1020'); rect(x - 2.5, y - 1, 1.5, 1.5, '#1b1020'); rect(x + 1, y - 1, 1.5, 1.5, '#1b1020');
  rect(x - 2.5, y + 2.5, 5, 1, '#1b1020'); rect(x - 3, y + 3.5, 1, 1, '#1b1020'); rect(x + 2, y + 3.5, 1, 1, '#1b1020');
  ctx.strokeStyle = '#e2183a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 5, y - 8); ctx.lineTo(x + 7, y - 6); ctx.moveTo(x + 9, y - 8); ctx.lineTo(x + 7, y - 6); ctx.moveTo(x + 5, y - 4); ctx.lineTo(x + 7, y - 6); ctx.moveTo(x + 9, y - 4); ctx.lineTo(x + 7, y - 6); ctx.stroke();
}
function drawCustomer(s, x) {
  const c = s.cust; if (!c) return;
  const leaveA = c.leaving ? clamp(1 - (c.leaveT || 0) / 0.6, 0, 1) : 1;
  let dy = Math.sin(c.bob * 3) * 0.8;
  const rowdy = c.type === 'rowdy', vip = c.type === 'vip';
  if (rowdy && !c.leaving) dy = -6 + Math.sin(c.t * 9) * 2;
  if (c.leaving === 'thrown') dy = -(c.leaveT || 0) * 120;
  ctx.globalAlpha = leaveA;
  const look = c.look, y = 87 + dy;
  if (crewArtReady) {
    if (!c.artKey) c.artKey = vip ? 'vip' : rowdy ? 'rowdy' : pick(CUST_KEYS);
    const ck = rowdy ? 'rowdy' : c.artKey, ci = CREW_ART[ck][x > 230 ? 'r' : 'l'];
    dimg(ci, Math.round(x - LW(ci) / 2), Math.round(y - 6));
  } else {
  const skin = rowdy ? '#f09a8a' : look.skin;
  rect(x - 13, y + 18, 26, 18, '#1b1020'); rect(x - 12, y + 19, 24, 17, vip ? '#a056c9' : look.coat); rect(x - 12, y + 19, 24, 2, '#ffffff22');
  if (vip) { rect(x - 12, y + 19, 24, 3, '#f2c94c'); rect(x - 2, y + 22, 4, 4, '#f2c94c'); }
  ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(x, y + 10, 10.5, 10, 0, 0, 7); ctx.fill();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(x, y + 10, 9.5, 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = look.hair; ctx.beginPath(); ctx.ellipse(x, y + 4, 10, 5.5, 0, Math.PI, 0); ctx.fill(); rect(x - 10, y + 3, 3, 8, look.hair);
  const mood = c.order ? c.pat / c.max : 0.5;
  rect(x - 5, y + 9, 2.5, 3, '#1b1020'); rect(x + 3, y + 9, 2.5, 3, '#1b1020'); rect(x - 5, y + 9, 1, 1, '#fff'); rect(x + 3, y + 9, 1, 1, '#fff');
  if (rowdy) { rect(x - 3, y + 15, 6, 2, '#1b1020'); rect(x - 8, y + 12, 3, 1.5, '#e05a5a'); rect(x + 5, y + 12, 3, 1.5, '#e05a5a'); rect(x + 13, y + 10 + Math.sin(c.t * 9) * 3, 4, 13, '#3f8f5a'); rect(x + 14, y + 6 + Math.sin(c.t * 9) * 3, 2, 4, '#3f8f5a'); }
  else if (mood > 0.5) { rect(x - 3, y + 15, 6, 1, '#1b1020'); rect(x - 4, y + 14, 1, 1, '#1b1020'); rect(x + 3, y + 14, 1, 1, '#1b1020'); }
  else if (mood > 0.35) rect(x - 3, y + 15, 6, 1, '#1b1020');
  else { rect(x - 3, y + 15, 6, 1, '#1b1020'); rect(x - 4, y + 16, 1, 1, '#1b1020'); rect(x + 3, y + 16, 1, 1, '#1b1020'); rect(x - 6, y + 7, 4, 1, '#1b1020'); rect(x + 3, y + 7, 4, 1, '#1b1020'); }
  if (vip) dimg(icon('crown', 1), x - 4, y - 5);
  }
  ctx.globalAlpha = 1;
  if (c.leaving === 'happy') dimg(icon('happy', 2), x - 8, y - 22 - (c.leaveT || 0) * 20);
  if (c.leaving) return;
  if (c.order) {
    if (!(uiArtReady && UI_BIG.bub_beer && fxDrawBub(c.order === 'beer' ? 'bub_beer' : 'bub_bowl', x, y - 19))) {
    panel(x - 12, y - 28, 24, 20, '#f6efe0', '#1b1020');
    dimg(c.order === 'beer' ? icon('beer', 2) : icon('bowl', 2), x - 8, y - 26); }
    bar(x - 13, y - 6, 26, 4, c.pat / c.max, c.pat / c.max > 0.5 ? '#6ad36a' : c.pat / c.max > 0.35 ? '#f2b134' : '#e2483b');
    if (c.pat / c.max < 0.35) angryFace(x + 16, y - 20 + Math.sin(c.t * 6) * 1.5);
  } else if (rowdy) {
    text(Math.floor(c.t * 2) % 2 ? 'ฮึก!' : 'อาละวาด!', x, y - 16, { size: 8, align: 'center', thai: true, color: '#ff9a7a' });
    bar(x - 13, y - 4, 26, 3, c.rowdyT / 14, '#ff6b6b');
  }
}

/* ======================================================= ALCHEMY ROOM */
const alchemy = createAlchemy({
  ctx, W, H, RES, ENV, UI_BIG,
  get fxArtReady() { return fxArtReady; },
  get uiArtReady() { return uiArtReady; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom,
  get save() { return save; },
  persist, track, knightMax,
  goMap() { scene = 'map'; map.enter(); },
});

/* ========================================================== WORLD MAP */
const map = createMap({
  ctx, W, H, RES, ENV, UI_BIG, FULL, FONT, THAI, CREW_ART,
  get fxArtReady() { return fxArtReady; },
  get uiArtReady() { return uiArtReady; },
  get crewArtReady() { return crewArtReady; },
  get tpOnTxt() { return tpOnTxt; },
  get mapRank() { return mapRank; }, set mapRank(v) { mapRank = v; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, LW, fxImg, fxB, knightSprite, controlStripCustom, hash, uiIcon,
  get save() { return save; },
  persist, track, knightMax, stage2Open, startStage,
  rankInput: close => ranking.input(close), drawRankPanel: () => ranking.draw(),
  showHelp(page) { help = page; },
  goAlchemy() { scene = 'alchemy'; alchemy.enter(); },
  rankPrefetch() { ranking.prefetch(); },
  rankStale() { NET.stale(); },
});
const { STAGES, CREW, crewLabel } = map;
/* =========================================================== TITLE ETC */
let scene = 'title', mapRank = false;
const ranking = createRanking({
  ctx, W, H, RES, ENV, UI_BIG, NET, NET_BOARDS, THAI, cv, netVal,
  get fxArtReady() { return fxArtReady; },
  get uiArtReady() { return uiArtReady; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom,
});
const titleScene = createTitle({
  ctx, W, H, RES, ENV, UI_BIG, THAI, GROUND, NET, KNIGHTS, ranking,
  get fxArtReady() { return fxArtReady; },
  get uiArtReady() { return uiArtReady; },
  get LANG() { return LANG; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom,
  get save() { return save; },
  persist, track, knightMax, tr, setLang, toggleMute, bgmSync, keyLabel, uiBig, drawForestBg, anyConfirm,
  goMap() { scene = 'map'; map.enter(); },
  startTavernFromTitle() { startTavern(); T.fromTitle = true; },
});
function updateResults(dt) { results.t += dt; if (results.t > 0.8 && (!results.net || results.net.state !== 'send' || results.t > 3) && anyConfirm()) { startTavern(); if (!save.seen.tavern) { help = 'tavern'; save.seen.tavern = true; persist(); } } }
function drawResults() {
  drawStageBg(results.n || 1, results.t * 10, results.t);
  rect(0, 0, W, H, '#05141aaa');
  panel(60, 12, 280, 196, '#101820f2', '#f2a93b');
  const r2 = results.n === 2;
  text(r2 ? 'เคลียร์ด่านที่ 2!' : 'เคลียร์ด่านที่ 1!', W / 2, 21, { size: 14, align: 'center', color: '#f2a93b', thai: true, weight: 600 });
  text(r2 ? 'ดันเจี้ยนไวน์โบราณ · Ancient Wine Dungeon' : 'ป่าเห็ดพิษ · Poison Mushroom Forest', W / 2, 40, { size: 8, align: 'center', thai: true, weight: 400, color: '#bba8ba' });
  for (let k = 0; k < 3; k++) text('★', W / 2 - 20 + k * 20, 51, { size: 15, align: 'center', color: k < results.stars ? '#f2c94c' : '#3a3a40', shadow: k < results.stars });
  const m = Math.floor(results.time / 60), s = Math.floor(results.time % 60);
  const rows = [['เวลา', m + ':' + String(s).padStart(2, '0')], ['คะแนน', results.score], ['ปราบมอนสเตอร์', results.kills], ['Glowcap / พริก', '+' + results.loot.glowcap + ' / +' + results.loot.chili], ['Shroom Crown', '+' + results.loot.crown], ['ห้องลับ (เชฟกอร์น)', results.vault ? 'เจอ! Truffle of Ages' : 'พลาด'], ['ดรอปลับบอส', results.ember ? 'Ember Spore!' : 'พลาด (ปราบตอนติดไฟ)']];
  if (r2) rows.splice(4, 3, ['100-Year Vintage Cork', '+' + (results.loot.cork || 0)], ['อุโมงค์ลับ (ตุ่น)', results.vault ? 'เจอ! Truffle + Cork' : 'พลาด'], ['ดรอปลับบอส', results.ember ? 'Cork เพิ่ม!' : 'พลาด (ปราบตอนติดน้ำแข็ง)']);
  rows.forEach(([a, b], i) => { text(a, 78, 72 + i * 12.5, { size: 8.5, thai: true, weight: 400 }); text(String(b), 322, 72 + i * 12.5, { size: 8.5, align: 'right', thai: true, color: /พลาด/.test(String(b)) ? '#7a6a6a' : '#ffd76a' }); });
  const nl = results.net ? netLine(results.net, ['stage1_score', 'stage1_time']) : null;
  text(nl ? nl.str : 'กลับร้านกันเถอะ ลูกค้ากะดึกรออยู่!', W / 2, 159, { size: nl ? 9 : 8, align: 'center', thai: true, color: nl ? nl.col : '#bba8ba', weight: nl ? 700 : 400 });
  if (results.t > 0.8 && (!results.net || results.net.state !== 'send' || results.t > 3)) text('Enter / แตะ: เริ่มกะดึก', W / 2, 172, { size: 10, align: 'center', thai: true, color: Math.floor(results.t * 2) % 2 ? '#ffd76a' : '#f6ead2' });
}
function updateOver(dt) {
  overT += dt;
  if (overT > 0.8 && anyConfirm()) startStage(S.bossOn);
}
function drawOver() {
  rect(0, 0, W, H, '#0d0812ee');
  text('The knights retreat...', W / 2, 70, { size: 18, align: 'center', color: '#ff6b6b', weight: 700 });
  text('Old Bart patches everyone up with stew.', W / 2, 98, { size: 10, align: 'center', color: '#bba8ba' });
  if (overT > 0.8) text(S && S.bossOn ? 'Enter / tap: retry from the boss' : 'Enter / tap: try again', W / 2, 130, { size: 11, align: 'center', color: '#ffd76a', weight: 700 });
}

/* ================================================================= HELP */
let help = null;
const HELP = {
  stage: { title: 'วิธีเล่น: ลุยด่าน', rows: [['← → / A D', 'เดินซ้าย-ขวา', 'Move'], ['↑ / W', 'กระโดด', 'Jump'], ['J / คลิกซ้าย', 'โจมตี: อาเธอร์ฟันดาบไฟคอมโบ 3 จังหวะ, โรสแมรี่ยิงดาวจากไม้ไผ่, เพอร์ซิวาลยิงลูกพลังน้ำแข็ง', 'Attack'], ['Space / K / คลิกขวา', 'ท่าพิเศษ (เกจครึ่งหลอด): คลื่นเพลิง / พลังแห่งต้มยำกุ้ง / คาถาฝนดาวตก', 'Special'], ['L / คลิกกลาง', 'ท่าประสาน 3 อัศวิน "ต้มยำมหาภัยกระทะเหล็กเดือด" เมื่อเกจ MAX', 'Ultimate'], ['1 2 3 / Q E', 'สลับตัวละครได้ตลอดเวลา', 'Swap'], ['C', 'เรียกลูกทีม: เชฟกอร์นทุบกำแพงร้าว / บาร์ตเฒ่าส่งเบียร์ฟื้นพลัง', 'Crew'], ['P', 'หยุดเกมชั่วคราว', 'Pause']], tip: 'เกจ SPECIAL เพิ่มเมื่อโจมตีโดนและเก็บเบียร์วุ้น · ปราบบอสตอนติดไฟ (คลื่นเพลิง/ต้มยำ) = ดรอปลับ' },
  tavern: { title: 'วิธีเล่น: กะดึกร้านเหล้า', rows: [['← →', 'เดินไป ครัว / อ่างล้างจาน / โต๊ะลูกค้า / ก๊อกเบียร์', 'Move'], ['1 2 3', 'สลับคนทำงาน (อาเธอร์ / โรสแมรี่ / เพอร์ซิวาล)', 'Swap'], ['J ที่ครัว', 'โรสแมรี่ปรุงอาหาร: กดลูกศรให้ตรงโน้ตที่วิ่งมาถึงวงกลม', 'Cook'], ['J ที่ก๊อก', 'เพอร์ซิวาลรินเบียร์ กด J อีกครั้งให้หยุดในแถบทอง', 'Pour'], ['J ที่โต๊ะ', 'เพอร์ซิวาลเสิร์ฟ · อาเธอร์เก็บจาน/เคาะขี้เมา', 'Serve / Bonk'], ['J ที่อ่าง', 'อาเธอร์ล้างจาน (ไม่มีจานสะอาด = ทำอาหารไม่ได้)', 'Wash'], ['Space / K', 'สกิล: พิณสงบลูกค้า / อาเธอร์จับโจร / โรสแมรี่ดับไฟ', 'Skill'], ['คลิก', 'คลิกที่ครัว อ่าง โต๊ะ หรือก๊อก = เปลี่ยนคนที่ถูกงานแล้วทำให้เลย · คลิกขวา = สกิล · ปรุงอาหารคลิกปุ่มลูกศรได้', 'Mouse']], tip: 'ดูแถบแจ้งเตือนด้านล่าง: VIP, โจร, เตาไฟไหม้ · Glowcap ทำต้มยำกุ้งพญามังกรขายได้แพง' },
  map: { title: 'วิธีเล่น: แผนที่โลก', rows: [['← →', 'เลือกด่าน (ตอนนี้เปิดด่าน 1)', 'Select'], ['1 2 3 C', 'เลือก/ถอดลูกทีม (พาได้ 2 คน)', 'Crew'], ['Enter / J', 'เริ่มลุยด่าน', 'Start'], ['คลิก', 'แตะหมุด ลูกทีม หรือปุ่มได้เลย', 'Tap']], tip: 'ดาว = อันดับการเคลียร์ · หัวใจ = ความลับที่เจอ (ห้องลับ + ดรอปลับบอส)' },
  alchemy: { title: 'วิธีเล่น: ห้องปรุงยา & ตีเหล็ก', rows: [['← →', 'เปลี่ยนหมวด: อาวุธ & ชุด / อาหารสวรรค์ / เครื่องใช้', 'Tabs'], ['↑ ↓', 'เลือกสูตร', 'Select'], ['Enter / J', 'ปรุง (Cook) หรือ คราฟต์ (Craft)', 'Make'], ['คลิก', 'แตะสูตร แล้วแตะปุ่ม [Craft / Cook]', 'Tap']], tip: 'Shroom Crown → Essence → ต้มยำกุ้งพญามังกร (บัฟ) หรือ Master Chef Set (ตำนาน)' },
};
const HELP_TOUCH = {
  stage: { title: 'วิธีเล่น: ลุยด่าน', rows: [['@stick', 'ดันจอยซ้าย-ขวาเพื่อเดิน ดันขึ้นเพื่อกระโดด · ดันเฉียงขึ้น/ลงพร้อมกดดาบเพื่อเล็งยิง', 'Move / Jump'], ['@atk', 'กดดาบ = โจมตี ดาวและเวทเล็งมอนตัวที่ใกล้สุดด้านที่หันอยู่ให้เอง · แตะที่จอเพื่อยิงไปจุดนั้น', 'Attack'], ['@sp', 'ท่าพิเศษ (เกจครึ่งหลอด): คลื่นเพลิง / พลังแห่งต้มยำกุ้ง / คาถาฝนดาวตก', 'Special'], ['@ult', 'ท่าประสาน 3 อัศวิน "ต้มยำมหาภัยกระทะเหล็กเดือด" เมื่อเกจ MAX', 'Ultimate'], ['@swap', 'สลับตัวละครได้ตลอดเวลา', 'Swap'], ['@crew', 'เรียกลูกทีม: เชฟกอร์นทุบกำแพงร้าว / บาร์ตเฒ่าส่งเบียร์ฟื้นพลัง', 'Crew'], ['@pause', 'หยุดเกมชั่วคราว', 'Pause']], tip: 'เกจ SPECIAL เพิ่มเมื่อโจมตีโดนและเก็บเบียร์วุ้น · ปราบบอสตอนติดไฟ (คลื่นเพลิง/ต้มยำ) = ดรอปลับ' },
  tavern: { title: 'วิธีเล่น: กะดึกร้านเหล้า', rows: [['แตะจอ', 'แตะที่ครัว อ่าง โต๊ะ หรือก๊อก แล้วคนที่ถูกงานจะเดินไปทำให้เลย', 'Tap'], ['@stick', 'เดินไป ครัว / อ่างล้างจาน / โต๊ะลูกค้า / ก๊อกเบียร์', 'Move'], ['@atk', 'ทำงานตรงที่ยืนอยู่: ปรุงอาหาร ล้างจาน เสิร์ฟ รินเบียร์ (แตะอีกครั้งให้หยุดในแถบทอง)', 'Work'], ['@swap', 'สลับคนทำงาน (อาเธอร์ / โรสแมรี่ / เพอร์ซิวาล)', 'Swap'], ['@sp', 'สกิล: พิณสงบลูกค้า / อาเธอร์จับโจร / โรสแมรี่ดับไฟ', 'Skill'], ['@stick', 'ตอนปรุงอาหาร: ดันจอยหรือแตะปุ่มลูกศรให้ตรงโน้ตที่วิ่งมาถึงวงกลม', 'Cook']], tip: 'ดูแถบแจ้งเตือนด้านล่าง: VIP, โจร, เตาไฟไหม้ · Glowcap ทำต้มยำกุ้งพญามังกรขายได้แพง' },
  map: { title: 'วิธีเล่น: แผนที่โลก', rows: [['แตะจอ', 'แตะหมุด ลูกทีม หรือปุ่มได้เลย', 'Tap'], ['@stick', 'เลือกด่าน (ตอนนี้เปิดด่าน 1)', 'Select'], ['@crew', 'เลือก/ถอดลูกทีม (พาได้ 2 คน)', 'Crew'], ['@atk', 'เริ่มลุยด่าน', 'Start']], tip: 'ดาว = อันดับการเคลียร์ · หัวใจ = ความลับที่เจอ (ห้องลับ + ดรอปลับบอส)' },
  alchemy: { title: 'วิธีเล่น: ห้องปรุงยา & ตีเหล็ก', rows: [['แตะจอ', 'แตะสูตร แล้วแตะปุ่ม [Craft / Cook]', 'Tap'], ['@stick', 'ซ้าย-ขวา เปลี่ยนหมวด · ขึ้น-ลง เลือกสูตร', 'Select'], ['@atk', 'ปรุง (Cook) หรือ คราฟต์ (Craft)', 'Make']], tip: 'Shroom Crown → Essence → ต้มยำกุ้งพญามังกร (บัฟ) หรือ Master Chef Set (ตำนาน)' },
};
const HELP_IMG = {};
function helpIcon(name, cx, cy, d) {
  const tb = window.__TB; if (!tb) return false;
  const get = k => { if (!tb[k]) return null; if (!HELP_IMG[k]) { HELP_IMG[k] = new Image(); HELP_IMG[k].src = tb[k]; } return HELP_IMG[k].complete && HELP_IMG[k].naturalWidth ? HELP_IMG[k] : null; };
  const smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true;
  if (name === 'stick') { const b = get('base'), k = get('knob'); if (b) ctx.drawImage(b, cx - d / 2, cy - d / 2, d, d); if (k) ctx.drawImage(k, cx - d * 0.22, cy - d * 0.22, d * 0.44, d * 0.44); }
  else { const im = get(name); if (im) ctx.drawImage(im, cx - d / 2, cy - d / 2, d, d); }
  ctx.imageSmoothingEnabled = smooth; return true;
}
function helpPageFor() { return scene === 'tavern' ? 'tavern' : scene === 'map' || scene === 'title' ? 'map' : scene === 'alchemy' ? 'alchemy' : 'stage'; }
function drawHelp() {
  const touch = document.body.classList.contains('tp-on'); const h = (touch ? HELP_TOUCH : HELP)[help]; if (!h) return;
  rect(0, 0, W, H, '#05080ccc'); panel(14, 8, 372, 208, '#101820f6', '#f2a93b');
  text(h.title, 27, 18, { size: 11, thai: true, color: '#f2a93b', weight: 600 }); text('How to play', 373, 20, { size: 8, align: 'right', color: '#8a9aa0' });
  ctx.font = `700 8px ${THAI}`; const KW = touch ? 30 : Math.max(46, ...h.rows.map(r => keyLabelW(r[0], 8, THAI) + 16));
  let ry = 38; const RS = h.rows.length > 6 ? 15 : 19, LHW = h.rows.length > 6 ? 8 : 8.5;
  h.rows.forEach(([k, th, en], i) => {
    const y = ry; ctx.font = `700 8px ${THAI}`; const kw = KW;
    if (k[0] === '@') helpIcon(k.slice(1), 28 + kw / 2, y + 6.5, 17); else if (touch) text(k, 28 + kw / 2, y + 2.5, { size: 7, align: 'center', thai: true, weight: 600, color: '#ffd76a' }); else { uiBtn(26, y - 0.5, kw + 2, 14, false, '', '#2a3a44', '', '#2a3a44'); keyLabel(k, 28 + kw / 2, y + 6.5, 8, { thai: true }); }
    ry = Math.max(y + RS, wrapText(th, 27 + kw + 7, y + 1.5, 311 - kw, LHW, { size: 7, thai: true, weight: 400 }) + (h.rows.length > 6 ? 3.5 : 6));
    text(en, 373, y + 1, { size: 7, align: 'right', color: '#8a9aa0' });
  });
  wrapText(h.tip, 27, 183, 346, 9, { size: 7, thai: true, weight: 400, color: '#ffd76a' });
  text(touch ? 'แตะที่ไหนก็ได้เพื่อปิด' : 'กด Enter / J / แตะ เพื่อปิด · กด H เปิดหน้านี้ได้ทุกเมื่อ', W / 2, 200, { size: 7, align: 'center', thai: true, color: '#bfe8ff' });
}
let uiRegions = [];
function localFrac(e, el) { const r = el.getBoundingClientRect(); if (document.body.classList.contains('tp-rot')) return [(e.clientY - r.top) / r.height, (r.right - e.clientX) / r.width]; return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
function btn(id, x, y, w, h) { uiRegions.push({ id, x, y, w, h }); }
/* phones only open the keyboard when focus() runs inside the tap itself, so the rename button focuses the name field right here */
document.addEventListener('mousedown', e => { if (ranking.nameEdit && e.target.id !== 'nameIn') e.preventDefault(); }, true); /* the mouse event a tap sends afterwards would move focus back to the canvas */
cv.addEventListener('pointerup', e => {
  const lf = localFrac(e, cv), x = lf[0] * W, y = lf[1] * H;
  const hit = uiRegions.slice().reverse().find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (!ranking.nameEdit && hit && hit.id === 'rkn' && !help) ranking.nameOpen();
  else if (ranking.nameEdit && !(hit && (hit.id === 'nok' || hit.id === 'ncan'))) { try { const el = document.getElementById('nameIn'), n = el.value.length; el.focus(); el.setSelectionRange(n, n); } catch (x) {} }
});
cv.addEventListener('pointerdown', e => {
  const lf = localFrac(e, cv); const x = lf[0] * W, y = lf[1] * H;
  const hit = uiRegions.slice().reverse().find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (hit && !help) pressed['ui:' + hit.id] = true;
  // mouse combat in a stage: left button = attack, right button = special, middle = ultimate; the knight turns toward the cursor
  if ((e.pointerType === 'mouse' || e.pointerType === 'touch') && scene === 'stage' && S && !S.paused && !help && !hit) {
    const a = e.button === 0 ? 'atk' : e.button === 2 ? 'sp' : e.button === 1 ? 'ult' : null; if (!a) return;
    if (S.p && !S.p.special) { const dx = S.camX + x - (S.p.x + 9); if (Math.abs(dx) > 4) S.p.face = dx > 0 ? 1 : -1; }
    if (a === 'atk') S.aim = { x: S.camX + x, y, t: S.t };
    mouseHeld = a; press(a);
  }
  // mouse in the night shift: left click a station = walk there with the right knight and work (same as J), right click = skill (K)
  if ((e.pointerType === 'mouse' || e.pointerType === 'touch') && scene === 'tavern' && T && !T.paused && !T.over && !help && !hit) {
    if (e.button === 2) { pressed.sp = true; return; }
    if (e.button !== 0) return;
    if (T.pour) { pressed.atk = true; return; }
    if (T.cook || y < 40 || y > 200) return;
    let bi = -1, bd = 26; STATIONS.forEach((st, i) => { const d = Math.abs(st.x - x); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) T.click = bi;
  }
});
let mouseHeld = null;
window.addEventListener('pointerup', e => { if (mouseHeld && (e.pointerType === 'mouse' || e.pointerType === 'touch')) { release(mouseHeld); mouseHeld = null; } });
cv.addEventListener('contextmenu', e => { if (scene === 'stage' || scene === 'tavern') e.preventDefault(); });
document.getElementById('btnHelp').addEventListener('click', () => { help = help ? null : helpPageFor(); cv.focus(); });
/* on-screen touch buttons show only on touch-screen devices (no option for it) */
document.body.classList.toggle('touch-on', matchMedia('(pointer: coarse)').matches);

/* ---- mobile landscape controls ---- */
const TOUCH_DEV = matchMedia('(pointer: coarse)').matches;
if (TOUCH_DEV) { const stop = e => { if (e.cancelable) e.preventDefault(); }; document.addEventListener('touchmove', stop, { passive: false }); document.addEventListener('gesturestart', stop, { passive: false }); document.addEventListener('dblclick', stop, { passive: false }); let lastT = 0; document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastT < 350 && e.cancelable) e.preventDefault(); lastT = n; }, { passive: false }); }
const tpEl = document.getElementById('tpad');
{
  const big = UI_ART_SRC.big, ic = UI_ART_SRC.icons;
  tpEl.querySelectorAll('.tp-dpad i').forEach(i => { i.style.backgroundImage = `url(${[].concat(big['ar_' + i.dataset.d])[0]})`; });
  const TB = {"atk": "art/1d49f6e542e5.webp", "sp": "art/5b41ee0111f4.webp", "ult": "art/d0df181ca6fe.webp", "bowl": "art/fb1025919639.webp", "swap": "art/6d49bb9cbb72.webp", "crew": "art/5f1580632b25.webp", "harp": "art/5987157def42.webp", "close": "art/cf2bcf9cc425.webp", "pause": "art/a177c75724f2.webp", "rotate": "art/35f3fa8159e8.webp", "full": "art/f6d3526c2f94.webp", "base": "art/88d408978b29.webp", "knob": "art/8d2d0d34962d.webp", "knobon": "art/0c5a8837e78f.webp", "ok": "art/229b6170159d.webp", "okon": "art/e6448512c78c.webp"};

  tpEl.querySelector('.tp-pause').style.backgroundImage = `url(${TB.pause})`; tpEl.querySelector('.tp-full').style.backgroundImage = `url(${TB.full})`;
  tpEl.querySelector('.tp-next').style.backgroundImage = `url(${TB.swap})`; tpEl.querySelector('.tp-ult').style.backgroundImage = `url(${TB.ult})`; tpEl.querySelector('.tp-sup').style.backgroundImage = `url(${TB.crew})`; tpEl.querySelector('.tp-back').style.backgroundImage = `url(${TB.close})`;
  document.querySelector('#rotate .rot-box').style.borderImageSource = `url(${PXF_SRC.e6_window})`; document.getElementById('rotIc').style.backgroundImage = `url(${TB.rotate})`;
  window.__TB = TB; window.__CAUL = FX_ART_SRC.cauldron;
  document.getElementById('tpDpad').style.backgroundImage = `url(${TB.base})`; document.getElementById('tpKnob').style.backgroundImage = `url(${TB.knob})`;
  const tb = document.getElementById('tpad');
  tb.querySelectorAll('.tp-b').forEach(b => {
    const a = b.dataset.k; if (!a) return; const on = v => { b.classList.toggle('on', v); if (b.classList.contains('tp-atk') && (document.body.dataset.tp === 'title' || document.body.dataset.tp === 'map')) b.style.backgroundImage = `url(${v ? window.__TB.okon : window.__TB.ok})`; };
    b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} press(a); on(true); });
    const up = e => { e.preventDefault(); release(a); on(false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', () => { release(a); on(false); });
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
  // d-pad: one touch zone, direction from finger position (diagonals only in action stages)
  const dp = document.getElementById('tpDpad'), cur = { up: false, down: false, left: false, right: false }; let pid = null;
  const set = want => { for (const d in cur) { if (want[d] && !cur[d]) press(d); else if (!want[d] && cur[d]) release(d); cur[d] = !!want[d]; dp.querySelector(`[data-d=${d}]`).classList.toggle('on', cur[d]); } };
  const kn = document.getElementById('tpKnob'), knob = (dx, dy) => { if (dx === null) { kn.classList.remove('on'); kn.style.transform = ''; kn.style.backgroundImage = `url(${window.__TB.knob})`; return; } const l = Math.hypot(dx, dy), k = l > 0.62 ? 0.62 / l : 1, r = dp.getBoundingClientRect(); kn.classList.add('on'); kn.style.backgroundImage = `url(${window.__TB.knobon})`; kn.style.transform = `translate(${dx * k * r.width / 2}px,${dy * k * r.height / 2}px)`; };
  const aim = e => { const lf = localFrac(e, dp), dx = lf[0] * 2 - 1, dy = lf[1] * 2 - 1, w = {}; knob(dx, dy);
    if (Math.hypot(dx, dy) < 0.22) { stickVec = null; return set(w); }
    if (document.body.dataset.tp === 'act') { const l = Math.hypot(dx, dy); stickVec = { dx: dx / l, dy: dy / l }; if (dx < -0.3) w.left = 1; if (dx > 0.3) w.right = 1; if (dy / l < -0.55) w.up = 1; if (dy / l > 0.6) w.down = 1; }
    else if (Math.abs(dx) > Math.abs(dy)) w[dx < 0 ? 'left' : 'right'] = 1; else w[dy < 0 ? 'up' : 'down'] = 1;
    set(w); };
  dp.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; try { dp.setPointerCapture(pid); } catch (_) {} aim(e); });
  dp.addEventListener('pointermove', e => { if (e.pointerId === pid) aim(e); });
  const end = e => { if (e.pointerId !== pid) return; pid = null; stickVec = null; set({}); knob(null); };
  dp.addEventListener('pointerup', end); dp.addEventListener('pointercancel', end);
  // first touch: try fullscreen + landscape lock (Android); iPhone keeps the browser bar
  const fb = document.getElementById('tpFull'), canFs = !!document.documentElement.requestFullscreen;
  const goFs = () => { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); };
  const fsUpd = () => fb.classList.toggle('hide', !canFs || !!document.fullscreenElement); document.addEventListener('fullscreenchange', fsUpd); fsUpd();
  fb.addEventListener('pointerdown', e => { e.preventDefault(); goFs(); });
  if (TOUCH_DEV) window.addEventListener('pointerdown', function fs() { window.removeEventListener('pointerdown', fs, true); const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); }, true);
}
let tpKey = '';
let tpRotKey = '';
function tpRotFit(rot) { /* Safari/LINE: 100vh includes the area under the browser bars, so size the rotated game to the real visible box */
  const w = window.innerWidth, h = window.innerHeight, k = rot + ':' + w + 'x' + h; if (k === tpRotKey) return; tpRotKey = k;
  const st = document.querySelector('.wrap').style;
  if (rot) { st.left = w + 'px'; st.width = h + 'px'; st.height = w + 'px'; } else { st.left = st.width = st.height = ''; }
}
function tpSync() {
  if (!TOUCH_DEV) return;
  const land = innerWidth >= innerHeight || ranking.nameEdit; /* while typing a name, lay the game flat at the top so the phone keyboard never covers it (X/FB in-app browsers don't resize for the keyboard) */
  document.body.classList.toggle('tp-name', ranking.nameEdit); const nz = ranking.nameEdit && ranking.nameZ; document.body.classList.toggle('tp-namez', nz);
  { /* upright phone: zoom in on the name box and centre it in the space above the keyboard */
    const sc = document.querySelector('.screen'), vv = window.visualViewport;
    if (nz) { const k = 1.75, wd = innerWidth, hd = wd * 9 / 16, avail = innerHeight < ranking.nameH0 * 0.8 ? innerHeight : vv && vv.height < innerHeight * 0.9 ? vv.height : innerHeight * 0.56;
      sc.style.transformOrigin = '0 0'; sc.style.transform = `translate(${wd / 2 * (1 - k)}px, ${avail / 2 - 114 / 225 * hd * k}px) scale(${k})`; }
    else if (sc.style.transform) sc.style.transform = sc.style.transformOrigin = ''; }
  document.body.classList.toggle('tp-on', true); tpOnTxt = true; document.body.classList.toggle('tp-rot', !land); tpRotFit(!land);
  const mode = help ? 'menu' : (scene === 'stage' || scene === 'gameover') ? 'act' : scene === 'tavern' ? 'tav' : scene === 'title' ? 'title' : scene === 'map' ? 'map' : 'menu';
  if ((titleScene.panel && scene === 'title') || (mapRank && scene === 'map')) document.body.dataset.tpp = '1'; else delete document.body.dataset.tpp;
  if (ranking.nameEdit) document.body.dataset.tpn = '1'; else delete document.body.dataset.tpn;
  const key = mode + LANG + (mode === 'tav' && T ? T.active : ''); if (key === tpKey) return; tpKey = key; document.body.dataset.tp = mode;
  const TB = window.__TB, Q = s => tpEl.querySelector(s);
  const lab = (sel, img, txt) => { const b = Q(sel); if (img) b.style.backgroundImage = `url(${img})`; b.querySelector('span').textContent = tr(txt); };
  if (mode === 'tav') { const who = T ? T.active : 0; lab('.tp-atk', TB.bowl, 'ทำงาน'); lab('.tp-sp', who === 2 ? TB.harp : TB.sp, 'สกิล'); lab('.tp-next', null, 'สลับคน'); }
  else if (mode === 'title') { lab('.tp-atk', TB.ok, 'ตกลง'); lab('.tp-back', null, '\u200bปิด'); }
  else if (mode === 'map') { lab('.tp-atk', TB.ok, 'ลุยเลย!'); lab('.tp-sp', window.__CAUL, 'ห้องปรุงยา'); lab('.tp-back', null, '\u200bปิด'); }
  else { lab('.tp-atk', TB.atk, 'โจมตี'); lab('.tp-sp', TB.sp, 'ท่าพิเศษ'); lab('.tp-next', null, 'สลับตัว'); }
  lab('.tp-ult', null, 'ท่าประสาน'); lab('.tp-sup', null, 'ลูกทีม');
  document.getElementById('rotTxt').textContent = tr('หมุนมือถือเป็นแนวนอนเพื่อเล่น');
}

/* ================================================================== LOOP */
const STEP = 1 / 60;
let last = performance.now(), acc = 0;
function update(dt) {
  if (pressed.help) { help = help ? null : helpPageFor(); }
  else if (help) { if (pressed.ok || pressed.click || pressed.atk || pressed.pause) help = null; }
  else if (scene === 'title') titleScene.update(dt);
  else if (scene === 'map') map.update(dt);
  else if (scene === 'stage') updateStage(dt);
  else if (scene === 'results') updateResults(dt);
  else if (scene === 'tavern') updateTavern(dt);
  else if (scene === 'alchemy') alchemy.update(dt);
  else if (scene === 'gameover') updateOver(dt);
  shake = Math.max(0, shake - dt * 20);
  for (const k in pressed) delete pressed[k];
}
function draw() {
  ctx.setTransform(RES, 0, 0, RES, 0, 0); ctx.imageSmoothingEnabled = false;
  uiRegions = [];
  ctx.save();
  if (shake > 0) ctx.translate(Math.round(rnd(-shake, shake)), Math.round(rnd(-shake, shake)));
  if (scene === 'title') titleScene.draw();
  else if (scene === 'map') map.draw();
  else if (scene === 'stage' || scene === 'gameover') { drawStageWorld(); drawUltimate(); drawStageHud(); }
  else if (scene === 'results') drawResults();
  else if (scene === 'tavern') drawTavern();
  else if (scene === 'alchemy') alchemy.draw();
  ctx.restore();
  if (scene === 'gameover') drawOver();
  if (help) drawHelp();
}
/* ------------------------------------------------ share a result / invite friends */
// A "Share" button over the stage-clear and night-shift results, and "Invite friends" on the title screen. On phones it opens
// the system share sheet with a picture of the result; elsewhere a small panel with LINE / Facebook / X / copy / save picture.
// Every share is counted (track 'share') with utm tags on the link, so gstats shows which shares bring players back.
const SHARE = (() => {
  const L = (th, en) => LANG === 'th' ? th : en;
  const btn = document.getElementById('shareBtn'), inv = document.getElementById('inviteBtn'), pop = document.getElementById('sharePop');
  const HOME = /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname) ? location.origin + '/' : 'https://tavern-knights.pages.dev/';
  let cur = null, lang = '', blob = null, imgUrl = '';
  const link = (m, medium, camp) => HOME + '?utm_source=' + m + '&utm_medium=' + medium + '&utm_campaign=' + camp + (LANG === 'en' ? '&lang=en' : '');
  const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  const starStr = n => '★'.repeat(n);
  function what() {
    if (scene === 'results' && results) return { kind: 'stage', text: L('เคลียร์ด่านที่ ' + (results.n || 1) + ' ของ Tavern Knights ได้ ' + results.score + ' คะแนน ' + starStr(results.stars) + ' เวลา ' + mmss(results.time) + ' ใครทำได้ดีกว่านี้บ้าง? เล่นฟรีบนเว็บ',
      'Cleared stage ' + (results.n || 1) + ' of Tavern Knights with ' + results.score + ' points ' + starStr(results.stars) + ' in ' + mmss(results.time) + '. Can you beat that? Free in your browser') };
    if (scene === 'tavern' && T && T.over && night) return { kind: 'tavern', text: L('ปิดร้านกะดึกได้ ' + night.gold + 'g ' + starStr(night.stars) + ' เสิร์ฟไป ' + night.served + ' คน ใน Tavern Knights มาแข่งเปิดร้านกัน! เล่นฟรีบนเว็บ',
      'Closed the night shift with ' + night.gold + 'g ' + starStr(night.stars) + ', ' + night.served + ' customers served in Tavern Knights. Think you can run it better? Free in your browser') };
    return null;
  }
  const invite = () => ({ kind: 'invite', text: L('มาเล่น Tavern Knights กัน! เกมแอ็กชันพิกเซลผสมบริหารร้านเหล้า เล่นฟรีบนเว็บ ไม่ต้องโหลด', 'Come play Tavern Knights with me! Pixel action plus tavern management, free in your browser, no download') });
  const urlFor = (c, m) => c.kind === 'invite' ? link(m, 'invite', 'friend') : link(m, 'share', 'result');
  // A picture of the result screen with the game's address along the bottom.
  function picture() {
    return new Promise(res => {
      try {
        const w = cv.width, h = cv.height, bar = Math.round(h * 0.075), c = document.createElement('canvas'); c.width = w; c.height = h + bar;
        const g = c.getContext('2d'); g.drawImage(cv, 0, 0); g.fillStyle = '#160f1c'; g.fillRect(0, h, w, bar);
        g.fillStyle = '#ffd76a'; g.font = `600 ${Math.round(bar * 0.48)}px ${THAI}`; g.textBaseline = 'middle';
        const l = 'Tavern Knights · ' + L('เล่นฟรีที่ ', 'Play free at ') + HOME.replace(/^https?:\/\//, '').replace(/\/$/, ''); g.fillText(l, Math.round(w * 0.03), h + bar / 2);
        c.toBlob(b => res(b), 'image/png');
      } catch (e) { res(null); }
    });
  }
  const phone = () => !!(navigator.share && navigator.canShare && TOUCH_DEV);
  function open(c, b) {
    cur = c; blob = b; document.body.classList.add('sp-open'); pop.hidden = false;
    document.getElementById('spTitle').textContent = c.kind === 'invite' ? L('ชวนเพื่อนมาเล่น', 'Invite friends') : L('แชร์ผลการเล่น', 'Share your result');
    document.getElementById('spTxt').textContent = c.text;
    const im = document.getElementById('spImg'); if (imgUrl) URL.revokeObjectURL(imgUrl); imgUrl = b ? URL.createObjectURL(b) : ''; im.hidden = !b; if (b) im.src = imgUrl;
    const row = [navigator.share ? ['native', L('แชร์', 'Share')] : null, ['line', 'LINE'], ['facebook', 'Facebook'], ['x', 'X'], ['copy', L('คัดลอกลิงก์', 'Copy link')], b ? ['save', L('บันทึกรูป', 'Save picture')] : null].filter(Boolean);
    document.getElementById('spRow').innerHTML = row.map(([k, t]) => k === 'line' || k === 'facebook' || k === 'x' ? `<a data-s="${k}" href="#" target="_blank" rel="noopener">${t}</a>` : `<button type="button" data-s="${k}">${t}</button>`).join('');
    document.getElementById('spClose').textContent = L('ปิด', 'Close');
    setTimeout(() => { const f = pop.querySelector('[data-s]'); if (f) f.focus(); }, 0);
  }
  function close() { pop.hidden = true; document.body.classList.remove('sp-open'); cur = null; try { cv.focus(); } catch (e) {} }
  async function start(c) {
    if (!c) return; initAudio(); SFX.select();
    track('share_open', { kind: c.kind });
    const b = c.kind === 'invite' ? null : await picture();
    if (phone()) {
      const files = b ? [new File([b], 'tavern-knights.png', { type: 'image/png' })] : [];
      const data = files.length && navigator.canShare({ files }) ? { files, text: c.text + ' ' + urlFor(c, 'native') } : { title: 'Tavern Knights', text: c.text, url: urlFor(c, 'native') };
      try { await navigator.share(data); track('share', { method: 'native', kind: c.kind }); } catch (e) {}
      return;
    }
    open(c, b);
  }
  pop.addEventListener('click', e => {
    if (e.target === pop || e.target.id === 'spClose') { close(); return; }
    const a = e.target.closest('[data-s]'); if (!a || !cur) return; const m = a.dataset.s, c = cur;
    track('share', { method: m, kind: c.kind });
    if (m === 'native') { e.preventDefault(); const files = blob ? [new File([blob], 'tavern-knights.png', { type: 'image/png' })] : [];
      navigator.share(files.length && navigator.canShare && navigator.canShare({ files }) ? { files, text: c.text + ' ' + urlFor(c, 'native') } : { title: 'Tavern Knights', text: c.text, url: urlFor(c, 'native') }).catch(() => {}); return; }
    if (m === 'copy') { e.preventDefault(); const t = c.text + ' ' + urlFor(c, 'copy'), done = () => { a.textContent = L('คัดลอกแล้ว', 'Copied'); setTimeout(() => { a.textContent = L('คัดลอกลิงก์', 'Copy link'); }, 1800); };
      try { navigator.clipboard.writeText(t).then(done, () => prompt('', t)); } catch (x) { prompt('', t); } return; }
    if (m === 'save') { e.preventDefault(); const d = document.createElement('a'); d.href = imgUrl; d.download = 'tavern-knights.png'; document.body.appendChild(d); d.click(); d.remove(); return; }
    const u = encodeURIComponent(urlFor(c, m)), tx = encodeURIComponent(c.text);
    a.href = m === 'line' ? 'https://social-plugins.line.me/lineit/share?url=' + u + '&text=' + tx : m === 'facebook' ? 'https://www.facebook.com/sharer/sharer.php?u=' + u : 'https://twitter.com/intent/tweet?url=' + u + '&text=' + tx;
  });
  // While the panel is open, keys go to it, not to the game (Enter would otherwise skip the results screen).
  document.addEventListener('keydown', e => { if (pop.hidden) return; if (e.key === 'Escape') { e.preventDefault(); close(); } if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') e.preventDefault(); e.stopPropagation(); }, true);
  btn.addEventListener('click', () => start(what()));
  inv.addEventListener('click', () => start(invite()));
  document.getElementById('btnGuide').addEventListener('click', () => { track('guides_open', { from: 'header' }); window.open(LANG === 'en' ? '/guide/en/' : '/guide/', '_blank', 'noopener'); });
  function sync() {
    const res = scene === 'results' && results && results.t > 0.8, tav = scene === 'tavern' && T && T.over && night && T.overT > 0.8;
    const showS = (res || tav) && !help && pop.hidden, showI = scene === 'title' && !titleScene.panel && !help && pop.hidden && !ranking.nameEdit;
    if (btn.hidden === showS) btn.hidden = !showS;
    if (showS) { const k = res ? 'at-res' : 'at-tav'; if (!btn.classList.contains(k)) { btn.classList.remove('at-res', 'at-tav'); btn.classList.add(k); } }
    if (inv.hidden === showI) inv.hidden = !showI;
    if (!pop.hidden && !(res || tav || scene === 'title')) close();
    if (lang !== LANG) { lang = LANG; btn.textContent = L('📣 แชร์ผล', '📣 Share'); inv.textContent = L('ชวนเพื่อนมาเล่น', 'Invite friends'); }
  }
  return { sync, close };
})();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  draw();
  bgmSync();
  tpSync();
  SHARE.sync();
  requestAnimationFrame(frame);
}
window.__tk = { sfxBuf: SFX_BUF, makeEnemy, get help() { return help; }, set help(v) { help = v; }, set scene(v) { scene = v; }, get scene() { return scene; }, get S() { return S; }, get T() { return T; }, startStage, startTavern, finishStage, endTavern, setLang, NET, titleAct: i => titleScene.act(i), get results() { return results; }, set T(v) { T = v; }, set titlePanel(v) { titleScene.panel = v; }, set titleSel(v) { titleScene.sel = v; }, set rank(v) { ranking.setBoard(v[0], v[1]); }, step: n => { for (let i = 0; i < n; i++) update(STEP); draw(); }, press, release, pressed, keys, save: () => save };
(document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve()).then(() => requestAnimationFrame(frame));
}
