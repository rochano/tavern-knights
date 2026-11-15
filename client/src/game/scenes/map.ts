// World map: pick a stage and two crew members, open the alchemy room or the ranking. Split out of
// legacy-game.ts unchanged. STAGES and CREW are shared with the rest of the game through the returned object.
import { SFX } from '../audio';
import { pressed } from '../input';
import type { DrawKit, GameState, Img } from './host';

export interface MapHost extends DrawKit, GameState {
  readonly FULL: boolean;
  readonly FONT: string;
  readonly THAI: string;
  readonly crewArtReady: boolean;
  readonly CREW_ART: Record<string, { l: Img; r?: Img } | undefined>;
  /** touch controls are showing (phones use on-screen Go/Alchemy buttons) */
  readonly tpOnTxt: boolean;
  /** the Ranking panel is open over the map */
  mapRank: boolean;
  hash(i: number): number;
  LW(img: Img): number;
  uiIcon(k: string, cx: number, cy: number, size: number): boolean;
  stage2Open(): boolean;
  startStage(checkpoint: boolean, n: number): void;
  showHelp(page: string): void;
  goAlchemy(): void;
  rankInput(close: () => void): void;
  drawRankPanel(): void;
  rankPrefetch(): void;
  rankStale(): void;
  /** full version only: the shop + advisor panel */
  readonly shop: { readonly open: boolean; enter(): void; update(dt: number): void; draw(): void };
}

export interface StageInfo { n: number; th: string; sh: string; en: string; boss: string; x: number; y: number; readonly open?: boolean }
export interface CrewInfo { id: string; th: string; role: string; readonly open?: boolean }

