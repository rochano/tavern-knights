// Night shift at The Tipsy Dragon: three knights run the kitchen, sink, tables and taps for 80 seconds,
// with a cooking rhythm game, a pouring bar and VIP / robber / fire events. Split out of legacy-game.ts unchanged.
import { SFX } from '../audio';
import { pressed } from '../input';
import type { Net, NetFinish, NetRun } from '../net';
import type { DrawKit, GameState, Img, ImgTable, TextOpt } from './host';

/* loosely typed pieces of the shift; fields match what the code below reads and writes */
interface Customer {
  type: string; order: string | null; pat: number; max: number; look: { skin: string; hair: string; coat: string };
  t: number; bob: number; rowdyT: number; leaving?: string; leaveT?: number; artKey?: string;
}
interface Seat { cust: Customer | null; dirty: boolean; cleanT: number }
interface Item { q: number; label?: string; glow?: boolean }
interface Note { dir: string; t0: number; res?: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; note?: boolean }
interface FloatText { str: string; x: number; y: number; col: string; life: number; big?: boolean }
interface Tavern {
  t: number; dur: number; sel: number; active: number; kpos: number[]; seats: Seat[];
  gold: number; served: number; angry: number; kicked: number; beers: Item[]; dishes: Item[]; bowls: number; pile: number;
  pour: { v: number } | null; cook: { notes: Note[]; time: number; glow: boolean; flash?: { txt: string; t: number } | null } | null;
  harpCd: number; harpT: number; robber: { x: number; caught: boolean; t: number } | null; fire: { hp: number; t: number } | null;
  spawnT: number; texts: FloatText[]; parts: Particle[]; usedGlow: number; washT: number; bonkT: number;
  events: { at: number; type: string; done?: boolean }[];
  banner: { text: string; sub: string; t: number } | null; over: boolean; overT: number;
  net?: NetRun; paused?: boolean; pauseSel?: number; fromTitle?: boolean; click?: number;
}
export interface Night { gold: number; served: number; angry: number; kicked: number; stars: number; usedGlow: number; net: NetFinish }

export interface TavernHost extends DrawKit, GameState {
  readonly KNIGHTS: { id: string; th: string; color: string }[];
  readonly CREW_ART: Record<string, { l: Img; r: Img } | undefined>;
  readonly crewArtReady: boolean;
  readonly E5: ImgTable<'mug'>;
  readonly TRAY: ImgTable<'tray_mix' | 'tray_beer' | 'tray_empty'>;
  readonly CUST_KEYS: string[];
  readonly NET: Net;
  readonly TOUCH_DEV: boolean;
  readonly tpOnTxt: boolean;
  rnd(a: number, b: number): number;
  clamp(v: number, a: number, b: number): number;
  pick<V>(arr: V[]): V;
  bar(x: number, y: number, w: number, h: number, frac: number, col: string, back?: string): void;
  frameBar(k: string, x: number, y: number, w: number, h: number, frac: number, col: string, hi?: string): unknown;
  uiIcon(k: string, cx: number, cy: number, size: number): boolean;
  uiBig(k: string, cx: number, cy: number, s?: number): boolean;
  thiefSprite(f: number): { r: Img; l: Img };
  addShake(v: number): void;
  netLine(net: NetFinish, boards: string[]): { str: string; col: string } | null;
  controlStrip(): void;
  LW(img: Img): number;
  anyConfirm(): boolean | undefined;
  enterTavern(): void;
  goAlchemy(): void;
  leaveTavern(to: 'title' | 'map'): void;
  showHelp(page: string): void;
}

