// Language: Thai is the source text everywhere; tr() turns it into English when the game runs in English.
// createLang patches the canvas fillText/measureText so every string drawn goes through tr() (and the
// touch wording when the phone pad is on), and swaps the Thai text in the page's own DOM too.
// It also holds track(), since every analytics event carries the current language.

import { I18N_EN, TOUCH_TXT } from './i18n/en';

export type Lang = 'th' | 'en';

declare global {
  interface Window {
    __trMiss?: Set<string>;
    __track?: [string, Record<string, unknown>][];
    gtag?: (cmd: 'event', name: string, params: Record<string, unknown>) => void;
    gstats?: { __ready?: boolean; capture(name: string, params: Record<string, unknown>): void };
  }
}

export interface LangHost {
  readonly ctx: CanvasRenderingContext2D;
  /** Whether the phone pad is on, so hints say tap instead of key names. */
  readonly tpOnTxt: boolean;
  /** Runs after setLang so DOM buttons with game-made labels can relabel. */
  onLangChange(): void;
}

export function createLang(host: LangHost) {
  const { ctx } = host;
  let LANG: Lang = (() => { try { const q = new URLSearchParams(location.search).get('lang'); if (q) return q === 'en' ? 'en' : 'th'; const v = localStorage.getItem('tk-lang'); if (v === 'en' || v === 'th') return v; } catch (e) {} return /^th/i.test(navigator.language || 'th') ? 'th' : 'en'; })();
  const _TH = /[฀-๿]/, _trC = new Map<string, string>(); let _trF: string[] | null = null;
  function tr<T>(s: T): T;
  function tr(s: unknown): unknown {
    if (LANG === 'th' || typeof s !== 'string' || !_TH.test(s) || s === 'กานม' || s.charCodeAt(0) === 0x2060) return s;
    let r = _trC.get(s); if (r !== undefined) return r;
    r = I18N_EN[s];
    if (r === undefined) { const nums: string[] = [], k = s.replace(/\d+/g, m => (nums.push(m), '#')), t = I18N_EN[k]; if (t !== undefined) { let i = 0; r = t.replace(/#/g, () => nums[i++]); } }
    if (r === undefined) { if (!_trF) _trF = Object.keys(I18N_EN).filter(k => !k.includes('#')).sort((a, b) => b.length - a.length); r = s; for (const f of _trF) if (r.includes(f)) r = r.split(f).join(I18N_EN[f]); if (_TH.test(r)) (window.__trMiss = window.__trMiss || new Set()).add(s); }
    _trC.set(s, r); return r;
  }
  function touchT(s: string): string { if (!host.tpOnTxt || typeof s !== 'string') return s; const r = TOUCH_TXT[s]; if (r !== undefined) return r; return s.startsWith('J/คลิก: ') ? 'แตะ: ' + s.slice(8) : s; }
  { const ft = ctx.fillText.bind(ctx), mt = ctx.measureText.bind(ctx);
    // align by hand: some mobile in-app browsers (iOS Facebook/LINE webviews) ignore canvas textAlign, which left-aligned centred menus
    ctx.fillText = (s: string, x: number, y: number, m?: number) => { const t = tr(touchT(s)), a = ctx.textAlign;
      if (a === 'center' || a === 'right' || a === 'end') { let w = mt(t).width; if (m !== undefined) w = Math.min(w, m); ctx.textAlign = 'left'; x -= a === 'center' ? w / 2 : w; if (m === undefined) ft(t, x, y); else ft(t, x, y, m); ctx.textAlign = a; return; }
      if (m === undefined) ft(t, x, y); else ft(t, x, y, m); };
    ctx.measureText = (s: string) => mt(tr(touchT(s))); }
  const _domTh = new WeakMap<Node, string>();
  function applyLangDom() {
    document.documentElement.lang = LANG;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n: Node | null;
    while ((n = w.nextNode())) { if (n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) continue; if (!_domTh.has(n)) { if (!_TH.test(n.nodeValue!)) continue; _domTh.set(n, n.nodeValue!); } const o = _domTh.get(n)!; n.nodeValue = LANG === 'th' ? o : tr(o.trim()) === o.trim() ? o : o.replace(o.trim(), tr(o.trim())); }
  }
  // analytics: sends game events to Google Analytics (gtag) and gstats when loaded; events before gstats loads are replayed from __track
  function track(name: string, params?: Record<string, unknown>) { try { const p = Object.assign({ lang: LANG }, params || {}); if (window.gtag) window.gtag('event', name, p); if (window.gstats && window.gstats.__ready) window.gstats.capture(name, p); (window.__track = window.__track || []).push([name, p]); } catch (e) {} }
  function setLang(l: Lang) { if (l !== LANG) track('language_change', { to: l }); LANG = l; _trC.clear(); try { localStorage.setItem('tk-lang', l); } catch (e) {} applyLangDom(); host.onLangChange(); }
  return { get LANG() { return LANG; }, tr, touchT, applyLangDom, track, setLang };
}
