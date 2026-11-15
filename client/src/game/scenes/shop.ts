// Shop and advisor panel over the world map. FULL VERSION ONLY: the map shows the button only when the game
// runs as the full version (store builds, the develop site, localhost), never on the free web demo.
// Coins live on the server (net.ts); this panel only shows them, asks to buy, and adds bought gold/crates to
// the save once. Every frame, button and window comes from the sheet art through the draw kit (uiBtn, nineBox, icons).
import { AI_COST, SHOP, type AiMode, type ShopItem } from '@tk/shared';
import { SFX } from '../audio';
import { pressed } from '../input';
import type { Net, NetErr } from '../net';
import type { DrawKit, GameState, Img } from './host';

export interface ShopHost extends DrawKit, GameState {
  readonly NET: Net;
  readonly THAI: string;
  readonly LANG: 'th' | 'en';
  readonly cv: HTMLCanvasElement;
  readonly HERO_HI: Record<string, Img | undefined>;
  readonly KNIGHTS: { id: string }[];
  tr(s: string): string;
  LW(img: Img): number;
  uiIcon(k: string, cx: number, cy: number, size: number): boolean;
  uiBig(k: string, cx: number, cy: number, s?: number): boolean;
}

type Tab = 'shop' | 'ask';
const PRESETS = ['ผ่านด่านนี้ยังไงดี', 'สู้บอสราชาเห็ดยังไง', 'ควรอัปเกรดอะไรก่อน', 'ทำกะดึกยังไงให้ได้ทองเยอะ'];
const ERR: Record<string, string> = {
  no_coins: 'เหรียญมังกรไม่พอ', owned: 'มีของชิ้นนี้แล้ว', ai_offline: 'ที่ปรึกษายังไม่เปิดให้บริการ', ai_busy: 'ที่ปรึกษาเต็มแล้วเดือนนี้ ลองใหม่เดือนหน้า',
  ai_failed: 'บาร์ตตอบไม่ได้ตอนนี้ คืนเหรียญให้แล้ว', too_many: 'ถามถี่เกินไป พักสักครู่นะ', off: 'ต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่', bad_question: 'พิมพ์คำถามก่อนนะ',
};
const errText = (e: NetErr) => ERR[e] || ERR['off']!;

