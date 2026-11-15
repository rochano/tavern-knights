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
import { createHelp } from './scenes/help';
import { createTavern } from './scenes/tavern';
import { createStage } from './scenes/stage';
import { createDraw } from './draw';
import { createTouch } from './touch';
import { createShare } from './share';
import { createSprites } from './sprites';
import { clamp, rnd, pick, overlap, hash } from './util';
import { HERO_ATLAS, UI_ART_SRC } from './data/art';

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
// one line for the stage.results screens: null when offline (the screen keeps its own line)
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
  if (scene === 'stage') { if (stage.S && stage.S.boss) return stage.S.boss.dead ? null : 'boss'; return stage.S && stage.S.n === 2 ? 'stage2' : 'stage1'; }
  if (scene === 'alchemy') return 'stage2';
  if (scene === 'tavern') return 'tavern';
  return null;
}
function bgmSync() { bgmPlay(bgmWant(), scene === 'stage' && !!stage.S && !!stage.S.paused); }

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

/* sprites and character art (sprites.ts) */
const RES = 4; // canvas px per world unit (world is 400x225)
const spr = createSprites({ ctx, RES, get save() { return save; }, get ui() { return kit; } });
const { spriteCache, KNIGHTS, HERO_HI, ENEMY_ART, CREW_ART, heroAtlas, LW, LH, dimg, flip, recol, tinted, shade, enemyArtFor, enemySprite, thiefSprite,
  fxImg, fxC, fxB, icon, knightHead, knightSprite } = spr;
/* Full version switch: the free web demo (tavern-knights.pages.dev) only has Stage 1. Store/Steam builds set window.TK_FULL = true; the develop site and localhost act as full so new stages can be tested. */
const DEV_HOST = /^(localhost|127\.|develop\.)/.test(location.hostname);
const FULL = window.TK_FULL === true || DEV_HOST;
function stage2Open() { return FULL && (DEV_HOST || !!(save && save.stages && save.stages[1])); }
/* drawing kit (draw.ts): UI frames from the user's Gemini sheet D, 9-slices, text, buttons, panels, key labels */
const kit = createDraw({
  ctx, W, RES, FONT, THAI, tr,
  get scene() { return scene; },
  onUiReady() { for (const key of [...spriteCache.keys()]) if (key.startsWith('ic_')) spriteCache.delete(key); },
});
const { UI_ICON, UI_BIG, PXF, uiIcon, uiBig, pxSlice, slice3, frameBar, nineBox, hp, rect, text, textC, uiBtn, panel, bar, glow, shroom, outlined, wrapText,
  keyLabelW, keyLabel, controlStrip, controlStripCustom } = kit;
const POOL_SQ = 0.55;
const E7_SRC = {"pit": "art/4c5078272bc3.webp", "pool": "art/6e7c374915d9.webp", "bub0": "art/bb0d5088bfe2.webp", "bub1": "art/f9fd734cc78a.webp", "bub2": "art/5be9cbb147c5.webp"}, E7 = {};
for (const k in E7_SRC) { const im = new Image(); im.onload = () => { E7[k] = im; }; im.src = E7_SRC[k]; }
const E5_SRC = {"pool": "art/47a623b8d4ef.webp", "shock": "art/28a6c5a024c6.webp", "spore": "art/6de6171bdaa1.webp", "mug": "art/f37aef6cbe64.webp"}, E5 = {};
for (const k in E5_SRC) { const im = new Image(); im.onload = () => { E5[k] = im; }; im.src = E5_SRC[k]; }
const TRAY_SRC = {"tray_empty": "art/2fec1f9ad44c.webp", "tray_beer": "art/cf5a1de7dacc.webp", "tray_mix": "art/6972664d1dbc.webp"}, TRAY = {};
for (const k in TRAY_SRC) { const im = new Image(); im.onload = () => { TRAY[k] = im; }; im.src = TRAY_SRC[k]; }
const CUST_KEYS = ['cust_dwarf', 'cust_mug', 'cust_elf', 'cust_archer', 'cust_merchant', 'cust_bard', 'cust_noble', 'cust_lady'];
/* --------------------------------------------------------------- helpers */

let shake = 0;
function addShake(v) { shake = Math.max(shake, v); }

