// Tavern Knights game code, moved from the old single-file index.html (migration phase 3).
// It runs as one module for now; scenes are split out into typed modules one at a time.
// Everything on screen is drawn on the canvas from the Gemini art sheets.

import { createLang } from './lang';
import { createNet, NET_BOARDS, netVal, netLine } from './net';
import { SFX, SFX_BUF, VOL, audio, bgmSync as bgmPlay, noise, setVol, startAudio } from './audio';
import { DEFAULT_SAVE, loadSave, writeSave } from './save';
import { keys, press, pressed, release } from './input';
import { createControls } from './controls';
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
import { HERO_ATLAS } from './data/art';
import { CUST_KEYS, POOL_SQ, loadEnvArt, loadPropArt } from './data/scene-art';

declare global { interface Window { TK_FULL?: boolean; __tk?: object } }

let started = false;

/** Starts the game on the #game canvas. Call once, after the game screen's markup is in the page. */
export function startGame(): void {
if (started) return;
started = true;
const W = 400, H = 225, GROUND = 190;
const cv = document.getElementById('game') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;

let tpOnTxt = false;
/* language (lang.ts): tr() Thai -> English, canvas text patch, page DOM text, analytics track() */
const lang = createLang({ ctx, get tpOnTxt() { return tpOnTxt; }, onLangChange: () => controls.relabel() });
const { tr, setLang, track } = lang;
/* ------------------------------------------------ online ranking (phase 1) */
// Talks to functions/api (Cloudflare Pages Function + D1). Same origin on the web (develop -> staging DB, main -> production DB);
// the store apps (app:// or capacitor://) use production. Everything fails soft: with no network or no database NET.on
// becomes false and the game shows its offline lines instead.
const NET = createNet(() => { for (const k in keys) keys[k] = false; });
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
const controls = createControls({
  cv, tr, initAudio,
  get ranking() { return ranking; },
  resetSave() { save = structuredClone(DEFAULT_SAVE); persist(); scene = 'title'; },
});
const { toggleMute } = controls;
setLang(lang.LANG);
const anyConfirm = () => pressed['ok'] || pressed['click'] || pressed['atk'];

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
const { E7, E5, TRAY } = loadPropArt();
/* --------------------------------------------------------------- helpers */

let shake = 0;
function addShake(v: number) { shake = Math.max(shake, v); }

/* -------------------------------------------------------- stage drawing */
const stars = Array.from({ length: 70 }, (_, i) => ({ x: hash(i) * W, y: hash(i + 99) * 110, ph: hash(i + 7) * 6 }));
const flies = Array.from({ length: 26 }, (_, i) => ({ x: hash(i + 300) * 520, y: 70 + hash(i + 400) * 115, ph: hash(i + 500) * 6, s: 0.5 + hash(i + 600) * 0.5 }));
const STAGE_POS_IMG = [[121, 47], [208, 48], [266, 60], [140, 140], [246, 113], [309, 34]];
const ENV = loadEnvArt(() => STAGES.forEach((st, i) => { st.x = STAGE_POS_IMG[i][0]; st.y = STAGE_POS_IMG[i][1]; }));
/* ======================================================== STAGES 1-2 */
const stage = createStage({
  CREW_ART, E5, E7, ENEMY_ART, ENV, GROUND, H, HERO_ATLAS, HERO_HI, KNIGHTS, LH, LW, NET, POOL_SQ, RES, THAI, UI_BIG, W, addShake, anyConfirm, bar,
  btn, clamp, controlStrip, ctx, dimg, enemyArtFor, enemySprite, flies, flip, frameBar, fxB, fxC, fxImg, glow, hash, heroAtlas, icon, knightHead,
  knightSprite, netLine, nineBox, noise, outlined, overlap, panel, persist, pick, recol, rect, rnd, shade, shroom, stars, text, textC, tinted, track,
  uiBtn, wrapText,
  crewLabel: () => crewLabel(), startTavern: () => startTavern(),
  get save() { return save; },
  get LANG() { return lang.LANG; },
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
  ctx, W, H, RES, ENV, UI_BIG, NET, NET_BOARDS, THAI, cv, netVal, tr,
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom,
});
const titleScene = createTitle({
  ctx, W, H, RES, ENV, UI_BIG, THAI, GROUND, NET, KNIGHTS, ranking,
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  get LANG() { return lang.LANG; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom,
  get save() { return save; },
  persist, track, knightMax, tr, setLang, toggleMute, bgmSync, keyLabel, uiBig, drawForestBg, anyConfirm,
  goMap() { scene = 'map'; map.enter(); },
  startTavernFromTitle() { startTavern(); tavern.T!.fromTitle = true; },
});
/* ================================================================= HELP */
let help: string | null = null;
const helpOverlay = createHelp({
  ctx, W, H, RES, ENV, UI_BIG, THAI,
  get fxArtReady() { return spr.fxArtReady; },
  get uiArtReady() { return kit.uiArtReady; },
  rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom, keyLabel, keyLabelW,
});
function helpPageFor() { return scene === 'tavern' ? 'tavern' : scene === 'map' || scene === 'title' ? 'map' : scene === 'alchemy' ? 'alchemy' : 'stage'; }
/* pointer + touch input (touch.ts): tap regions, mouse combat / station clicks, the phone pad */
function btn(id: string, x: number, y: number, w: number, h: number) { touch.btn(id, x, y, w, h); }
const touch = createTouch({
  cv, W, H, ranking, stage, tavern, STATIONS, tr, helpPageFor,
  get LANG() { return lang.LANG; },
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
function update(dt: number) {
  if (pressed['help']) { help = help ? null : helpPageFor(); }
  else if (help) { if (pressed['ok'] || pressed['click'] || pressed['atk'] || pressed['pause']) help = null; }
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
  get LANG() { return lang.LANG; },
  get scene() { return scene; },
  get help() { return help; },
  get TOUCH_DEV() { return TOUCH_DEV; },
  get titlePanel() { return titleScene.panel; },
});
function frame(now: number) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  draw();
  bgmSync();
  tpSync();
  SHARE.sync();
  requestAnimationFrame(frame);
}
window.__tk = { sfxBuf: SFX_BUF, makeEnemy, get help() { return help; }, set help(v) { help = v; }, set scene(v) { scene = v; }, get scene() { return scene; }, get S() { return stage.S; }, get T() { return tavern.T; }, startStage, startTavern, finishStage, endTavern, setLang, NET, titleAct: (i: number) => titleScene.act(i), get results() { return stage.results; }, set T(v: typeof tavern.T) { tavern.T = v; }, set titlePanel(v: typeof titleScene.panel) { titleScene.panel = v; }, set titleSel(v: number) { titleScene.sel = v; }, set rank(v: [number, Parameters<typeof ranking.setBoard>[1]]) { ranking.setBoard(v[0], v[1]); }, step: (n: number) => { for (let i = 0; i < n; i++) update(STEP); draw(); }, press, release, pressed, keys, save: () => save };
(document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve()).then(() => requestAnimationFrame(frame));
}
