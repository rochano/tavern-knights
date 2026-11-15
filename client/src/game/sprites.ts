// @ts-nocheck -- moved out of legacy-game.ts unchanged; the pixel painters get their types in a follow-up step.
// Sprites and character art: the sprite cache, pixel upscale / shading / outline helpers, the knights (hand-painted
// fallback + hero atlas + hi-res Gemini sheets with gear levels), painted icons and enemies, and the enemy, crew and
// FX art cut from the user's Gemini sheets (loaded here, in the same order as before).
import { CREW_ART_SRC, ENEMY_ART_SRC, FX_ART_SRC, HERO_ATLAS, HERO_ATLAS_SRC, HERO_HI_SRC } from './data/art';
import { clamp } from './util';
import type { SaveData } from './save';
import type { Img } from './scenes/host';

export interface SpritesHost {
  readonly ctx: CanvasRenderingContext2D;
  /** canvas px per world unit */
  readonly RES: number;
  readonly save: SaveData;
  /** the drawing kit, for the sheet-D item icons (read lazily; it is created after the sprites) */
  readonly ui: { readonly UI_ICON: Record<string, Img[] | undefined>; readonly uiArtReady: boolean };
}

export function createSprites(host: SpritesHost) {
  const { ctx, RES } = host;
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
  function gearLook() { return host.save.up.legend ? 5 : 1 + Math.min(3, Math.max(host.save.up.blade || 0, host.save.up.stew || 0)); }
  function gearId(id) { if (!heroHiReady) return id; if (host.save.up.legend && HERO_HI[id + '5_stand']) return id + '5'; for (let l = 1 + Math.min(3, Math.max(host.save.up.blade || 0, host.save.up.stew || 0)); l > 1; l--) if (HERO_HI[id + l + '_stand']) return id + l; return id; }
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
      if (host.ui.uiArtReady && host.ui.UI_ICON[name]) { const src = host.ui.UI_ICON[name][scale > 1 ? 1 : 0]; if (scale === 1 || scale === 2) r = src; else { r = document.createElement('canvas'); r.width = r.height = RES * 8 * scale; const g = r.getContext('2d'); g.drawImage(src, 0, 0, r.width, r.height); r.lw = r.lh = 8 * scale; } }
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

  return {
    spriteCache, KNIGHTS, HERO_HI, ENEMY_ART, CREW_ART, heroAtlas, LW, LH, dimg, flip, recol, tinted, shade, enemyArtFor, enemySprite, thiefSprite,
    fxImg, fxC, fxB, icon, knightHead, knightSprite,
    get heroReady() { return heroReady; },
    get heroHiReady() { return heroHiReady; },
    get enemyArtReady() { return enemyArtReady; },
    get crewArtReady() { return crewArtReady; },
    get fxArtReady() { return fxArtReady; },
  };
}