/* -------------------------------------------------------- stage drawing */
const stars = Array.from({ length: 70 }, (_, i) => ({ x: hash(i) * W, y: hash(i + 99) * 110, ph: hash(i + 7) * 6 }));
const flies = Array.from({ length: 26 }, (_, i) => ({ x: hash(i + 300) * 520, y: 70 + hash(i + 400) * 115, ph: hash(i + 500) * 6, s: 0.5 + hash(i + 600) * 0.5 }));
const ENV_SRC={title_clean:"art/7e37ff8cac34.jpg",cellar2:"art/559c329846ee.jpg",tav2:"art/97f217a03440.jpg",arena:"art/a46905011e86.webp",ground2:"art/8fa63bc34a04.webp",plat2:"art/1de7f53ed7d5.webp",midbg:"art/003ce3dd268f.webp",farbg:"art/b16db0e3d121.jpg",title:"art/55d67ed13c86.jpg",sky:"art/91695c65291a.webp",trees:"art/08bd5ffeb7b3.webp",fungi:"art/36ab70487458.webp",groundstrip:"art/abde28010105.webp",platform:"art/c34d5b0aa1c8.webp",tavern:"art/7f6d45704aea.webp",cellar:"art/9c447fcc6c3a.webp",map:"art/f1237e09a557.jpg",};
const ENV = {};
const STAGE_POS_IMG = [[121, 47], [208, 48], [266, 60], [140, 140], [246, 113], [309, 34]];
for (const k in ENV_SRC) { const im = new Image(); im.onload = () => { ENV[k] = im; if (k === 'map') STAGES.forEach((st, i) => { st.x = STAGE_POS_IMG[i][0]; st.y = STAGE_POS_IMG[i][1]; }); }; im.src = ENV_SRC[k]; }
/* ======================================================== STAGES 1-2 */
const stage = createStage({
  CREW_ART, E5, E7, ENEMY_ART, ENV, GROUND, H, HERO_ATLAS, HERO_HI, KNIGHTS, LH, LW, NET, POOL_SQ, RES, THAI, UI_BIG, W, addShake, anyConfirm, bar,
  btn, clamp, controlStrip, ctx, dimg, enemyArtFor, enemySprite, flies, flip, frameBar, fxB, fxC, fxImg, glow, hash, heroAtlas, icon, knightHead,
  knightSprite, netLine, nineBox, noise, outlined, overlap, panel, persist, pick, recol, rect, rnd, shade, shroom, stars, text, textC, tinted, track,
  uiBtn, wrapText,
  crewLabel: () => crewLabel(), startTavern: () => startTavern(),
  get save() { return save; },
  get LANG() { return LANG; },
  get tpOnTxt() { return tpOnTxt; },
  get heroReady() { return spr.heroReady; },
  get heroHiReady() { return spr.heroHiReady; },
  get enemyArtReady() { return spr.enemyArtReady; },
  get crewArtReady() { return spr.crewArtReady; },
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  get scene() { return scene; }, set scene(v) { scene = v; },
  get help() { return help; }, set help(v) { help = v; },
});
const { LEVEL_W, ARENA, startStage, finishStage, updateStage, makeEnemy, knightMax, dmgMul, gameOver, drawStageWorld, drawStageHud, drawUltimate, drawStageBg, drawForestBg,
  updateResults, drawResults, updateOver, drawOver } = stage;