export function createShop(g: ShopHost) {
  const { ctx, W, H, NET, THAI, cv, tr, rect, text, textC, wrapText, panel, nineBox, uiBtn, btn, uiIcon, uiBig, dimg, LH, LW } = g;
  let open = false, tab: Tab = 'shop', sel = 0, askSel = 0, mode: AiMode = 'hint';
  let msg: { str: string; col: string; t: number } | null = null;
  let busy = false, answer = '', asked = '';
  // the typed question reuses the ranking name box (#nameIn), with a longer limit while open
  let askEdit = false, askZ = false, askH0 = 0;
  const input = () => document.getElementById('nameIn') as HTMLInputElement;
  const say = (str: string, col = '#ff8a7a') => { msg = { str, col, t: 3.5 }; };

  /** Adds bought gold/crates to the save once (ids are remembered in the save), then marks them claimed. */
  function applyGrants() {
    const s = g.save, done = new Set(s.applied || []), ids: string[] = [];
    for (const gr of NET.wallet.grants) {
      ids.push(gr.id);
      if (done.has(gr.id)) continue;
      const it = SHOP.find(x => x.id === gr.item); if (!it) continue;
      if (it.gold) s.gold += it.gold;
      if (it.ing) for (const k in it.ing) s.ing[k] = (s.ing[k] || 0) + it.ing[k]!;
      done.add(gr.id);
    }
    s.applied = [...done].slice(-200);
    s.owned = NET.wallet.owned.slice();
    if (s.look && !s.owned.includes('look' + s.look)) s.look = 0;
    g.persist();
    NET.wallet.grants = [];
    NET.claim(ids);
  }
  function refresh() { NET.walletLoad().then(w => { if (w.state === 'ok') applyGrants(); }); }

  function enter(t: Tab = 'shop') { open = true; tab = t; msg = null; refresh(); }
  function close() { if (askEdit) askDone(false); open = false; SFX.select(); }

  const owned = (it: ShopItem) => NET.wallet.owned.includes(it.id) || !!g.save.owned?.includes(it.id);
  const wearing = (it: ShopItem) => it.kind === 'look' && g.save.look === it.look;

  async function act(it: ShopItem) {
    if (busy) return;
    if (it.kind === 'look' && owned(it)) { g.save.look = wearing(it) ? 0 : it.look; g.persist(); SFX.select(); g.track('shop_wear', { item: it.id }); return; }
    if (NET.wallet.state !== 'ok') { say(errText('off')); SFX.fail(); return; }
    if (NET.wallet.coins < it.price) { say(errText('no_coins')); SFX.fail(); return; }
    busy = true;
    const r = await NET.buy(it.id); busy = false;
    if (!r.ok) { say(errText(r.error)); SFX.fail(); if (r.error === 'owned') refresh(); return; }
    SFX.coin(); g.track('shop_buy', { item: it.id });
    if (it.once) { NET.wallet.owned.push(it.id); if (it.kind === 'look') g.save.look = it.look; }
    else NET.wallet.grants.push(r.grant);
    applyGrants();
    say(it.kind === 'look' ? 'ได้ชุดใหม่แล้ว สวมให้ทั้งทีมเลย' : 'เพิ่มของเข้ากระเป๋าแล้ว', '#9be15d');
  }
  async function devCoins() { if (busy) return; busy = true; const ok = await NET.devCoins(); busy = false; if (ok) { SFX.coin(); say('ได้เหรียญทดสอบ +50', '#9be15d'); } else { say('เติมเหรียญทดสอบไม่ได้ (มีพอแล้วหรือไม่ใช่เว็บทดสอบ)'); SFX.fail(); } }

  async function askBart(q: string) {
    q = q.trim(); if (busy) return;
    if ([...q].length < 2) { say(errText('bad_question')); SFX.fail(); return; }
    if (!NET.wallet.ai) { say(errText('ai_offline')); SFX.fail(); return; }
    if (NET.wallet.coins < AI_COST[mode]) { say(errText('no_coins')); SFX.fail(); return; }
    busy = true; asked = q; answer = ''; SFX.select();
    const s = g.save;
    const r = await NET.ask(mode, q, { lang: g.LANG, gold: s.gold, stages: s.stages, up: s.up as Record<string, number | boolean>, ing: s.ing, crew: s.crew, runs: s.runs });
    busy = false;
    if (!r.ok) { say(errText(r.error)); SFX.fail(); if (r.error === 'ai_failed') NET.walletLoad(); return; }
    answer = r.answer; g.track('ai_ask', { mode });
  }

  function askOpen() {
    const el = input(); askEdit = true; askZ = innerWidth < innerHeight; askH0 = innerHeight;
    el.maxLength = 120; el.value = ''; el.style.display = 'block';
    try { el.focus(); } catch (e) { /* old browsers */ }
  }
  function askDone(ok: boolean) {
    const el = input(); if (!askEdit) return; askEdit = false; el.style.display = 'none'; el.maxLength = 16;
    try { el.blur(); window.scrollTo(0, 0); } catch (e) { /* old browsers */ } cv.focus();
    if (ok) askBart(el.value); else SFX.select();
  }

  /* ----------------------------------------------------------------- input */
  function update(dt: number) {
    if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
    if (askEdit) { if (pressed['ui:aok']) askDone(true); else if (pressed['ui:acan']) askDone(false); return; }
    if (pressed.pause || pressed['ui:sclose'] || pressed.shop) { close(); return; }
    if (pressed.prev || pressed.next || pressed['ui:tab0'] || pressed['ui:tab1']) {
      tab = pressed['ui:tab0'] ? 'shop' : pressed['ui:tab1'] ? 'ask' : tab === 'shop' ? 'ask' : 'shop'; SFX.select(); return;
    }
    if (tab === 'shop') {
      if (pressed.left || pressed.right) { sel = sel % 2 ? sel - 1 : Math.min(SHOP.length - 1, sel + 1); SFX.select(); }
      if (pressed.up) { sel = (sel + SHOP.length - 2) % SHOP.length; SFX.select(); }
      if (pressed.down) { sel = (sel + 2) % SHOP.length; SFX.select(); }
      for (let i = 0; i < SHOP.length; i++) if (pressed['ui:it' + i]) { if (sel === i) act(SHOP[i]!); else { sel = i; SFX.select(); } }
      if (pressed['ui:buy'] || pressed.ok || pressed.atk) act(SHOP[sel]!);
      if (pressed['ui:dev'] && NET.wallet.dev) devCoins();
    } else {
      const rows = PRESETS.length + 1;
      if (pressed.up) { askSel = (askSel + rows - 1) % rows; SFX.select(); }
      if (pressed.down) { askSel = (askSel + 1) % rows; SFX.select(); }
      if (pressed.left || pressed.right) { mode = mode === 'hint' ? 'coach' : 'hint'; SFX.select(); }
      if (pressed['ui:mh'] || pressed['ui:mc']) { mode = pressed['ui:mh'] ? 'hint' : 'coach'; SFX.select(); }
      for (let i = 0; i < PRESETS.length; i++) if (pressed['ui:q' + i]) { askSel = i; askBart(tr(PRESETS[i]!)); }
      if ((pressed.ok || pressed.atk) && !busy) { if (askSel < PRESETS.length) askBart(tr(PRESETS[askSel]!)); else askOpen(); }
    }
  }

  /* ------------------------------------------------------------------ draw */
  const ICON: Record<string, string> = { look2: 'shield_steel', look3: 'sword_fire', look4: 'sword_gold', look5: 'masterset', gold150: 'bag', crate1: 'glowcap' };
  const DESC: Record<string, string> = { look: 'ชุดแต่งทั้งทีม เปลี่ยนแค่หน้าตา ไม่เพิ่มพลัง', gold: 'เพิ่มทอง 150g เข้าเซฟ', crate: 'Glowcap 2 · Truffle 1 · พริก 1' };

  /** coin count, top right of the window */
  function drawCoins() {
    const w = NET.wallet, str = w.state === 'ok' ? String(w.coins) : w.state === 'load' || w.state === 'idle' ? '...' : '-';
    ctx.font = `700 9px ${THAI}`; const sw = ctx.measureText(str).width;
    const lb = 'เหรียญมังกร'; ctx.font = `400 6.5px ${THAI}`; const lw = ctx.measureText(tr(lb)).width;
    const right = 304, x0 = right - sw - lw - 16;
    if (!uiIcon('coin', x0 + 5, 23.5, 10)) textC('●', x0 + 5, 23.5, { size: 8, align: 'center', color: '#ffd76a' });
    textC(str, x0 + 12, 23.5, { size: 9, color: '#ffd76a', weight: 700 });
    textC(lb, right, 23.5, { size: 6.5, align: 'right', thai: true, color: '#cfc0b0', weight: 400 });
  }
  function drawShopTab() {
    SHOP.forEach((it, i) => {
      const x = 32 + (i % 2) * 170, y = 40 + Math.floor(i / 2) * 32, on = i === sel, has = owned(it);
      btn('it' + i, x, y, 166, 29); uiBtn(x, y, 166, 29, on);
      if (it.kind === 'look' && it.look) {
        /* the three knights' heads in this outfit, from the hi-res hero sheets */
        g.KNIGHTS.forEach((k, j) => { const hd = g.HERO_HI[k.id + it.look + '_head']; if (hd) { const s = 13 / LH(hd); dimg(hd, x + 4 + j * 10, y + 8, LW(hd) * s, 13); } });
      } else if (!uiIcon(ICON[it.id] || 'chest', x + 18, y + 14.5, 18)) textC('?', x + 18, y + 14.5, { size: 9, align: 'center' });
      textC(it.th, x + 44, y + 10.5, { size: 7.5, thai: true, color: on ? '#ffe9b0' : '#f6ead2' });
      const st = it.kind === 'look' && has ? (wearing(it) ? 'สวมอยู่' : 'มีแล้ว') : it.price + ' เหรียญ';
      textC(st, x + 44, y + 20.5, { size: 6.5, thai: true, color: has ? '#9be15d' : '#ffd76a', weight: 400 });
    });
    const it = SHOP[sel]!;
    text(DESC[it.kind] || '', 34, 139, { size: 6.5, thai: true, color: '#cfc0b0', weight: 400 });
    text('ยังไม่มีการจ่ายเงินจริงในเวอร์ชันนี้', 34, 150, { size: 6, thai: true, color: '#8a7a6a', weight: 400 });
    const lb = it.kind === 'look' && owned(it) ? (wearing(it) ? 'ถอดชุด' : 'สวมชุด') : busy ? 'กำลังซื้อ...' : 'ซื้อ (Enter)';
    btn('buy', 268, 140, 98, 16); uiBtn(268, 140, 98, 16, true); textC(lb, 317, 148, { size: 7.5, align: 'center', thai: true, color: '#ffe9b0' });
    if (NET.wallet.dev) { btn('dev', 32, 162, 112, 14); uiBtn(32, 162, 112, 14, false); textC('+50 เหรียญ (ทดสอบ)', 88, 169, { size: 6.5, align: 'center', thai: true, color: '#bfe8ff' }); }
  }
  function drawAskTab() {
    if (!uiBig('bust_bart', 52, 62, 1) && !uiIcon('beer', 52, 62, 24)) textC('?', 52, 62, { size: 12, align: 'center' });
    text('บาร์ตเฒ่า', 52, 84, { size: 7, align: 'center', thai: true, color: '#f2a93b' });
    ([['mh', 'hint', 'คำใบ้สั้น', 84], ['mc', 'coach', 'โค้ชเต็ม', 178]] as const).forEach(([id, m, lb, x]) => {
      const on = mode === m; btn(id, x, 40, 90, 14); uiBtn(x, 40, 90, 14, on);
      textC(tr(lb) + ' · ' + tr(AI_COST[m] + ' เหรียญ'), x + 45, 47, { size: 6.5, align: 'center', thai: true, color: on ? '#ffe9b0' : '#a89a8a' });
    });
    PRESETS.forEach((q, i) => { const x = 84 + (i % 2) * 141, y = 58 + Math.floor(i / 2) * 16, on = askSel === i; btn('q' + i, x, y, 137, 14); uiBtn(x, y, 137, 14, on); textC(q, x + 68.5, y + 7, { size: 6.5, align: 'center', thai: true, color: on ? '#ffe9b0' : '#cfc0b0' }); });
    { const on = askSel === PRESETS.length; btn('aski', 84, 90, 278, 14); uiBtn(84, 90, 278, 14, on); textC('พิมพ์คำถามเอง...', 223, 97, { size: 6.5, align: 'center', thai: true, color: on ? '#ffe9b0' : '#cfc0b0' }); }
    rect(32, 108, 336, 0.6, '#5a4a3a');
    if (busy) text('บาร์ตเฒ่ากำลังคิด...', 36, 114, { size: 7, thai: true, color: '#bfe8ff', weight: 400 });
    else if (answer) {
      text('⁠' + asked, 36, 113, { size: 6.5, thai: true, color: '#8aa0c0', weight: 400 });
      ctx.save(); ctx.beginPath(); ctx.rect(30, 118, 340, 70); ctx.clip();
      wrapText('⁠' + answer, 36, 123, 328, 8, { size: 7, thai: true, color: '#f6ead2', weight: 400 });
      ctx.restore();
    } else wrapText(NET.wallet.ai ? 'ถามบาร์ตเฒ่าเรื่องเกมได้เลย เช่น ผ่านด่านยังไง ควรอัปเกรดอะไร · ถามแล้ว รอบถัดไปจะไม่ขึ้นตารางอันดับหลัก' : 'ที่ปรึกษายังไม่เปิดให้บริการ', 36, 116, 328, 9, { size: 7, thai: true, color: '#cfc0b0', weight: 400 });
  }
  function draw() {
    if (!open) return;
    rect(0, 0, W, H, '#05050ae0');
    if (!nineBox('dialog', 20, 8, 360, 186, 16, 9)) panel(24, 12, 352, 178, '#1b120cf4', '#f2a93b');
    ([['tab0', 'shop', 'ร้านค้า', 32], ['tab1', 'ask', 'ถามที่ปรึกษา', 102]] as const).forEach(([id, t, lb, x]) => { const on = tab === t; btn(id, x, 16, 66, 15); uiBtn(x, 16, 66, 15, on); textC(lb, x + 33, 23.5, { size: 7.5, align: 'center', thai: true, color: on ? '#ffe9b0' : '#a89a8a' }); });
    drawCoins();
    if (tab === 'shop') drawShopTab(); else drawAskTab();
    btn('sclose', 312, 16, 54, 15); uiBtn(312, 16, 54, 15, false); textC('ปิด (Esc)', 339, 23.5, { size: 7, align: 'center', thai: true, color: '#cfc0b0' });
    if (msg) { ctx.font = `600 7.5px ${THAI}`; const mw = ctx.measureText(tr(msg.str)).width + 16; uiBtn(W / 2 - mw / 2, 172, mw, 14, false); textC(msg.str, W / 2, 179, { size: 7.5, align: 'center', thai: true, color: msg.col }); }
    if (askEdit) {
      rect(0, 0, W, H, '#05050ac0'); if (!nineBox('dialog', 56, 70, 288, 88, 16, 9)) panel(60, 74, 280, 80, '#1b120cf4', '#f2a93b');
      text('พิมพ์คำถามถึงบาร์ตเฒ่า', W / 2, 80, { size: 8, align: 'center', thai: true, color: '#f2a93b', weight: 600 });
      uiBtn(72, 92, 256, 22, false);
      const el = input(), v = el.value, foc = document.activeElement === el;
      ctx.font = `400 8px ${THAI}`; let shown = v; while (shown && ctx.measureText(shown).width > 240) shown = shown.slice(1);
      if (v) textC('⁠' + shown, 80, 103, { size: 8, thai: true, color: '#fff4dc', weight: 400 });
      else textC(foc ? '' : 'แตะเพื่อพิมพ์', W / 2, 103, { size: 7, align: 'center', thai: true, color: '#8aa0c0', weight: 400 });
      if (foc && (performance.now() / 500 | 0) % 2 === 0) rect(80 + (v ? ctx.measureText(shown).width : 0) + 1, 97, 1, 12, '#fff4dc');
      text('ใช้ ' + AI_COST[mode] + ' เหรียญ', W / 2, 119, { size: 6, align: 'center', thai: true, color: '#bba8ba', weight: 400 });
      ([['aok', 'ถาม', 122, true], ['acan', 'ยกเลิก', 204, false]] as const).forEach(([id, lb, x, on]) => { btn(id, x, 132, 74, 15); uiBtn(x, 132, 74, 15, on); textC(lb, x + 37, 139.5, { size: 7, align: 'center', thai: true, color: on ? '#ffe9b0' : '#cfc0b0' }); });
    }
  }

  return {
    enter, update, draw, askOpen, askDone,
    get open() { return open; },
    get askEdit() { return askEdit; },
    get askZ() { return askZ; },
    get askH0() { return askH0; },
    /** test hooks */
    set tab(v: Tab) { tab = v; },
    set sel(v: number) { sel = v; },
    setAnswer(q: string, a: string) { asked = q; answer = a; },
  };
}
