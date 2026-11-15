// Canvas drawing kit shared by every scene: UI frames cut from the user's Gemini sheet D (loaded here),
// pixel-exact 9-slices, text, buttons, panels, bars, glow, key labels and the keyboard control strip.
// Split out of legacy-game.ts unchanged.
import { UI_ART_SRC } from './data/art';
import { clamp } from './util';
import type { Img, TextOpt } from './scenes/host';

/** crisp UI frames (sheet D, 1 art pixel each); also used for the rotate-phone box in the page */
export const PXF_SRC: Record<string, string> = {"frame_dark": "art/ee9f33c9cd83.webp", "frame_blue": "art/73185bb01f97.webp", "dialog": "art/181d43739390.webp", "e6_btn_n": "art/99b0ba4aeb21.webp", "e6_btn_s": "art/21f3017ae152.webp", "e6_btn_d": "art/7bd29faefd84.webp", "e6_window": "art/b1560977b03e.webp"};

/** A sheet-D frame re-sampled to its pixel grid, with its 9-slice borders in art pixels. */
type PxImg = HTMLImageElement & { T: number; B: number; L: number; R: number };
type KeyOpt = TextOpt;

export interface DrawOpts {
  readonly ctx: CanvasRenderingContext2D;
  readonly W: number;
  /** canvas px per world unit */
  readonly RES: number;
  readonly FONT: string;
  readonly THAI: string;
  readonly scene: string;
  tr(s: string): string;
  /** runs once every UI icon and frame has loaded */
  onUiReady(): void;
}

