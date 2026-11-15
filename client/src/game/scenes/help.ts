// How-to-play overlay drawn over any scene (H key, the help button, or a scene's first visit).
// Split out of legacy-game.ts unchanged.
import { HELP, HELP_TOUCH, type HelpPageId } from '../data/help';
import type { DrawKit, TextOpt } from './host';

export interface HelpHost extends DrawKit {
  readonly THAI: string;
  keyLabel(k: string, cx: number, cy: number, size: number, opt?: TextOpt): void;
  keyLabelW(k: string, size: number, font?: string): number;
}

declare global { interface Window { __TB?: Record<string, string> } }

export function createHelp(g: HelpHost) {
  const { ctx, W, H, THAI, keyLabel, keyLabelW, rect, text, wrapText, panel, uiBtn } = g;
  const HELP_IMG: Record<string, HTMLImageElement> = {};
  function helpIcon(name: string, cx: number, cy: number, d: number) {
    const tb = window.__TB; if (!tb) return false;
    const get = (k: string) => { if (!tb[k]) return null; if (!HELP_IMG[k]) { HELP_IMG[k] = new Image(); HELP_IMG[k].src = tb[k]; } return HELP_IMG[k].complete && HELP_IMG[k].naturalWidth ? HELP_IMG[k] : null; };
    const smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true;
    if (name === 'stick') { const b = get('base'), k = get('knob'); if (b) ctx.drawImage(b, cx - d / 2, cy - d / 2, d, d); if (k) ctx.drawImage(k, cx - d * 0.22, cy - d * 0.22, d * 0.44, d * 0.44); }
    else { const im = get(name); if (im) ctx.drawImage(im, cx - d / 2, cy - d / 2, d, d); }
    ctx.imageSmoothingEnabled = smooth; return true;
  }
  function drawHelp(page: string) {
    const touch = document.body.classList.contains('tp-on'); const h = (touch ? HELP_TOUCH : HELP)[page as HelpPageId]; if (!h) return;
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
  return { draw: drawHelp };
}