export function createMap(g: MapHost) {
  const { ctx, W, H, ENV, UI_BIG, FULL, FONT, CREW_ART, rect, glow, text, textC, panel, nineBox, uiBtn, btn, dimg, LH, LW, hash, uiIcon, stage2Open, controlStripCustom } = g;
  let mapSel = 0, mapMsg: { str: string; t: number } | null = null;
  const STAGES: StageInfo[] = [
    { n: 1, th: 'ป่าเห็ดพิษ', sh: 'ป่าเห็ดพิษ', en: 'Poison Mushroom Forest', boss: 'King Shroomba (ราชาเห็ด)', x: 52, y: 138, open: true },
    { n: 2, th: 'ดันเจี้ยนไวน์โบราณ', sh: 'ดันเจี้ยนไวน์', en: 'Ancient Wine Dungeon', boss: 'Baron von Barrel', x: 104, y: 92, get open() { return stage2Open(); } },
    { n: 3, th: 'เหมืองเกลือ & ยอดเขากังหันลม', sh: 'ยอดเขากังหันลม', en: 'Salt Mine & Windmill Peak', boss: 'Gryphon Garum', x: 168, y: 46 },
    { n: 4, th: 'ท่าเรือซากราเคน', sh: 'ท่าเรือคราเคน', en: 'Kraken Wreck Harbor', boss: 'Chef Cthulhu', x: 232, y: 126 },
    { n: 5, th: 'หอคอยกระจกมิติ', sh: 'หอคอยกระจก', en: 'Mirror Dimension Tower', boss: 'Shadow Doppelgänger', x: 292, y: 72 },
    { n: 6, th: 'ปราสาทลอยฟ้าจอมมาร', sh: 'ปราสาทลอยฟ้า', en: 'Sky Castle of Malacor', boss: 'Archmage Malacor & Oven Golem', x: 356, y: 34 },
  ];
  const CREW: CrewInfo[] = [
    { id: 'gorn', th: 'เชฟกอร์น', role: 'ทุบกำแพงร้าว', open: true }, { id: 'bart', th: 'บาร์ตเฒ่า', role: 'ส่งเบียร์ฟื้นพลัง', open: true },
    { id: 'pixie', th: 'พิกซี่', role: 'บินพาขึ้นที่สูง (ด่าน 2)', get open() { return stage2Open(); } }, { id: 'mole', th: 'ตุ่น', role: 'ขุดอุโมงค์ (ด่าน 2)', get open() { return stage2Open(); } },
  ];
  let parchment: HTMLCanvasElement | null = null;
  function makeParchment() {
    const c = document.createElement('canvas'); c.width = 800; c.height = 340; const g = c.getContext('2d')!; // a 2D context on a fresh canvas is never null
    g.fillStyle = '#e6d2a2'; g.fillRect(0, 0, 800, 340);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${120 + hash(i) * 60},${80 + hash(i + 1) * 40},30,${0.04 + hash(i + 2) * 0.06})`; const r = 1 + hash(i + 3) * 10; g.beginPath(); g.arc(hash(i + 4) * 800, hash(i + 5) * 340, r, 0, 7); g.fill(); }
    const v = g.createRadialGradient(400, 170, 120, 400, 170, 460); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(90,50,10,0.55)'); g.fillStyle = v; g.fillRect(0, 0, 800, 340);
    g.scale(2, 2);
    // sea bottom-right
    g.fillStyle = '#9cc4c0'; g.beginPath(); g.moveTo(400, 100); g.quadraticCurveTo(330, 120, 300, 170); g.lineTo(400, 170); g.fill();
    g.strokeStyle = '#6a9a98'; g.lineWidth = 0.8; for (let i = 0; i < 8; i++) { const x = 330 + hash(i) * 60, y = 130 + hash(i + 9) * 34; g.beginPath(); g.arc(x, y, 3, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    // forest
    for (let i = 0; i < 26; i++) { const x = 18 + hash(i + 20) * 70, y = 120 + hash(i + 40) * 40; g.fillStyle = '#4a7a3a'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.fillStyle = '#6a9a4a'; g.beginPath(); g.arc(x - 1, y - 1, 2, 0, 7); g.fill(); }
    // mountains
    for (let i = 0; i < 7; i++) { const x = 130 + i * 14 + hash(i) * 8, y = 64 + hash(i + 3) * 10; g.fillStyle = '#9a8a6a'; g.beginPath(); g.moveTo(x - 10, y + 10); g.lineTo(x, y - 8); g.lineTo(x + 10, y + 10); g.fill(); g.fillStyle = '#f6f0e0'; g.beginPath(); g.moveTo(x - 3, y - 2); g.lineTo(x, y - 8); g.lineTo(x + 3, y - 2); g.fill(); }
    // clouds near sky castle
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(330 + i * 12, 48 + (i % 2) * 4, 10, 4, 0, 0, 7); g.fill(); }
    // title cartouche + compass
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 1; g.strokeRect(4, 4, 392, 162);
    g.fillStyle = '#6a4a2a'; g.font = `700 11px ${FONT}`; g.fillText('AETHELGARD', 12, 18);
    g.save(); g.translate(372, 150); g.strokeStyle = '#6a4a2a'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.stroke(); g.beginPath(); g.moveTo(0, -12); g.lineTo(2, 0); g.lineTo(0, 12); g.lineTo(-2, 0); g.closePath(); g.fillStyle = '#8a2a1a'; g.fill(); g.restore();
    return c;
  }
  function stageIcon(n: number, x: number, y: number) {
    if (n === 1) { ctx.fillStyle = '#a056c9'; ctx.beginPath(); ctx.ellipse(x, y, 7, 4.5, 0, Math.PI, 0); ctx.fill(); rect(x - 2, y, 4, 5, '#efe2c4'); rect(x - 3, y - 3, 1.5, 1.5, '#fff'); rect(x + 2, y - 2, 1.5, 1.5, '#fff'); }
    if (n === 2) { rect(x - 6, y - 5, 12, 10, '#7a4a22'); rect(x - 6, y - 2, 12, 1.5, '#3a2416'); rect(x - 6, y + 2, 12, 1.5, '#3a2416'); }
    if (n === 3) { rect(x - 1, y - 2, 3, 9, '#8a7a6a'); ctx.save(); ctx.translate(x + 0.5, y - 2); ctx.rotate(performance.now() / 600); for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = '#f6f0e0'; ctx.fillRect(0, -1, 7, 2); } ctx.restore(); }
    if (n === 4) { ctx.strokeStyle = '#2a5a5a'; ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - 4 + k * 4, y + 2, 3, Math.PI, 0); ctx.stroke(); } }
    if (n === 5) { rect(x - 3, y - 7, 6, 13, '#7ab8d8'); rect(x - 2, y - 6, 1.5, 11, '#e0f6ff'); ctx.fillStyle = '#4a7a9a'; ctx.beginPath(); ctx.moveTo(x - 4, y - 7); ctx.lineTo(x, y - 12); ctx.lineTo(x + 4, y - 7); ctx.fill(); }
    if (n === 6) { rect(x - 7, y - 3, 14, 7, '#6a5a7a'); rect(x - 7, y - 6, 3, 3, '#6a5a7a'); rect(x + 4, y - 6, 3, 3, '#6a5a7a'); rect(x - 1.5, y - 8, 3, 5, '#6a5a7a'); rect(x - 1, y + 1, 2, 3, '#1b1020'); }
  }
  function crewFace(id: string, x: number, y: number, on: boolean | undefined, small = false) {
    ctx.globalAlpha = on ? 1 : 0.35;
    if (g.uiArtReady && UI_BIG['bust_' + id]) { const bi = UI_BIG['bust_' + id]!; const sz = small ? 16 : 20; ctx.drawImage(bi, x + 7 - sz / 2, y - 2, sz, sz); ctx.globalAlpha = 1; return; }
    if (g.crewArtReady && CREW_ART['face_' + id]) { const fi = CREW_ART['face_' + id]!.l, k = 15 / LH(fi); dimg(fi, x + 7 - LW(fi) * k / 2, y, LW(fi) * k, 15); ctx.globalAlpha = 1; return; }
    if (id === 'gorn') { rect(x, y + 3, 14, 11, '#6aa84f'); rect(x + 1, y - 2, 12, 5, '#f6efe0'); rect(x + 3, y + 6, 2, 2, '#1b1020'); rect(x + 9, y + 6, 2, 2, '#1b1020'); rect(x + 4, y + 11, 1.5, 2, '#fff'); rect(x + 9, y + 11, 1.5, 2, '#fff'); }
    if (id === 'bart') { rect(x + 1, y + 1, 12, 9, '#f0bf8a'); rect(x, y + 8, 14, 7, '#f6f6f6'); rect(x + 1, y, 12, 3, '#d8d8d8'); rect(x + 3, y + 5, 2, 1.5, '#1b1020'); rect(x + 9, y + 5, 2, 1.5, '#1b1020'); }
    if (id === 'pixie') { ctx.fillStyle = '#bfe8ff'; ctx.beginPath(); ctx.ellipse(x + 2, y + 6, 4, 6, -0.4, 0, 7); ctx.ellipse(x + 12, y + 6, 4, 6, 0.4, 0, 7); ctx.fill(); rect(x + 4, y + 2, 6, 7, '#f6d2b0'); rect(x + 4, y + 1, 6, 2, '#ff8ac8'); rect(x + 4, y + 9, 6, 5, '#ff8ac8'); }
    if (id === 'mole') { ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(x + 7, y + 8, 7, 7, 0, 0, 7); ctx.fill(); rect(x + 2, y + 4, 10, 3, '#3a3a44'); rect(x + 3, y + 4.5, 3, 2, '#9fd8ff'); rect(x + 8, y + 4.5, 3, 2, '#9fd8ff'); rect(x + 6, y + 9, 2, 2, '#ff9aa8'); }
    ctx.globalAlpha = 1;
  }
  function crewLabel() { return g.save.crew.map(id => CREW.find(c => c.id === id)!.th).join('/') || '-'; }
  function toggleCrew(i: number) {
    const c = CREW[i]!; if (!c.open) { mapMsg = { str: FULL ? c.th + ' จะเข้าร่วมในด่าน 2' : c.th + ' มีในฉบับเต็ม', t: 1.5 }; SFX.fail(); return; }
    if (g.save.crew.includes(c.id)) g.save.crew = g.save.crew.filter(x => x !== c.id);
    else { if (g.save.crew.length >= 2) g.save.crew.shift(); g.save.crew.push(c.id); }
    g.persist(); SFX.select();
  }
  function updateMap(dt: number) {
    if (g.mapRank) { g.rankInput(() => { g.mapRank = false; }); return; }
    if (FULL && g.shop.open) { g.shop.update(dt); return; }
    if (FULL && (pressed.shop || pressed['ui:mshop'])) { g.shop.enter(); SFX.select(); return; }
    if (pressed.rank || pressed['ui:mrank']) { g.mapRank = true; g.rankStale(); SFX.select(); return; }
    g.rankPrefetch(); /* prefetch so the Ranking panel opens instantly */
    if (pressed.left) { mapSel = Math.max(0, mapSel - 1); SFX.select(); }
    if (pressed.right) { mapSel = Math.min(5, mapSel + 1); SFX.select(); }
    for (let i = 0; i < 6; i++) if (pressed['ui:pin' + i]) { mapSel = i; SFX.select(); }
    ['k1', 'k2', 'k3'].forEach((k, i) => { if (pressed[k]) toggleCrew(i); });
    if (pressed.sup) toggleCrew(3);
    for (let i = 0; i < 4; i++) if (pressed['ui:crew' + i]) toggleCrew(i);
    if (pressed['ui:go']) pressed.ok = true;
    if (pressed['ui:alc'] || pressed.sp) { g.goAlchemy(); return; }
    if (mapMsg) { mapMsg.t -= dt; if (mapMsg.t <= 0) mapMsg = null; }
    if (pressed.ok || pressed.atk) {
      if (!STAGES[mapSel].open) { mapMsg = { str: mapSel === 1 ? (FULL ? 'เคลียร์ด่าน 1 ก่อนนะ' : 'ด่าน 2 มีในฉบับเต็ม') : 'ด่านนี้ยังไม่เปิด (กำลังสร้าง)', t: 1.5 }; SFX.fail(); return; }
      g.startStage(false, STAGES[mapSel].n);
      if (!g.save.seen['stage']) { g.showHelp('stage'); g.save.seen['stage'] = true; g.persist(); }
    }
  }
  /* map route: a curved trail of dots from the tavern through stages 1-6, bent around the map's printed labels */
  const MAP_WAY = [[[106, 64]], [[165, 64]], [[240, 68]], [[244, 86], [190, 98], [160, 122]], [[192, 142], [226, 130]], [[284, 98], [300, 62]]];
  function catmull(pts: number[][], step: number) {
    const out: number[][] = []; const P = [pts[0], ...pts, pts[pts.length - 1]];
    for (let i = 1; i < P.length - 2; i++) { const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      for (let t = 0; t < 1; t += step) { const t2 = t * t, t3 = t2 * t; out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); } }
    out.push(pts[pts.length - 1]); return out;
  }
  /* route markers cut from the user's Gemini card G8 (open = brown ink, locked = faded) */
  const ROUTE_SRC: Record<string, string> = {"dot_on": "art/175a789a72ad.webp", "dot_off": "art/bae8b58087be.webp", "foot_on": "art/97be5adaeba2.webp", "foot_off": "art/c65876c02fe4.webp", "x_on": "art/9015e6ecf9d4.webp"}, ROUTE: Partial<Record<'dot_on' | 'dot_off' | 'foot_on' | 'foot_off' | 'x_on', HTMLImageElement>> & Record<string, HTMLImageElement | undefined> = {};
  for (const k in ROUTE_SRC) { const im = new Image(); im.onload = () => { ROUTE[k] = im; }; im.src = ROUTE_SRC[k]; }
  function drawMapPath() {
    if (ROUTE.foot_on) ctx.drawImage((STAGES[0].open ? ROUTE.foot_on : ROUTE.foot_off)!, 100, 76, 7.5, 7.5);
    let prev = [104, 80];
    STAGES.forEach((st, i) => {
      const pts = catmull([prev, ...MAP_WAY[i], [st.x, st.y]], 0.02), lit = st.open;
      let acc = 0, last = pts[0];
      for (const q of pts) { acc += Math.hypot(q[0] - last[0], q[1] - last[1]); last = q; if (acc < 5) continue; acc = 0;
        if (Math.hypot(q[0] - st.x, q[1] - st.y) < 6 || (i === 0 && Math.hypot(q[0] - 104, q[1] - 80) < 7)) continue;
        const dot = lit ? ROUTE.dot_on : ROUTE.dot_off;
        if (dot) ctx.drawImage(dot, q[0] - 1.75, q[1] - 1.75, 3.5, 3.5);
        else { ctx.globalAlpha = lit ? 1 : 0.45; rect(q[0] - 1.3, q[1] - 1.3, 2.6, 2.6, '#3a1e10'); rect(q[0] - 0.8, q[1] - 0.8, 1.6, 1.6, lit ? '#ffe9a8' : '#e8d8b8'); } }
      ctx.globalAlpha = 1; prev = [st.x, st.y];
    });
  }
  function drawMap() {
    const t = performance.now() / 1000;
    rect(0, 0, W, H, '#2a1a10');
    if (!parchment) parchment = makeParchment();
    if (ENV.map) { rect(0, 0, W, 170, '#2f5f8f'); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, 170); ctx.clip(); ctx.filter = 'blur(6px) brightness(0.55)'; ctx.drawImage(ENV.map, -40, -30, 480, 230); ctx.filter = 'none'; ctx.drawImage(ENV.map, 34.5, -8, 331, 185); ctx.restore(); }
    else dimg(parchment, 0, 0, 400, 170);
    if (!ENV.map) {
    // tavern home
    rect(16, 52, 18, 12, '#8a5a32'); ctx.fillStyle = '#8a2a1a'; ctx.beginPath(); ctx.moveTo(14, 53); ctx.lineTo(25, 44); ctx.lineTo(36, 53); ctx.fill(); rect(23, 58, 4, 6, '#3a2416');
    text('The Tipsy Dragon', 25, 66, { size: 6, align: 'center', color: '#5a3a1a', shadow: false });
    }
    // path
    if (ENV.map) drawMapPath(); else {
    ctx.strokeStyle = '#8a2a1a'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); if (ENV.map) ctx.moveTo(104, 100); else ctx.moveTo(25, 64);
    STAGES.forEach(st => ctx.lineTo(st.x, st.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    STAGES.forEach((st, i) => {
      const rec = g.save.stages[st.n], sel = i === mapSel, bobY = sel ? Math.sin(t * 5) * 1.5 : 0;
      btn('pin' + i, st.x - 14, st.y - 26, 28, 40);
      if (!ENV.map) stageIcon(st.n, st.x, st.y + 6);
      ctx.globalAlpha = st.open ? 1 : g.uiArtReady ? 0.85 : 0.55;
      if (g.uiArtReady) { if (sel) glow(st.x, st.y - 8, 14, 'rgba(255,210,90,A)', 0.5); uiIcon(st.open && sel ? 'flag_gold' : 'flag_red', st.x + 4, st.y - 9 + bobY, 18); text(String(st.n), st.x - 1, st.y - 27 + bobY, { size: 8, align: 'center', weight: 700, color: '#fff' }); }
      else {
      ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.arc(st.x, st.y - 12 + bobY, 7, 0, 7); ctx.fill();
      ctx.fillStyle = st.open ? (sel ? '#f2a93b' : '#c0392b') : '#7a6a5a'; ctx.beginPath(); ctx.arc(st.x, st.y - 12 + bobY, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.moveTo(st.x - 3, st.y - 8 + bobY); ctx.lineTo(st.x, st.y - 2); ctx.lineTo(st.x + 3, st.y - 8 + bobY); ctx.fill();
      text(String(st.n), st.x, st.y - 17 + bobY, { size: 8, align: 'center', weight: 700, shadow: false, color: '#fff' }); }
      ctx.globalAlpha = 1;
      if (!st.open && uiIcon('lock', st.x + 9, st.y - 4, 10)) {} else if (!st.open) { rect(st.x + 4, st.y - 20, 5, 4, '#5a4a3a'); ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(st.x + 6.5, st.y - 20, 1.8, Math.PI, 0); ctx.stroke(); }
      if (rec && g.uiArtReady) { for (let k = 0; k < 3; k++) uiIcon(k < rec.stars ? 'star' : 'star_empty', st.x - 7 + k * 7, st.y + 6, 7); for (let k = 0; k < 2; k++) uiIcon(k < rec.hearts ? 'heart_full' : 'heart_empty', st.x - 3.5 + k * 7, st.y + 13, 6.5); }
      else if (rec) { for (let k = 0; k < 3; k++) text('★', st.x - 8 + k * 6, st.y + 12, { size: 7, color: k < rec.stars ? '#e8a81c' : '#9a8a6a', shadow: false }); for (let k = 0; k < 2; k++) text('♥', st.x - 5 + k * 6, st.y + 19, { size: 6.5, color: k < rec.hearts ? '#c0283a' : '#9a8a6a', shadow: false }); }
      if (ENV.map) text(st.sh, st.x, st.y + (rec ? 20 : 3), { size: 6.5, align: 'center', thai: true, color: sel ? '#ffe9a8' : '#fff4e0' });
    });
    if (ENV.map) text('โรงเตี๊ยม The Tipsy Dragon', 106, 104.5, { size: 6, align: 'center', thai: true, color: '#fff4e0' });
    // info panel
    if (!nineBox('dialog', 3, 171, 394, 42, 16, 7)) panel(4, 172, 392, 40, '#1b120cf2', '#8a5a2e');
    const st = STAGES[mapSel], rec = g.save.stages[st.n];
    /* long names (Thai stage 3, English stages 3-6) shrink so they stop before the crew label at x=160 */
    const title = 'ด่านที่ ' + st.n + ': ' + st.th;
    let tsz = 8.5; ctx.font = `600 ${tsz}px ${g.THAI}`; const tw = ctx.measureText(title).width; if (tw > 136) tsz = Math.max(6.5, tsz * 136 / tw);
    text(title, 12, 177 + (8.5 - tsz) / 2, { size: tsz, thai: true, color: '#f2a93b' });
    text('บอส: ' + st.boss, 12, 189, { size: 6.5, thai: true, color: '#cfc0b0' });
    text(st.open ? (rec ? 'Clear Rank: ' + '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) + '  ความลับ ' + rec.hearts + '/2' : 'ยังไม่เคยเคลียร์') : st.n === 2 ? (FULL ? 'เคลียร์ด่าน 1 ก่อนนะ' : 'มีในฉบับเต็ม · Full version') : 'ยังไม่เปิด · Coming soon', 12, 198, { size: 7, thai: true, color: st.open ? '#ffd76a' : '#8a7a6a' });
    text('ลูกทีม (เลือก 2):', 160, 176, { size: 6.5, thai: true, color: '#bba8ba' });
    CREW.forEach((c, i) => { const x = 160 + i * 34, y = 185, on = g.save.crew.includes(c.id); btn('crew' + i, x - 1, y - 2, 28, 26); uiBtn(x, y - 1, 26, 18, on, '#f2a93b', '#3a2a20', '#140d0a', '#140d0a'); crewFace(c.id, x + 5, y, c.open, true);  textC((i + 1) + ' ' + c.th, x + 13, y + 21, { size: 5.5, align: 'center', thai: true, weight: 400, color: c.open ? '#f6ead2' : '#6a5a4a', shadow: false }); });
    if (!g.tpOnTxt) { /* phones use the on-screen Go/Alchemy buttons instead */
    btn('go', 296, 178, 92, 15); uiBtn(296, 178, 92, 15, !!st.open, '#9be15d', '#3a2a20', '#22381a', '#140d0a');
    textC(st.open ? 'ลุยเลย! (Enter)' : 'ยังไม่เปิด', 342, 185.5, { size: 8, align: 'center', thai: true, color: st.open ? '#d8ffc0' : '#6a5a4a' });
    btn('alc', 296, 195, 92, 13); uiBtn(296, 195, 92, 13, false, '', '#5a3a22', '', '#2a1a10');
    textC('ห้องปรุงยา/ตีเหล็ก', 342, 201.5, { size: 7, align: 'center', thai: true, color: '#ffd7a0' }); }
    if (mapMsg) { panel(110, 140, 180, 16, '#1b120cf2', '#ff8a7a'); text(mapMsg.str, 200, 143, { size: 8, align: 'center', thai: true, color: '#ffb0a0' }); }
    btn('mrank', 366, 5, 32, 17); uiBtn(366, 6, 31, 15, false); textC('อันดับ', 381.5, 13.5, { size: 7, align: 'center', thai: true, color: '#ffd7a0' });
    if (FULL) { btn('mshop', 366, 23, 32, 17); uiBtn(366, 24, 31, 15, false); textC('ร้านค้า', 381.5, 31.5, { size: 7, align: 'center', thai: true, color: '#ffd7a0' }); }
    if (FULL && g.shop.open) { g.shop.draw(); controlStripCustom([['↑ ↓ ← →', 'เลือก'], ['Enter', 'ตกลง'], ['Q E', 'สลับแท็บ'], ['Esc', '\u200bปิด']]); return; }
    if (g.mapRank) {
      rect(0, 0, W, H, '#05050ae0'); if (!nineBox('dialog', 64, 28, 272, 162, 16, 9)) panel(70, 34, 260, 150, '#1b120cf4', '#f2a93b');
      btn('close', 70, 34, 260, 20); g.drawRankPanel();
      controlStripCustom([['← →', 'ตาราง'], ['↑ ↓', 'ช่วงเวลา'], ['N', 'เปลี่ยนชื่อ'], ['Esc', '\u200bปิด']]); return;
    }
    controlStripCustom([['← →', 'เลือกด่าน'], ['1 2 3 C', 'เลือกลูกทีม'], ['Enter', 'เริ่มด่าน'], ['R', 'อันดับ'], ...(FULL ? [['B', 'ร้านค้า'] as [string, string]] : []), ['H', 'วิธีเล่น']]);
  }

  return {
    STAGES, CREW, crewLabel,
    /** call when arriving on the map: selects stage 1 */
    enter() { mapSel = 0; },
    update: updateMap,
    draw: drawMap,
  };
}