export function createDraw(o: DrawOpts) {
  const { ctx, W, RES, FONT, THAI, tr } = o;
  const LW = (c: Img) => c.lw || c.width, LH = (c: Img) => c.lh || c.height;
  const UI_ICON: Record<string, Img[] | undefined> = {}, UI_BIG: Partial<Record<'dialog' | 'frame_dark' | 'frame_blue', Img>> & Record<string, Img | undefined> = {}; let uiArtReady = false;
  (() => {
    const mk = (srcUri: string, done: (c: Img) => void) => { const im = new Image(); im.onload = () => { const c: Img = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d')!.drawImage(im, 0, 0); c.lw = im.width / RES; c.lh = im.height / RES; done(c); }; im.src = srcUri; };
    const ik = Object.keys(UI_ART_SRC.icons), bk = Object.keys(UI_ART_SRC.big); let n = ik.length * 2 + bk.length;
    const fin = () => { if (--n === 0) { uiArtReady = true; o.onUiReady(); } };
    ik.forEach(k => { UI_ICON[k] = []; UI_ART_SRC.icons[k].forEach((u, i) => mk(u, c => { UI_ICON[k]![i] = c; fin(); })); });
    bk.forEach(k => mk(UI_ART_SRC.big[k], c => { UI_BIG[k] = c; fin(); }));
  })();
  function uiIcon(k: string, cx: number, cy: number, size: number) { const a = UI_ICON[k]; if (!uiArtReady || !a) return false; const im = size > 10 ? a[1] : a[0]; ctx.drawImage(im, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size); return true; }
  function uiBig(k: string, cx: number, cy: number, s = 1) { const im = UI_BIG[k]; if (!uiArtReady || !im) return false; const w = LW(im) * s, h = LH(im) * s; ctx.drawImage(im, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h); return true; }
  const PXF: Partial<Record<'frame_dark' | 'frame_blue' | 'dialog' | 'e6_window', PxImg>> & Record<string, PxImg | undefined> = {};
  for (const k in PXF_SRC) { const im = new Image() as PxImg; im.onload = () => { const H = im.height, mid = 3; im.T = Math.floor((H - mid) / 2); im.B = H - mid - im.T; im.L = im.R = k === 'dialog' ? 11 : 8; if (k === 'dialog') im.T = im.B = 11; if (k.startsWith('e6_btn')) { im.L = im.R = 10; im.T = 6; im.B = 6; } if (k === 'e6_window') { im.L = im.R = 20; im.T = im.B = 22; } PXF[k] = im; }; im.src = PXF_SRC[k]; }
  const pxFor = (im: Img) => im === UI_BIG.frame_dark ? PXF.frame_dark : im === UI_BIG.frame_blue ? PXF.frame_blue : im === UI_BIG.dialog ? PXF.dialog : null;
  function pxSlice(p: PxImg, x: number, y: number, w: number, h: number, u: number) {
    const sn = (v: number) => Math.round(v * RES) / RES; x = sn(x); y = sn(y); w = sn(w); h = sn(h);
    const uh = Math.min(u, w / (p.L + p.R), h / (p.T + p.B)), uq = Math.max(1, Math.floor(uh * RES)) / RES;
    const sx = [0, p.L, p.width - p.R, p.width], sy = [0, p.T, p.height - p.B, p.height];
    const dx = [x, x + p.L * uq, x + w - p.R * uq, x + w], dy = [y, y + p.T * uq, y + h - p.B * uq, y + h];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const dw = dx[i + 1] - dx[i], dh = dy[j + 1] - dy[j]; if (dw > 0 && dh > 0) ctx.drawImage(p, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dw, dh); }
    return uq;
  }
  function pxUnit(h: number) { return h >= 14 ? 1 : h >= 10.5 ? 0.75 : 0.5; }
  function slice3(im: Img, x: number, y: number, w: number, h: number, cap: number) {
    const p = pxFor(im); if (p) { pxSlice(p, x, y, w, h, pxUnit(h)); return; } const k = h / im.height, c = cap * k, sw = im.width; ctx.drawImage(im, 0, 0, cap, im.height, x, y, c, h); ctx.drawImage(im, cap, 0, sw - 2 * cap, im.height, x + c, y, w - 2 * c, h); ctx.drawImage(im, sw - cap, 0, cap, im.height, x + w - c, y, c, h); }
  function frameBar(k: string, x: number, y: number, w: number, h: number, frac: number, col: string, hi?: string) {
    const im = UI_BIG[k]; if (!uiArtReady || !im) return false;
    const p = pxFor(im); let ix, iy, iw, ih; const f = clamp(frac, 0, 1);
    if (p) { const u = pxSlice(p, x, y, w, h, pxUnit(h)); ix = x + 7 * u; iy = y + 4 * u; iw = w - 14 * u; ih = h - 8 * u; }
    else { slice3(im, x, y, w, h, 22 * im.height / 40); const q = h / 40; ix = x + 12 * q; iy = y + 8.5 * q; iw = w - 24 * q; ih = h - 17 * q; }
    rect(ix, iy, iw * f, ih, col); if (hi) rect(ix, iy, iw * f, Math.max(1, ih * 0.3), hi);
    return { ix, iy, iw, ih };
  }
  function nineBox(k: string, x: number, y: number, w: number, h: number, b = 16, d = 6) {
    const im = UI_BIG[k]; if (!uiArtReady || !im) return false;
    if (k === 'dialog' && PXF.e6_window) { pxSlice(PXF.e6_window, x, y, w, h, h >= 150 ? 0.75 : 0.5); return true; }
    const pp = pxFor(im); if (pp) { pxSlice(pp, x, y, w, h, h >= 60 ? 1.25 : 1); return true; }
    b = b * im.height / 96; const sw = im.width, sh = im.height, sx = [0, b, sw - b, sw], sy = [0, b, sh - b, sh], dx = [x, x + d, x + w - d, x + w], dy = [y, y + d, y + h - d, y + h];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ctx.drawImage(im, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]);
    return true;
  }
  const hp = (v: number) => Math.round(v * RES) / RES;
  function rect(x: number, y: number, w: number, h: number, c: string) { ctx.fillStyle = c; ctx.fillRect(hp(x), hp(y), hp(w), hp(h)); }
  function text(str: string, x: number, y: number, opt: TextOpt = {}) {
    ctx.font = `${opt.weight || 600} ${opt.size || 10}px ${opt.thai ? THAI : FONT}`;
    ctx.textAlign = opt.align || 'left'; ctx.textBaseline = opt.base || 'top';
    if (opt.shadow !== false) { ctx.fillStyle = opt.shadowColor || '#1b1020'; ctx.fillText(str, hp(x) + 0.5, hp(y) + 0.5); }
    ctx.fillStyle = opt.color || '#f6ead2'; ctx.fillText(str, hp(x), hp(y));
  }
  // text whose visual middle (cap height for Latin/digits, consonant body for Thai) sits exactly on cy, so it lines up with icons and bars
  const _midCache: Record<string, number> = {};
  function textC(str: string, x: number, cy: number, opt: TextOpt = {}) {
    const size = opt.size || 10, font = `${opt.weight || 600} ${size}px ${opt.thai ? THAI : FONT}`, key = font;
    if (_midCache[key] === undefined) { ctx.font = font; ctx.textBaseline = 'alphabetic'; const m = ctx.measureText(opt.thai ? 'กานม' : 'H08x'); _midCache[key] = m.actualBoundingBoxAscent / 2; }
    text(str, x, cy + _midCache[key], Object.assign({}, opt, { base: 'alphabetic' }));
  }
  function uiBtn(x: number, y: number, w: number, h: number, on: boolean | 'off', c1?: string, c2?: string, c3?: string, c4?: string) {
    const e6 = PXF[on === 'off' ? 'e6_btn_d' : on ? 'e6_btn_s' : 'e6_btn_n']; if (e6) { pxSlice(e6, x, y, w, h, clamp(Math.round(h / 25 * RES) / RES, 0.5, 1)); return; }
    const im = uiArtReady && UI_BIG[on ? 'frame_blue' : 'frame_dark'];
    if (im) { let cap = 22 * im.height / 40; const k = h / im.height; if (2 * cap * k > w - 1) cap = (w - 1) / 2 / k; slice3(im, x, y, w, h, cap); return; }
    rect(x, y, w, h, (on ? c1 : c2) as string); rect(x + 0.5, y + 0.5, w - 1, h - 1, (on ? c3 : c4) as string);
  }
  function panel(x: number, y: number, w: number, h: number, fill = '#221727ee', edge = '#f2a93b') {
    if (uiArtReady && UI_BIG.dialog) { if (h >= 24) { nineBox('dialog', x - 1, y - 1, w + 2, h + 2, 16, Math.min(7, h / 3)); return; } uiBtn(x, y, w, h, false); return; }
    rect(x, y, w, h, edge); rect(x + 1, y + 1, w - 2, h - 2, '#1b1020'); rect(x + 2, y + 2, w - 4, h - 4, fill); }
  function bar(x: number, y: number, w: number, h: number, frac: number, col: string, back = '#1b1020') { rect(x, y, w, h, '#1b1020'); rect(x + 1, y + 1, w - 2, h - 2, back); rect(x + 1, y + 1, Math.max(0, (w - 2) * clamp(frac, 0, 1)), h - 2, col); }
  function glow(x: number, y: number, r: number, col: string, a = 0.5) { const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', String(a))); gr.addColorStop(1, col.replace('A', String(0))); ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  function shroom(x: number, baseY: number, h: number, capW: number, capH: number, stem: string, cap: string, under: string, spots: string | null, glowCol?: string | null) {
    ctx.fillStyle = stem; ctx.beginPath(); ctx.moveTo(x - capW * 0.1, baseY); ctx.quadraticCurveTo(x - capW * 0.02, baseY - h * 0.5, x - capW * 0.08, baseY - h); ctx.lineTo(x + capW * 0.08, baseY - h); ctx.quadraticCurveTo(x + capW * 0.16, baseY - h * 0.5, x + capW * 0.11, baseY); ctx.fill();
    if (glowCol) glow(x, baseY - h, capW * 0.9, glowCol, 0.28);
    ctx.fillStyle = under; ctx.beginPath(); ctx.ellipse(x, baseY - h + 1, capW / 2, capH * 0.35, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = cap; ctx.beginPath(); ctx.ellipse(x, baseY - h, capW / 2, capH, 0, Math.PI, 0); ctx.quadraticCurveTo(x, baseY - h + capH * 0.3, x - capW / 2, baseY - h); ctx.fill();
    if (spots) { ctx.fillStyle = spots; for (let k = 0; k < 4; k++) { const a = Math.PI + 0.5 + k * 0.6; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * capW * 0.32, baseY - h + Math.sin(a) * capH * 0.55, capW * 0.06, capH * 0.12, 0, 0, 7); ctx.fill(); } }
  }
  /* Environment art cut from the user's environment sheet (grid lines removed, backgrounds keyed out). */
  function outlined(str: string, x: number, y: number, size: number, col: string) {
    ctx.font = `700 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#1b1020';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) ctx.fillText(str, x + dx * 0.8, y + dy * 0.8);
    ctx.fillStyle = col; ctx.fillText(str, x, y); ctx.fillStyle = '#ffffff55'; ctx.fillText(str, x - 0.3, y - 0.4);
  }
  function wrapText(str: string, x: number, y: number, maxW: number, lh: number, opt: TextOpt) {
    str = tr(str);
    ctx.font = `${opt.weight || 600} ${opt.size || 10}px ${opt.thai ? THAI : FONT}`;
    let words = str.split(' '), line = '', yy = y;
    if (window.Intl && Intl.Segmenter) { const sg = new Intl.Segmenter('th', { granularity: 'word' }); words = words.flatMap((w, i) => { const parts = ctx.measureText(w).width > maxW ? [...sg.segment(w)].map(p => p.segment) : [w]; return i ? ['\u0001' + parts[0], ...parts.slice(1)] : parts; }); }
    for (let w of words) { let sep = ''; if (w[0] === '\u0001') { sep = ' '; w = w.slice(1); } else if (!window.Intl || !Intl.Segmenter) sep = ' '; const test = line ? line + sep + w : w; if (ctx.measureText(test).width > maxW && line) { text(line, x, yy, opt); line = w; yy += lh; } else line = test; }
    if (line) text(line, x, yy, opt);
    return yy + lh;
  }
  /* key labels: arrow glyphs use the bold Thai UI font (the pixel font draws them hairline-thin) */
  const KEY_AR: Record<string, string> = { '←': 'ar_left', '→': 'ar_right', '↑': 'ar_up', '↓': 'ar_down' };
  function keyToks(k: string) { return k.split(/([←→↑↓])/).filter(t => t && t !== ' '); }
  function keyLabelW(k: string, size: number, font?: string) { ctx.font = `700 ${size}px ${font || FONT}`; const ts = keyToks(k); return ts.reduce((w, t, i) => w + (KEY_AR[t] ? size * 0.95 : (ctx.font = `700 ${size}px ${font || FONT}`, ctx.measureText(t).width)) + (i ? size * 0.25 : 0), 0); }
  function keyLabel(k: string, cx: number, cy: number, size: number, opt?: KeyOpt) {
    const ts = keyToks(k); if (ts.length === 1 && !KEY_AR[ts[0]]) { textC(k, cx, cy, Object.assign({ size, align: 'center', weight: 700 }, opt)); return; }
    const font = opt && opt.thai ? THAI : FONT; let x = cx - keyLabelW(k, size, font) / 2;
    ts.forEach((t, i) => { if (i) x += size * 0.25; if (KEY_AR[t]) { const w = size * 0.95, rot = ({ '↑': 0, '→': Math.PI / 2, '↓': Math.PI, '←': -Math.PI / 2 } as Record<string, number>)[t]; ctx.save(); ctx.translate(x + w / 2, cy); ctx.rotate(rot); textC('↑', 0, 0, Object.assign({ size: size * 1.2, align: 'center', weight: 700 }, opt, { thai: true })); ctx.restore(); x += w; } else { ctx.font = `700 ${size}px ${font}`; const w = ctx.measureText(t).width; textC(t.trim(), x + w / 2, cy, Object.assign({ size, align: 'center', weight: 700 }, opt)); x += w; } });
  }
  function controlStrip() { controlStripCustom(null); }
  function controlStripCustom(custom: [string, string][] | null) {
    if (document.body.classList.contains('tp-on')) return;
    if (!(uiArtReady && UI_BIG.frame_dark && (slice3(UI_BIG.frame_dark, -6, 212, W + 12, 13, 44), true))) rect(0, 213, W, 12, '#05080cd8');
    const items = custom ? custom : o.scene === 'tavern'
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


  return {
    UI_ICON, UI_BIG, PXF, get uiArtReady() { return uiArtReady; },
    uiIcon, uiBig, pxSlice, slice3, frameBar, nineBox, hp, rect, text, textC, uiBtn, panel, bar, glow, shroom, outlined, wrapText,
    keyLabelW, keyLabel, controlStrip, controlStripCustom,
  };
}