export function createTavern(g: TavernHost) {
  const { ctx, W, H, RES, ENV, UI_BIG, KNIGHTS, CREW_ART, E5, TRAY, CUST_KEYS, NET, rnd, clamp, pick, bar, frameBar, uiIcon, uiBig, thiefSprite, addShake, netLine, controlStrip, LW, anyConfirm,
    rect, glow, text, textC, panel, nineBox, slice3, uiBtn, btn, dimg, icon, LH, fxB, knightSprite } = g;
  const STATIONS = [ { kind: 'kitchen', x: 61 }, { kind: 'sink', x: 120 }, { kind: 'seat', x: 172 }, { kind: 'seat', x: 203 }, { kind: 'seat', x: 234 }, { kind: 'seat', x: 265 }, { kind: 'taps', x: 300 } ];
  const HOME = [1, 0, 6];
  const ARROWS = ['up', 'down', 'left', 'right'];
  const ARROW_GLYPH: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };
  /** the running night shift, null outside it. Code below only runs while a shift is on, so it reads T as set. */
  let T = null as unknown as Tavern;
  function startTavern() {
    g.track('tavern_start');
    T = {
      t: 0, dur: 80, sel: 6, active: 2, kpos: HOME.map(h => STATIONS[h].x), seats: [0, 1, 2, 3].map(() => ({ cust: null, dirty: false, cleanT: 0 })),
      gold: 0, served: 0, angry: 0, kicked: 0, beers: [], dishes: [], bowls: 4, pile: 0, pour: null, cook: null, harpCd: 0, harpT: 0, robber: null, fire: null,
      spawnT: 1.5, texts: [], parts: [], usedGlow: 0, washT: 0, bonkT: 0,
      events: [ { at: rnd(16, 22), type: 'vip' }, { at: rnd(32, 38), type: 'robber' }, { at: rnd(50, 56), type: 'fire' } ],
      banner: { text: 'NIGHT SHIFT', sub: 'กะดึกที่ร้าน The Tipsy Dragon เริ่มแล้ว!', t: 2.4 }, over: false, overT: 0,
    };
    T.net = NET.start('tavern');
    g.enterTavern();
  }
  const CUST_LOOKS = [ { skin: '#f3c58e', hair: '#5a3a22', coat: '#4a5670' }, { skin: '#c98e5a', hair: '#1b1020', coat: '#6a4a2a' }, { skin: '#f6d7b8', hair: '#e9c46a', coat: '#3f6a8a' }, { skin: '#8d5a3a', hair: '#2e1d12', coat: '#5a6a3a' }, { skin: '#7ad37a', hair: '#3f8f3f', coat: '#6a3a5a' }, { skin: '#b7a1d6', hair: '#6c2f8f', coat: '#3a5a5a' } ];
  function newCustomer(type: string): Customer {
    const look = pick(CUST_LOOKS);
    const order = Math.random() < 0.55 ? 'beer' : 'dish';
    const pat = type === 'vip' ? 16 : 22;
    return { type, order: type === 'rowdy' ? null : order, pat, max: pat, look, t: 0, bob: Math.random() * 6, rowdyT: 14 };
  }
  function tText(str: string, x: number, y: number, col: string, big?: boolean) { T.texts.push({ str, x, y, col, life: 1.2, big }); }
  const kidT = () => KNIGHTS[T.active].id;
  function tavernHint() {
    const st = STATIONS[T.sel], id = kidT();
    if (T.cook) return 'กดลูกศร หรือคลิกปุ่มลูกศร ให้ตรงตอนโน้ตเข้าวงกลม!';
    if (T.pour) return 'กด J หรือคลิกอีกครั้งให้หยุดในแถบทอง';
    if (st.kind === 'kitchen') return id === 'rosemary' ? (T.fire ? (g.TOUCH_DEV ? 'รัวปุ่มสกิลดับไฟ!' : 'รัว K ดับไฟ!') : T.bowls <= 0 ? 'ไม่มีจานสะอาด! ให้อาเธอร์ล้างจาน' : 'J/คลิก: ปรุงอาหาร (มินิเกมจังหวะ)') : 'สลับเป็นโรสแมรี่ (2) เพื่อทำอาหาร';
    if (st.kind === 'sink') return id === 'arthur' ? (T.pile ? 'J/คลิก: ล้างจาน (เหลือ ' + T.pile + ' ใบ)' : 'อ่างว่าง ไปเก็บจานที่โต๊ะ') : 'อาเธอร์ (1) ล้างจานที่นี่';
    if (st.kind === 'taps') return id === 'percival' ? 'J/คลิก: รินเบียร์วุ้น' : 'สลับเป็นเพอร์ซิวาล (3) เพื่อรินเบียร์';
    const seat = T.seats[T.sel - 2], c = seat.cust;
    if (seat.dirty && !c) return id === 'arthur' ? 'J/คลิก: เก็บจานไปล้าง' : 'โต๊ะสกปรก: ให้อาเธอร์ (1) เก็บ';
    if (c && c.type === 'rowdy') return id === 'arthur' ? 'J/คลิก: เคาะกระทะเรียกสติขี้เมา!' : 'ขี้เมาอาละวาด! อาเธอร์ (1) หรือ K พิณ';
    if (c && c.order) return id === 'percival' ? 'J/คลิก: เสิร์ฟ' + (c.order === 'beer' ? 'เบียร์' : 'อาหาร') : 'เพอร์ซิวาล (3) เป็นคนเสิร์ฟ';
    return 'K: ' + (id === 'percival' ? 'ดีดพิณสงบลูกค้า' : id === 'arthur' ? 'จับโจร' : 'ดับไฟ');
  }
  function tavernAlert() {
    const msgs: Record<string, string> = { vip: 'ลูกค้า VIP กำลังจะเดินเข้าร้าน!', robber: 'มีโจรด้อม ๆ มองหน้าร้าน! อาเธอร์เตรียมตัว', fire: 'เตาไฟเริ่มมีควันขึ้นแล้ว!' };
    if (T.robber && !T.robber.caught) return 'โจรบุกปล้นร้าน! สลับเป็นอาเธอร์ (1) แล้วกด K';
    if (T.fire) return g.TOUCH_DEV ? 'เตาไฟไหม้! แตะที่ครัว แล้วรัวปุ่มสกิล (สีส้ม)' : 'เตาไฟไหม้! โรสแมรี่ (2) ไปที่ครัวแล้วรัว K';
    const ev = T.events.find(e => !e.done && T.t > e.at - 3.5); if (ev) return msgs[ev.type];
    const angry = T.seats.filter(s => s.cust && s.cust.order && !s.cust.leaving && s.cust.pat / s.cust.max < 0.35).length;
    if (angry) return 'ลูกค้า ' + angry + ' คนเริ่มหัวร้อน! เสิร์ฟด่วน หรือดีดพิณ';
    return null;
  }

  function updateTavern(dt: number) {
    if (T.over) { T.overT += dt; if (T.overT > 0.8 && anyConfirm()) g.goAlchemy(); return; }
    if (pressed.pause) { T.paused = !T.paused; T.pauseSel = 0; }
    if (T.paused) {
      if (pressed.up || pressed.down) { T.pauseSel = 1 - (T.pauseSel || 0); SFX.select(); }
      const quit = () => { const back = T.fromTitle ? 'title' : 'map'; T = null as unknown as Tavern; g.leaveTavern(back); SFX.select(); };
      if (pressed['ui:tquit']) { quit(); return; }
      if (pressed['ui:tresume']) { T.paused = false; return; }
      if (pressed['ui:thelp']) { g.showHelp('tavern'); return; }
      if (pressed.ok || pressed.atk) { if (T.pauseSel === 1) { quit(); return; } T.paused = false; }
      return;
    }
    T.t += dt;
    if (T.banner) { T.banner.t -= dt; if (T.banner.t <= 0) T.banner = null; }
    T.washT = Math.max(0, T.washT - dt); T.bonkT = Math.max(0, T.bonkT - dt); T.harpT = Math.max(0, T.harpT - dt);
    if (!T.cook) {
      if (pressed.k1 || pressed.k2 || pressed.k3 || pressed.next || pressed.prev) {
        const nt = pressed.k1 ? 0 : pressed.k2 ? 1 : pressed.k3 ? 2 : (T.active + (pressed.next ? 1 : 2)) % 3;
        if (nt !== T.active) { T.active = nt; T.pour = null; SFX.swap(); }
      }
      if (!T.pour) { if (pressed.left) { T.sel = Math.max(0, T.sel - 1); SFX.step(); } if (pressed.right) { T.sel = Math.min(6, T.sel + 1); SFX.step(); } }
    }
    for (let i = 0; i < 3; i++) { const target = i === T.active ? STATIONS[T.sel].x : STATIONS[HOME[i]].x; T.kpos[i] += (target - T.kpos[i]) * Math.min(1, dt * (i === T.active ? 14 : 5)); }
    if (T.click !== undefined) {
      const i = T.click; T.click = undefined;
      if (!T.cook && !T.pour) {
        const kind = STATIONS[i].kind; let who = kind === 'kitchen' ? 1 : kind === 'sink' ? 0 : kind === 'taps' ? 2 : -1;
        if (who < 0) { const seat = T.seats[i - 2], c = seat.cust; if (c && c.type === 'rowdy' && !c.leaving) who = 0; else if (c && c.order && !c.leaving) who = 2; else if (seat.dirty && !c) who = 0; }
        if (who >= 0 && who !== T.active) { T.active = who; SFX.swap(); }
        if (T.sel !== i) { T.sel = i; SFX.step(); }
        pressed.atk = true;
      }
    }
    for (const a of ARROWS) if (pressed['ui:qa_' + a]) pressed[a] = true;
    T.harpCd = Math.max(0, T.harpCd - dt);
    const st = STATIONS[T.sel], id = kidT();

    if (T.cook) {
      const c = T.cook; c.time += dt;
      const nx = (n: Note) => 132 + (n.t0 - c.time) * 80;
      const press = ARROWS.find(a => pressed[a]);
      const next = c.notes.find(n => n.res === undefined);
      if (press && next) {
        const d = Math.abs(nx(next) - 132);
        if (d <= 16) { next.res = press === next.dir ? (d <= 6 ? 2 : 1) : 0; c.flash = { txt: next.res === 2 ? 'Perfect!' : next.res === 1 ? 'Good' : 'Miss', t: 0.4 }; next.res ? SFX.note(next.dir, next.res === 2) : SFX.fail(); }
        else if (d < 40) { next.res = 0; c.flash = { txt: 'เร็วไป!', t: 0.4 }; SFX.fail(); }
      }
      c.notes.forEach(n => { if (n.res === undefined && nx(n) < 132 - 16) { n.res = 0; c.flash = { txt: 'Miss', t: 0.4 }; SFX.fail(); } });
      if (c.flash) { c.flash.t -= dt; if (c.flash.t <= 0) c.flash = null; }
      if (c.notes.every(n => n.res !== undefined)) finishCook();
    } else if (T.pour) {
      T.pour.v += dt / 1.3;
      if (pressed.atk || T.pour.v > 1.15) finishPour();
    } else if (pressed.atk) {
      if (st.kind === 'kitchen') {
        if (id !== 'rosemary') tText('โรสแมรี่เท่านั้นที่ทำอาหาร!', st.x, 96, '#bba8ba');
        else if (T.fire) tText('ครัวไฟไหม้อยู่!', st.x, 96, '#ff6b2c');
        else if (T.bowls <= 0) { tText('ไม่มีจานสะอาด!', st.x, 96, '#ff9a7a'); SFX.fail(); }
        else if (T.dishes.length >= 3) tText('ช่องส่งอาหารเต็ม', st.x, 96, '#bba8ba');
        else { const glow = g.save.ing.glowcap > 0; T.cook = { notes: Array.from({ length: 5 }, (_, k) => ({ dir: pick(ARROWS), t0: 0.9 + k * 0.55 })), time: 0, glow }; SFX.select(); }
      } else if (st.kind === 'sink') {
        if (id !== 'arthur') tText('อาเธอร์คนล้างจาน!', st.x, 110, '#bba8ba');
        else if (!T.pile) tText('ไม่มีจานรอล้าง', st.x, 110, '#bba8ba');
        else { T.pile--; T.bowls++; T.washT = 0.25; SFX.pour(); for (let n = 0; n < 6; n++) T.parts.push({ x: st.x + rnd(-8, 8), y: 128, vx: rnd(-30, 30), vy: rnd(-60, -20), life: 0.5, max: 0.5, col: '#bfe8ff' }); tText('จานสะอาด +1', st.x, 104, '#cfe8ff'); }
      } else if (st.kind === 'taps') {
        if (id !== 'percival') tText('เพอร์ซิวาลเป็นคนรินเบียร์!', st.x, 96, '#bba8ba');
        else if (T.beers.length >= 3) tText('ถาดเต็มแล้ว', st.x, 96, '#bba8ba');
        else { T.pour = { v: 0 }; SFX.pour(); }
      } else seatAction(T.seats[T.sel - 2], st);
    }
    if (pressed.sp && !T.cook && !T.pour) {
      if (id === 'percival') {
        if (T.harpCd > 0) tText('พิณยังไม่พร้อม ' + Math.ceil(T.harpCd) + ' วิ', T.kpos[2], 140, '#bba8ba');
        else { T.harpCd = 12; T.harpT = 1.4; SFX.harp(); tText('บทเพลงสงบใจ ♪', T.kpos[2], 136, '#7fd6ff', true); T.seats.forEach(s => { if (s.cust) { if (s.cust.type === 'rowdy') { s.cust.leaving = 'calm'; } else s.cust.pat = Math.min(s.cust.max, s.cust.pat + s.cust.max * 0.4); } }); for (let n = 0; n < 18; n++) T.parts.push({ x: T.kpos[2], y: 160, vx: rnd(-140, 60), vy: rnd(-90, -20), life: 1.1, max: 1.1, col: '#7fd6ff', note: true }); }
      } else if (id === 'arthur') {
        if (T.robber && !T.robber.caught) { T.robber.caught = true; T.robber.t = 0; T.gold += 10; SFX.punch(); addShake(5); T.bonkT = 0.3; tText('จับโจรได้! +10g', T.robber.x, 150, '#f2c94c', true); }
        else tText('ยังไม่มีโจร...', T.kpos[0], 150, '#bba8ba');
      } else {
        if (T.fire && st.kind === 'kitchen') { T.fire.hp--; SFX.pour(); for (let n = 0; n < 5; n++) T.parts.push({ x: 34 + rnd(-14, 14), y: 92, vx: rnd(-30, 30), vy: rnd(-60, -20), life: 0.5, max: 0.5, col: '#cfe8ff' }); if (T.fire.hp <= 0) { T.fire = null; tText('ดับไฟแล้ว!', 34, 90, '#7fd6ff', true); SFX.serve(); } }
        else tText(T.fire ? 'ไปที่ครัวก่อน!' : 'ไม่มีไฟให้ดับ', T.kpos[1], 150, '#bba8ba');
      }
    }

    const rowdyNear = T.seats.some(s => s.cust && s.cust.type === 'rowdy' && !s.cust.leaving);
    const drain = (rowdyNear ? 1.5 : 1) * (T.fire ? 1.35 : 1);
    T.seats.forEach((s, i) => {
      const c = s.cust, sx = STATIONS[i + 2].x;
      if (s.cleanT > 0) { s.cleanT -= dt; if (s.cleanT <= 0) s.dirty = false; }
      if (!c) return;
      c.t += dt; c.bob += dt;
      if (c.leaving) { c.leaveT = (c.leaveT || 0) + dt; if (c.leaveT > 0.6) { s.cust = null; s.dirty = c.leaving !== 'calm'; } return; }
      if (c.type === 'rowdy') {
        c.rowdyT -= dt;
        if (c.rowdyT <= 0) { c.leaving = 'smash'; T.gold = Math.max(0, T.gold - 6); tText('ขี้เมาทุบแก้ว! -6g', sx, 70, '#ff6b6b'); SFX.fail(); }
        return;
      }
      c.pat -= dt * drain;
      if (c.pat <= 0) { c.leaving = 'angry'; T.angry++; tText('ช้าจริง! ไม่กินแล้ว!', sx, 66, '#ff6b6b'); SFX.fail(); }
    });

    T.spawnT -= dt;
    if (T.spawnT <= 0 && T.t < T.dur - 4) {
      T.spawnT = Math.max(2.4, rnd(3.6, 5.4) - T.t * 0.03);
      const free = T.seats.map((s, i) => i).filter(i => !T.seats[i].cust && !T.seats[i].dirty);
      if (free.length) { const i = pick(free); T.seats[i].cust = newCustomer(Math.random() < 0.15 ? 'rowdy' : 'normal'); }
    }
    for (const ev of T.events) {
      if (ev.done || T.t < ev.at) continue;
      ev.done = true;
      if (ev.type === 'vip') {
        const free = T.seats.map((s, i) => i).filter(i => !T.seats[i].cust);
        const i = free.length ? pick(free) : 1; T.seats[i].dirty = false; T.seats[i].cust = newCustomer('vip');
        T.banner = { text: 'VIP!', sub: 'ท่านหญิงแมรีโกลด์มาแล้ว จ่ายสองเท่า อย่าให้รอนาน!', t: 2.2 }; SFX.ult();
      } else if (ev.type === 'robber') { T.robber = { x: -10, caught: false, t: 0 }; SFX.hurt(); }
      else if (ev.type === 'fire') { T.fire = { hp: 6, t: 12 }; SFX.boom(); }
    }
    if (T.robber) {
      const r = T.robber;
      if (r.caught) { r.t += dt; if (r.t > 1) T.robber = null; }
      else { r.x += 40 * dt; if (r.x > 380) { const loss = Math.round(T.gold * 0.4); T.gold -= loss; tText('โดนปล้น! -' + loss + 'g', 370, 140, '#ff6b6b', true); SFX.fail(); T.robber = null; } }
    }
    if (T.fire) { T.fire.t -= dt; if (T.fire.t <= 0) { T.fire = null; T.gold = Math.max(0, T.gold - 10); tText('ไฟไหม้จนมอด ค่าซ่อม -10g', 80, 90, '#ff6b6b', true); } if (Math.random() < 0.6) T.parts.push({ x: 34 + rnd(-16, 16), y: 100, vx: rnd(-10, 10), vy: rnd(-60, -30), life: 0.5, max: 0.5, col: pick(['#ff6b2c', '#ffd35a', '#e2483b']) }); }
    for (const q of T.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    T.parts = T.parts.filter(q => q.life > 0);
    for (const t of T.texts) { t.life -= dt; t.y -= 16 * dt; }
    T.texts = T.texts.filter(t => t.life > 0);
    if (T.t >= T.dur) endTavern();
  }

  function seatAction(seat: Seat, st: { kind: string; x: number }) {
    const id = kidT(), c = seat.cust;
    if (id === 'arthur') {
      if (c && c.type === 'rowdy' && !c.leaving) { c.leaving = 'thrown'; T.kicked++; T.gold += 4; addShake(4); SFX.punch(); T.bonkT = 0.3; tText('โป๊ง! สร่างเมาซะ! +4g', st.x, 66, '#f2c94c', true); return; }
      if (seat.dirty && !c) { seat.cleanT = 0.3; T.pile += 1; SFX.pour(); for (let n = 0; n < 8; n++) T.parts.push({ x: st.x + rnd(-14, 14), y: 126, vx: rnd(-30, 30), vy: rnd(-60, -20), life: 0.5, max: 0.5, col: '#fff' }); tText('เก็บจานไปอ่าง', st.x, 108, '#cfe8ff'); return; }
      tText('ตรงนี้ไม่มีงาน', st.x, 108, '#bba8ba'); return;
    }
    if (id === 'percival') {
      if (!c || !c.order || c.leaving) { tText(seat.dirty ? 'อาเธอร์เป็นคนเก็บโต๊ะ' : 'ไม่มีออเดอร์', st.x, 108, '#bba8ba'); return; }
      const stock = c.order === 'beer' ? T.beers : T.dishes;
      if (!stock.length) { tText(c.order === 'beer' ? 'ยังไม่ได้รินเบียร์!' : 'อาหารยังไม่เสร็จ!', st.x, 108, '#ff9a7a'); SFX.fail(); return; }
      stock.sort((a, b) => b.q - a.q); const item = stock.shift()!;
      const base = c.order === 'beer' ? 6 : item.glow ? 16 : 9;
      const pay = Math.round(base * item.q * (c.type === 'vip' ? 2 : 1) * (c.pat / c.max > 0.5 ? 1.25 : 1) * (g.save.tools.spoon ? 1.2 : 1));
      T.gold += pay; T.served++; c.leaving = 'happy'; SFX.coin();
      tText('+' + pay + 'g', st.x, 62, '#f2c94c', true);
      for (let n = 0; n < 6; n++) T.parts.push({ x: st.x, y: 80, vx: rnd(-50, 50), vy: rnd(-80, -30), life: 0.7, max: 0.7, col: '#f2c94c' });
      return;
    }
    tText('โรสแมรี่ต้องอยู่ในครัว', st.x, 108, '#bba8ba');
  }
  function finishPour() {
    const v = T.pour!.v; T.pour = null; let q, label;
    if (v > 1) { tText('ล้นแก้ว! เสียของ', 368, 108, '#ff6b6b'); SFX.fail(); return; }
    if (v >= 0.74 && v <= 0.92) { q = 1.4; label = 'รินเป๊ะ!'; } else if (v >= 0.5) { q = 1; label = 'รินพอดี'; } else { q = 0.6; label = 'ฟองล้วน...'; }
    T.beers.push({ q }); tText(label, 368, 108, q > 1 ? '#ffd76a' : '#f6ead2'); SFX.serve();
  }
  function finishCook() {
    const c = T.cook!; T.cook = null;
    const pts = c.notes.reduce((a, n) => a + (n.res as number), 0);
    const q = pts >= 9 ? 1.5 : pts >= 6 ? 1.2 : pts >= 3 ? 1 : 0.6;
    const glow = c.glow && g.save.ing.glowcap > 0; if (glow) { g.save.ing.glowcap--; T.usedGlow++; }
    T.bowls--; T.dishes.push({ q, glow });
    tText((pts >= 9 ? 'สุดยอด! ' : pts < 3 ? 'ไหม้นิดหน่อย... ' : '') + (glow ? 'ต้มยำกุ้งพญามังกร' : 'ข้าวผัดร้าน'), 60, 98, glow ? '#ff9a5a' : '#f6ead2', true);
    SFX.serve();
  }
  /** summary of the last finished shift (results panel and Share) */
  let night: Night | null = null;
  function endTavern() {
    T.over = true; T.overT = 0;
    g.track('tavern_end', { gold: T.gold, served: T.served, angry: T.angry });
    const stars = clamp(Math.round((T.served * 1 - T.angry * 1.5) / 4), 0, 5);
    g.save.gold += T.gold; g.save.best = Math.max(g.save.best, T.gold); g.persist();
    night = { gold: T.gold, served: T.served, angry: T.angry, kicked: T.kicked, stars, usedGlow: T.usedGlow, net: NET.finish(T.net ?? null, { gold: T.gold }) };
  }

  function drawTavern() {
    const t = T.t;
    if (ENV.tav2) { ctx.drawImage(ENV.tav2, 0, 0, W, H); ctx.fillStyle = 'rgba(20,10,5,0.16)'; ctx.fillRect(0, 0, W, H);
      textC('The Tipsy Dragon', 230, 38, { size: 10, align: 'center', color: '#5a2e14', weight: 700, shadow: false }); textC('โรงเตี๊ยมมังกรเมา', 230, 51, { size: 7.5, align: 'center', thai: true, color: '#6a3a1c', shadow: false }); }
    else if (ENV.tavern) { ctx.drawImage(ENV.tavern, 0, 0, W, H); ctx.fillStyle = 'rgba(20,10,5,0.28)'; ctx.fillRect(0, 0, W, H); } else {
    // room
    rect(0, 0, W, H, '#2a1a12');
    for (let y = 16; y < 120; y += 10) for (let x = (y / 10) % 2 ? -12 : 0; x < W; x += 24) { rect(x + 0.5, y + 0.5, 23, 9, '#4a2e1e'); rect(x + 0.5, y + 0.5, 23, 1, '#5e3c26'); }
    for (const bx of [116, 340]) { rect(bx, 16, 6, 104, '#3a2416'); rect(bx + 1, 16, 1, 104, '#5a3a22'); }
    [[132, 26], [292, 26]].forEach(([x, y]) => { rect(x, y, 36, 28, '#1b1020'); const sk = ctx.createLinearGradient(0, y, 0, y + 28); sk.addColorStop(0, '#0c1a40'); sk.addColorStop(1, '#2a3a70'); ctx.fillStyle = sk; ctx.fillRect(x + 2, y + 2, 32, 24); rect(x + 17, y + 2, 2, 24, '#1b1020'); rect(x + 2, y + 13, 32, 2, '#1b1020'); rect(x + 8, y + 6, 1, 1, '#fff'); rect(x + 26, y + 19, 1, 1, '#fff'); });
    panel(178, 20, 104, 30, '#5a3a22', '#f2a93b');
    text('The Tipsy Dragon', 230, 23, { size: 10, align: 'center', color: '#ffd76a', weight: 700 });
    text('โรงเตี๊ยมมังกรเมา', 230, 35, { size: 7, align: 'center', thai: true, weight: 400 });
    for (const sx of [178, 236]) { rect(sx - 2, 66, 50, 2.5, '#2b1b14'); for (let k = 0; k < 6; k++) { const c = ['#3f8f5a', '#a056c9', '#c0392b', '#f2b134', '#4fb3d9', '#7cf5c8'][k]; rect(sx + k * 8, 55, 5, 11, '#1b1020'); rect(sx + k * 8 + 0.5, 57, 4, 8.5, c); rect(sx + k * 8 + 1, 57.5, 1, 4, '#ffffff66'); } }
    for (const lx of [70, 230, 350]) { rect(lx, 16, 0.5, 52, '#1b1020'); rect(lx - 5, 68, 11, 6, '#f2a93b'); glow(lx, 74, 46, 'rgba(255,190,90,A)', 0.22); }
    }
    // kitchen
    if (!g.fxArtReady) { rect(4, 58, 64, 62, '#1b1020'); rect(5, 59, 62, 60, T.fire ? '#4a1a10' : '#2a1a14'); }
    if (ENV.tav2) glow(61, 108, 22, 'rgba(255,120,40,A)', 0.3); else if (g.fxArtReady) { glow(36, 108, 22, 'rgba(255,120,40,A)', 0.4); fxB('stove', 36, 120, 1, 0.92); } else {
    rect(10, 96, 52, 22, '#4a4a55'); rect(10, 96, 52, 2, '#6a6a75'); glow(36, 98, 20, 'rgba(255,120,40,A)', 0.4);
    for (let k = 0; k < 5; k++) rect(16 + k * 9, 92 - Math.abs(Math.sin(t * 8 + k)) * 3, 4, 3 + Math.abs(Math.sin(t * 8 + k)) * 3, k % 2 ? '#ff6b2c' : '#ffd35a');
    ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.ellipse(36, 90, 14, 5, 0, 0, Math.PI); ctx.fill(); rect(50, 88, 10, 2, '#5a3a22'); }
    text('ครัว', 61, 84, { size: 7, align: 'center', thai: true, color: '#e8833a' });
    T.dishes.forEach((d, k) => dimg(icon('bowl', 2), 34 + k * 17, 128));
    // sink + dish pile
    if (ENV.tav2) {} else if (g.fxArtReady) fxB('sink', 92, 121); else {
    rect(74, 92, 36, 28, '#1b1020'); rect(75, 93, 34, 26, '#5a6a72'); rect(78, 95, 28, 10, '#2a4a5a'); rect(78, 95, 28, 3, '#6ab8d8');
    rect(90, 80, 2, 12, '#9aa0aa'); rect(90, 80, 8, 2, '#9aa0aa'); }
    for (let k = 0; k < Math.min(T.pile, 6); k++) dimg(icon('bowl2', 1), 100 + (k % 3) * 9, 112 - Math.floor(k / 3) * 6);
    text('อ่างล้างจาน', 120, 90, { size: 6, align: 'center', thai: true, color: '#cfe8ff' });
    text('จานสะอาด ' + T.bowls, 120, 81, { size: 6, align: 'center', thai: true, color: T.bowls ? '#9be15d' : '#ff6b6b' });
    // taps
    if (!g.fxArtReady) { rect(344, 60, 50, 60, '#1b1020'); rect(345, 61, 48, 58, '#2a1a14'); }
    if (ENV.tav2 && g.fxArtReady) fxB('taps', 292, 109, 1, 0.9); else if (g.fxArtReady) fxB('taps', 369, 119, 1, 0.9); else {
    for (let k = 0; k < 3; k++) { rect(350 + k * 14, 66, 8, 18, '#c08a3c'); rect(351 + k * 14, 67, 2, 16, '#e8b86a'); rect(353 + k * 14, 84, 2, 8, '#d8d8e0'); }
    rect(346, 100, 46, 14, '#5a3a22'); }
    text('ก๊อกเบียร์', 292, 58, { size: 6, align: 'center', thai: true, color: '#ffd76a' });
    T.beers.forEach((b, k) => dimg(icon('beer', 1), 280 + k * 8, 108));
    if (!ENV.tavern && !ENV.tav2) {
    // floor
    const fl = ctx.createLinearGradient(0, 120, 0, H); fl.addColorStop(0, '#6a4428'); fl.addColorStop(1, '#3a2416'); ctx.fillStyle = fl; ctx.fillRect(0, 120, W, H - 120);
    for (let x = 0; x < W; x += 30) rect(x, 120, 0.5, H - 120, '#4a2e1c');
    for (let y = 140; y < H; y += 20) rect(0, y, W, 0.5, '#4a2e1c');
    }
    // customers + counter
    T.seats.forEach((s, k) => drawCustomer(s, STATIONS[k + 2].x));
    if (ENV.tav2) { const k = ENV.tav2.width / W; ctx.drawImage(ENV.tav2, 159 * k, 104 * k, 151 * k, 54 * k, 159, 104, 151, 54); ctx.fillStyle = 'rgba(20,10,5,0.16)'; ctx.fillRect(159, 104, 151, 54); }
    else { rect(126, 126, 214, 24, '#1b1020'); rect(127, 127, 212, 6, '#a86a3a'); rect(127, 127, 212, 1.5, '#d89a5a'); rect(127, 133, 212, 16, '#7a4a2a');
    for (let x = 134; x < 336; x += 26) rect(x, 136, 1, 11, '#5a3a22'); }
    T.seats.forEach((s, k) => { const x = STATIONS[k + 2].x; if (s.dirty) { dimg(icon('bowl2', 1), x - 12, 114); dimg(icon('bowl', 1), x - 1, 115); if (s.cleanT > 0 && g.fxArtReady) { ctx.globalAlpha = clamp(s.cleanT / 0.3, 0, 1); fxB('dust', x, 128, 1, 0.5); ctx.globalAlpha = 1; } } });
    // robber
    if (T.robber) {
      const r = T.robber, x = Math.round(r.x), y = r.caught ? 186 : 160 + Math.abs(Math.sin(t * 10)) * 2;
      if (r.caught) { ctx.save(); ctx.translate(x + 12, 196); ctx.rotate(-Math.PI / 2); if (g.crewArtReady) { const ri = CREW_ART['robber_a']!.l; dimg(ri, -LW(ri) / 2, -LH(ri) + 6); } else dimg(thiefSprite(0).r, -17, -24); ctx.restore(); text('โอ๊ย!', x + 14, 172, { size: 8, align: 'center', thai: true }); dimg(icon('st_dizzy', 1), x + 22, 176); }
      else { if (g.crewArtReady) { const ri = CREW_ART['robber_b']!.l; dimg(ri, x - 2, 199 - LH(ri) - Math.abs(Math.sin(t * 10)) * 2); } else dimg(thiefSprite(Math.floor(t * 8) % 2).r, x - 2, 164); text('โจรป่า', x + 10, 154, { size: 6.5, align: 'center', thai: true, color: '#ff9a7a' }); }
    }
    // knights
    for (let i = 0; i < 3; i++) {
      const x = T.kpos[i], act = i === T.active, moving = Math.abs((act ? STATIONS[T.sel].x : STATIONS[HOME[i]].x) - x) > 2;
      const target = act ? STATIONS[T.sel].x : STATIONS[HOME[i]].x;
      const spr = knightSprite(i, moving ? (Math.floor(t * 10) % 2 ? 'run1' : 'run2') : 'stand');
      const face = target >= x || !moving ? 1 : -1;
      ctx.globalAlpha = act ? 1 : 0.85;
      dimg(face > 0 ? spr.r : spr.l, Math.round(x - 18), 156 - (i === 0 && T.bonkT > 0 ? 3 : 0));
      ctx.globalAlpha = 1;
      if (i === 2 && (T.beers.length || T.dishes.length)) { const tr = TRAY[T.dishes.length ? 'tray_mix' : 'tray_beer'], tw = 22; if (tr) { const th = tr.height * tw / tr.width; dimg(tr, Math.round((x + 12 - tw / 2) * RES) / RES, Math.round((178.5 - th) * RES) / RES, tw, th); } }
      if (i === 2 && T.harpT > 0) { ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 6, 182); ctx.quadraticCurveTo(x + 16, 168, x + 8, 160); ctx.stroke(); for (let k = 0; k < 3; k++) rect(x + 8 + k * 2, 164 + k, 0.5, 16 - k * 3, '#fff6c0'); }
      if (i === 0 && T.bonkT > 0) { ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.arc(x + 14, 160, 6, 0, 7); ctx.fill(); text('โป๊ง!', x + 20, 146, { size: 8, thai: true, color: '#ffd76a' }); }
      if (i === 0 && T.washT > 0) for (let k = 0; k < 3; k++) rect(x + 8 + k * 3, 166 - k * 2, 2, 2, '#bfe8ff');
      if (act) { ctx.fillStyle = '#f2a93b'; ctx.beginPath(); ctx.moveTo(x - 4, 148); ctx.lineTo(x + 4, 148); ctx.lineTo(x, 153); ctx.fill(); text(KNIGHTS[i].th, x, 140, { size: 7, align: 'center', thai: true, color: KNIGHTS[i].color }); }
    }
    // fire
    if (T.fire && g.fxArtReady) { glow(61, 90, 40, 'rgba(255,90,30,A)', 0.5); fxB('fire', 45, 116, 1, 0.55 + Math.sin(t * 13) * 0.05); fxB('fire', 79, 116, -1, 0.55 + Math.sin(t * 11 + 1) * 0.05); fxB('fire', 61, 118, Math.sin(t * 6) > 0 ? 1 : -1, 0.85 + Math.sin(t * 15) * 0.06); bar(35, 74, 52, 5, T.fire.hp / 6, '#ff6b2c'); }
    else if (T.fire) { for (let k = 0; k < 7; k++) { const fx = 10 + k * 8, fh = 12 + Math.abs(Math.sin(t * 12 + k)) * 16; rect(fx, 96 - fh, 6, fh, k % 2 ? '#ff6b2c' : '#ffd35a'); } glow(36, 80, 40, 'rgba(255,90,30,A)', 0.5); bar(10, 66, 52, 5, T.fire.hp / 6, '#ff6b2c'); }
    for (const q of T.parts) { ctx.globalAlpha = clamp(q.life / q.max, 0, 1); if (q.note) text('♪', q.x, q.y, { size: 9, color: q.col, shadow: false }); else rect(q.x, q.y, 2, 2, q.col); }
    ctx.globalAlpha = 1;
    for (const tx of T.texts) { ctx.globalAlpha = clamp(tx.life * 2, 0, 1); text(tx.str, tx.x, tx.y, { size: tx.big ? 9 : 7.5, align: 'center', color: tx.col, thai: true, weight: 600 }); }
    ctx.globalAlpha = 1;

    // rhythm QTE
    if (T.cook) {
      const c = T.cook; panel(84, 20, 232, 88, '#140d18f4', '#e8833a');
      text('โรสแมรี่ปรุง: ' + (c.glow ? 'ต้มยำกุ้งพญามังกร' : 'ข้าวผัดร้าน'), 92, 23, { size: 8, thai: true, color: '#ffb070' });
      for (let k = 0; k < 5; k++) rect(96, 42 + k * 6, 212, 0.5, '#5a4a5a');
      ctx.strokeStyle = '#f2a93b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(132, 54, 10, 0, 7); ctx.stroke();
      glow(132, 54, 14, 'rgba(242,169,59,A)', 0.25);
      c.notes.forEach(n => {
        const x = 132 + (n.t0 - c.time) * 80; if (x > 312 || x < 90) return;
        const col = n.res === undefined ? '#ffd76a' : n.res === 2 ? '#9be15d' : n.res === 1 ? '#7fd6ff' : '#ff6b6b';
        ctx.globalAlpha = n.res === undefined ? 1 : 0.5;
        if (g.uiArtReady && UI_BIG['ar_' + n.dir]) { if (n.res !== undefined) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, 54, 11, 0, 7); ctx.fill(); } uiBig(n.res === 0 ? 'ar_silver' : 'ar_' + n.dir, x, 54, 1); if (n.res === 0) { ctx.globalAlpha = 0.6; text(ARROW_GLYPH[n.dir], x, 49, { size: 9, align: 'center', weight: 700, color: '#1b1020', shadow: false }); } }
        else {
        ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(x, 54, 9, 7, -0.3, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, 54, 8, 6, -0.3, 0, 7); ctx.fill();
        rect(x + 7, 34, 1, 20, '#1b1020'); text(ARROW_GLYPH[n.dir], x, 48, { size: 10, align: 'center', weight: 700, color: '#1b1020', shadow: false }); }
        ctx.globalAlpha = 1;
      });
      ARROWS.forEach((d, k) => { const bx = 164 + k * 24, by = 92; if (g.uiArtReady && UI_BIG['ar_' + d]) uiBig('ar_' + d, bx, by, 0.85); btn('qa_' + d, bx - 11, by - 11, 22, 22); });
      if (c.flash) text(c.flash.txt, 132, 66, { size: 8, align: 'center', thai: true, color: c.flash.txt === 'Perfect!' ? '#9be15d' : c.flash.txt === 'Good' ? '#7fd6ff' : '#ff6b6b' });
    }
    if (T.pour) {
      const v = clamp(T.pour.v, 0, 1.15);
      if (E5.mug) { // E5 glass mug: beer rises inside it, gold band = target (0.74-0.92)
        const im = E5.mug, mh = 62, k = mh / 586, mw = im.width / im.height * mh, mx = 318, my = 108;
        const bot = my + 380 * k, top = bot - Math.min(v, 1.15) * 265 * k;
        rect(mx + 32 * k, top, (290 - 32) * k, bot - top, v > 1 ? '#e8503a' : '#f2b134'); rect(mx + 32 * k, top, (290 - 32) * k, 2, '#fffbea');
        ctx.drawImage(im, mx, my, mw, mh);
      } else {
      panel(320, 116, 20, 60, '#140d18f4', '#ffd76a'); rect(324, 120, 12, 52, '#140d18');
      rect(324, 120 + 52 * (1 - 0.92), 12, 52 * (0.92 - 0.74), '#6a5a12');
      rect(324, 172 - 52 * Math.min(1, v), 12, 52 * Math.min(1, v), v > 1 ? '#ff6b6b' : '#f2b134'); rect(324, 172 - 52 * Math.min(1, v), 12, 2, '#fffbea'); }
    }
    // top HUD
    if (!(g.uiArtReady && UI_BIG.frame_dark && (slice3(UI_BIG.frame_dark, -6, -1, W + 12, 16.5, 44), true))) rect(0, 0, W, 15, '#0c0810ec');
    textC('กะดึก', 6, 7.5, { size: 8, thai: true, color: '#bfa0ff' });
    const left = Math.max(0, T.dur - T.t), frac = clamp(T.t / T.dur, 0, 1);
    if (!frameBar('frame_blue', 33, 1.5, 172, 12, 1 - frac, left < 10 ? '#e2483b' : '#7a5ad8', left < 10 ? '#ff9a8a' : '#b8a2ff')) bar(36, 4, 170, 7, 1 - frac, left < 10 ? '#e2483b' : '#7a5ad8', '#1a1030');
    textC(Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'), 212, 7.5, { size: 9, color: left < 10 ? '#ff6b6b' : '#f6ead2', weight: 700 });
    dimg(icon('glowcap', 1), 250, 4); textC('x' + g.save.ing.glowcap, 260, 4 + LH(icon('glowcap', 1)) / 2, { size: 8, color: '#7cf5c8' });
    textC('จาน ' + T.bowls + '/' + (T.bowls + T.pile + T.dishes.length), 284, 7.5, { size: 7, thai: true, color: '#cfe8ff' });
    dimg(icon('coin', 2), 336, 2); textC(String(T.gold), 350, 2 + LH(icon('coin', 2)) / 2, { size: 11, color: '#f2c94c', weight: 700 });
    // alert / hint bar
    const alert = tavernAlert();
    if (alert) { const on = Math.floor(t * 4) % 2; rect(0, 198, W, 15, on ? '#7a1a10ee' : '#4a1a10ee'); rect(0, 198, W, 1, '#ffb347'); if (g.uiArtReady) { uiIcon('alert', 10, 205.5, 11); uiIcon('alert', W - 10, 205.5, 11); } text((g.uiArtReady ? '' : '⚠ ') + alert, W / 2, 200, { size: 8.5, align: 'center', thai: true, color: '#ffe0a0' }); }
    else { if (!(g.uiArtReady && UI_BIG.frame_dark && (slice3(UI_BIG.frame_dark, -6, 197.5, W + 12, 15, 44), true))) rect(0, 198, W, 15, '#0c0810d8'); text(KNIGHTS[T.active].th + ': ' + tavernHint(), W / 2, 200, { size: 8, align: 'center', thai: true, color: '#f6ead2' }); }
    controlStrip();
    if (T.banner) { const b = T.banner, a = clamp(Math.min(b.t, 2) * 3, 0, 1); ctx.globalAlpha = a; if (!nineBox('dialog', 70, 82, 260, 44, 16, 8)) rect(0, 84, W, 40, '#1b1020dd'); text(b.text, W / 2, 87, { size: 16, align: 'center', color: '#f2a93b', weight: 700 }); text(b.sub, W / 2, 108, { size: 9, align: 'center', thai: true }); ctx.globalAlpha = 1; }
    if (T.paused) { rect(0, 0, W, H, '#0d0812cc'); const tph = g.tpOnTxt ? 122 : 98; if (!nineBox('dialog', 120, 62, 160, tph, 16, 8)) panel(120, 62, 160, tph, '#1b120cf4', '#f2a93b'); text('หยุดชั่วคราว', W / 2, 70, { size: 16, align: 'center', color: '#f2a93b', thai: true });
      [['เล่นต่อ', 'tresume'], [T.fromTitle ? 'ออกจากร้าน (กลับหน้าแรก)' : 'ออกจากร้าน (กลับแผนที่)', 'tquit']].concat(g.tpOnTxt ? [['วิธีเล่น', 'thelp']] : []).forEach(([lb, id], k) => { const y = 98 + k * 24, sel = (T.pauseSel || 0) === k; btn(id, 136, y, 128, 19); uiBtn(136, y, 128, 19, sel, '#f2a93b', '#3a2a20', '#5a3a12', '#1b120c'); textC(lb, W / 2, y + 9.5, { size: 8.5, align: 'center', thai: true, color: sel ? '#ffe9b0' : '#cfc0b0' }); });
      text('↑↓ เลือก · Enter ตกลง · Esc เล่นต่อ', W / 2, g.tpOnTxt ? 170 : 146, { size: 6.5, align: 'center', thai: true, color: '#bba8ba', weight: 400 }); }
    if (T.over && night) {
      rect(0, 0, W, H, '#0d0812cc'); panel(80, 24, 240, 170);
      text('ปิดร้าน! สรุปกะดึก', W / 2, 30, { size: 13, align: 'center', color: '#f2a93b', thai: true });
      const rows: [string, string | number][] = [['รายได้', night.gold + 'g'], ['เสิร์ฟสำเร็จ', night.served], ['ลูกค้าหัวร้อนเดินออก', night.angry], ['ขี้เมาที่ถูกเคาะ', night.kicked], ['ต้มยำกุ้งพญามังกร', night.usedGlow]];
      rows.forEach(([a, b2], k) => { text(a, 100, 56 + k * 15, { size: 9, thai: true }); text(String(b2), 300, 56 + k * 15, { size: 10, align: 'right', color: '#ffd76a' }); });
      for (let k = 0; k < 5; k++) text('★', 160 + k * 20, 131, { size: 16, align: 'center', color: k < night.stars ? '#f2c94c' : '#3a2a40', shadow: k < night.stars });
      const nl = netLine(night.net, ['tavern_gold']); if (nl) text(nl.str, W / 2, 149, { size: 9, align: 'center', thai: true, color: nl.col, weight: 700 });
      if (T.overT > 0.8) text('Enter / แตะ: ไปห้องปรุงยา & ตีเหล็ก', W / 2, 162, { size: 9, align: 'center', thai: true, color: Math.floor(T.overT * 2) % 2 ? '#f6ead2' : '#bba8ba' });
    }
  }
  function fxDrawBub(k: string, cx: number, cy: number) { return uiBig(k, cx, cy, 0.95); }
  function angryFace(x: number, y: number) {
    if (uiIcon('angry', x, y, 14)) return;
    ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 7); ctx.fill(); ctx.fillStyle = '#ff6a3a'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill();
    rect(x - 3.5, y - 2.5, 2.5, 1, '#1b1020'); rect(x + 1, y - 2.5, 2.5, 1, '#1b1020'); rect(x - 2.5, y - 1, 1.5, 1.5, '#1b1020'); rect(x + 1, y - 1, 1.5, 1.5, '#1b1020');
    rect(x - 2.5, y + 2.5, 5, 1, '#1b1020'); rect(x - 3, y + 3.5, 1, 1, '#1b1020'); rect(x + 2, y + 3.5, 1, 1, '#1b1020');
    ctx.strokeStyle = '#e2183a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 5, y - 8); ctx.lineTo(x + 7, y - 6); ctx.moveTo(x + 9, y - 8); ctx.lineTo(x + 7, y - 6); ctx.moveTo(x + 5, y - 4); ctx.lineTo(x + 7, y - 6); ctx.moveTo(x + 9, y - 4); ctx.lineTo(x + 7, y - 6); ctx.stroke();
  }
  function drawCustomer(s: Seat, x: number) {
    const c = s.cust; if (!c) return;
    const leaveA = c.leaving ? clamp(1 - (c.leaveT || 0) / 0.6, 0, 1) : 1;
    let dy = Math.sin(c.bob * 3) * 0.8;
    const rowdy = c.type === 'rowdy', vip = c.type === 'vip';
    if (rowdy && !c.leaving) dy = -6 + Math.sin(c.t * 9) * 2;
    if (c.leaving === 'thrown') dy = -(c.leaveT || 0) * 120;
    ctx.globalAlpha = leaveA;
    const look = c.look, y = 87 + dy;
    if (g.crewArtReady) {
      if (!c.artKey) c.artKey = vip ? 'vip' : rowdy ? 'rowdy' : pick(CUST_KEYS);
      const ck = rowdy ? 'rowdy' : c.artKey, ci = CREW_ART[ck as string]![x > 230 ? 'r' : 'l'];
      dimg(ci, Math.round(x - LW(ci) / 2), Math.round(y - 6));
    } else {
    const skin = rowdy ? '#f09a8a' : look.skin;
    rect(x - 13, y + 18, 26, 18, '#1b1020'); rect(x - 12, y + 19, 24, 17, vip ? '#a056c9' : look.coat); rect(x - 12, y + 19, 24, 2, '#ffffff22');
    if (vip) { rect(x - 12, y + 19, 24, 3, '#f2c94c'); rect(x - 2, y + 22, 4, 4, '#f2c94c'); }
    ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(x, y + 10, 10.5, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(x, y + 10, 9.5, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = look.hair; ctx.beginPath(); ctx.ellipse(x, y + 4, 10, 5.5, 0, Math.PI, 0); ctx.fill(); rect(x - 10, y + 3, 3, 8, look.hair);
    const mood = c.order ? c.pat / c.max : 0.5;
    rect(x - 5, y + 9, 2.5, 3, '#1b1020'); rect(x + 3, y + 9, 2.5, 3, '#1b1020'); rect(x - 5, y + 9, 1, 1, '#fff'); rect(x + 3, y + 9, 1, 1, '#fff');
    if (rowdy) { rect(x - 3, y + 15, 6, 2, '#1b1020'); rect(x - 8, y + 12, 3, 1.5, '#e05a5a'); rect(x + 5, y + 12, 3, 1.5, '#e05a5a'); rect(x + 13, y + 10 + Math.sin(c.t * 9) * 3, 4, 13, '#3f8f5a'); rect(x + 14, y + 6 + Math.sin(c.t * 9) * 3, 2, 4, '#3f8f5a'); }
    else if (mood > 0.5) { rect(x - 3, y + 15, 6, 1, '#1b1020'); rect(x - 4, y + 14, 1, 1, '#1b1020'); rect(x + 3, y + 14, 1, 1, '#1b1020'); }
    else if (mood > 0.35) rect(x - 3, y + 15, 6, 1, '#1b1020');
    else { rect(x - 3, y + 15, 6, 1, '#1b1020'); rect(x - 4, y + 16, 1, 1, '#1b1020'); rect(x + 3, y + 16, 1, 1, '#1b1020'); rect(x - 6, y + 7, 4, 1, '#1b1020'); rect(x + 3, y + 7, 4, 1, '#1b1020'); }
    if (vip) dimg(icon('crown', 1), x - 4, y - 5);
    }
    ctx.globalAlpha = 1;
    if (c.leaving === 'happy') dimg(icon('happy', 2), x - 8, y - 22 - (c.leaveT || 0) * 20);
    if (c.leaving) return;
    if (c.order) {
      if (!(g.uiArtReady && UI_BIG['bub_beer'] && fxDrawBub(c.order === 'beer' ? 'bub_beer' : 'bub_bowl', x, y - 19))) {
      panel(x - 12, y - 28, 24, 20, '#f6efe0', '#1b1020');
      dimg(c.order === 'beer' ? icon('beer', 2) : icon('bowl', 2), x - 8, y - 26); }
      bar(x - 13, y - 6, 26, 4, c.pat / c.max, c.pat / c.max > 0.5 ? '#6ad36a' : c.pat / c.max > 0.35 ? '#f2b134' : '#e2483b');
      if (c.pat / c.max < 0.35) angryFace(x + 16, y - 20 + Math.sin(c.t * 6) * 1.5);
    } else if (rowdy) {
      text(Math.floor(c.t * 2) % 2 ? 'ฮึก!' : 'อาละวาด!', x, y - 16, { size: 8, align: 'center', thai: true, color: '#ff9a7a' });
      bar(x - 13, y - 4, 26, 3, c.rowdyT / 14, '#ff6b6b');
    }
  }
  return {
    STATIONS, HOME,
    start: startTavern,
    update: updateTavern,
    draw: drawTavern,
    end: endTavern,
    /** the running shift, or null */
    get T(): Tavern | null { return T; },
    set T(v: Tavern | null) { T = v as Tavern; },
    get night() { return night; },
  };
}
