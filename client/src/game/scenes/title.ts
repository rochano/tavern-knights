// Title screen: the menu over the title art, plus its Options / Ranking / About / Credits panels, and the
// plain fallback title used before the art loads. Split out of legacy-game.ts unchanged.
import { SFX, VOL, audio, setVol } from '../audio';
import { pressed } from '../input';
import type { Net } from '../net';
import type { DrawKit, GameState, Img, TextOpt } from './host';

export type TitlePanel = 'rank' | 'options' | 'about' | 'credits' | null;

export interface TitleHost extends DrawKit, GameState {
  readonly THAI: string;
  readonly GROUND: number;
  readonly LANG: 'th' | 'en';
  readonly NET: Net;
  readonly KNIGHTS: { th: string; color: string }[];
  readonly ranking: { input(close: () => void): void; draw(): void };
  tr(s: string): string;
  setLang(l: 'th' | 'en'): void;
  toggleMute(): void;
  bgmSync(): void;
  keyLabel(k: string, cx: number, cy: number, size: number, opt?: TextOpt): void;
  uiBig(k: string, cx: number, cy: number, s?: number): boolean;
  drawForestBg(camX: number, t: number): void;
  /** Enter, J or a click/tap this frame */
  anyConfirm(): boolean | undefined;
  goMap(): void;
  startTavernFromTitle(): void;
}

