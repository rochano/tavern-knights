// Alchemy room & forge: the scene between the night shift and the world map, where ingredients and
// gold become gear upgrades, buff dishes and tools. Split out of legacy-game.ts unchanged.
import { SFX } from '../audio';
import { pressed } from '../input';
import type { DrawKit, GameState } from './host';

export interface AlchemyHost extends DrawKit, GameState {
  /** leave the room for the world map */
  goMap(): void;
}

/** A row in the room's recipe book. gold may depend on the current upgrade tier. */
interface Recipe {
  tab: 'gear' | 'cook' | 'tool';
  id: string;
  icon?: string;
  th: string;
  kind: 'Craft' | 'Cook';
  desc: string;
  need: Record<string, number>;
  gold: number | (() => number);
  can(): boolean;
  why?: string;
  locked?: boolean;
  apply(): void;
}

export function createAlchemy(g: AlchemyHost) {
  const { ctx, W, H, RES, ENV, UI_BIG, rect, glow, text, textC, wrapText, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxImg, fxB, knightSprite, controlStripCustom } = g;
  let alcSel = 0, alcMsg: { str: string; t: number; col: string } | null = null, alcFx = 0;
  const ING: Record<string, string> = { glowcap: 'Glowcap', chili: 'พริกเม็ดใหญ่', truffle: 'Truffle of Ages', crown: 'Shroom Crown', ember: 'Ember Spore', essence: 'Crown Essence', cork: '100-Year Vintage Cork', feather: 'Golden Gryphon Feather', kraken: 'Deep Sea Kraken Heart', salt: 'เกลือสวรรค์' };
  const TABS: [Recipe['tab'], string][] = [['gear', 'อาวุธ & ชุด'], ['cook', 'อาหารสวรรค์'], ['tool', 'เครื่องใช้']];
  let alcTab = 0;
  const RECIPES: Recipe[] = [
    { tab: 'gear', id: 'essence', th: 'สกัด Crown Essence', kind: 'Craft', desc: 'กลั่นมงกุฎราชาเห็ดเป็นหัวเชื้อเวทมนตร์', need: { crown: 1 }, gold: 0, can: () => true, apply: () => { g.save.ing.essence++; } },
    { tab: 'cook', id: 'tomyum', th: 'ต้มยำกุ้งพญามังกร', kind: 'Cook', desc: 'บัฟด่านถัดไป: ATK +30% และเริ่มด้วยเกจ +50', need: { essence: 1, chili: 1, glowcap: 2 }, gold: 0, can: () => !g.save.buff, why: 'มีบัฟรออยู่แล้ว', apply: () => { g.save.buff = true; } },
    { tab: 'gear', id: 'blade', th: 'ตีดาบ Tier ', kind: 'Craft', desc: 'ATK +20% ทั้งทีม', need: { glowcap: 1 }, gold: () => 40 + g.save.up.blade * 40, can: () => g.save.up.blade < 3, why: 'ดาบ Tier สูงสุดแล้ว', apply: () => { g.save.up.blade++; } },
    { tab: 'gear', id: 'armor', th: 'เกราะหนังมังกร Tier ', kind: 'Craft', desc: 'HP สูงสุด +25 ต่อคน', need: {}, gold: () => 35 + g.save.up.stew * 35, can: () => g.save.up.stew < 3, why: 'เกราะ Tier สูงสุดแล้ว', apply: () => { g.save.up.stew++; } },
    { tab: 'cook', id: 'brew', th: 'Dragon Froth Brew', kind: 'Cook', desc: 'ทุกด่านเริ่มด้วยเกจครึ่งหลอด', need: { chili: 2 }, gold: () => 50, can: () => !g.save.up.brew, why: 'ปรุงไว้แล้ว', apply: () => { g.save.up.brew = 1; } },
    { tab: 'gear', id: 'legend', th: 'Master Chef Set ★', kind: 'Craft', desc: 'ชุดหมวก+ผ้ากันเปื้อน+ดาบกระทะ ATK +50%', need: { essence: 1, truffle: 1, ember: 1 }, gold: () => 80, can: () => !g.save.up.legend, why: 'มีชุดนี้แล้ว', apply: () => { g.save.up.legend = true; } },
    { tab: 'gear', id: 'celestial', th: 'Celestial Tavern Set', kind: 'Craft', desc: 'ต้องใช้ Kraken Heart + Gryphon Feather จากด่าน 3-4', need: {}, gold: () => 0, can: () => false, why: 'วัตถุดิบยังไม่ปลดล็อก (ด่าน 3-4)', locked: true, apply: () => {} },
    { tab: 'cook', id: 'drink', icon: 'drink', th: 'เครื่องดื่มเวทมนตร์', kind: 'Cook', desc: 'ด่านถัดไปเริ่มด้วยเกจ SPECIAL เต็ม (MAX)', need: { glowcap: 1, chili: 1 }, gold: 0, can: () => !g.save.drink, why: 'มีเครื่องดื่มรออยู่แล้ว', apply: () => { g.save.drink = true; } },
    { tab: 'cook', id: 'ribs', icon: 'ribs', th: 'ซี่โครงบาร์บีคิวคธูลู', kind: 'Cook', desc: 'ต้องใช้ Kraken Heart จากด่าน 4', need: {}, gold: () => 0, can: () => false, locked: true, apply: () => {} },
    { tab: 'cook', id: 'pudding', icon: 'pudding', th: 'พุดดิ้งเกลือสวรรค์', kind: 'Cook', desc: 'ต้องใช้เกลือสวรรค์จากด่าน 3', need: {}, gold: () => 0, can: () => false, locked: true, apply: () => {} },
    { tab: 'tool', id: 'lucky', icon: 'lucky', th: 'ขวดเบียร์วุ้นนำโชค', kind: 'Craft', desc: 'เบียร์วุ้นในด่านเติมเกจ 55 แทน 35', need: { glowcap: 1 }, gold: () => 40, can: () => !g.save.tools.lucky, why: 'มีแล้ว', apply: () => { g.save.tools.lucky = true; } },
    { tab: 'tool', id: 'spoon', icon: 'spoon', th: 'ช้อนทองคำ', kind: 'Craft', desc: 'รายได้กะดึกเพิ่ม 20%', need: { chili: 1 }, gold: () => 60, can: () => !g.save.tools.spoon, why: 'มีแล้ว', apply: () => { g.save.tools.spoon = true; } },
    { tab: 'tool', id: 'bell', icon: 'bell', th: 'กระดิ่งเรียกพนักงาน', kind: 'Craft', desc: 'บาร์ตเฒ่าส่งเบียร์ฟื้นพลังได้ 3 ครั้ง', need: {}, gold: () => 45, can: () => !g.save.tools.bell, why: 'มีแล้ว', apply: () => { g.save.tools.bell = true; } },
    { tab: 'tool', id: 'obsidian', icon: 'obsidian', th: 'จุกคอร์กเวทมนตร์', kind: 'Craft', desc: 'ต้องใช้ 100-Year Vintage Cork จากด่าน 2', need: {}, gold: () => 0, can: () => false, locked: true, apply: () => {} },
  ];
  const recipeName = (r: Recipe) => r.th + (r.id === 'blade' ? (1 + g.save.up.blade + 1) : r.id === 'armor' ? (1 + g.save.up.stew + 1) : '');
  const recipeGold = (r: Recipe) => typeof r.gold === 'function' ? r.gold() : r.gold;
  function recipeOk(r: Recipe): string | null {
    if (r.locked) return 'วัตถุดิบยังไม่ปลดล็อก';
    if (!r.can()) return r.why ?? null;
    for (const k in r.need) if ((g.save.ing[k] || 0) < r.need[k]) return 'วัตถุดิบไม่พอ: ' + ING[k];
    if (g.save.gold < recipeGold(r)) return 'เงินไม่พอ';
    return null;
  }
  const tabList = () => RECIPES.filter(r => r.tab === TABS[alcTab][0]);
  function updateAlchemy(dt: number) {
    const list = tabList(), n = list.length + 1;
    if (pressed.left || pressed.right || pressed.prev || pressed.next) { alcTab = (alcTab + ((pressed.left || pressed.prev) ? 2 : 1)) % 3; alcSel = 0; SFX.select(); return; }
    for (let i = 0; i < 3; i++) if (pressed['ui:tab' + i]) { alcTab = i; alcSel = 0; SFX.select(); return; }
    if (pressed.up) { alcSel = (alcSel + n - 1) % n; SFX.select(); }
    if (pressed.down) { alcSel = (alcSel + 1) % n; SFX.select(); }
    for (let i = 0; i < n; i++) if (pressed['ui:rec' + i]) { if (alcSel === i) pressed.ok = true; alcSel = i; SFX.select(); }
    if (pressed['ui:craft']) pressed.ok = true;
    if (alcMsg) { alcMsg.t -= dt; if (alcMsg.t <= 0) alcMsg = null; }
    alcFx = Math.max(0, alcFx - dt);
    if (pressed.ok || pressed.atk) {
      if (alcSel === list.length) { g.goMap(); return; }
      const r = list[alcSel], why = recipeOk(r);
      if (why) { SFX.fail(); alcMsg = { str: why, t: 1.6, col: '#ff8a7a' }; return; }
      for (const k in r.need) g.save.ing[k] -= r.need[k];
      g.save.gold -= recipeGold(r); r.apply(); g.persist(); alcFx = 1.2; SFX.ult();
      g.track('craft', { item: r.id, kind: r.kind });
      alcMsg = { str: (r.kind === 'Cook' ? 'ปรุงสำเร็จ: ' : 'คราฟต์สำเร็จ: ') + r.th, t: 1.8, col: '#9be15d' };
    }
  }
  function drawCellar(t: number) {
    if (ENV.cellar2) { ctx.drawImage(ENV.cellar2, 0, 0, W, H); ctx.fillStyle = 'rgba(10,6,12,0.12)'; ctx.fillRect(0, 0, W, H); return; }
    if (ENV.cellar) { rect(0, 0, W, H, '#120c10'); ctx.drawImage(ENV.cellar, 72, 0, 383, 225); ctx.fillStyle = 'rgba(10,6,12,0.2)'; ctx.fillRect(0, 0, W, H); const cg = ctx.createLinearGradient(0, 186, 0, 198); cg.addColorStop(0, 'rgba(18,12,16,0)'); cg.addColorStop(1, 'rgba(18,12,16,1)'); ctx.fillStyle = cg; ctx.fillRect(0, 186, W, 12); rect(0, 198, W, 27, '#120c10'); return; }
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a1420'); g.addColorStop(1, '#2a1c18'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let y = 16; y < 180; y += 10) for (let x = (y / 10) % 2 ? -10 : 0; x < W; x += 20) { rect(x + 0.5, y + 0.5, 19, 9, '#2c2230'); rect(x + 0.5, y + 0.5, 19, 1, '#3a2e3c'); }
    rect(0, 180, W, 45, '#1a120e'); for (let x = 0; x < W; x += 24) rect(x, 180, 0.5, 45, '#2a1c16');
    // shelves of glowing jars
    const jar = (x: number, y: number, col: string) => { glow(x + 3, y + 4, 10, col.replace('#', 'rgba(').length ? 'rgba(120,255,220,A)' : col, 0.0); rect(x, y, 6, 9, '#1b1020'); rect(x + 0.5, y + 2, 5, 6.5, col); rect(x + 1, y + 2.5, 1, 3, '#ffffff88'); rect(x + 1, y, 4, 2, '#8a6a4a'); };
    for (const [sx, sy] of [[180, 30], [180, 56]]) { rect(sx, sy + 10, 108, 3, '#5a3a22'); }
    const jars = ['#7cf5c8', '#b064d8', '#ff6b2c', '#e8c76a', '#4fb3d9', '#e2382c', '#9be15d', '#ffd35a'];
    jars.forEach((c, i) => { const x = 184 + (i % 8) * 13, y = 31; glow(x + 3, y + 5, 9, 'rgba(255,255,255,A)', 0.08); jar(x, y, c); });
    jars.slice().reverse().forEach((c, i) => { const x = 184 + i * 13, y = 57; jar(x, y, c); });
    // forge on the right
    rect(318, 70, 76, 110, '#3a2a2a'); for (let y = 72; y < 180; y += 8) for (let x = 318 + ((y / 8) % 2 ? 4 : 0); x < 392; x += 9) rect(x, y, 8.5, 7.5, '#4a3434');
    rect(332, 120, 48, 30, '#1b1020'); glow(356, 138, 34, 'rgba(255,140,40,A)', 0.55);
    for (let i = 0; i < 6; i++) { const fh = 8 + Math.abs(Math.sin(t * 9 + i)) * 12; rect(336 + i * 7, 148 - fh, 5, fh, i % 2 ? '#ff6b2c' : '#ffd35a'); }
    rect(326, 166, 34, 6, '#4a4a55'); rect(334, 172, 16, 8, '#3a3a44'); rect(322, 164, 10, 4, '#4a4a55');
    text('เตาหลอม', 356, 74, { size: 7, align: 'center', thai: true, color: '#ffb347' });
  }
  /* the rainbow smoke of the user's cauldron art (sheet C) sways in strips and a faint copy drifts up; the pot below stays still */
  function drawCauldronArt(cx: number, by: number, s: number, t: number) {
    const im = fxImg('cauldron'); if (!im) return false;
    const W0 = im.width, H0 = im.height, sc = s / RES, w = W0 * sc, x0 = cx - w / 2, y0 = by - H0 * sc, SPLIT = 146, STRIP = 1;
    const smoke = (dy: number, scl: number, alpha: number, ph: number) => {
      ctx.globalAlpha = alpha;
      for (let y = 0; y < SPLIT; y += STRIP) {
        const k = 1 - y / SPLIT, dx = Math.sin(t * 2.1 + y * 0.055 + ph) * 3.2 * k * k + Math.sin(t * 3.3 + y * 0.12) * 0.6 * k;
        const yy = y0 + SPLIT * sc - (SPLIT - y) * sc * scl + dy, ww = w * (1 + (scl - 1) * 0.6);
        ctx.drawImage(im, 0, y, W0, STRIP, cx - ww / 2 + dx, yy, ww, STRIP * sc * scl + 0.3);
      }
    };
    const p = (t * 0.32) % 1;
    smoke(-p * 14, 1 + p * 0.18, (1 - p) * 0.32, 1.7);
    smoke(0, 1 + Math.sin(t * 1.6) * 0.035, 0.9 + Math.sin(t * 2.4) * 0.1, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(im, 0, SPLIT, W0, H0 - SPLIT, x0, y0 + SPLIT * sc, w, (H0 - SPLIT) * sc);
    return true;
  }
  function drawCauldron(cx: number, cy: number, t: number) {
    glow(cx, cy - 10, 60, 'rgba(160,120,255,A)', 0.25 + alcFx * 0.3);
    // rainbow smoke
    const cols = ['#ff6b6b', '#ffb347', '#ffe66b', '#7ff59a', '#6bd8ff', '#b28cff'];
    if (!g.fxArtReady) for (let i = 0; i < 14; i++) { const ph = (t * 0.6 + i / 14) % 1; const x = cx + Math.sin(i * 1.7 + t * 2) * (6 + ph * 18), y = cy - 20 - ph * 70; ctx.globalAlpha = (1 - ph) * 0.7; ctx.fillStyle = cols[i % 6]; ctx.beginPath(); ctx.arc(x, y, 3 + ph * 7, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (g.fxArtReady && drawCauldronArt(cx, cy + 30, 1.15, t)) { text('หม้อต้มยำเวทมนตร์', cx, cy + 30, { size: 7, align: 'center', thai: true, color: '#d8c8ff' }); return; }
    for (let i = 0; i < 6; i++) { const ph = (t * 1.2 + i / 6) % 1; rect(cx - 20 + i * 8, cy - 18 - ph * 40, 1, 1, '#fff'); }
    if (g.fxArtReady) { fxB('cauldron', cx, cy + 30, 1, 1.15); text('หม้อต้มยำเวทมนตร์', cx, cy + 30, { size: 7, align: 'center', thai: true, color: '#d8c8ff' }); return; }
    rect(cx - 30, cy + 18, 6, 10, '#2a2a30'); rect(cx + 24, cy + 18, 6, 10, '#2a2a30');
    ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 32, 24, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#3a3a48'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 30, 22, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#55556a'; ctx.beginPath(); ctx.ellipse(cx - 8, cy + 8, 12, 8, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(cx, cy, 33, 7, 0, 0, 7); ctx.fill();
    const brew = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0); cols.forEach((c, i) => brew.addColorStop(i / 5, c));
    ctx.fillStyle = '#e2552e'; ctx.beginPath(); ctx.ellipse(cx, cy, 29, 5, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.45 + Math.sin(t * 3) * 0.15; ctx.fillStyle = brew; ctx.beginPath(); ctx.ellipse(cx, cy, 29, 5, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) rect(cx - 18 + i * 11 + Math.sin(t * 4 + i) * 2, cy - 2 + Math.sin(t * 6 + i) * 1, 2.5, 2.5, '#ffe9c0');
    text('หม้อต้มยำเวทมนตร์', cx, cy + 30, { size: 7, align: 'center', thai: true, color: '#d8c8ff' });
  }
  function ingIcon(k: string) { return icon(k === 'crown' ? 'crown' : k === 'essence' ? 'essence' : k, 1); }
  function drawAlchemy() {
    const t = performance.now() / 1000;
    drawCellar(t);
    // knights around the cauldron
    const cx = 240, cy = 150;
    dimg(knightSprite(1, alcFx > 0 ? 'jump' : 'stand').r, cx - 4, cy - 62 - (alcFx > 0 ? 4 : 0)); dimg(knightSprite(0, 'stand').r, cx - 72, cy - 18); dimg(knightSprite(2, 'stand').l, cx + 34, cy - 18);
    drawCauldron(cx, cy, t);
    // title bar
    if (!(g.uiArtReady && UI_BIG.frame_dark && (slice3(UI_BIG.frame_dark, -6, -1, W + 12, 16.5, 44), true))) rect(0, 0, W, 15, '#0c0810e8');
    text('ห้องปรุงยา & ตีเหล็ก', 6, 1.5, { size: 9, thai: true, color: '#f2a93b', weight: 600 });
    const order = ['glowcap', 'chili', 'crown', 'essence', 'truffle', 'ember'];
    order.forEach((k, i) => { const x = 128 + i * 30; dimg(ingIcon(k), x, 3.5); textC('x' + (g.save.ing[k] || 0), x + 10, 3.5 + LH(ingIcon(k)) / 2, { size: 8, color: (g.save.ing[k] || 0) ? '#f6ead2' : '#6a5a6a' }); });
    [['cork'], ['feather'], ['kraken']].forEach(([k], i) => { const x = 308 + i * 12 - 4; ctx.globalAlpha = 0.35; dimg(icon(k, 1), x, 3.5); ctx.globalAlpha = 1; });
    dimg(icon('coin', 1), 350, 4); textC(g.save.gold + 'g', 358, 4 + LH(icon('coin', 1)) / 2, { size: 9, color: '#f2c94c', weight: 700 });
    // recipe list (left)
    const list = tabList(), lh = 35 + list.length * 25 + 17 + 7 - 19;
    if (!nineBox('dialog', 3, 18, 152, lh + 2, 16, 6)) panel(4, 19, 150, lh, '#140d18f0', '#8a5a2e');
    TABS.forEach(([id, th], i) => { const x = 7 + i * 49; btn('tab' + i, x, 21, 47, 11); uiBtn(x, 21, 47, 11, i === alcTab, '#f2a93b', '#2a1e30', '#5a3a12', '#1b1020'); textC(th, x + 23.5, 26.5, { size: 6, align: 'center', thai: true, color: i === alcTab ? '#ffe9c0' : '#8a7a8a', shadow: false }); });
    list.forEach((r, i) => {
      const y = 35 + i * 25, sel = alcSel === i, why = recipeOk(r);
      btn('rec' + i, 8, y, 142, 24);
      uiBtn(8, y, 142, 24, sel, '#f2a93b', '#2a1e30', '#3b2a12', '#1b1020');
      const ic = r.icon || (g.uiArtReady ? { essence: 'essence', tomyum: 'bowl2', blade: ['sword', 'sword_fire', 'sword_gold'][Math.min(2, g.save.up.blade || 0)], armor: (g.save.up.armor || g.save.up.stew || 0) ? 'shield_steel' : 'shield_wood', brew: 'beer', legend: 'masterset', celestial: 'feather' } as Record<string, string> : { essence: 'essence', tomyum: 'bowl', blade: 'st_fire', armor: 'heart', brew: 'beer', legend: 'crown', celestial: 'feather' } as Record<string, string>)[r.id];
      ctx.globalAlpha = r.locked ? 0.4 : 1; dimg(icon(ic as string, 2), 18, y + 4); ctx.globalAlpha = 1;
      textC(recipeName(r), 40, y + 8.5, { size: 7.5, thai: true, color: r.locked ? '#6a5a6a' : r.id === 'legend' ? '#ffb347' : '#f6ead2' });
      textC(why ? (r.locked ? 'ล็อก' : why.replace('วัตถุดิบไม่พอ: ', 'ขาด ')) : 'พร้อม!', 40, y + 16, { size: 6, thai: true, weight: 400, color: why ? '#8a7a8a' : '#9be15d' });
    });
    const gy = 35 + list.length * 25, gsel = alcSel === list.length;
    btn('rec' + list.length, 8, gy, 142, 17);
    uiBtn(8, gy, 142, 17, gsel, '#9be15d', '#2a1e30', '#22381a', '#1b1020');
    textC('ออกเดินทาง ▶ แผนที่โลก', 79, gy + 8.5, { size: 8, align: 'center', thai: true, color: '#d8ffc0' });
    // right: recipe detail + Master Chef stats
    const r = list[alcSel];
    const nItems = r ? Object.keys(r.need).length + (recipeGold(r) ? 1 : 0) : 0, by = 70 + nItems * 9 + 4, ph = r ? by + 13 + 7 - 19 : 20;
    if (!nineBox('dialog', 291, 18, 106, ph + 2, 16, 6)) panel(292, 19, 104, ph, '#140d18f0', '#8a5a2e');
    if (r) {
      wrapText(recipeName(r), 300, 26, 88, 9, { size: 8, thai: true, color: '#ffd76a' });
      wrapText(r.desc, 300, 45, 88, 8, { size: 6.5, thai: true, weight: 400, color: '#cfc0d0' });
      let y = 70; const items = Object.entries(r.need);
      items.forEach(([k, n]) => { const have = g.save.ing[k] || 0; dimg(ingIcon(k), 300, y); textC(ING[k], 311, y + LH(ingIcon(k)) / 2, { size: 6.5, thai: true, weight: 400, color: '#e8dcc8' }); textC(have + '/' + n, 388, y + LH(ingIcon(k)) / 2, { size: 7, align: 'right', color: have >= n ? '#9be15d' : '#ff8a7a' }); y += 9; });
      const gcost = recipeGold(r); if (gcost) { dimg(icon('coin', 1), 300, y + 1); textC(gcost + 'g', 311, y + 1 + LH(icon('coin', 1)) / 2, { size: 7, color: g.save.gold >= gcost ? '#f2c94c' : '#ff8a7a' }); }
      const ok = !recipeOk(r);
      btn('craft', 300, by, 88, 13);
      uiBtn(300, by, 88, 13, ok, '#f2a93b', '#3a2a40', '#5a3a12', '#1b1020');
      textC('[' + (r.kind === 'Cook' ? 'Cook / ปรุง' : 'Craft / คราฟต์') + ']', 344, by + 6.5, { size: 7, align: 'center', thai: true, color: ok ? '#ffe9c0' : '#6a5a6a' });
    } else { text('กลับไปที่แผนที่โลก', 300, 26, { size: 8, thai: true }); }
    if (!nineBox('dialog', 291, 125, 106, 87, 16, 6)) panel(292, 126, 104, 85, '#140d18f0', g.save.up.legend ? '#ffb347' : '#5a4a3a');
    text('Master Chef Set', 300, 132, { size: 8, weight: 700, color: g.save.up.legend ? '#ffb347' : '#8a7a6a' });
    const base = 1 + 0.2 * g.save.up.blade, withSet = base + 0.5;
    const rows = [['ATK', Math.round((base + (g.save.up.legend ? 0.5 : 0)) * 100) + '%', g.save.up.legend ? '' : '→ ' + Math.round(withSet * 100) + '%'], ['HP', String(g.knightMax()), ''], ['ดาบ', 'Tier ' + (1 + g.save.up.blade + (g.save.up.legend ? 1 : 0)), ''], ['เกราะ', 'Tier ' + (1 + g.save.up.stew), ''], ['บัฟถัดไป', g.save.buff ? 'ต้มยำ +30%' : '-', '']];
    rows.forEach(([a, b2, c2], i) => { const y = 144 + i * 10.5; text(a, 300, y, { size: 7, thai: true, weight: 400, color: '#bba8ba' }); text(b2, 352, y, { size: 7, align: 'right', color: '#f6ead2' }); if (c2) text(c2, 388, y, { size: 7, align: 'right', color: '#9be15d' }); });
    text(g.save.up.legend ? 'สวมใส่แล้ว: +50% ATK' : 'โบนัสเซ็ต: +50% ATK', 300, 197, { size: 6.5, thai: true, color: g.save.up.legend ? '#ffb347' : '#8a7a8a' });
    if (alcMsg) { panel(100, 186, 190, 14, '#140d18f0', alcMsg.col); text(alcMsg.str, 195, 188.5, { size: 8, align: 'center', thai: true, color: alcMsg.col }); }
    if (alcFx > 0) { ctx.globalAlpha = alcFx * 0.3; rect(0, 0, W, H, '#fff6d8'); ctx.globalAlpha = 1; }
    controlStripCustom([['← →', 'เปลี่ยนหมวด'], ['↑ ↓', 'เลือกสูตร'], ['Enter / J', 'ปรุง/คราฟต์'], ['H', 'วิธีเล่น']]);
  }
  return {
    /** call when entering the room: starts on the first recipe */
    enter() { alcSel = 0; },
    update: updateAlchemy,
    draw: drawAlchemy,
  };
}