/* ============================================================ NIGHT SHIFT */
const tavern = createTavern({
  ctx, W, H, RES, ENV, UI_BIG, KNIGHTS, CREW_ART, E5, TRAY, CUST_KEYS, NET,
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  get crewArtReady() { return spr.crewArtReady; },
  get TOUCH_DEV() { return TOUCH_DEV; },
  get tpOnTxt() { return tpOnTxt; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, LW, fxImg, fxB, knightSprite, controlStripCustom, controlStrip,
  rnd, clamp, pick, bar, frameBar, uiIcon, uiBig, thiefSprite, addShake, netLine, anyConfirm,
  get save() { return save; },
  persist, track, knightMax,
  enterTavern() { scene = 'tavern'; },
  goAlchemy() { scene = 'alchemy'; alchemy.enter(); },
  leaveTavern(to) { scene = to; if (to === 'title') titleScene.panel = null; },
  showHelp(page) { help = page; },
});
const { STATIONS } = tavern;
const startTavern = () => tavern.start(), endTavern = () => tavern.end();
/* ======================================================= ALCHEMY ROOM */
const alchemy = createAlchemy({
  ctx, W, H, RES, ENV, UI_BIG,
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom,
  get save() { return save; },
  persist, track, knightMax,
  goMap() { scene = 'map'; map.enter(); },
});

/* ========================================================== WORLD MAP */
const map = createMap({
  ctx, W, H, RES, ENV, UI_BIG, FULL, FONT, THAI, CREW_ART,
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  get crewArtReady() { return spr.crewArtReady; },
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
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom,
});
const titleScene = createTitle({
  ctx, W, H, RES, ENV, UI_BIG, THAI, GROUND, NET, KNIGHTS, ranking,
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  get LANG() { return LANG; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom,
  get save() { return save; },
  persist, track, knightMax, tr, setLang, toggleMute, bgmSync, keyLabel, uiBig, drawForestBg, anyConfirm,
  goMap() { scene = 'map'; map.enter(); },
  startTavernFromTitle() { startTavern(); tavern.T.fromTitle = true; },
});
/* ================================================================= HELP */
let help = null;
const helpOverlay = createHelp({
  ctx, W, H, RES, ENV, UI_BIG, THAI,
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom, keyLabel, keyLabelW,
});
function helpPageFor() { return scene === 'tavern' ? 'tavern' : scene === 'map' || scene === 'title' ? 'map' : scene === 'alchemy' ? 'alchemy' : 'stage'; }
/* pointer + touch input (touch.ts): tap regions, mouse combat / station clicks, the phone pad */
function btn(id, x, y, w, h) { touch.btn(id, x, y, w, h); }
const touch = createTouch({
  cv, W, H, ranking, stage, tavern, STATIONS, tr, helpPageFor,
  get LANG() { return LANG; },
  get scene() { return scene; },
  get mapRank() { return mapRank; },
  get titlePanel() { return titleScene.panel; },
  get help() { return help; }, set help(v) { help = v; },
  get tpOnTxt() { return tpOnTxt; }, set tpOnTxt(v) { tpOnTxt = v; },
});
const { TOUCH_DEV } = touch;
const tpSync = () => touch.sync();

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
  else if (scene === 'tavern') tavern.update(dt);
  else if (scene === 'alchemy') alchemy.update(dt);
  else if (scene === 'gameover') updateOver(dt);
  shake = Math.max(0, shake - dt * 20);
  for (const k in pressed) delete pressed[k];
}
function draw() {
  ctx.setTransform(RES, 0, 0, RES, 0, 0); ctx.imageSmoothingEnabled = false;
  touch.clearRegions();
  ctx.save();
  if (shake > 0) ctx.translate(Math.round(rnd(-shake, shake)), Math.round(rnd(-shake, shake)));
  if (scene === 'title') titleScene.draw();
  else if (scene === 'map') map.draw();
  else if (scene === 'stage' || scene === 'gameover') { drawStageWorld(); drawUltimate(); drawStageHud(); }
  else if (scene === 'results') drawResults();
  else if (scene === 'tavern') tavern.draw();
  else if (scene === 'alchemy') alchemy.draw();
  ctx.restore();
  if (scene === 'gameover') drawOver();
  if (help) helpOverlay.draw(help);
}
/* share a result / invite friends (share.ts) */
const SHARE = createShare({
  cv, THAI, stage, tavern, ranking, initAudio, track,
  get LANG() { return LANG; },
  get scene() { return scene; },
  get help() { return help; },
  get TOUCH_DEV() { return TOUCH_DEV; },
  get titlePanel() { return titleScene.panel; },
});
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  draw();
  bgmSync();
  tpSync();
  SHARE.sync();
  requestAnimationFrame(frame);
}
window.__tk = { sfxBuf: SFX_BUF, makeEnemy, get help() { return help; }, set help(v) { help = v; }, set scene(v) { scene = v; }, get scene() { return scene; }, get S() { return stage.S; }, get T() { return tavern.T; }, startStage, startTavern, finishStage, endTavern, setLang, NET, titleAct: i => titleScene.act(i), get results() { return stage.results; }, set T(v) { tavern.T = v; }, set titlePanel(v) { titleScene.panel = v; }, set titleSel(v) { titleScene.sel = v; }, set rank(v) { ranking.setBoard(v[0], v[1]); }, step: n => { for (let i = 0; i < n; i++) update(STEP); draw(); }, press, release, pressed, keys, save: () => save };
(document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve()).then(() => requestAnimationFrame(frame));
}