export function createTitle(g: TitleHost) {
  const { ctx, W, H, RES, ENV, GROUND, THAI, KNIGHTS, tr, toggleMute, keyLabel, uiBig, drawForestBg, anyConfirm, rect, glow, text, textC, wrapText, panel, nineBox, uiBtn, btn, dimg, knightSprite, controlStripCustom } = g;
  let titleT = 0;
  const TITLE_MENU = [0, 1, 2, 3, 4, 5].map(i => { const cy = 152.6 + i * 9.7; return [140, cy - 4.6, 260, cy + 4.6]; });
  let titleSel = 0, titlePanel: TitlePanel = null, optSel = 0;
  function titleAct(i: number) {
    g.track('title_menu', { item: ['start', 'ranking', 'options', 'about', 'credits', 'tavern_mode'][i] || i });
    SFX.select();
    if (i === 0) g.goMap();
    else if (i === 1) { titlePanel = 'rank'; g.NET.stale(); }
    else if (i === 2) { titlePanel = 'options'; optSel = 0; }
    else if (i === 3) titlePanel = 'about';
    else if (i === 4) titlePanel = 'credits';
    else g.startTavernFromTitle();
  }
  function updateTitle(dt: number) {
    titleT += dt;
    if (!ENV.title) { if (anyConfirm() && titleT > 0.3) g.goMap(); return; }
    if (titlePanel) {
      if (titlePanel === 'options') {
        if (pressed.up) { optSel = (optSel + 3) % 4; SFX.select(); }
        if (pressed.down) { optSel = (optSel + 1) % 4; SFX.select(); }
        const VK = [null, 'bgm', 'sfx'] as const, adj = (k: number, d: number) => { const v = VK[k as 1 | 2]; setVol(v, VOL[v] + d); g.bgmSync(); SFX.select(); };
        if (optSel > 0 && optSel < 3 && pressed.left) adj(optSel, -1);
        if (optSel > 0 && optSel < 3 && pressed.right) adj(optSel, 1);
        if ((optSel === 3 && (pressed.left || pressed.right || pressed.ok || pressed.atk)) || pressed['ui:opt3']) { optSel = 3; g.setLang(g.LANG === 'th' ? 'en' : 'th'); SFX.select(); }
        if (pressed['ui:opt0']) { optSel = 0; toggleMute(); SFX.select(); }
        for (const k of [1, 2]) { if (pressed['ui:opt' + k + 'm']) { optSel = k; adj(k, -1); } if (pressed['ui:opt' + k + 'p']) { optSel = k; adj(k, 1); } }
        if ((pressed.ok || pressed.atk) && optSel === 0) { toggleMute(); SFX.select(); }
        if (pressed.pause || pressed['ui:close']) titlePanel = null;
      } else if (titlePanel === 'rank') g.ranking.input(() => { titlePanel = null; }); else if (pressed.ok || pressed.atk || pressed.pause || pressed['ui:close']) titlePanel = null;
      return;
    }
    if (pressed.up) { titleSel = (titleSel + 5) % 6; SFX.select(); }
    if (pressed.down) { titleSel = (titleSel + 1) % 6; SFX.select(); }
    for (let i = 0; i < 6; i++) if (pressed['ui:tm' + i]) { titleSel = i; titleAct(i); return; }
    if ((pressed.ok || pressed.atk) && titleT > 0.3) titleAct(titleSel);
  }
  // title words drawn per language over the text-free title art (the painted Thai plate/menu were inpainted out)
  // drawn once into an offscreen canvas per language/selection (cheap per frame on phones); solid colour bands, no gradients or strokeText (broken in some iOS webviews)
  function outlineText(c: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, fills: string | string[], stroke: string, lw: number, weight?: number) {
    c.font = `${weight || 600} ${size}px ${THAI}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    const w = c.measureText(str).width, x0 = x - w / 2, r = lw / 2;
    c.fillStyle = stroke; for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; c.fillText(str, x0 + Math.cos(an) * r, y + Math.sin(an) * r); }
    if (typeof fills === 'string') fills = [fills];
    const n = fills.length, top = y - size * 0.6, band = size * 1.2 / n;
    fills.forEach((f, i) => { c.save(); if (n > 1) { const y0 = i ? top + band * i : y - size * 2, y1 = i === n - 1 ? y + size * 2 : top + band * (i + 1); c.beginPath(); c.rect(x0 - 4, y0, w + 8, y1 - y0); c.clip(); } c.fillStyle = f; c.fillText(str, x0, y); c.restore(); });
  }
  let _twCache: HTMLCanvasElement | null = null, _twKey = '';
  try { document.fonts && document.fonts.addEventListener('loadingdone', () => { _twKey = ''; }); } catch (e) {}
  function drawTitleWords() {
    const en = g.LANG === 'en', key = g.LANG + '|' + (titlePanel ? -1 : titleSel);
    if (key !== _twKey || !_twCache) {
      if (!_twCache) { _twCache = document.createElement('canvas'); _twCache.width = W * RES; _twCache.height = H * RES; }
      const c = _twCache.getContext('2d')!; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, _twCache.width, _twCache.height); c.setTransform(RES, 0, 0, RES, 0, 0);
      const sub = en ? 'Three Tom Yum Knights' : 'สามอัศวินต้มยำกุ้ง';
      let sz = en ? 17 : 21; c.font = `600 ${sz}px ${THAI}`; while (c.measureText(sub).width > 146 && sz > 9) { sz -= 0.5; c.font = `600 ${sz}px ${THAI}`; }
      outlineText(c, sub, 199, en ? 52 : 51, sz, ['#fff0a8', '#ffcf45', '#f0962a'], '#3a1d0c', 3, 600);
      const labels = en ? ['Start Game', 'Ranking', 'Options', 'About', 'Ending / Credits', 'Tavern Mode'] : ['เริ่มเกม', 'อันดับ', 'ตัวเลือก', 'เกี่ยวกับ', 'ฉากจบ / เครดิต', 'โหมดบริหารร้าน'];
      TITLE_MENU.forEach((b, i) => outlineText(c, labels[i], (b[0] + b[2]) / 2, (b[1] + b[3]) / 2 + 0.3, 8.6, i === titleSel && !titlePanel ? '#ffe9a0' : '#f3e6c8', '#1b1020', 2.2, 600));
      outlineText(c, 'v1.0.1 · ' + (en ? 'Developer: ' : 'ผู้พัฒนา: ') + 'Rochano Developer Teams', 330, 204, 6, '#e9dcc0', '#1b1020', 1.8, 400);
      _twKey = key;
    }
    ctx.drawImage(_twCache, 0, 0, W, H);
  }
  function drawTitleMenuScreen() {
    const t = titleT;
    rect(0, 0, W, H, '#0c0a10'); ctx.drawImage((ENV.title_clean || ENV.title)!, 0, 0, W, 223.5);
    if (ENV.title_clean) drawTitleWords();
    TITLE_MENU.forEach((b, i) => {
      btn('tm' + i, b[0] - 4, b[1] - 1, b[2] - b[0] + 8, b[3] - b[1] + 2);
      if (i !== titleSel || titlePanel) return;
      const bob = Math.sin(t * 8) * 1.5, y = (b[1] + b[3]) / 2;
      ctx.fillStyle = 'rgba(255,210,110,0.16)'; ctx.fillRect(b[0] - 3, b[1], b[2] - b[0] + 6, b[3] - b[1]);
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 0.8; ctx.strokeRect(b[0] - 3, b[1], b[2] - b[0] + 6, b[3] - b[1]);
      const px = b[0] - 12 + bob; if (uiBig('pointer', px - 4, y, 0.85)) return; ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.moveTo(px - 1, y - 5); ctx.lineTo(px + 8, y); ctx.lineTo(px - 1, y + 5); ctx.fill();
      ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.moveTo(px, y - 3.5); ctx.lineTo(px + 6, y); ctx.lineTo(px, y + 3.5); ctx.fill();
    });
    if (titlePanel) {
      rect(0, 0, W, H, '#05050af4'); if (!nineBox('dialog', 64, 28, 272, 162, 16, 9)) panel(70, 34, 260, 150, '#1b120cf4', '#f2a93b');
      btn('close', 70, 34, 260, titlePanel === 'options' || titlePanel === 'rank' ? 20 : 150);
      if (titlePanel === 'options') {
        text('ตัวเลือก (Options)', W / 2, 40, { size: 11, align: 'center', thai: true, color: '#f2a93b', weight: 600 });
        const rows: [string, string | number][] = [['เสียงทั้งหมด (M)', audio.muted ? 'ปิด' : 'เปิด'], ['เพลง (BGM)', VOL.bgm], ['เอฟเฟกต์เสียง (SFX)', VOL.sfx], ['ภาษา (Language)', g.LANG === 'th' ? 'ไทย' : 'English']];
        rows.forEach((r, k) => { const y = 60 + k * 24; uiBtn(90, y - 4, 220, 22, k === optSel, '#5a3a22', '#2a1a10', '#5a3a22', '#2a1a10'); textC(r[0], 100, y + 7, { size: 9, thai: true, color: '#f6ead2' });
          if (k === 3) { btn('opt3', 90, y - 4, 220, 22); ctx.font = `700 9px ${THAI}`; const ah = Math.max(24, ctx.measureText(tr(String(r[1]))).width / 2 + 10); keyLabel('←', 268 - ah, y + 7, 9, { color: '#ffd76a' }); textC(String(r[1]), 268, y + 7, { size: 9, thai: true, align: 'center', color: '#ffd76a', weight: 700 }); keyLabel('→', 268 + ah, y + 7, 9, { color: '#ffd76a' }); }
          else if (k === 0) { btn('opt0', 90, y - 4, 220, 22); textC(String(r[1]), 296.5, y + 7, { size: 9, thai: true, align: 'right', color: r[1] === 'เปิด' ? '#9be15d' : '#ff8a7a', weight: 700 }); }
          else { btn('opt' + k + 'm', 230, y - 4, 34, 22); btn('opt' + k + 'p', 266, y - 4, 44, 22); keyLabel('←', 244, y + 7, 9, { color: (r[1] as number) > 0 ? '#ffd76a' : '#6a5a4a' }); textC(String(r[1]), 268, y + 7, { size: 9, align: 'center', weight: 700, color: r[1] ? '#f6ead2' : '#ff8a7a' }); keyLabel('→', 292, y + 7, 9, { color: (r[1] as number) < 10 ? '#ffd76a' : '#6a5a4a' }); } });
        text('ล้างเซฟได้จากปุ่ม "ล้างเซฟ" ด้านบนเกม', W / 2, 158, { size: 7, align: 'center', thai: true, color: '#bba8ba', weight: 400 });
        text('ขึ้น/ลง เลือก · ซ้าย/ขวา ปรับ · Enter เปิด/ปิด · Esc ปิด', W / 2, 170, { size: 7, align: 'center', thai: true, color: '#ffd76a', weight: 400 });
      } else if (titlePanel === 'rank') g.ranking.draw();
      else if (titlePanel === 'about') {
        text('เกี่ยวกับ (About)', W / 2, 40, { size: 11, align: 'center', thai: true, color: '#f2a93b', weight: 600 });
        wrapText('อัศวินตกอับสามคนเปิดร้าน The Tipsy Dragon บังหน้า กลางวันลุยดันเจี้ยนล่าวัตถุดิบหายากจากบอส กลางคืนเปิดร้านทำต้มยำกุ้งเลี้ยงลูกค้า แล้วนำของที่ได้ไปปรุงยาและตีอาวุธ เพื่อสู้กับกลุ่ม Obsidian Syndicate', 84, 62, 232, 11, { size: 8, thai: true, weight: 400, color: '#f6ead2' });
        wrapText('เวอร์ชันต้นแบบนี้มี: ด่าน 1 ป่าเห็ดพิษ + บอสราชาเห็ด, กะกลางคืนในร้าน, ห้องปรุงยา/ตีเหล็ก และแผนที่โลก', 84, 128, 232, 10, { size: 7, thai: true, weight: 400, color: '#bfe8ff' });
        text('กด Enter / แตะ เพื่อปิด', W / 2, 168, { size: 7, align: 'center', thai: true, color: '#ffd76a', weight: 400 });
      } else {
        text('ฉากจบ / เครดิต', W / 2, 40, { size: 11, align: 'center', thai: true, color: '#f2a93b', weight: 600 });
        text('ฉากจบ', W / 2, 60, { size: 9, align: 'center', thai: true, color: '#ffd76a' });
        wrapText(g.save.runs ? 'คุณชนะราชาเห็ดมาแล้ว ' + g.save.runs + ' รอบ ฉากจบจะปลดล็อกเมื่อปราบ Archmage Malacor ที่ด่าน 6 (ยังไม่มีในต้นแบบนี้)' : 'ฉากจบจะปลดล็อกเมื่อปราบ Archmage Malacor ที่ด่าน 6 (ยังไม่มีในต้นแบบนี้)', 84, 74, 232, 10, { size: 7.5, thai: true, weight: 400, color: '#f6ead2' });
        text('เครดิต', W / 2, 104, { size: 9, align: 'center', thai: true, color: '#ffd76a' });
        text('ทีมพัฒนา: Rochano Developer Teams', W / 2, 118, { size: 8, align: 'center', thai: true, color: '#f6ead2', weight: 400 });
        text('ออกแบบเกม ตัวละคร และฉาก: Rochano Developer Teams', W / 2, 131, { size: 7.5, align: 'center', thai: true, color: '#cfc0b0', weight: 400 });
        text('ต้นแบบที่เล่นได้: สร้างร่วมกับ Claude', W / 2, 144, { size: 7.5, align: 'center', thai: true, color: '#cfc0b0', weight: 400 });
        text('กด Enter / แตะ เพื่อปิด', W / 2, 168, { size: 7, align: 'center', thai: true, color: '#ffd76a', weight: 400 });
      }
    }
    controlStripCustom(titlePanel === 'rank' ? [['← →', 'ตาราง'], ['↑ ↓', 'ช่วงเวลา'], ['N', 'เปลี่ยนชื่อ'], ['Esc', '\u200bปิด']] : titlePanel ? [['Enter', 'ตกลง'], ['Esc', '\u200bปิด'], ['M', 'เสียง']] : [['↑ ↓', 'เลือกเมนู'], ['Enter / J', 'ตกลง'], ['H', 'วิธีเล่น'], ['M', 'เสียง']]);
  }
  function drawTitle() {
    if (ENV.title) { drawTitleMenuScreen(); return; }
    const t = titleT;
    drawForestBg(t * 20, t);
    rect(0, GROUND, W, H - GROUND, '#1a2a20'); rect(0, GROUND, W, 3, '#3cbf5a');
    // tavern on the right
    const tx = 262;
    rect(tx, 96, 128, 94, '#4a2e1e'); for (let y = 100; y < 190; y += 8) rect(tx, y, 128, 0.5, '#3a2416');
    ctx.fillStyle = '#7a2a1a'; ctx.beginPath(); ctx.moveTo(tx - 10, 98); ctx.lineTo(tx + 64, 54); ctx.lineTo(tx + 138, 98); ctx.fill();
    rect(tx + 90, 64, 10, 22, '#3a2416');
    for (let k = 0; k < 4; k++) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#cfd8d0'; ctx.beginPath(); ctx.arc(tx + 95 + Math.sin(t * 2 + k) * 3, 58 - ((t * 10 + k * 7) % 28), 3 + k * 0.6, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
    [[tx + 14, 120], [tx + 44, 120], [tx + 96, 120]].forEach(([x, y]) => { glow(x + 8, y + 7, 22, 'rgba(255,190,90,A)', 0.4); rect(x, y, 16, 14, '#1b1020'); rect(x + 1, y + 1, 14, 12, '#f2b14a'); rect(x + 7.5, y + 1, 1, 12, '#1b1020'); });
    rect(tx + 70, 148, 20, 42, '#1b1020'); rect(tx + 71, 149, 18, 41, '#5a3a22'); rect(tx + 85, 168, 2, 2, '#f2c94c');
    panel(tx + 22, 100, 84, 14, '#5a3a22', '#f2a93b'); text('THE TIPSY DRAGON', tx + 64, 102.5, { size: 7, align: 'center', color: '#ffd76a', weight: 700 });
    // logo
    rect(0, 14, 250, 92, '#05141a99');
    text('TAVERN KNIGHTS', 16, 18, { size: 30, color: '#f2a93b', weight: 700, shadowColor: '#5a1a10' });
    text('สามอัศวินต้มยำกุ้ง', 18, 52, { size: 18, color: '#f6ead2', thai: true, weight: 600 });
    text('พระสหาย · สาวใช้ · จอมขมังเวทย์ ผู้กอบกู้ร้านเหล้า', 18, 80, { size: 8, color: '#bfe8ff', thai: true, weight: 400 });
    // knights
    for (let i = 0; i < 3; i++) {
      const hop = Math.floor(t * 3 + i * 1.3) % 5 === 0;
      const spr = knightSprite(i, hop ? 'jump' : 'stand').r; const x = 40 + i * 64;
      ctx.fillStyle = '#00000044'; ctx.beginPath(); ctx.ellipse(x + 18, GROUND, 14, 3, 0, 0, 7); ctx.fill();
      dimg(spr, x, GROUND - 44 - (hop ? 6 : 0));
      text(KNIGHTS[i].th, x + 18, GROUND + 6, { size: 8, align: 'center', thai: true, color: KNIGHTS[i].color });
    }
    if (Math.floor(t * 2) % 2 === 0) text('คลิก / แตะ / กด Enter เพื่อเริ่ม', 18, 116, { size: 11, color: '#ffd76a', thai: true, weight: 600 });
    text('กด H หรือปุ่ม "วิธีเล่น" เพื่อดูปุ่มบังคับ', 18, 132, { size: 8, color: '#cfe0e4', thai: true, weight: 400 });
    if (g.save.runs) text('เซฟ: ' + g.save.gold + 'g · เล่นแล้ว ' + g.save.runs + ' รอบ', 18, 144, { size: 7, color: '#8a9aa0', thai: true, weight: 400 });
    controlStripCustom([['Enter / J', 'เริ่ม'], ['H', 'วิธีเล่น'], ['M', 'เปิด/ปิดเสียง']]);
  }
  return {
    act: titleAct,
    update: updateTitle,
    draw: drawTitle,
    /** the open panel over the title menu */
    get panel() { return titlePanel; },
    set panel(v: TitlePanel) { titlePanel = v; },
    /** highlighted menu row (test hook) */
    set sel(v: number) { titleSel = v; },
  };
}
