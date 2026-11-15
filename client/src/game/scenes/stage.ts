// Action stages 1-2: start / checkpoint, player, crew helpers, enemies, boss, pickups, ultimates, the
// stage world and HUD drawing, and the stage-clear / game-over screens.
import { SFX } from '../audio';
import { keys, pressed } from '../input';
import type { Net, NetFinish, NetRun } from '../net';
import type { DrawKit, GameState, Img, ImgTable, TextOpt } from './host';

/* Loosely typed pieces of a stage run. Fields match what the code below reads and writes; optional
   fields are only set by some enemy types, specials or events. */
interface Box { x: number; y: number; w: number; h: number }
interface Special {
  type: string; t: number; fired?: boolean; spawn: number; dir: number; ox: number; tick: number;
}
interface Player extends Box {
  vx: number; vy: number; face: number; onGround: boolean; inv: number; atkT: number; atkCd: number; combo: number; comboT: number;
  special: Special | null; swapCd: number; anim: number; lunge: number; kbT: number; wasGround?: boolean; coyote?: number; jumpBuf?: number;
}
interface KnightHp { hp: number; max: number; down: boolean }
export interface Enemy extends Box {
  type: string; vx: number; vy: number; face: number; hp: number; max: number; t: number; flash: number; burn: number; slow: number; freeze: number;
  kbT: number; dead: boolean; cd: number; state: string; anim: number; active: boolean; contact: number;
  heavyish?: boolean; heavy?: boolean; burnTick?: number; throwT?: number; puffT?: number; squashT?: number; onGround?: boolean;
  /* set by the types or states that use them */
  chT: number; dt: number; dvx: number; dvy: number; homeY: number;
  /* boss only */
  squash: number; hops: number; bounces: number;
}
interface Proj extends Box {
  type: string; owner: 'p' | 'e'; vx: number; vy: number; dmg: number; life: number;
  aim?: boolean; status?: string | null; pierce?: boolean; set?: Set<Enemy>; grav?: number; rot?: number; hit?: boolean;
}
interface Hit extends Box {
  dmg: number; kb: number; delay: number; t: number; set: Set<Enemy>; status: string | null; from: number; noGauge?: boolean; shot?: boolean;
}
interface Pickup extends Box { type: string; bob: number; vy?: number; drop?: boolean; got?: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; size: number; grav?: boolean }
interface FloatText { x: number; y: number; str: string; col: string; life: number; big?: boolean; dmg?: boolean; size?: number }
type Fx = { type: 'bowl'; x: number; t: number } | { type: 'spark' | 'boom'; x: number; y: number; t: number };
interface Platform { x: number; y: number; w: number; got?: boolean }
interface Solid extends Box { kind?: string; broken?: boolean }
interface Banner { text: string; sub: string; t: number; boss?: boolean }
interface Gorn { t: number; x: number; state: string; mole?: boolean; hit?: boolean }
interface Loot { glowcap: number; truffle: number; crown: number; ember: number; chili: number; cork?: number }
export interface StageState {
  n: number; t: number; camX: number; paused: boolean; pits: { x: number; w: number }[]; shelf: Platform | null;
  p: Player; knights: KnightHp[]; active: number; gauge: number;
  enemies: Enemy[]; projs: Proj[]; hits: Hit[]; pickups: Pickup[]; parts: Particle[]; texts: FloatText[];
  platforms: Platform[]; solids: Solid[]; wall: Solid & { broken: boolean }; vaultOpened: boolean; pools: { x: number; w: number }[];
  boss: Enemy | null; bossOn: boolean; bossIntro: number; kills: number; loot: Loot; buff: boolean; ko: number;
  sup: { bart: number; bartCd: number; gorn: Gorn | null };
  ult: { t: number; hit: boolean } | null; banner: Banner | null; end: { t: number; ember: boolean } | null;
  speech: { who: string; line: string; t: number } | null; score: number; hint: string | null; checkpoint: boolean; poolT: number;
  net?: NetRun | null; netT0?: number; fx?: Fx[]; corpse?: { i: number; x: number; y: number; face: number; t: number } | null;
  aim?: { x: number; y: number; t: number }; lift?: { t: number } | null; stickyTold?: boolean; poisonT?: number;
}
export interface Results {
  t: number; stars: number; hearts: number; score: number; kills: number; time: number; loot: Loot; n: number; vault: boolean; ember: boolean; net: NetFinish | null;
}
type Sprite = { r: Img; l: Img };
type ImgTable2<K extends string> = Partial<Record<K, Sprite>> & Record<string, Sprite | undefined>;

export interface StageHost extends DrawKit, GameState {
  readonly KNIGHTS: { id: string; th: string; name: string; color: string }[];
  readonly CREW_ART: ImgTable2<'gorn_chop' | 'gorn_idle' | 'mole' | 'pixie' | 'bart'>;
  readonly ENV: ImgTable<'cellar' | 'cellar2' | 'arena' | 'farbg' | 'fungi' | 'ground2' | 'groundstrip' | 'midbg' | 'plat2' | 'platform' | 'sky' | 'trees'>;
  readonly E5: ImgTable<'pool' | 'shock' | 'spore' | 'mug'>;
  readonly E7: ImgTable<'pit' | 'pool' | 'bub0' | 'bub1' | 'bub2'>;
  readonly ENEMY_ART: ImgTable2<'boss_idle' | 'puff_cloud'>;
  readonly HERO_ATLAS: Partial<Record<'bowl', [number, number, number, number]>> & Record<string, [number, number, number, number] | undefined>;
  readonly HERO_HI: ImgTable<'arthur_atk1' | 'rosemary_atk3'>;
  readonly GROUND: number;
  readonly POOL_SQ: number;
  readonly NET: Net;
  readonly THAI: string;
  readonly heroAtlas: HTMLImageElement;
  readonly flies: { x: number; y: number; ph: number; s: number }[];
  readonly stars: { x: number; y: number; ph: number }[];
  readonly LANG: string;
  readonly tpOnTxt: boolean;
  readonly heroReady: boolean;
  readonly heroHiReady: boolean;
  readonly enemyArtReady: boolean;
  readonly crewArtReady: boolean;
  scene: string;
  help: string | null;
  rnd(a: number, b: number): number;
  clamp(v: number, a: number, b: number): number;
  pick<V>(arr: V[]): V;
  hash(i: number): number;
  overlap(a: Box, b: Box): boolean;
  addShake(v: number): void;
  anyConfirm(): boolean | undefined;
  bar(x: number, y: number, w: number, h: number, frac: number, col: string, back?: string): void;
  frameBar(k: string, x: number, y: number, w: number, h: number, frac: number, col: string, hi?: string): { ix: number; iy: number; iw: number; ih: number } | false;
  controlStrip(custom?: null): void;
  LW(img: Img): number;
  fxC(k: string, cx: number, cy: number, face?: number, s?: number): boolean;
  enemyArtFor(e: Enemy, frame: number): { key: string; spr: Sprite; hurt: boolean } | null;
  enemySprite(type: string, frame: number): Sprite;
  knightHead(i: number): Sprite;
  flip(c: Img): HTMLCanvasElement;
  recol(c: Img, f: string): HTMLCanvasElement;
  shade(c: Img, outline?: boolean, amt?: number): HTMLCanvasElement;
  tinted(c: Img, color: string): HTMLCanvasElement;
  noise(dur: number, vol?: number, delay?: number): void;
  outlined(str: string, x: number, y: number, size: number, col: string): void;
  shroom(x: number, baseY: number, h: number, capW: number, capH: number, stem: string, cap: string, under: string, spots: string | null, glowCol?: string | null): void;
  netLine(net: NetFinish, boards: string[]): { str: string; col: string } | null;
  crewLabel(id?: string): string;
  startTavern(): void;
}

export function createStage(host: StageHost) {
  const {
    CREW_ART, E5, E7, ENEMY_ART, ENV, GROUND, H, HERO_ATLAS, HERO_HI, KNIGHTS, LH, LW, NET, POOL_SQ, RES, THAI, UI_BIG, W, addShake, anyConfirm, bar,
    btn, clamp, controlStrip, ctx, dimg, enemyArtFor, enemySprite, flies, flip, frameBar, fxB, fxC, fxImg, glow, hash, heroAtlas, icon, knightHead,
    knightSprite, netLine, nineBox, noise, outlined, overlap, panel, persist, pick, recol, rect, rnd, shade, shroom, stars, text, textC, tinted,
    track, uiBtn, wrapText
  } = host;
  let hitKind = 'melee';
  const LEVEL_W = 3120, ARENA = 2720;
  function knightMax() { return 100 + 25 * host.save.up.stew; }
  function dmgMul() { return (1 + 0.2 * host.save.up.blade + (host.save.up.legend ? 0.5 : 0)) * (S && S.buff ? 1.3 : 1); }

  /** the running stage, null before the first one. Code below only runs inside a stage, so it reads S as set. */
  let S = null as unknown as StageState;
  function startStage(checkpoint?: boolean, n?: number) {
    n = n || (S && S.n) || 1;
    track(checkpoint ? 'stage_retry' : 'stage_start', { stage: n });
    const prevS = checkpoint ? S : null;
    const prevLoot = S && checkpoint ? S.loot : null, prevKills = S && checkpoint ? S.kills : 0, prevWall = S && checkpoint ? S.wall.broken : false, prevVault = S && checkpoint ? S.vaultOpened : false;
    S = {
      n, t: 0, camX: 0, paused: false, pits: [], shelf: null,
      p: { x: 40, y: GROUND - 36, w: 18, h: 36, vx: 0, vy: 0, face: 1, onGround: true, inv: 0, atkT: 0, atkCd: 0, combo: 0, comboT: 0, special: null, swapCd: 0, anim: 0, lunge: 0, kbT: 0 },
      knights: KNIGHTS.map(() => ({ hp: knightMax(), max: knightMax(), down: false })), active: 0,
      gauge: host.save.up.brew ? 50 : 0,
      enemies: [], projs: [], hits: [], pickups: [], parts: [], texts: [],
      platforms: [
        { x: 300, y: 152, w: 64 }, { x: 420, y: 124, w: 64 }, { x: 770, y: 146, w: 80 }, { x: 900, y: 116, w: 64 },
        { x: 1160, y: 162, w: 48 }, { x: 1600, y: 146, w: 72 }, { x: 1720, y: 116, w: 72 },
        { x: 2100, y: 150, w: 90 }, { x: 2250, y: 120, w: 64 }, { x: 2400, y: 150, w: 80 },
      ],
      solids: [ { x: 1240, y: 138, w: 200, h: 12, kind: 'slab' }, { x: 1424, y: 150, w: 16, h: 40, kind: 'rock' } ],
      wall: { x: 1240, y: 150, w: 16, h: 40, broken: prevWall },
      vaultOpened: prevVault,
      pools: [ { x: 620, w: 70 }, { x: 1520, w: 60 }, { x: 1990, w: 70 } ],
      boss: null, bossOn: false, bossIntro: 0, kills: prevKills,
      loot: prevLoot || { glowcap: 0, truffle: 0, crown: 0, ember: 0, chili: 0 }, buff: false, ko: 0,
      sup: { bart: host.save.tools && host.save.tools.bell ? 3 : 2, bartCd: 0, gorn: null },
      ult: null, banner: null, end: null, speech: null, score: 0, hint: null, checkpoint: !!checkpoint, poolT: 0,
    };
    S.net = n !== 1 ? null : prevS ? prevS.net : NET.start('stage'); S.netT0 = prevS ? (prevS.netT0 || 0) + prevS.t : 0;
    if (host.save.buff && !checkpoint) { S.buff = true; host.save.buff = false; persist(); S.gauge = Math.min(100, S.gauge + 50); }
    if (host.save.drink && !checkpoint) { host.save.drink = false; persist(); S.gauge = 100; }
    if (n === 2) layoutStage2(!!checkpoint, prevWall, prevVault);
    if (!S.wall.broken) S.solids.push(S.wall);
    const E = (type: string, x: number, y?: number) => S.enemies.push(makeEnemy(type, x, y));
    if (n === 2) { if (checkpoint) { S.p.x = ARENA - 120; S.camX = ARENA - 260; } }
    else if (checkpoint) {
      S.p.x = ARENA - 120; S.camX = ARENA - 260;
    } else {
      [250, 520, 700, 990, 1100, 1660, 1830, 2160, 2320, 2520].forEach(x => E('sporeling', x));
      [560, 1010, 1700, 2210, 2470].forEach(x => E('moth', x, rnd(80, 110)));
      [860, 1480, 2360].forEach(x => E('puff', x));
      E('mimic', 1950);
      const P = (type: string, x: number, y: number) => S.pickups.push({ type, x, y, w: 16, h: 16, bob: Math.random() * 6 });
      P('glowcap', 326, 132); P('beer', 446, 102); P('glowcap', 924, 96); P('ale', 1612, 126); P('beer', 1748, 94); P('glowcap', 2272, 100); P('glowcap', 2600, 170); P('beer', 1300, 116); P('chili', 790, 124); P('chili', 1745, 70); P('chili', 2420, 128);
      if (!S.vaultOpened) S.pickups.push({ type: 'chest', x: 1330, y: 174, w: 24, h: 16, bob: 0 });
    }
    host.scene = 'stage';
    S.banner = n === 2 ? { text: checkpoint ? 'Back to the cellar!' : 'STAGE 2', sub: checkpoint ? 'Baron von Barrel awaits' : 'ดันเจี้ยนไวน์โบราณ · Ancient Wine Dungeon', t: 2.2 }
      : { text: checkpoint ? 'Back to the throne!' : 'STAGE 1', sub: checkpoint ? 'King Shroomba awaits' : 'ป่าเห็ดพิษ · Poison Mushroom Forest', t: 2.2 };
  }

  /* ================================================================ STAGE 2: Ancient Wine Dungeon
     pits you jump over, sticky wine puddles, a dirt mound only the Mole can dig (vault),
     a high cellar shelf only the Pixie can reach, and the boss Baron von Barrel */
  function layoutStage2(checkpoint: boolean, prevWall: boolean, prevVault: boolean) {
    S.platforms = [
      { x: 300, y: 150, w: 64 }, { x: 430, y: 122, w: 56 }, { x: 800, y: 146, w: 72 }, { x: 930, y: 118, w: 64 },
      { x: 1540, y: 150, w: 72 }, { x: 2140, y: 150, w: 72 }, { x: 2290, y: 120, w: 64 }, { x: 2440, y: 146, w: 72 },
    ];
    S.shelf = { x: 1730, y: 70, w: 96, got: prevVault && S.shelf ? S.shelf.got : false };
    S.platforms.push(S.shelf);
    S.pits = [{ x: 600, w: 46 }, { x: 1040, w: 50 }, { x: 2010, w: 50 }];
    S.pools = [{ x: 700, w: 60 }, { x: 1640, w: 64 }, { x: 2560, w: 60 }];
    S.loot = Object.assign({ cork: 0 }, S.loot);
    if (checkpoint) return;
    S.enemies = [];
    const E = (type: string, x: number, y?: number) => S.enemies.push(makeEnemy(type, x, y));
    [260, 520, 880, 1150, 1700, 1900, 2240, 2500].forEach(x => E('keg', x));
    [480, 980, 1600, 2180, 2420].forEach(x => E('bat', x, rnd(78, 108)));
    [760, 1480, 2330].forEach(x => E('grape', x));
    [1120, 1960, 2600].forEach(x => E('imp', x));
    const P = (type: string, x: number, y: number) => S.pickups.push({ type, x, y, w: 16, h: 16, bob: Math.random() * 6 });
    S.pickups = [];
    P('glowcap', 326, 130); P('beer', 452, 100); P('chili', 824, 124); P('glowcap', 954, 96); P('ale', 1564, 128); P('beer', 1300, 116); P('chili', 2164, 128); P('beer', 2314, 98); P('glowcap', 2466, 124); P('ale', 2640, 170);
    if (!S.vaultOpened) S.pickups.push({ type: 'chest', x: 1330, y: 174, w: 24, h: 16, bob: 0 });
    S.pickups.push({ type: 'shelfchest', x: S.shelf.x + 36, y: S.shelf.y - 16, w: 24, h: 16, bob: 0 });
  }
  function overPit(x: number, w: number) { return S.pits.some(pt => x + w / 2 > pt.x + 2 && x + w / 2 < pt.x + pt.w - 2); }
  function pitAhead(e: Box, d: number) { const fx = d > 0 ? e.x + e.w + 6 : e.x - 6; return S.pits.some(pt => fx > pt.x && fx < pt.x + pt.w); }

  function makeEnemy(type: string, x: number, y?: number): Enemy {
    const base = { type, x, y: 0, vx: 0, vy: 0, face: -1, hp: 20, max: 20, w: 20, h: 22, t: Math.random() * 2, flash: 0, burn: 0, slow: 0, freeze: 0, kbT: 0, dead: false, cd: rnd(0.5, 2), state: 'idle', anim: 0, active: false, contact: 8 };
    if (type === 'sporeling') Object.assign(base, { hp: 22, max: 22, w: 20, h: 20 });
    if (type === 'moth') Object.assign(base, { hp: 14, max: 14, w: 20, h: 12, homeY: y, contact: 7 });
    if (type === 'puff') Object.assign(base, { hp: 34, max: 34, w: 22, h: 16, heavyish: true, contact: 6 });
    if (type === 'mimic') Object.assign(base, { hp: 60, max: 60, w: 24, h: 20, state: 'sleep', contact: 12 });
    if (type === 'keg') Object.assign(base, { hp: 30, max: 30, w: 22, h: 22, contact: 10 });
    if (type === 'bat') Object.assign(base, { hp: 16, max: 16, w: 20, h: 12, homeY: y, contact: 8 });
    if (type === 'grape') Object.assign(base, { hp: 28, max: 28, w: 20, h: 18, contact: 8 });
    if (type === 'grapelet') Object.assign(base, { hp: 8, max: 8, w: 12, h: 10, contact: 5, cd: rnd(0.3, 0.8) });
    if (type === 'imp') Object.assign(base, { hp: 22, max: 22, w: 18, h: 20, contact: 7, cd: rnd(1, 2) });
    base.y = type === 'moth' || type === 'bat' ? y as number : GROUND - base.h;
    return base as Enemy;
  }

  function activeK() { return S.knights[S.active]; }
  function kid() { return KNIGHTS[S.active].id; }

  function swapTo(i: number) {
    const p = S.p;
    if (i === S.active || S.knights[i].down || p.swapCd > 0 || S.ult) return;
    if (p.special && p.special.type === 'tempest') p.special = null;
    S.active = i; p.swapCd = 0.3; p.inv = Math.max(p.inv, 0.25); p.atkT = 0;
    for (let n = 0; n < 10; n++) S.parts.push({ x: p.x + 9 + rnd(-10, 10), y: p.y + rnd(0, 30), vx: rnd(-40, 40), vy: rnd(-60, -10), life: 0.4, max: 0.4, col: '#fff6d8', size: 3 });
    S.texts.push({ x: p.x + 9, y: p.y - 6, str: KNIGHTS[i].name + '!', col: KNIGHTS[i].color, life: 0.7 });
    SFX.swap();
  }
  function cycle(d: number) { for (let n = 1; n <= 3; n++) { const i = (S.active + d * n + 3) % 3; if (!S.knights[i].down) { swapTo(i); return; } } }

  function addGauge(v: number) { const before = S.gauge; S.gauge = clamp(S.gauge + v, 0, 100); if (before < 100 && S.gauge >= 100) S.texts.push({ x: S.p.x + 9, y: S.p.y - 14, str: 'GAUGE MAX!', col: '#7fd6ff', life: 1 }); }

  /* mouse aim: a click in a stage stores the cursor's world point; shots fired within 0.25 s fly toward it (kept in front of the knight, at most ~50 degrees up or down) */
  let stickVec: { dx: number; dy: number } | null = null; // mobile joystick direction (-1..1), used to aim shots when no tap aim is fresh
  function aimEnemy(sx: number, sy: number, face: number, px?: number, py?: number, rad?: number): [number, number] | null { /* nearest live monster on the facing side; with px/py, only ones within rad of that point */
    let best: [number, number] | null = null, bd = 1e9;
    for (const e of S.enemies) { if (e.dead || !e.active || e.state === 'sleep') continue; const ex = e.x + e.w / 2, ey = e.y + e.h * 0.5, dx = ex - sx; if (dx * face < 4 || Math.abs(dx) > W * 0.95) continue;
      const d = px === undefined ? Math.abs(dx) + Math.abs(ey - sy) * 0.6 : Math.hypot(ex - px, ey - py!) - Math.max(e.w, e.h) / 2; if (px !== undefined && d > rad!) continue; if (d < bd) { bd = d; best = [ex, ey]; } }
    return best;
  }
  function aimVel(sx: number, sy: number, speed: number, face: number): [number, number] {
    const a = S.aim, tap = a && S.t - a.t <= 0.25;
    const vec = (dx: number, dy: number): [number, number] => { if (dx * face < 10) dx = 10 * face; const lim = Math.abs(dx) * 1.2; dy = Math.max(-lim, Math.min(lim, dy)); const l = Math.hypot(dx, dy) || 1; return [speed * dx / l, speed * dy / l]; };
    const stickAim = (): [number, number] => { let dx = Math.max(Math.abs(stickVec!.dx), 0.35) * face, dy = stickVec!.dy; const lim = Math.abs(dx) * 1.2; dy = Math.max(-lim, Math.min(lim, dy)); const l = Math.hypot(dx, dy) || 1; return [speed * dx / l, speed * dy / l]; };
    if (document.body.classList.contains('tp-on')) {
      /* touch: shots lock onto monsters. A tap snaps to the monster near the tap, otherwise to the nearest one on the facing side.
         With no monster in front the shot flies straight ahead; the joystick never tilts shots, since a thumb drifts while running. */
      const t = (tap && aimEnemy(sx, sy, face, a.x, a.y, 70)) || aimEnemy(sx, sy, face);
      if (t) return vec(t[0] - sx, t[1] - sy);
      return [speed * face, 0];
    }
    if (!tap && stickVec && Math.abs(stickVec.dy) > 0.18) return stickAim();
    if (!tap) return [speed * face, 0];
    return vec(a.x - sx, a.y - sy);
  }
  function doAttack() {
    const p = S.p, m = dmgMul(), id = kid();
    if (id === 'arthur') {
      p.combo = p.comboT > 0 ? (p.combo + 1) % 3 : 0; p.comboT = 0.55;
      const heavy = p.combo === 2;
      p.atkT = heavy ? 0.26 : 0.18; p.atkCd = heavy ? 0.34 : 0.2;
      const w = heavy ? 30 : 26;
      S.hits.push({ x: p.face > 0 ? p.x + p.w - 2 : p.x - w + 2, y: p.y + 2, w, h: 24, dmg: (heavy ? 20 : 12) * m, kb: heavy ? 280 : 110, delay: 0.04, t: 0.1, set: new Set(), status: null, from: p.x + 9 });
      if (heavy) p.lunge = 0.14;
      SFX.slash();
    } else if (id === 'rosemary') {
      p.atkT = 0.24; p.atkCd = 0.26;
      S.hits.push({ x: p.face > 0 ? p.x + p.w - 4 : p.x - 22, y: p.y + 4, w: 26, h: 26, dmg: 7 * m, kb: 90, delay: 0.03, t: 0.12, set: new Set(), status: null, from: p.x + 9 });
      const sx = p.x + (p.face > 0 ? p.w + 6 : -18), [svx, svy] = aimVel(sx + 7, p.y + 18, 270, p.face);
      S.projs.push({ type: 'star', owner: 'p', x: sx, y: p.y + 10, w: 14, h: 16, vx: svx, vy: svy, aim: !!svy, dmg: 7 * m, status: null, life: 0.42, pierce: true, set: new Set() });
      SFX.arrow();
    } else {
      p.atkT = 0.2; p.atkCd = 0.36;
      const bx = p.x + (p.face > 0 ? p.w : -14), [bvx, bvy] = aimVel(bx + 7, p.y + 20, 300, p.face);
      S.projs.push({ type: 'bolt', owner: 'p', x: bx, y: p.y + 14, w: 14, h: 12, vx: bvx, vy: bvy, aim: !!bvy, dmg: 10 * m, status: 'slow', life: 1.1, pierce: false, set: new Set() });
      SFX.arrow();
    }
  }

  function doSpecial() {
    const p = S.p, m = dmgMul(), id = kid();
    if (S.gauge < 50 || p.special) return;
    S.gauge -= 50; SFX.special(); addShake(3);
    const names: Record<string, string> = { arthur: 'Flame Wave!', rosemary: 'Tomyumkung Power!', percival: 'Meteor Shower!' };
    const lines: Record<string, string> = { arthur: 'คลื่นเพลิง! เผามันให้เกรียม!', rosemary: 'พลังแห่งต้มยำกุ้ง! เมี้ยว!', percival: 'คาถาฝนดาวตก!' };
    say(KNIGHTS[S.active].th, lines[id] + '  (' + names[id] + ')');
    if (id === 'arthur') {
      p.atkT = 0.3; p.special = { type: 'skillet', t: 0.3 } as Special;
      S.projs.push({ type: 'firewave', owner: 'p', x: p.x + (p.face > 0 ? p.w : -34), y: p.y - 8, w: 34, h: 40, vx: 250 * p.face, vy: 0, dmg: 42 * m, status: 'burn', life: 1.1, pierce: true, set: new Set() });
    } else if (id === 'rosemary') {
      p.special = { type: 'tomyum', t: 0.7, fired: false } as Special; p.inv = Math.max(p.inv, 0.7);
    } else {
      p.special = { type: 'rain', t: 1.0, spawn: 0, dir: p.face, ox: p.x } as Special;
    }
  }

  function doUltimate() {
    if (S.gauge < 100 || S.ult) return;
    if (S.knights.filter(k => !k.down).length < 1) return;
    S.gauge = 0; S.ult = { t: 0, hit: false }; SFX.ult(); say('อาเธอร์', 'พลังแห่งต้มยำกุ้ง! ย้ากกก!', 2.6);
  }

  function say(who: string, line: string, t = 2.2) { if (S) S.speech = { who, line, t }; }
  function hurtEnemy(e: Enemy, dmg: number, kb: number, status: string | null | undefined, fromX: number, gauge = true) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 0.1;
    if (kb && !e.heavy) { e.vx = Math.sign(e.x + e.w / 2 - fromX || 1) * kb; e.kbT = 0.18; if (e.type !== 'moth') e.vy = -80; }
    if (status === 'burn') e.burn = 3.5;
    if (status === 'slow') e.slow = 2.5;
    if (status === 'freeze') e.freeze = e.heavy ? 0.5 : 1.6;
    if (gauge) addGauge(4);
    if (dmg >= 30) { S.texts.push({ x: e.x + e.w / 2, y: e.y - 18, str: 'HIT!', col: '#ffb347', life: 0.6, big: true }); S.fx = S.fx || []; S.fx.push({ type: 'spark', x: e.x + e.w / 2, y: e.y + e.h / 2, t: 0.3 }); }
    S.texts.push({ dmg: true, size: dmg >= 30 ? 13 : 10, x: e.x + e.w / 2 + rnd(-4, 4), y: e.y - 4, str: String(Math.round(dmg)), col: dmg >= 30 ? '#7dff6a' : status === 'burn' ? '#ffb347' : status ? '#9fe8ff' : '#fff6c0', life: 0.6 });
    for (let n = 0; n < 5; n++) S.parts.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: rnd(-90, 90), vy: rnd(-90, 30), life: 0.3, max: 0.3, col: status === 'burn' ? '#ff8a3d' : status ? '#bff4ff' : '#fff3b0', size: 2 });
    if (hitKind === 'shot') SFX.hitShot(); else SFX.hit();
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e: Enemy) {
    e.dead = true;
    if (e.type === 'boss') { bossDefeated(e); return; }
    S.kills++; S.score += e.type === 'mimic' ? 500 : 100; S.fx = S.fx || []; S.fx.push({ type: 'boom', x: e.x + e.w / 2, y: e.y + e.h / 2, t: 0.6 });
    for (let n = 0; n < 12; n++) S.parts.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: rnd(-120, 120), vy: rnd(-140, 20), life: 0.6, max: 0.6, col: pick(['#a056c9', '#f1e3ff', '#7ad37a', '#c9b34e']), size: 3, grav: true });
    const r = Math.random();
    if (e.type === 'grape') [-1, 0, 1].forEach(d => { const g = makeEnemy('grapelet', e.x + 4 + d * 8); g.active = true; g.vy = -180; g.vx = d * 60; g.kbT = 0.25; S.enemies.push(g); });
    if (e.type === 'grapelet') return;
    if (e.type === 'mimic') { [0, 1, 2].forEach(i => S.pickups.push({ type: 'glowcap', x: e.x + i * 10, y: e.y - 10, w: 16, h: 16, vy: -150, bob: 0, drop: true })); S.pickups.push({ type: 'beer', x: e.x + 4, y: e.y - 20, w: 16, h: 16, vy: -180, drop: true, bob: 0 }); }
    else if (r < 0.28) S.pickups.push({ type: 'beer', x: e.x, y: e.y - 6, w: 16, h: 16, vy: -150, drop: true, bob: 0 });
    else if (r < 0.48) S.pickups.push({ type: 'glowcap', x: e.x, y: e.y - 6, w: 16, h: 16, vy: -150, drop: true, bob: 0 });
  }

  function hurtPlayer(dmg: number, fromX: number) {
    const p = S.p;
    if (p.inv > 0 || S.ult || S.end) return;
    const k = activeK();
    k.hp -= dmg; p.inv = 1.0; p.kbT = 0.2; p.vx = Math.sign(p.x + 9 - fromX || -p.face) * 160; p.vy = -170; p.onGround = false;
    addShake(4); SFX.hurt();
    S.texts.push({ dmg: true, size: 11, x: p.x + 9, y: p.y - 4, str: String(Math.round(dmg)), col: '#ff4a3a', life: 0.7 });
    if (k.hp <= 0) {
      k.hp = 0; k.down = true; S.ko++; S.corpse = { i: S.active, x: p.x, y: p.y, face: p.face, t: 1.4 };
      const next = [1, 2].map(d => (S.active + d) % 3).find(i => !S.knights[i].down);
      S.texts.push({ x: p.x + 9, y: p.y - 18, str: KNIGHTS[S.active].name + ' is down!', col: '#ff6b6b', life: 1.4, big: true });
      if (next === undefined) { gameOver(); return; }
      S.p.swapCd = 0; swapTo(next); p.inv = 1.5;
    }
  }

  function gameOver() { host.scene = 'gameover'; overT = 0; }
  let overT = 0;

  function bossDefeated(b: Enemy) {
    if (S.n === 2) {
      addShake(8); SFX.boom();
      S.loot.cork!++; S.score += 6000; say('บารอนฟอนบาร์เรล', 'ไวน์ร้อยปีของข้า... เสียของหมดเลย!', 2.5);
      const frozen = b.freeze > 0 || b.slow > 0;
      if (frozen) S.loot.cork!++;
      S.end = { t: 0, ember: frozen };
      track('boss_defeated', { stage: 2, boss: 'baron_von_barrel', ember: frozen ? 1 : 0, time_s: Math.round(S.t) });
      for (let n = 0; n < 60; n++) S.parts.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: rnd(-220, 220), vy: rnd(-260, 40), life: 1.2, max: 1.2, col: pick(['#8a2040', '#c8304a', '#ffd35a', '#a0703a']), size: 4, grav: true });
      return;
    }
    addShake(8); SFX.boom();
    S.loot.crown++; S.score += 5000; say('ราชาเห็ด', 'ไม่นะ... มงกุฎของข้า...', 2.5);
    const ember = b.burn > 0;
    if (ember) S.loot.ember++;
    S.end = { t: 0, ember };
    track('boss_defeated', { stage: 1, boss: 'king_shroomba', ember: ember ? 1 : 0, time_s: Math.round(S.t) });
    for (let n = 0; n < 60; n++) S.parts.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: rnd(-220, 220), vy: rnd(-260, 40), life: 1.2, max: 1.2, col: pick(['#a056c9', '#f1e3ff', '#ffd35a', '#ff6b2c']), size: 4, grav: true });
  }

  function spawnBoss() {
    if (S.n === 2) { S.boss = { type: 'boss', x: ARENA + 280, y: -100, w: 70, h: 66, vx: 0, vy: 0, face: -1, hp: 560, max: 560, heavy: true, flash: 0, burn: 0, slow: 0, freeze: 0, kbT: 0, dead: false, state: 'intro', t: 2.2, contact: 14, hops: 0, onGround: false, squash: 0, bounces: 0 } as Enemy; S.enemies.push(S.boss); return; }
    S.boss = { type: 'boss', x: ARENA + 280, y: -100, w: 76, h: 70, vx: 0, vy: 0, face: -1, hp: 460, max: 460, heavy: true, flash: 0, burn: 0, slow: 0, freeze: 0, kbT: 0, dead: false, state: 'intro', t: 2.2, contact: 14, hops: 0, onGround: false, squash: 0 } as Enemy;
    S.enemies.push(S.boss);
  }

  function updateBaron(b: Enemy, dt: number) {
    const p = S.p, f = b.freeze > 0 ? 0 : b.slow > 0 ? 0.55 : 1, phase2 = b.hp < b.max * 0.5;
    b.vy += 900 * dt; b.y += b.vy * dt; b.x += b.vx * dt * (f || 0);
    b.squash = Math.max(0, b.squash - dt * 3);
    if (b.y + b.h >= GROUND) {
      if (!b.onGround && b.vy > 200) {
        addShake(b.state === 'intro' ? 6 : 5); SFX.boom(); b.squash = 1;
        if (b.state === 'air') [-1, 1].forEach(d => S.projs.push({ type: 'wave', owner: 'e', x: b.x + b.w / 2 - 8 + d * 30, y: GROUND - 14, w: 16, h: 14, vx: d * (phase2 ? 200 : 160), vy: 0, dmg: 12, life: 2.2 }));
      }
      b.y = GROUND - b.h; b.vy = 0; b.onGround = true; if (b.state !== 'roll') b.vx = 0;
    } else b.onGround = false;
    if (b.state === 'roll' && (b.x <= ARENA + 4 || b.x >= ARENA + W - b.w - 4)) { b.vx = -b.vx; b.bounces--; addShake(4); SFX.boom(); b.x = clamp(b.x, ARENA + 5, ARENA + W - b.w - 5); if (b.bounces <= 0) { b.state = 'idle'; b.vx = 0; b.t = phase2 ? 0.7 : 1.1; } }
    b.x = clamp(b.x, ARENA + 4, ARENA + W - b.w - 4);
    b.contact = b.state === 'roll' ? 18 : 14;
    if (f === 0) return;
    b.t -= dt * f;
    if (b.state !== 'air' && b.state !== 'roll') b.face = p.x + 9 < b.x + b.w / 2 ? -1 : 1;
    switch (b.state) {
      case 'intro': if (b.t <= 0 && b.onGround) { b.state = 'idle'; b.t = 0.8; } break;
      case 'idle':
        if (b.t <= 0) {
          const kegs = S.enemies.filter(e => !e.dead && e.type === 'keg').length, r = Math.random();
          if (r < 0.34) { b.state = 'curl'; b.t = 0.55; }
          else if (r < 0.66) { b.state = 'spray'; b.t = 0.6; }
          else if (r < 0.86 || !phase2 || kegs >= 2) { b.state = 'crouch'; b.t = phase2 ? 0.3 : 0.45; b.hops = phase2 ? 2 : 1; }
          else { b.state = 'summon'; b.t = 0.6; }
        }
        break;
      case 'curl': if (b.t <= 0) { b.state = 'roll'; b.vx = b.face * (phase2 ? 290 : 240); b.bounces = phase2 ? 3 : 2; SFX.special(); } break;
      case 'roll': if (Math.random() < 0.5) S.parts.push({ x: b.x + b.w / 2 - b.face * 30, y: GROUND - 3, vx: -b.vx * 0.2, vy: rnd(-40, -10), life: 0.4, max: 0.4, col: '#8a7a6a', size: 3 }); break;
      case 'crouch':
        if (b.t <= 0) { b.state = 'air'; b.vy = -430; b.onGround = false; const tx = clamp(p.x + 9 - b.w / 2, ARENA + 4, ARENA + W - b.w - 4); b.vx = (tx - b.x) / 0.95; SFX.jump(); }
        break;
      case 'air':
        if (b.onGround) { b.hops--; if (b.hops > 0) { b.state = 'crouch'; b.t = 0.2; } else { b.state = 'idle'; b.t = phase2 ? 0.55 : 0.9; } }
        break;
      case 'spray':
        if (b.t <= 0) {
          const n = phase2 ? 9 : 6;
          for (let i = 0; i < n; i++) S.projs.push({ type: 'wine', owner: 'e', x: b.x + b.w / 2 + b.face * 20, y: b.y + b.h * 0.55, w: 9, h: 9, vx: b.face * (110 + i * 26), vy: -120 - (i % 3) * 50, grav: 420, dmg: 10, life: 3 });
          noise(0.25, 0.06); b.state = 'idle'; b.t = phase2 ? 0.6 : 1.0;
        }
        break;
      case 'summon':
        if (b.t <= 0) { [-1, 1].forEach(d => { const e = makeEnemy('keg', clamp(b.x + b.w / 2 + d * 70, ARENA + 10, ARENA + W - 30)); e.active = true; e.vy = -200; S.enemies.push(e); }); SFX.special(); b.state = 'idle'; b.t = 0.9; }
        break;
    }
  }

  function updateBoss(b: Enemy, dt: number) {
    if (S.n === 2) { updateBaron(b, dt); return; }
    const p = S.p, f = b.freeze > 0 ? 0 : b.slow > 0 ? 0.55 : 1, phase2 = b.hp < b.max * 0.5;
    b.vy += 900 * dt; b.y += b.vy * dt; b.x += b.vx * dt * (f || 0);
    b.squash = Math.max(0, b.squash - dt * 3);
    if (b.y + b.h >= GROUND) {
      if (!b.onGround && b.vy > 200) {
        addShake(b.state === 'intro' ? 6 : 5); SFX.boom(); b.squash = 1;
        if (b.state === 'air') {
          [-1, 1].forEach(d => S.projs.push({ type: 'wave', owner: 'e', x: b.x + b.w / 2 - 8 + d * 30, y: GROUND - 14, w: 16, h: 14, vx: d * (phase2 ? 200 : 160), vy: 0, dmg: 12, life: 2.2 }));
        }
      }
      b.y = GROUND - b.h; b.vy = 0; b.onGround = true; b.vx = 0;
    } else b.onGround = false;
    b.x = clamp(b.x, ARENA + 4, ARENA + W - b.w - 4);
    if (f === 0) return;
    b.t -= dt * f;
    if (b.state !== 'air') b.face = p.x + 9 < b.x + b.w / 2 ? -1 : 1;
    switch (b.state) {
      case 'intro': if (b.t <= 0 && b.onGround) { b.state = 'idle'; b.t = 0.8; } break;
      case 'idle':
        if (b.t <= 0) {
          const minions = S.enemies.filter(e => !e.dead && e.type === 'sporeling').length;
          const r = Math.random();
          if (r < 0.42) { b.state = 'crouch'; b.t = phase2 ? 0.28 : 0.42; b.hops = phase2 ? 2 : 1; }
          else if (r < 0.78 || minions >= 3) { b.state = 'spray'; b.t = 0.55; }
          else { b.state = 'summon'; b.t = 0.6; }
        }
        break;
      case 'crouch':
        if (b.t <= 0) {
          b.state = 'air'; b.vy = -430; b.onGround = false;
          const tx = clamp(p.x + 9 - b.w / 2, ARENA + 4, ARENA + W - b.w - 4);
          b.vx = (tx - b.x) / 0.95; SFX.jump();
        }
        break;
      case 'air':
        if (b.onGround) { b.hops--; if (b.hops > 0) { b.state = 'crouch'; b.t = 0.2; } else { b.state = 'idle'; b.t = phase2 ? 0.55 : 0.9; } }
        break;
      case 'spray':
        if (b.t <= 0) {
          const n = phase2 ? 8 : 5;
          for (let i = 0; i < n; i++) S.projs.push({ type: 'spore', owner: 'e', x: b.x + b.w / 2, y: b.y + 10, w: 10, h: 10, vx: b.face * rnd(50, 210), vy: rnd(-330, -180), grav: 420, dmg: 10, life: 3 });
          noise(0.25, 0.06); b.state = 'idle'; b.t = phase2 ? 0.6 : 1.0;
        }
        break;
      case 'summon':
        if (b.t <= 0) {
          [-1, 1].forEach(d => { const e = makeEnemy('sporeling', clamp(b.x + b.w / 2 + d * 70, ARENA + 10, ARENA + W - 30)); e.active = true; e.vy = -200; S.enemies.push(e); });
          SFX.special(); b.state = 'idle'; b.t = 0.9;
        }
        break;
    }
  }

  function updateEnemy(e: Enemy, dt: number) {
    const p = S.p, px = p.x + p.w / 2, ex = e.x + e.w / 2, dx = px - ex;
    if (!e.active) { if (e.x < S.camX + W + 40 && e.x > S.camX - 80) e.active = true; else return; }
    if (e.type === 'boss') { updateBoss(e, dt); return; }
    const f = e.freeze > 0 ? 0 : e.slow > 0 ? 0.4 : 1;
    e.anim += dt * f; e.t += dt;
    if (e.kbT > 0) { e.kbT -= dt; e.x += e.vx * dt; e.vx *= 0.9; }
    if (e.type === 'sporeling') {
      if (e.kbT <= 0) { e.vx = Math.abs(dx) < 230 ? Math.sign(dx) * 42 * f : 0; e.x += e.vx * dt; if (e.vx) e.face = Math.sign(e.vx); }
      e.vy += 900 * dt; e.y += e.vy * dt; if (e.y + e.h > GROUND) { e.y = GROUND - e.h; e.vy = 0; }
    } else if (e.type === 'keg') {
      e.cd -= dt * f;
      if (e.kbT <= 0) {
        if (e.state === 'charge') { e.chT -= dt; if (e.chT <= 0 || pitAhead(e, e.vx)) { e.state = 'idle'; e.cd = rnd(1.4, 2.2); e.vx = 0; } }
        else if (e.state === 'wind') { e.chT -= dt * f; e.vx = 0; if (e.chT <= 0) { e.state = 'charge'; e.vx = e.face * 175; e.chT = 0.75; } }
        else { e.vx = Math.abs(dx) < 230 ? Math.sign(dx) * 36 * f : 0; if (e.vx) e.face = Math.sign(e.vx); if (Math.abs(dx) < 120 && Math.abs(p.y - e.y) < 40 && e.cd <= 0 && f > 0) { e.state = 'wind'; e.chT = 0.4; e.face = Math.sign(dx) || 1; } }
        if (pitAhead(e, e.vx)) e.vx = 0;
        e.x += e.vx * dt * (e.state === 'charge' ? f : 1);
      }
      e.contact = e.state === 'charge' ? 14 : 10;
      e.vy += 900 * dt; e.y += e.vy * dt; if (e.y + e.h > GROUND && !overPit(e.x, e.w)) { e.y = GROUND - e.h; e.vy = 0; }
    } else if (e.type === 'grape' || e.type === 'grapelet') {
      e.cd -= dt * f; const onG = e.y + e.h >= GROUND - 0.5;
      if (onG && e.kbT <= 0) { e.vx = 0; if (e.cd <= 0 && f > 0 && Math.abs(dx) < 240) { const d = Math.sign(dx) || 1; if (!pitAhead(e, d)) { e.vy = e.type === 'grape' ? -250 : -190; e.vx = d * (e.type === 'grape' ? 70 : 85); e.face = d; } e.cd = e.type === 'grape' ? rnd(0.9, 1.3) : rnd(0.5, 0.8); e.squashT = 0.15; } }
      if (e.kbT <= 0) e.x += e.vx * dt * f;
      e.squashT = Math.max(0, (e.squashT || 0) - dt);
      e.vy += 900 * dt; e.y += e.vy * dt; if (e.y + e.h > GROUND && !overPit(e.x, e.w)) { if (e.vy > 120) e.squashT = 0.15; e.y = GROUND - e.h; e.vy = 0; }
    } else if (e.type === 'imp') {
      e.cd -= dt * f; e.face = Math.sign(dx) || 1;
      if (e.kbT <= 0) { const want = Math.abs(dx) < 110 ? -1 : Math.abs(dx) > 190 ? 1 : 0; e.vx = want * Math.sign(dx) * 40 * f; if (pitAhead(e, e.vx)) e.vx = 0; e.x += e.vx * dt; }
      if (e.cd <= 0 && Math.abs(dx) < 260 && f > 0) { e.cd = rnd(2, 2.6); e.throwT = 0.3; const tt = 0.9; S.projs.push({ type: 'bottle', owner: 'e', x: ex - 4, y: e.y - 2, w: 8, h: 8, vx: dx / tt, vy: -250, grav: 500, dmg: 10, life: 3 }); }
      if (e.throwT) e.throwT = Math.max(0, e.throwT - dt);
      e.vy += 900 * dt; e.y += e.vy * dt; if (e.y + e.h > GROUND && !overPit(e.x, e.w)) { e.y = GROUND - e.h; e.vy = 0; }
    } else if (e.type === 'moth' || e.type === 'bat') {
      e.cd -= dt * f;
      if (e.state === 'idle') {
        if (e.kbT <= 0) { e.x += Math.sign(dx) * 26 * f * dt; e.y = e.homeY + Math.sin(e.t * 3) * 10; }
        e.face = Math.sign(dx) || 1;
        if (Math.abs(dx) < 130 && e.cd <= 0 && f > 0) { e.state = 'dive'; const ang = Math.atan2(p.y + 12 - e.y, dx); e.dvx = Math.cos(ang) * 170; e.dvy = Math.sin(ang) * 170; e.dt = 0.9; }
      } else if (e.state === 'dive') {
        e.x += e.dvx * dt * f; e.y += e.dvy * dt * f; e.dt -= dt * f;
        if (e.dt <= 0 || e.y > GROUND - 14) { e.state = 'back'; }
      } else { e.y += (e.homeY - e.y) * dt * 2 * f; if (Math.abs(e.y - e.homeY) < 3) { e.state = 'idle'; e.cd = rnd(1.4, 2.4); } }
    } else if (e.type === 'puff') {
      e.cd -= dt * f; e.face = Math.sign(dx) || 1;
      if (e.cd <= 0 && Math.abs(dx) < 260) { e.cd = 2.6; e.puffT = 0.3; S.projs.push({ type: 'cloud', owner: 'e', x: ex - 6, y: e.y - 4, w: 12, h: 12, vx: Math.sign(dx) * 80, vy: -10, dmg: 9, life: 3 }); noise(0.15, 0.04); }
      if (e.puffT) e.puffT = Math.max(0, e.puffT - dt);
    } else if (e.type === 'mimic') {
      if (e.state === 'sleep') { if (Math.abs(dx) < 54 && Math.abs(p.y - e.y) < 40) { e.state = 'awake'; S.texts.push({ x: ex, y: e.y - 14, str: 'MIMIC!', col: '#ff6b6b', life: 1, big: true }); SFX.hurt(); } }
      else {
        e.face = Math.sign(dx) || 1; e.cd -= dt * f;
        if (e.cd <= 0 && e.y + e.h >= GROUND - 1) { e.vy = -260; e.vx = Math.sign(dx) * 90; e.cd = 0.9; }
        e.vy += 900 * dt; e.y += e.vy * dt; if (e.kbT <= 0) e.x += e.vx * dt * f;
        if (e.y + e.h > GROUND) { e.y = GROUND - e.h; e.vy = 0; e.vx = 0; }
      }
    }
    if (e.x < 0) e.x = 0;
    if (S.bossOn && (e.type === 'sporeling' || e.type === 'keg')) e.x = clamp(e.x, ARENA, ARENA + W - e.w);
    if (e.y > H + 30 && !e.dead) { e.dead = true; S.kills++; S.score += 100; } /* fell into a pit */
  }

  function updateStage(dt: number) {
    if (pressed.pause) S.paused = !S.paused;
    if (S.paused) { if (pressed['ui:shelp']) { host.help = 'stage'; return; } if (pressed.ok || pressed['click'] || pressed['ui:sresume']) S.paused = false; return; }
    S.t += dt;
    const p = S.p;
    if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) S.banner = null; }
    if (S.speech) { S.speech.t -= dt; if (S.speech.t <= 0) S.speech = null; }

    /* ultimate cinematic freezes the world */
    if (S.ult) {
      const u = S.ult; u.t += dt;
      if (!u.hit && u.t > 0.75) {
        u.hit = true; addShake(10); SFX.boom();
        S.enemies.forEach(e => { if (!e.dead && e.active && e.x + e.w > S.camX - 10 && e.x < S.camX + W + 10) hurtEnemy(e, 150 * dmgMul(), 200, 'burn', p.x + 9, false); });
        S.projs = S.projs.filter(pr => pr.owner === 'p');
        for (let n = 0; n < 80; n++) S.parts.push({ x: S.camX + W / 2 + rnd(-40, 40), y: 150, vx: rnd(-300, 300), vy: rnd(-320, -60), life: 1.2, max: 1.2, col: pick(['#e2552e', '#ff9a3d', '#ffd35a', '#7ad37a', '#fff']), size: 4, grav: true });
      }
      if (u.t > 2.1) S.ult = null;
      updateParticles(dt);
      return;
    }

    /* swapping + actions */
    if (pressed.k1) swapTo(0); if (pressed.k2) swapTo(1); if (pressed.k3) swapTo(2);
    if (pressed.next) cycle(1); if (pressed.prev) cycle(-1);
    p.swapCd = Math.max(0, p.swapCd - dt); p.inv = Math.max(0, p.inv - dt); p.atkCd = Math.max(0, p.atkCd - dt); p.atkT = Math.max(0, p.atkT - dt); p.comboT = Math.max(0, p.comboT - dt);
    S.sup.bartCd = Math.max(0, S.sup.bartCd - dt);
    const busy = p.special && p.special.type === 'tempest';
    if (!S.end) {
      if (pressed.atk && p.atkCd <= 0 && !busy) doAttack();
      if (pressed.sp) doSpecial();
      if (pressed.ult) doUltimate();
      if (pressed.sup) callSupport();
    }

    /* movement */
    const id = kid(), sticky = S.n === 2 && p.onGround && p.y + p.h >= GROUND - 1 && S.pools.some(pl => p.x + p.w > pl.x + 4 && p.x < pl.x + pl.w - 4);
    const speed = (id === 'rosemary' ? 122 : id === 'percival' ? 96 : 104) * (sticky ? 0.45 : 1);
    if (sticky && !S.stickyTold) { S.stickyTold = true; S.texts.push({ x: p.x + 9, y: p.y - 8, str: 'ไวน์เหนียว! เดินช้าลง', col: '#ff8aa0', life: 1.2 }); }
    let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (S.end) dir = 0;
    if (p.kbT > 0) { p.kbT -= dt; }
    else if (busy) { p.vx = p.face * 210; }
    else if (p.lunge > 0) { p.lunge -= dt; p.vx = p.face * 230; }
    else { p.vx = dir * speed * (p.atkT > 0 && p.onGround && id === 'percival' ? 0.3 : 1); if (dir) p.face = dir; }
    if (pressed.up && p.onGround && !S.end && !S.lift) { p.vy = sticky ? -270 : -335; p.onGround = false; SFX.jump(); }
    if (!keys.up && p.vy < -140) p.vy = -140;
    p.vy = Math.min(p.vy + 900 * dt, 520);
    if (S.lift) { /* the Pixie carries the knight up to the high shelf */
      const L = S.lift; L.t += dt; p.vx = 0; p.vy = 0; p.inv = Math.max(p.inv, 0.3);
      const tx = S.shelf!.x + 14, ty = S.shelf!.y - p.h; p.x += (tx - p.x) * Math.min(1, dt * 2.5); p.y += (ty - 6 - p.y) * Math.min(1, dt * 2.2);
      if (L.t > 1.4) { p.x = tx; p.y = ty; p.onGround = true; S.lift = null; say('พิกซี่', 'ถึงแล้ว! ตรงนี้มีหีบลับด้วยนะ~'); }
    } else moveBody(p, dt);
    if (S.n === 2 && p.y > H + 20) { /* fell into a pit */
      const pt = S.pits.find(q => p.x + p.w / 2 > q.x - 20 && p.x + p.w / 2 < q.x + q.w + 20) || S.pits[0];
      p.x = pt.x - 28; p.y = GROUND - p.h - 30; p.vx = 0; p.vy = 0; p.face = 1;
      const k = activeK(); k.hp = Math.max(1, k.hp - 15); p.inv = 1.2; addShake(3); SFX.hurt();
      S.texts.push({ x: p.x + 9, y: p.y - 8, str: '-15 ตกหลุม!', col: '#ff6b6b', life: 1 });
    }
    const leftBound = S.bossOn ? ARENA : Math.max(0, S.camX - 4);
    const rightBound = S.bossOn ? ARENA + W : LEVEL_W;
    p.x = clamp(p.x, leftBound, rightBound - p.w);
    p.anim += dt * (Math.abs(p.vx) > 1 ? 1 : 0);

    /* specials over time */
    if (p.special) {
      const sp = p.special; sp.t -= dt;
      if (sp.type === 'tempest') {
        sp.tick -= dt;
        if (sp.tick <= 0) { sp.tick = 0.09; S.hits.push({ x: p.x - 18, y: p.y - 4, w: p.w + 36, h: 36, dmg: 7 * dmgMul(), kb: 70, delay: 0, t: 0.05, set: new Set(), status: null, from: p.x + 9, noGauge: true }); }
        if (Math.random() < 0.8) S.parts.push({ x: p.x + 9 + rnd(-20, 20), y: p.y + rnd(0, 30), vx: rnd(-60, 60), vy: rnd(-40, 0), life: 0.25, max: 0.25, col: pick(['#ffd35a', '#e8833a', '#fff']), size: 2 });
      } else if (sp.type === 'tomyum') {
        if (Math.random() < 0.9) { const a = Math.random() * 6.28; S.parts.push({ x: p.x + 9 + p.face * 16 + Math.cos(a) * 14, y: p.y + 14 + Math.sin(a) * 14, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40, life: 0.3, max: 0.3, col: pick(['#ffd35a', '#fff', '#ff9a3d']), size: 2 }); }
        if (!sp.fired && sp.t < 0.25) { sp.fired = true; S.projs.push({ type: 'bowl', owner: 'p', x: p.x + 9 + p.face * 70 - 22, y: -40, w: 44, h: 30, vx: 0, vy: 420, dmg: 0, life: 2, pierce: true, set: new Set() }); }
      } else if (sp.type === 'rain') {
        sp.spawn -= dt;
        while (sp.spawn <= 0) { sp.spawn += 0.06; S.projs.push({ type: 'icefall', owner: 'p', x: sp.ox + sp.dir * rnd(20, 230), y: rnd(-30, -6), w: 10, h: 10, vx: sp.dir * 60, vy: 340, dmg: 14 * dmgMul(), status: 'freeze', life: 1.2, pierce: false, set: new Set() }); }
      }
      if (sp.t <= 0) p.special = null;
    }

    /* poison pools */
    S.poolT -= dt;
    if (S.n !== 2 && p.onGround && p.y + p.h >= GROUND - 1 && S.pools.some(pl => p.x + p.w > pl.x + 4 && p.x < pl.x + pl.w - 4) && S.poolT <= 0) { S.poolT = 0.5; S.poisonT = 0.6; const k = activeK(); if (p.inv <= 0) { k.hp = Math.max(1, k.hp - 6); S.texts.push({ x: p.x + 9, y: p.y - 4, str: '-6 poison', col: '#9be15d', life: 0.6 }); SFX.hurt(); } }

    /* hitboxes */
    for (const h of S.hits) {
      h.delay -= dt; if (h.delay > 0) continue; h.t -= dt;
      for (const e of S.enemies) if (!e.dead && e.active && !h.set.has(e) && overlap(h, e)) { h.set.add(e); hurtEnemy(e, h.dmg, h.kb, h.status, h.from, !h.noGauge); }
      if (h.noGauge && h.set.size) addGauge(0.6 * h.set.size);
    }
    S.hits = S.hits.filter(h => h.delay > 0 || h.t > 0);

    /* enemies */
    for (const e of S.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt); e.slow = Math.max(0, e.slow - dt); e.freeze = Math.max(0, e.freeze - dt);
      if (e.burn > 0) { e.burn -= dt; e.burnTick = (e.burnTick || 0) - dt; if (e.burnTick <= 0) { e.burnTick = 0.5; e.hp -= 3; S.texts.push({ x: e.x + e.w / 2, y: e.y - 2, str: '3', col: '#ffb347', life: 0.4 }); if (e.hp <= 0) killEnemy(e); } }
      if (e.dead) continue;
      updateEnemy(e, dt);
      if (e.active && !e.dead && e.freeze <= 0 && overlap(p, e) && !(e.type === 'mimic' && e.state === 'sleep') && !(e.type === 'boss' && e.state === 'intro')) hurtPlayer(e.contact, e.x + e.w / 2);
    }
    S.enemies = S.enemies.filter(e => !e.dead || e === S.boss);

    /* projectiles */
    for (const pr of S.projs) {
      pr.life -= dt;
      if (pr.grav) pr.vy += pr.grav * dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (pr.aim && pr.y + pr.h > GROUND + 6) pr.life = 0;
      if (pr.owner === 'p') {
        for (const e of S.enemies) if (!e.dead && e.active && !pr.set!.has(e) && overlap(pr, e)) { pr.set!.add(e); hitKind = 'shot'; hurtEnemy(e, pr.dmg, pr.type === 'firewave' ? 160 : 40, pr.status, pr.x - pr.vx, true); hitKind = 'melee'; if (!pr.pierce) { pr.life = 0; break; } }
        if (pr.type === 'bowl' && pr.y + pr.h >= GROUND) {
          pr.life = 0; addShake(7); SFX.boom();
          const zone = { x: pr.x - 40, y: GROUND - 70, w: pr.w + 80, h: 70 };
          S.enemies.forEach(e => { if (!e.dead && e.active && overlap(zone, e)) hurtEnemy(e, 48 * dmgMul(), 220, 'burn', pr.x + pr.w / 2); });
          for (let n = 0; n < 50; n++) S.parts.push({ x: pr.x + pr.w / 2 + rnd(-20, 20), y: GROUND - 20, vx: rnd(-220, 220), vy: rnd(-300, -60), life: 1, max: 1, col: pick(['#e2552e', '#ff8a3d', '#ffd35a', '#7ad37a', '#c6e86a', '#ff4a3a', '#fff']), size: pick([2, 3, 4]), grav: true });
          S.fx = S.fx || []; S.fx.push({ type: 'bowl', x: pr.x, t: 0.9 });
        }
        if (pr.type === 'icefall' && pr.y > GROUND - pr.h) { pr.life = 0; for (let n = 0; n < 3; n++) S.parts.push({ x: pr.x, y: GROUND - 2, vx: rnd(-50, 50), vy: rnd(-60, -10), life: 0.3, max: 0.3, col: '#bff4ff', size: 2 }); }
        if (pr.type === 'firewave' && Math.random() < 0.7) S.parts.push({ x: pr.x + rnd(0, pr.w), y: pr.y + rnd(0, pr.h), vx: -pr.vx * 0.1, vy: rnd(-60, -10), life: 0.35, max: 0.35, col: pick(['#ff6b2c', '#ffd35a', '#e2483b']), size: 3 });
      } else {
        if (overlap(pr, p)) { hurtPlayer(pr.dmg, pr.x); if (pr.type !== 'wave') pr.life = 0; }
        if ((pr.type === 'bottle' || pr.type === 'wine') && pr.y + pr.h > GROUND && !overPit(pr.x, pr.w)) { pr.life = 0; for (let n = 0; n < (pr.type === 'bottle' ? 7 : 3); n++) S.parts.push({ x: pr.x + 4, y: GROUND - 3, vx: rnd(-60, 60), vy: rnd(-90, -20), life: 0.45, max: 0.45, col: pick(pr.type === 'bottle' ? ['#7ad37a', '#c8304a', '#e8fff0'] : ['#c8304a', '#8a2040']), size: 2, grav: true }); if (pr.type === 'bottle') noise(0.08, 0.05); }
        if (pr.type === 'spore' && pr.y + pr.h > GROUND) { pr.life = 0; for (let n = 0; n < 4; n++) S.parts.push({ x: pr.x + 5, y: GROUND - 3, vx: rnd(-40, 40), vy: rnd(-50, -10), life: 0.4, max: 0.4, col: '#c88ae8', size: 2 }); }
      }
    }
    S.projs = S.projs.filter(pr => pr.life > 0 && pr.x > S.camX - 80 && pr.x < S.camX + W + 80);

    /* pickups */
    for (const it of S.pickups) {
      if (it.drop) { it.vy! += 700 * dt; it.y += it.vy! * dt; if (it.y + it.h > GROUND && !(S.pits.length && overPit(it.x, it.w))) { it.y = GROUND - it.h; it.vy = 0; it.drop = false; } if (it.y > H + 20) it.got = true; }
      it.bob += dt;
      if (it.got || !overlap(p, it)) continue;
      if (it.type === 'shelfchest') { if (!S.shelf!.got) { S.shelf!.got = true; SFX.chest(); S.loot.glowcap += 2; S.loot.chili += 2; addGauge(40); S.score += 800; S.texts.push({ x: it.x + 12, y: it.y - 20, str: 'หีบบนชั้นลับ! +SP', col: '#e8c76a', life: 2, big: true }); } continue; }
      if (it.type === 'chest' && S.n === 2) { if (!S.vaultOpened) { S.vaultOpened = true; SFX.chest(); it.got = true; S.loot.truffle++; S.loot.cork!++; S.score += 800; S.texts.push({ x: it.x + 12, y: it.y - 20, str: '100-Year Vintage Cork!', col: '#e8c76a', life: 2, big: true }); SFX.ult(); } continue; }
      if (it.type === 'chest') { if (!S.vaultOpened) { S.vaultOpened = true; SFX.chest(); it.got = true; S.loot.truffle++; S.loot.glowcap += 2; S.texts.push({ x: it.x + 12, y: it.y - 20, str: 'Truffle of Ages!', col: '#e8c76a', life: 2, big: true }); SFX.ult(); } continue; }
      it.got = true; SFX.coin(); S.score += it.type === 'glowcap' ? 50 : 20;
      if (it.type === 'beer') { addGauge(host.save.tools.lucky ? 55 : 35); S.texts.push({ x: it.x + 8, y: it.y - 6, str: 'เบียร์วุ้น! +SP', col: '#ffd76a', life: 0.9 }); }
      if (it.type === 'chili') { S.loot.chili++; S.texts.push({ x: it.x + 8, y: it.y - 6, str: '+1 พริกเม็ดใหญ่', col: '#ff6b4a', life: 0.9 }); }
      if (it.type === 'glowcap') { S.loot.glowcap++; S.texts.push({ x: it.x + 8, y: it.y - 6, str: '+1 Glowcap', col: '#7cf5c8', life: 0.9 }); }
      if (it.type === 'ale') { const k = activeK(); k.hp = Math.min(k.max, k.hp + 40); S.texts.push({ x: it.x + 8, y: it.y - 6, str: '+40 HP', col: '#ff9a7a', life: 0.9 }); }
    }
    S.pickups = S.pickups.filter(it => !it.got || it.type === 'chest' || it.type === 'shelfchest');

    /* support crew */
    const g = S.sup.gorn;
    if (g) {
      g.t += dt;
      if (g.state === 'run') { g.x += 230 * dt; if (g.x + 24 >= S.wall.x - 2) { g.state = 'smash'; g.t = 0; } }
      else if (g.state === 'smash') { if (g.t > 0.25 && !S.wall.broken) breakWall(); if (g.t > 0.9) g.state = 'leave'; }
      else { g.x -= 260 * dt; if (g.x < S.camX - 60) S.sup.gorn = null; }
    }
    S.hint = null;
    if (S.n === 2) {
      if (!S.wall.broken && Math.abs(p.x - S.wall.x) < 110 && !g) S.hint = host.save.crew.includes('mole') ? 'กด C เรียกตุ่นมาขุดกองดิน!' : 'กองดินขวางทาง... ต้องพาตุ่นมา (เลือกที่แผนที่โลก)';
      else if (nearShelf() && !S.lift) S.hint = host.save.crew.includes('pixie') ? 'กด C เรียกพิกซี่พาบินขึ้นชั้นบน!' : 'ชั้นบนสูงเกินกระโดด... ต้องพาพิกซี่มา';
    }
    else if (!S.wall.broken && Math.abs(p.x - S.wall.x) < 110 && !g) S.hint = host.save.crew.includes('gorn') ? 'กด C เรียกเชฟกอร์นมาทุบกำแพงร้าว!' : 'กำแพงร้าว... ต้องพาเชฟกอร์นมา (เลือกที่แผนที่โลก)';

    /* boss trigger */
    if (!S.bossOn && p.x > ARENA + 60) { S.bossOn = true; spawnBoss();
      if (S.n === 2) { S.banner = { text: 'BARON VON BARREL', sub: 'บารอนแห่งถังไวน์', t: 2.2, boss: true }; say('บารอนฟอนบาร์เรล', 'ใครบังอาจย่องเข้าห้องเก็บไวน์ของข้า! ชิมนี่ซะ!', 3); }
      else { S.banner = { text: 'KING SHROOMBA', sub: 'ราชาเห็ดสปอร์พิษ', t: 2.2, boss: true }; say('ราชาเห็ด', 'ใครกล้าบุกป่าเห็ดของข้า! จงกลายเป็นปุ๋ยซะ!', 3); } }

    /* camera */
    const camMin = document.body.classList.contains('tp-on') ? -110 : 0; /* touch: keep the knight clear of the joystick */
    const target = S.bossOn ? ARENA : clamp(p.x - 150 + p.face * 20, camMin, LEVEL_W - W);
    if (S.t < 0.05 && camMin < 0 && S.camX === 0) S.camX = target;
    S.camX += (target - S.camX) * Math.min(1, dt * (S.bossOn ? 4 : 6));
    if (!S.bossOn) S.camX = Math.max(S.camX, Math.min(target, S.camX));

    updateParticles(dt);

    if (S.end) { S.end.t += dt; if (S.end.t > 3) finishStage(); }
  }

  function moveBody(p: Player | Enemy, dt: number) {
    const prevBottom = p.y + p.h;
    p.x += p.vx * dt;
    for (const s of S.solids) if (overlap(p, s)) { if (p.vx > 0) p.x = s.x - p.w; else if (p.vx < 0) p.x = s.x + s.w; }
    p.y += p.vy * dt;
    p.onGround = false;
    if (p.y + p.h >= GROUND && !(S.pits.length && overPit(p.x, p.w)) && prevBottom <= GROUND + 4) { p.y = GROUND - p.h; p.vy = 0; p.onGround = true; }
    if (p.vy >= 0) for (const pl of S.platforms) if (p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2 && prevBottom <= pl.y + 1 && p.y + p.h >= pl.y) { p.y = pl.y - p.h; p.vy = 0; p.onGround = true; }
    for (const s of S.solids) if (overlap(p, s)) {
      if (p.vy >= 0 && prevBottom <= s.y + 2) { p.y = s.y - p.h; p.vy = 0; p.onGround = true; }
      else if (p.vy < 0) { p.y = s.y + s.h; p.vy = 0; }
    }
  }

  function nearShelf() { const p = S.p; return S.shelf && !S.shelf.got && p.y > S.shelf.y && p.x + p.w > S.shelf.x - 30 && p.x < S.shelf.x + S.shelf.w + 30; }
  function callSupport() {
    const p = S.p;
    if (S.n === 2) {
      if (!S.wall.broken && Math.abs(p.x - S.wall.x) < 110 && !S.sup.gorn && host.save.crew.includes('mole')) { S.sup.gorn = { x: S.camX - 30, t: 0, state: 'run', mole: true }; say('ตุ่น', 'ขุดดินเป็นงานถนัดของข้าเอง!'); SFX.select(); return; }
      if (nearShelf() && !S.lift && host.save.crew.includes('pixie')) { S.lift = { t: 0 }; say('พิกซี่', 'จับมือไว้นะ! บินแล้ว~'); SFX.select(); return; }
    } else
    if (!S.wall.broken && Math.abs(p.x - S.wall.x) < 110 && !S.sup.gorn && host.save.crew.includes('gorn')) {
      S.sup.gorn = { x: S.camX - 30, t: 0, state: 'run' };
      say('เชฟกอร์น', 'หลีกไป! พุงพลุ้ยมาแล้ว!'); SFX.select();
      return;
    }
    if (!host.save.crew.includes('bart')) { if (S.n === 2 && !host.save.crew.includes('bart')) { S.texts.push({ x: p.x + 9, y: p.y - 10, str: 'ไม่มีอะไรให้ลูกทีมช่วยตรงนี้', col: '#bba8ba', life: 0.8 }); return; } S.texts.push({ x: p.x + 9, y: p.y - 10, str: 'ไม่ได้พาบาร์ตเฒ่ามา', col: '#bba8ba', life: 0.8 }); return; }
    if (S.sup.bart > 0 && S.sup.bartCd <= 0) {
      S.sup.bart--; S.sup.bartCd = 4;
      S.pickups.push({ type: 'ale', x: p.x + p.face * 30, y: p.y - 40, w: 16, h: 16, vy: -120, drop: true, bob: 0 });
      say('บาร์ตเฒ่า', 'รับไปเลยไอ้หนู! เบียร์ฟื้นพลัง!'); SFX.select();
    } else { S.texts.push({ x: p.x + 9, y: p.y - 10, str: S.sup.bart <= 0 ? 'Old Bart is out of ale' : 'Bart is pouring...', col: '#bba8ba', life: 0.8 }); }
  }

  function breakWall() {
    S.wall.broken = true; S.solids = S.solids.filter(s => s !== S.wall);
    addShake(6); SFX.boom();
    for (let n = 0; n < 30; n++) S.parts.push({ x: S.wall.x + rnd(0, 16), y: S.wall.y + rnd(0, 40), vx: rnd(-40, 200), vy: rnd(-220, -40), life: 0.9, max: 0.9, col: pick(['#7b6a5e', '#a39282', '#4a3f38']), size: 3, grav: true });
    if (S.n === 2) for (let n = 0; n < 20; n++) S.parts.push({ x: S.wall.x + rnd(0, 16), y: S.wall.y + rnd(10, 40), vx: rnd(-60, 160), vy: rnd(-180, -40), life: 0.8, max: 0.8, col: pick(['#7a5a3a', '#5a3e28', '#9a7a52']), size: 3, grav: true });
    S.texts.push({ x: S.wall.x + 40, y: S.wall.y - 10, str: S.n === 2 ? 'Secret tunnel!' : 'Secret vault!', col: '#e8c76a', life: 1.6, big: true });
  }

  function updateParticles(dt: number) {
    for (const q of S.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.grav) q.vy += 500 * dt; }
    S.parts = S.parts.filter(q => q.life > 0);
    for (const t of S.texts) { t.life -= dt; t.y -= 18 * dt; }
    S.texts = S.texts.filter(t => t.life > 0);
  }

  /** the last stage-clear summary; read only on the results screen, after finishStage set it. */
  let results = null as unknown as Results;
  function finishStage() {
    for (const k in S.loot) host.save.ing[k] = (host.save.ing[k] || 0) + (S.loot as unknown as Record<string, number>)[k];
    host.save.runs++; persist();
    const stars = 1 + (S.t < 300 ? 1 : 0) + (S.ko === 0 ? 1 : 0), hearts = (S.vaultOpened ? 1 : 0) + (S.end!.ember ? 1 : 0);
    const prev = host.save.stages[S.n] || { stars: 0, hearts: 0 }; host.save.stages[S.n] = { stars: Math.max(prev.stars, stars), hearts: Math.max(prev.hearts, hearts) }; persist();
    results = { n: S.n, time: S.t, kills: S.kills, loot: Object.assign({}, S.loot), vault: S.vaultOpened, ember: S.end!.ember, t: 0, stars, hearts, score: S.score, net: S.net ? NET.finish(S.net, { score: S.score, timeMs: Math.round(((S.netT0 || 0) + S.t) * 1000), kills: S.kills }) : null };
    host.scene = 'results';
  }

  function tileX(img: Img, par: number, camX: number, y: number, w: number, h: number) { const off = ((camX * par) % w + w) % w; for (let x = -off; x < W; x += w) ctx.drawImage(img, Math.round(x), y, w, h); }
  function drawForestBg(camX: number, t: number) {
    if (ENV.sky && ENV.trees && ENV.fungi) {
      rect(0, 0, W, H, '#10293d');
      if (ENV.farbg) tileX(ENV.farbg, 0.08, camX, 0, 800, 225);
      else { tileX(ENV.sky, 0.05, camX, 0, 1050, 150); tileX(ENV.trees, 0.18, camX, GROUND - 128, 497, 84); }
      const fog2 = ctx.createLinearGradient(0, 110, 0, GROUND); fog2.addColorStop(0, 'rgba(40,140,150,0)'); fog2.addColorStop(1, 'rgba(60,170,170,0.3)'); ctx.fillStyle = fog2; ctx.fillRect(0, 110, W, GROUND - 110);
      if (ENV.midbg) tileX(ENV.midbg, 0.42, camX, GROUND + 4 - 198, 794, 198); else tileX(ENV.fungi, 0.42, camX, GROUND - 64, 373, 67);
      ctx.fillStyle = ENV.midbg ? 'rgba(6,20,30,0.26)' : ENV.farbg ? 'rgba(6,20,30,0.12)' : 'rgba(6,20,30,0.3)'; ctx.fillRect(0, 0, W, GROUND);
    } else {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#061a2a'); g.addColorStop(0.45, '#0c3446'); g.addColorStop(1, '#13505a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (const s2 of stars) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s2.ph)); rect(s2.x, s2.y, 0.5, 0.5, '#d8fff8'); } ctx.globalAlpha = 1;
    glow(330, 34, 46, 'rgba(180,255,240,A)', 0.25); ctx.fillStyle = '#e4fff6'; ctx.beginPath(); ctx.arc(330, 34, 13, 0, 7); ctx.fill(); ctx.fillStyle = '#bfe8dc'; ctx.beginPath(); ctx.arc(326, 31, 3, 0, 7); ctx.arc(335, 38, 2, 0, 7); ctx.fill();
    // far canopy trunks
    for (let i = -1; i < 9; i++) { const seed = Math.floor(camX * 0.1 / 60) + i, x = i * 60 - ((camX * 0.1) % 60); ctx.fillStyle = '#0a2836'; ctx.fillRect(x + 20, 0, 10 + hash(seed) * 8, GROUND); ctx.beginPath(); ctx.ellipse(x + 26, 18 + hash(seed + 3) * 20, 40, 22, 0, 0, 7); ctx.fill(); }
    // far mushrooms
    for (let i = -1; i < 8; i++) { const seed = Math.floor(camX * 0.18 / 70) + i, x = i * 70 - ((camX * 0.18) % 70) + 35; shroom(x, GROUND, 50 + hash(seed) * 40, 44 + hash(seed + 1) * 20, 16, '#123c4a', '#17495a', '#123c4a', null, null); }
    const fog = ctx.createLinearGradient(0, 100, 0, GROUND); fog.addColorStop(0, 'rgba(40,140,150,0)'); fog.addColorStop(1, 'rgba(60,170,170,0.35)'); ctx.fillStyle = fog; ctx.fillRect(0, 100, W, GROUND - 100);
    // mid glowing mushrooms
    const pal = [['#2fd8c8', '#9ffff2', 'rgba(80,255,230,A)'], ['#38a8e8', '#bfe8ff', 'rgba(90,190,255,A)'], ['#7ad85a', '#d8ffb0', 'rgba(140,255,110,A)']];
    for (let i = -1; i < 7; i++) {
      const seed = Math.floor(camX * 0.38 / 95) + i, x = i * 95 - ((camX * 0.38) % 95) + 40, P = pal[Math.abs(seed) % 3];
      shroom(x, GROUND, 40 + hash(seed + 5) * 45, 40 + hash(seed + 6) * 26, 15, '#1d5a64', P[0], '#16444e', P[1], P[2]);
    }
    }
    // cave arch near the boss arena
    const ax = ARENA + 250 - camX * 0.6 - (ARENA * 0.4 - 0);
    const caveX = (ARENA + 120 - camX) * 0.55 + 140;
    if (ENV.arena) { const x0 = ARENA - camX - 13; if (x0 < W) ctx.drawImage(ENV.arena, Math.round(x0), 0, 427, 240); }
    else if (caveX > -120 && caveX < W + 120) {
      ctx.fillStyle = '#2a4450'; ctx.beginPath(); ctx.ellipse(caveX, GROUND, 70, 90, 0, Math.PI, 0); ctx.fill();
      for (let k = 0; k < 9; k++) { const a = Math.PI + k * (Math.PI / 8); ctx.fillStyle = k % 2 ? '#3e5c66' : '#4a6a72'; ctx.beginPath(); ctx.ellipse(caveX + Math.cos(a) * 58, GROUND + Math.sin(a) * 78, 14, 11, a, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#071820'; ctx.beginPath(); ctx.ellipse(caveX, GROUND, 40, 58, 0, Math.PI, 0); ctx.fill();
    }
    // fireflies
    for (const f of flies) { const x = ((f.x - camX * 0.7 * f.s) % 520 + 520) % 520 - 60, y = f.y + Math.sin(t * 1.3 + f.ph) * 8; const a = 0.5 + 0.5 * Math.sin(t * 3 + f.ph); glow(x, y, 6, 'rgba(200,255,140,A)', 0.5 * a); rect(x, y, 1, 1, '#f0ffc0'); }
  }
  function drawGround(camX: number) {
    if (ENV.groundstrip) {
      const g2 = ctx.createLinearGradient(0, GROUND, 0, H); g2.addColorStop(0, '#3a2a1c'); g2.addColorStop(1, '#120c08'); ctx.fillStyle = g2; ctx.fillRect(0, GROUND, W, H - GROUND);
      if (ENV.ground2) { ctx.fillStyle = '#21150e'; ctx.fillRect(0, GROUND + 20, W, H - GROUND - 20); tileX(ENV.ground2, 1, camX, GROUND - 7, 564, 40); } else tileX(ENV.groundstrip, 1, camX, GROUND - 5, 100, 24);
    } else {
    const g = ctx.createLinearGradient(0, GROUND, 0, H); g.addColorStop(0, '#2a3a2a'); g.addColorStop(1, '#101a14'); ctx.fillStyle = g; ctx.fillRect(0, GROUND, W, H - GROUND);
    rect(0, GROUND, W, 4, '#3cbf5a'); rect(0, GROUND + 4, W, 2, '#25803c');
    const off = camX % 8;
    for (let x = -off - 8; x < W + 8; x += 2) { const i = Math.floor((x + camX) / 2); const hgt = 1.5 + hash(i) * 4; rect(x, GROUND - hgt + 1, 1, hgt, hash(i + 1) > 0.5 ? '#5ad86a' : '#3cbf5a'); }
    for (let x = -((camX) % 40) - 40; x < W + 40; x += 40) { const i = Math.floor((x + camX) / 40); rect(x + hash(i) * 30, GROUND + 10 + hash(i + 2) * 18, 3 + hash(i + 3) * 3, 2, '#3a4a3a'); if (hash(i + 9) > 0.55) { const fx = x + hash(i + 4) * 36; glow(fx + 2, GROUND - 3, 8, 'rgba(90,255,230,A)', 0.35); rect(fx, GROUND - 5, 4, 2, '#7ff5e8'); rect(fx + 1.5, GROUND - 3, 1, 3, '#d8f8f0'); } }
    }
    for (const pl of S.pools) {
      const x = pl.x - camX; if (x > W || x + pl.w < 0) continue;
      glow(x + pl.w / 2, GROUND, pl.w * 0.6, 'rgba(170,80,255,A)', 0.12);
      if (E7.pit) { // E7 pit + liquid only (Gemini's own grass removed so the stage grass surrounds it), colour-graded to the night host.scene
        const bw = pl.w + 8, bh = bw * E7.pit.height / E7.pit.width * POOL_SQ, bx = x - 4, by = GROUND - 3;
        dimg(E7.pit, Math.round(bx * RES) / RES, by, bw, bh);
        for (let i = 0; i < 2; i++) { const ph = (S.t * 0.8 + i * 0.5 + pl.x * 0.013) % 1, fr = Math.min(2, Math.floor(ph * 4)); if (ph > 0.75) continue; const im = E7['bub' + fr]; if (!im) continue;
          const ux = 0.3 + 0.4 * ((Math.floor(S.t * 0.8 + i * 0.5 + pl.x) * 0.618 + i * 0.37) % 1), w = im.width / 8; dimg(im, bx + bw * ux - w / 2, by + bh * 0.2 - im.height / 8, w, im.height / 8); }
      } else
      if (E5.pool) { const wob = Math.sin(S.t * 3 + pl.x) * 0.6; dimg(E5.pool, x - 5, GROUND - 4 + wob * 0.3, pl.w + 10, 13 - wob); }
      else { rect(x, GROUND - 2, pl.w, 9, '#8a4ad8'); rect(x + 2, GROUND, pl.w - 4, 7, '#5a2a9a'); }
    }
  }
  /* temporary Stage 2 scenery: the alchemy cellar art (G6) darkened as a tiled far wall, stage props recoloured to stone and wine */
  const F_STONE = 'grayscale(1) sepia(0.28) brightness(0.62) contrast(1.1)', F_WINE = 'hue-rotate(70deg) saturate(1.5) brightness(0.8)', F_DIRT = 'sepia(0.9) saturate(1.3) brightness(0.8)';
  function drawDungeonBg(camX: number, t: number) {
    rect(0, 0, W, H, '#140c10');
    if (ENV.cellar2) { const im = recol(ENV.cellar2, 'brightness(0.42) saturate(0.7) sepia(0.25)'); tileX(im, 0.12, camX, -18, 400, 225); }
    const fog = ctx.createLinearGradient(0, 90, 0, GROUND); fog.addColorStop(0, 'rgba(80,20,30,0)'); fog.addColorStop(1, 'rgba(110,30,40,0.28)'); ctx.fillStyle = fog; ctx.fillRect(0, 90, W, GROUND - 90);
    if (ENV.cellar2) { const x0 = ARENA - camX - 20; if (x0 < W) { ctx.drawImage(recol(ENV.cellar2, 'brightness(0.6) saturate(1.2) hue-rotate(-12deg)'), Math.round(x0), -10, 440, 248); const gr = ctx.createLinearGradient(x0, 0, x0 + 60, 0); gr.addColorStop(0, '#140c10'); gr.addColorStop(1, 'rgba(20,12,16,0)'); ctx.fillStyle = gr; ctx.fillRect(x0, 0, 60, H); } }
  }
  function drawStageBg(n: number, camX: number, t: number) { if (n === 2) drawDungeonBg(camX, t); else drawForestBg(camX, t); }
  function drawDungeonGround(camX: number) {
    ctx.fillStyle = '#16100e'; ctx.fillRect(0, GROUND, W, H - GROUND);
    if (ENV.ground2) tileX(recol(ENV.ground2, F_STONE), 1, camX, GROUND - 7, 564, 40);
    for (const pt of S.pits) { const x = pt.x - camX; if (x > W || x + pt.w < 0) continue;
      const g = ctx.createLinearGradient(0, GROUND - 8, 0, H); g.addColorStop(0, '#0a0608'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(Math.round(x), GROUND - 7, pt.w, H - GROUND + 7); }
    for (const pl of S.pools) { const x = pl.x - camX; if (x > W || x + pl.w < 0 || !E7.pit) continue;
      const im = recol(E7.pit, F_WINE), bw = pl.w + 8, bh = bw * im.height / im.width * POOL_SQ, bx = x - 4, by = GROUND - 3;
      glow(x + pl.w / 2, GROUND, pl.w * 0.6, 'rgba(200,40,70,A)', 0.12); dimg(im, Math.round(bx * RES) / RES, by, bw, bh); }
  }
  function drawStageWorld() {
    const cx = Math.round(S.camX);
    drawStageBg(S.n, cx, S.t);
    if (S.n === 2) drawDungeonGround(cx); else drawGround(cx);
    ctx.save(); ctx.translate(-cx, 0);
    // arena markers
    if (!ENV.arena) { rect(ARENA - 6, GROUND - 60, 6, 60, '#2b1a2a'); rect(ARENA - 14, GROUND - 70, 22, 12, '#8a3a4a'); }
    // platforms
    for (const pl of S.platforms) { if (pl.x - cx > W || pl.x + pl.w - cx < 0) continue;
      if (ENV.plat2) { const im = S.n === 2 ? recol(ENV.plat2, F_STONE) : ENV.plat2, y = pl.y - 2, h = 16, cw = 7, mw = 13.75;
        const nr = pl.w > 70 ? 2 : 1; for (let k = 0; k < nr; k++) { const rx = pl.x + pl.w * (k + 1) / (nr + 1) - 13.9; ctx.drawImage(im, 0, 60, 111, 59, rx, y + 15, 27.75, 14.75); }
        ctx.drawImage(im, 0, 0, 28, 64, pl.x - 2, y, cw, h); ctx.drawImage(im, 83, 0, 28, 64, pl.x + pl.w - 5, y, cw, h);
        for (let x = pl.x + 5; x < pl.x + pl.w - 5; x += mw) { const ww = Math.min(mw, pl.x + pl.w - 5 - x); ctx.drawImage(im, 28, 0, 55 * ww / mw, 64, x, y, ww, h); }
        continue; }
      if (ENV.platform) { const im = ENV.platform, y = pl.y - 2, h = 14; ctx.drawImage(im, 0, 0, 14, 24, pl.x - 2, y, 8, h); ctx.drawImage(im, 14, 0, 42, 24, pl.x + 6, y, pl.w - 12, h); ctx.drawImage(im, 56, 0, 14, 24, pl.x + pl.w - 6, y, 8, h); continue; }
      rect(pl.x + 4, pl.y + 6, 3, GROUND - pl.y - 6, '#2a4a40'); rect(pl.x + pl.w - 7, pl.y + 6, 3, GROUND - pl.y - 6, '#2a4a40');
      rect(pl.x - 0.5, pl.y - 0.5, pl.w + 1, 8, '#1b1020'); rect(pl.x, pl.y, pl.w, 7, '#8a5a32'); for (let k = 0; k < pl.w; k += 12) rect(pl.x + k, pl.y + 1, 0.5, 6, '#5a3a22'); rect(pl.x, pl.y + 3.5, pl.w, 0.5, '#a8723a');
      rect(pl.x, pl.y, pl.w, 2, '#3cbf5a'); for (let k = 3; k < pl.w - 3; k += 7) rect(pl.x + k, pl.y + 2, 1.5, 1 + hash(pl.x + k) * 4, '#2a9a48'); }
    // mound
    const m = S.solids.find(s => s.kind === 'slab')!;
    if (ENV.plat2 && host.fxArtReady) { // vault roof = G3 mossy platform art; open alcove behind (no code-drawn room)
      const im = S.n === 2 ? recol(ENV.plat2, F_STONE) : ENV.plat2, y = m.y - 2, h = 16, cw = 7, mw = 13.75;
      ctx.drawImage(im, 0, 0, 28, 64, m.x - 2, y, cw, h); ctx.drawImage(im, 83, 0, 28, 64, m.x + m.w - 5, y, cw, h);
      for (let x = m.x + 5; x < m.x + m.w - 5; x += mw) { const ww = Math.min(mw, m.x + m.w - 5 - x); ctx.drawImage(im, 28, 0, 55 * ww / mw, 64, x, y, ww, h); }
      for (let k = 0; k < 3; k++) ctx.drawImage(im, 0, 60, 111, 59, m.x + 30 + k * 60, y + 15, 27.75, 14.75);
    } else {
    rect(m.x, m.y, m.w, m.h, '#4a6a72'); for (let x = m.x; x < m.x + m.w; x += 10) { rect(x, m.y + 2, 9.5, 4.5, '#5a7c84'); rect(x + 5, m.y + 7, 9.5, 4.5, '#3e5c66'); } rect(m.x, m.y, m.w, 3, '#3cbf5a');
    rect(1424, 150, 16, 40, '#4a6a72'); for (let y = 152; y < 190; y += 6) rect(1425, y, 14, 5, y % 12 ? '#5a7c84' : '#3e5c66');
    rect(1256, 150, 168, 40, S.wall.broken ? '#0e2228' : '#1e3a42');
    if (S.wall.broken) { for (let x = 1262; x < 1420; x += 20) rect(x, 154, 2, 2, '#7cf5c8'); }
    }
    if (host.fxArtReady && S.n === 2) { const w = S.wall, ok = fxImg('wall_ok', 1), rb = fxImg('rubble', 1);
      if (ok) { const im = recol(ok, F_STONE); ctx.drawImage(im, Math.round(1432 - LW(im) / 2), Math.round(GROUND + 1 - LH(im)), LW(im), LH(im)); }
      if (rb) { const im = recol(rb, F_DIRT), k = w.broken ? 0.8 : 1.9; ctx.drawImage(im, Math.round(w.x + w.w / 2 - LW(im) * k / 2), Math.round(GROUND + 2 - LH(im) * k), LW(im) * k, LH(im) * k); } }
    else if (host.fxArtReady) { const w = S.wall; fxB('wall_ok', 1432, GROUND + 1); if (!w.broken) fxB('wall_crack', w.x + w.w / 2, GROUND + 1); else fxB('rubble', w.x + w.w / 2, GROUND + 2); }
    else if (!S.wall.broken) {
      const w = S.wall; rect(w.x, w.y, w.w, w.h, '#6a8a90'); for (let y = w.y; y < w.y + w.h; y += 8) rect(w.x, y + 7, w.w, 1, '#3e5c66');
      ctx.strokeStyle = '#2a1e1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w.x + 3, w.y + 4); ctx.lineTo(w.x + 9, w.y + 14); ctx.lineTo(w.x + 5, w.y + 22); ctx.lineTo(w.x + 12, w.y + 34); ctx.moveTo(w.x + 9, w.y + 14); ctx.lineTo(w.x + 14, w.y + 18); ctx.stroke();
    }
    // pickups
    for (const it of S.pickups) {
      if (it.type === 'shelfchest') { if (host.fxArtReady) fxB(S.shelf!.got ? 'chest_open' : 'chest', it.x + 12, it.y + 17); continue; }
      if (it.type === 'chest') {
        if (host.fxArtReady) { fxB(S.vaultOpened ? 'chest_open' : 'chest', it.x + 12, it.y + 17); continue; }
        if (S.wall.broken || true) { const open = S.vaultOpened; rect(it.x, it.y + (open ? 4 : 0), 24, open ? 12 : 16, '#1b1020'); rect(it.x + 1, it.y + 1 + (open ? 4 : 0), 22, (open ? 10 : 14), '#c08a3c'); rect(it.x + 1, it.y + 6, 22, 2, '#f2c94c'); if (!open) rect(it.x + 10, it.y + 5, 4, 5, '#f2c94c'); }
        continue;
      }
      const y = it.y + (it.drop ? 0 : Math.sin(it.bob * 3) * 2);
      dimg(icon(it.type), Math.round(it.x), Math.round(y));
    }
    // enemies
    for (const e of S.enemies) { if ((e.dead && e !== S.boss) || !e.active && e.type !== 'mimic') continue; if (e.x - cx > W + 20 || e.x + e.w - cx < -20) continue; drawEnemy(e); }
    // projectiles
    for (const pr of S.projs) drawProj(pr);
    if (S.fx) { for (const f of S.fx) { f.t -= 1 / 60;
      if (f.type === 'bowl' && host.fxArtReady) { ctx.globalAlpha = clamp(f.t * 2, 0, 1); fxB('tomyum', f.x + 22, GROUND + 4, 1, 0.8 + (0.9 - f.t) * 0.4); }
      else if (f.type === 'bowl') { ctx.globalAlpha = clamp(f.t * 2, 0, 1); drawTomyumBowl(f.x + 22, GROUND, 1 + (0.9 - f.t) * 0.3); }
      else if (f.type === 'boom' && host.fxArtReady) { const k = 1 - f.t / 0.6; const fr = k < 0.12 ? 'b_spark' : k < 0.3 ? 'b_small' : k < 0.55 ? 'b_big' : 'b_smoke'; if (k >= 0.55) ctx.globalAlpha = clamp((1 - k) / 0.45, 0, 1); fxC(fr, f.x, f.y - (k >= 0.55 ? (k - 0.55) * 20 : 0)); }
      else if (f.type === 'spark' && host.fxArtReady) { const k = 1 - f.t / 0.3; ctx.globalAlpha = clamp(1 - k * 0.8, 0, 1); fxC('hit', f.x, f.y, 1, 0.55 + k * 0.5); }
      else if (f.type === 'boom') { const k = 1 - f.t / 0.6; if (k < 0.45) { const r = 4 + k * 30; glow(f.x, f.y, r * 1.6, 'rgba(255,170,60,A)', 0.8); ctx.fillStyle = '#ff6b2c'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.8, 0, 7); ctx.fill(); ctx.fillStyle = '#ffd35a'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.5, 0, 7); ctx.fill(); } else { ctx.globalAlpha = clamp(f.t * 3, 0, 1); for (let n = 0; n < 6; n++) { const a = n * 1.05 + f.x; ctx.fillStyle = n % 2 ? '#3a2a2a' : '#5a4040'; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * k * 14, f.y + Math.sin(a) * k * 12 - k * 6, 3 + k * 3, 0, 7); ctx.fill(); rect(f.x + Math.cos(a + 0.5) * k * 22, f.y + Math.sin(a + 0.5) * k * 20, 1.5, 1.5, '#ffd35a'); } } }
      else if (f.type === 'spark') { const k = 1 - f.t / 0.3; ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 1.2; for (let n = 0; n < 8; n++) { const a = n * Math.PI / 4; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * (4 + k * 10), f.y + Math.sin(a) * (4 + k * 10)); ctx.lineTo(f.x + Math.cos(a) * (8 + k * 16), f.y + Math.sin(a) * (8 + k * 16)); ctx.stroke(); } }
      ctx.globalAlpha = 1; } S.fx = S.fx.filter(f => f.t > 0); }
    // gorn
    if (S.sup.gorn) { if (S.sup.gorn.mole) drawBustHelper('mole', 'MOLE', S.sup.gorn.x + 15, GROUND - 6, S.sup.gorn.state === 'smash' ? Math.sin(S.t * 40) * 2 : Math.abs(Math.sin(S.t * 14)) * -2, S.sup.gorn.state === 'leave'); else drawGorn(S.sup.gorn); }
    if (S.lift) drawBustHelper('pixie', 'PIXIE', S.p.x + S.p.w / 2, S.p.y - 2, Math.sin(S.t * 12) * 2, false);
    if (S.corpse) { const c = S.corpse; c.t -= 1 / 60; const hasDead = host.heroReady && HERO_ATLAS[KNIGHTS[c.i].id + '_dead']; if (hasDead) { const ds = knightSprite(c.i, 'dead'); ctx.globalAlpha = clamp(c.t, 0, 1); ctx.drawImage(c.face > 0 ? ds.r : ds.l, Math.round(c.x + 9 - 50 - (ds.r.padL || 0)), Math.round(GROUND - (ds.r.lh! - 1.5)), ds.r.lw!, ds.r.lh!); ctx.globalAlpha = 1; if (c.t <= 0) S.corpse = null; } else { const spr = knightSprite(c.i, 'stand'); const img = c.face > 0 ? spr.r : spr.l; ctx.save(); ctx.globalAlpha = clamp(c.t, 0, 1); ctx.translate(c.x + 9, GROUND - 6); ctx.rotate(-c.face * Math.PI / 2 * clamp((1.4 - c.t) * 4, 0, 1)); dimg(img, -18, -38); ctx.restore(); ctx.globalAlpha = 1; if (c.t <= 0) S.corpse = null; } }
    // player
    drawPlayer();
    if (S.poisonT! > 0) { S.poisonT! -= 1 / 60; dimg(icon('st_poison', 1), S.p.x + 5, S.p.y - 20 + Math.sin(S.t * 8)); }
    // particles
    for (const q of S.parts) { ctx.globalAlpha = clamp(q.life / q.max, 0, 1); rect(q.x, q.y, q.size, q.size, q.col); }
    ctx.globalAlpha = 1;
    for (const t of S.texts) { ctx.globalAlpha = clamp(t.life * 2, 0, 1); if (t.dmg) { outlined(t.str, t.x, t.y, t.size!, t.col); continue; } text(t.str, t.x, t.y, { thai: /[\u0E00-\u0E7F]/.test(t.str), align: 'center', size: t.big ? 11 : 9, color: t.col, weight: 700 }); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawPlayer() {
    const p = S.p, i = S.active, id = KNIGHTS[i].id;
    if (p.inv > 0 && p.inv < 0.9 && Math.floor(p.inv * 20) % 2 === 0 && !p.special) return;
    let frame = Math.floor(S.t * 2) % 2 ? 'idle2' : 'stand';
    if (p.special && p.special.type !== 'skillet') frame = 'spec';
    else if (p.atkT > 0) frame = id === 'arthur' ? (p.special && p.special.type === 'skillet' ? 'atk3' : ['atk1', 'atk2', 'atk3'][p.combo || 0]) : (id === 'rosemary' ? (host.heroHiReady && HERO_HI.rosemary_atk3 ? ['atk1', 'atk2', 'atk3'][p.combo || 0] : p.combo % 2 ? 'atk2' : 'atk1') : 'atk1');
    else if (!p.onGround) frame = 'jump';
    else if (Math.abs(p.vx) > 1) frame = 'run' + (1 + Math.floor(p.anim * 10) % 4);
    const spr = knightSprite(i, frame); const img = p.face > 0 ? spr.r : spr.l;
    if (img.hero) { ctx.drawImage(img, Math.round(p.x + p.w / 2 - 50 - (img.padL || 0)), Math.round(p.y + p.h - (img.lh! - 1.5)), img.lw!, img.lh!); }
    else dimg(img, Math.round(p.x + p.w / 2 - LW(img) / 2), Math.round(p.y + p.h - LH(img)));
    if (id === 'arthur' && p.atkT > 0 && host.fxArtReady && !HERO_HI.arthur_atk1 && !(p.special && p.special.type === 'skillet')) { const heavy = p.combo === 2; ctx.globalAlpha = clamp(p.atkT / (heavy ? 0.2 : 0.14), 0, 1); fxC(heavy ? 'crescent' : 'slash', p.x + p.w / 2 + p.face * 22, p.y + 14, p.face, heavy ? 1 : 0.85); ctx.globalAlpha = 1; }
    if (id === 'percival' && (p.atkT > 0 || (p.special && p.special.type === 'rain'))) { const hx = p.x + p.w / 2 + p.face * 12, hy = p.y + 4; for (let k = 0; k < 3; k++) { const a = S.t * 8 + k * 2.1; rect(hx + Math.cos(a) * 8, hy + Math.sin(a) * 8, 1.5, 1.5, '#bff4ff'); } }
  }

  function drawEnemy(e: Enemy) {
    if (e.type === 'boss') { drawBoss(e); return; }
    let img;
    const frame = e.type === 'mimic' ? (e.state === 'sleep' ? 0 : (Math.floor(e.t * 6) % 2)) : Math.floor(e.anim * 6) % 2;
    const art = enemyArtFor(e, frame);
    const spr = art ? art.spr : enemySprite(e.type, frame);
    img = e.face > 0 ? spr.l : spr.r;
    if (e.type === 'mimic' && e.state === 'sleep') img = spr.r;
    if (e.flash > 0 && !(art && art.hurt)) img = tinted(img, art ? '#ffffffaa' : '#ffffff');
    else if (e.freeze > 0) img = tinted(img, '#a8ecffcc');
    else if (e.burn > 0 && Math.floor(S.t * 10) % 2) img = tinted(img, '#ff8a3d99');
    else if (e.slow > 0) img = tinted(img, '#7fd6ff66');
    const sc = e.type === 'grapelet' ? 0.55 : e.type === 'keg' ? 0.9 : 1;
    const dx = Math.round(e.x + e.w / 2 - LW(img) * sc / 2), dy = Math.round(e.y + e.h - LH(img) * sc);
    if (sc !== 1) dimg(img, dx, dy, LW(img) * sc, LH(img) * sc); else dimg(img, dx, dy);
    if (e.type === 'puff' && e.puffT && host.enemyArtReady) { const cl = ENEMY_ART.puff_cloud!.l, k = 0.35 + e.puffT; ctx.globalAlpha = Math.min(1, e.puffT * 4); dimg(cl, e.x + e.w / 2 - LW(cl) * k / 2, e.y - LH(cl) * k * 0.7, LW(cl) * k, LH(cl) * k); ctx.globalAlpha = 1; }
    else if (e.type === 'puff' && e.puffT) { ctx.fillStyle = '#e8d8ff88'; ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y - 2, 6 + e.puffT * 10, 0, 7); ctx.fill(); }
    if (e.burn > 0 && Math.random() < 0.4) S.parts.push({ x: e.x + rnd(0, e.w), y: e.y + rnd(0, e.h), vx: 0, vy: -40, life: 0.3, max: 0.3, col: '#ff8a3d', size: 2 });
    const sts = [e.burn > 0 && 'st_fire', e.freeze > 0 && 'st_freeze', e.slow > 0 && 'st_slow'].filter((n): n is string => Boolean(n)); sts.forEach((n, k) => dimg(icon(n, 1), e.x + e.w / 2 - sts.length * 4.5 + k * 9, e.y - 16));
    if (e.hp < e.max && e.type !== 'mimic' && e.type !== 'grapelet' || (e.type === 'mimic' && e.state !== 'sleep' && e.hp < e.max)) bar(e.x, e.y - 6, e.w, 3, e.hp / e.max, '#e2483b');
  }

  const bossCanvas = (() => {
    /* painted with paths at 2x (224x208 real), alpha-thresholded, shaded and outlined; drawn at 112x104 world units, facing left */
    const make = (squash: number, angry: boolean) => {
      const c: Img = document.createElement('canvas'); c.width = 224; c.height = 208; const g = c.getContext('2d')!;
      g.scale(2, 2);
      const ell = (x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
      const lg = (y0: number, y1: number, a: string, b2: string) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, b2); return gr; };
      const sq = 1 - squash * 0.08, sx = 1 + squash * 0.08;
      g.translate(56, 104); g.scale(sx, sq); g.translate(-56, -104);
      // legs
      ell(40, 96, 11, 8, angry ? '#8a2240' : '#8e2a6a'); ell(74, 96, 11, 8, angry ? '#8a2240' : '#8e2a6a');
      // back arm (resting)
      g.strokeStyle = angry ? '#c0405a' : '#c8508a'; g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); g.moveTo(84, 62); g.quadraticCurveTo(100, 70, 96, 86); g.stroke();
      ell(96, 88, 6, 5, angry ? '#c0405a' : '#c8508a');
      // body
      ell(57, 70, 31, 28, lg(44, 98, angry ? '#e0405a' : '#d85aa0', angry ? '#f08a3a' : '#f0904a'));
      ell(57, 78, 18, 15, angry ? '#f8a070' : '#f8aa78');
      // face
      g.fillStyle = '#1b1020';
      [[40, 60], [62, 60]].forEach(([x, y]) => { ell(x + 4, y + 4, 6, 4.5, '#1b1020'); ell(x + 4, y + 4, 4.5, 3.2, angry ? '#ff4a3a' : '#ffd84a'); ell(x + 3.4, y + 4.4, 1.6, 1.8, '#1b1020'); });
      g.fillStyle = '#1b1020'; g.beginPath(); g.moveTo(36, 56); g.lineTo(50, 61); g.lineTo(49, 63.5); g.lineTo(35, 59); g.fill();
      g.beginPath(); g.moveTo(76, 56); g.lineTo(62, 61); g.lineTo(63, 63.5); g.lineTo(77, 59); g.fill();
      g.beginPath(); g.moveTo(44, 80); g.quadraticCurveTo(57, 70, 70, 80); g.lineTo(68, 82); g.quadraticCurveTo(57, 75, 46, 82); g.fill();
      g.fillStyle = '#fff'; g.fillRect(50, 75.5, 3, 3); g.fillRect(61, 75.5, 3, 3);
      // reaching arm toward the player (left)
      g.strokeStyle = angry ? '#c0405a' : '#c8508a'; g.lineWidth = 10; g.beginPath(); g.moveTo(32, 64); g.quadraticCurveTo(18, 58, 10, 64); g.stroke();
      ell(8, 66, 7, 6, angry ? '#c0405a' : '#c8508a'); g.lineWidth = 3; [[2, 60], [0, 66], [3, 72]].forEach(([x, y]) => { g.beginPath(); g.moveTo(6, 66); g.lineTo(x, y); g.stroke(); });
      // cap
      g.fillStyle = lg(8, 52, angry ? '#b04ad8' : '#a85ae0', angry ? '#5a1a7a' : '#5e2a96'); g.beginPath(); g.ellipse(56, 40, 52, 30, 0, Math.PI, 0); g.quadraticCurveTo(100, 54, 56, 52); g.quadraticCurveTo(12, 54, 4, 40); g.fill();
      g.fillStyle = '#e07a9a'; g.beginPath(); g.moveTo(10, 44); g.quadraticCurveTo(56, 60, 102, 44); g.quadraticCurveTo(56, 54, 10, 44); g.fill();
      [[24, 30, 7], [46, 18, 6], [70, 22, 8], [90, 34, 5], [56, 38, 4], [14, 40, 3.5], [34, 42, 3]].forEach(([x, y, r]) => { ell(x, y, r, r * 0.8, '#f08a3a'); ell(x - r * 0.25, y - r * 0.25, r * 0.5, r * 0.4, '#ffc070'); });
      // crown
      g.save(); g.translate(62, 10); g.rotate(0.12);
      g.fillStyle = '#f2c94c'; g.beginPath(); g.moveTo(-16, 6); g.lineTo(-16, -6); g.lineTo(-10, 0); g.lineTo(-5, -10); g.lineTo(0, -1); g.lineTo(5, -10); g.lineTo(10, 0); g.lineTo(16, -6); g.lineTo(16, 6); g.closePath(); g.fill();
      g.fillStyle = '#fff2b0'; g.fillRect(-15, 1, 30, 2); ell(-5, 3, 2.2, 2.2, '#c0283a'); ell(5, 3, 2.2, 2.2, '#c0283a'); ell(0, -3, 2, 2, '#4fb3d9');
      g.restore();
      // pixelate: hard alpha, then shade + outline
      const d = g.getImageData(0, 0, 224, 208); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0; g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(d, 0, 0);
      shade(c, true, 0.15);
      c.lw = 112; c.lh = 104; return c;
    };
    const o: Record<string, Img> = { idle: make(0, false), squash: make(1, false), idleA: make(0, true), squashA: make(1, true) };
    for (const k of Object.keys(o)) o[k + 'R'] = flip(o[k]);
    return o;
  })();
  function drawBoss(b: Enemy) {
    const angry = b.hp < b.max * 0.5;
    if (host.enemyArtReady) {
      let k = 'boss_idle';
      if (b.dead) k = 'boss_dead';
      else if (b.state === 'spray') k = 'boss_spit';
      else if (b.squash > 0.4) k = 'boss_slam';
      else if (b.state === 'crouch' || b.state === 'summon' || b.state === 'air') k = 'boss_fists';
      else if (Math.abs(b.vx) > 5 || b.state === 'intro') k = Math.floor(S.t * 4) % 2 ? 'boss_stomp' : 'boss_idle';
      if (S.n === 2) { if (b.state === 'curl' || b.state === 'roll') k = 'boss_fists'; else if (b.state === 'spray') k = 'boss_spit'; }
      let spr = ENEMY_ART[k]!; if (S.n === 2) spr = { l: recol(spr.l, 'sepia(1) saturate(2.2) hue-rotate(-15deg) brightness(0.85)'), r: recol(spr.r, 'sepia(1) saturate(2.2) hue-rotate(-15deg) brightness(0.85)') };
      let im = b.face > 0 ? spr.l : spr.r;
      if (S.n === 2 && b.state === 'roll') { ctx.save(); ctx.translate(Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2 + 4)); ctx.rotate(S.t * 14 * Math.sign(b.vx || 1)); const w = LW(im) * 0.75, h = LH(im) * 0.75; ctx.drawImage(b.flash > 0 ? tinted(im, '#ffffffaa') : im, -w / 2, -h / 2, w, h); ctx.restore(); return; }
      if (b.flash > 0) im = tinted(im, '#ffffffaa'); else if (b.freeze > 0) im = tinted(im, '#a8ecff99'); else if (b.burn > 0 && Math.floor(S.t * 10) % 2) im = tinted(im, '#ff8a3d77'); else if (angry) im = tinted(im, '#ff203822');
      const wob = b.state === 'spray' ? Math.sin(S.t * 50) * 1.5 : 0;
      const cxOff = k === 'boss_spit' ? (b.face > 0 ? 1 : -1) * (LW(im) - LW(ENEMY_ART.boss_idle!.l)) / 2 : 0;
      dimg(im, Math.round(b.x + b.w / 2 - LW(im) / 2 + cxOff + wob), Math.round(b.y + b.h - LH(im) + 3));
      if (b.burn > 0 && Math.random() < 0.6) S.parts.push({ x: b.x + rnd(0, b.w), y: b.y + rnd(0, b.h), vx: 0, vy: -50, life: 0.4, max: 0.4, col: pick(['#ff8a3d', '#ffd35a']), size: 3 });
      return;
    }
    let img = bossCanvas[((b.state === 'crouch' || b.squash > 0.4) ? 'squash' : 'idle') + (angry ? 'A' : '') + (b.face > 0 ? 'R' : '')];
    if (b.flash > 0) img = tinted(img, '#ffffffcc'); else if (b.freeze > 0) img = tinted(img, '#a8ecff99'); else if (b.burn > 0 && Math.floor(S.t * 10) % 2) img = tinted(img, '#ff8a3d77');
    const wob = b.state === 'spray' ? Math.sin(S.t * 50) * 2 : 0;
    dimg(img, Math.round(b.x + b.w / 2 - 56 + wob), Math.round(b.y + b.h - 102));
    if (b.state === 'spray') { ctx.fillStyle = '#d4a8ff66'; ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + 4, 10 + (0.55 - b.t) * 30, 0, 7); ctx.fill(); }
    if (b.burn > 0 && Math.random() < 0.6) S.parts.push({ x: b.x + rnd(0, b.w), y: b.y + rnd(0, b.h), vx: 0, vy: -50, life: 0.4, max: 0.4, col: pick(['#ff8a3d', '#ffd35a']), size: 3 });
  }

  function drawProj(pr: Proj) {
    if (pr.type === 'bottle' || pr.type === 'wine') { /* temporary: reuse the poison-pool bubble art recoloured until card W7 arrives */
      const im = E7.bub0 ? recol(E7.bub0, pr.type === 'bottle' ? 'hue-rotate(200deg) saturate(1.4)' : F_WINE) : null;
      if (im) { const sz = pr.type === 'bottle' ? 11 : 9; ctx.save(); ctx.translate(pr.x + pr.w / 2, pr.y + pr.h / 2); ctx.rotate(S.t * 10); ctx.drawImage(im, -sz / 2, -sz / 2, sz, sz); ctx.restore(); }
      return;
    }
    if (host.fxArtReady) {
      const f = Math.sign(pr.vx) || 1;
      if (pr.type === 'bolt') { glow(pr.x + pr.w / 2, pr.y + pr.h / 2, 12, 'rgba(120,200,255,A)', 0.5); if (pr.vy) { ctx.save(); ctx.translate(pr.x + pr.w / 2, pr.y + pr.h / 2); ctx.rotate(Math.atan2(pr.vy, Math.abs(pr.vx)) * f); fxC('icebolt', -f * 4, 0, f); ctx.restore(); } else fxC('icebolt', pr.x + pr.w / 2 - f * 4, pr.y + pr.h / 2, f); return; }
      if (pr.type === 'icefall') { glow(pr.x + 5, pr.y + 5, 12, 'rgba(255,150,60,A)', 0.5); fxB('meteor', pr.x + 5, pr.y + 12, pr.vx > 0 ? -1 : 1); return; }
      if (pr.type === 'star') { glow(pr.x + pr.w / 2, pr.y + pr.h / 2, 12, 'rgba(255,230,120,A)', 0.5); fxC('star', pr.x + pr.w / 2 - f * 5, pr.y + pr.h / 2, f); return; }
      if (pr.type === 'firewave') { glow(pr.x + pr.w / 2, pr.y + pr.h / 2, 30, 'rgba(255,120,40,A)', 0.45); fxB('flame', pr.x + pr.w / 2, pr.y + pr.h + 2, f, 1 + Math.sin(S.t * 24) * 0.05); return; }
    }
    if (pr.type === 'bolt') { const f = Math.sign(pr.vx); glow(pr.x + pr.w / 2, pr.y + 4, 12, 'rgba(120,200,255,A)', 0.6); for (let k = 0; k < 4; k++) rect(pr.x + pr.w / 2 - f * k * 4, pr.y + 3 - k * 0.3, 4 - k * 0.6, 2, k ? '#7fd6ff' : '#ffffff'); ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.arc(pr.x + pr.w / 2 + f * 2, pr.y + 4, 3, 0, 7); ctx.fill(); }
    else if (pr.type === 'icefall') { glow(pr.x + 5, pr.y + 5, 12, 'rgba(140,220,255,A)', 0.6); ctx.strokeStyle = '#bff4ff88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pr.x + 5, pr.y + 5); ctx.lineTo(pr.x + 5 - pr.vx * 0.06, pr.y + 5 - pr.vy * 0.06); ctx.stroke(); drawStar(pr.x + 5, pr.y + 5, 5, '#e8fbff', S.t * 8); }
    else if (pr.type === 'star') { glow(pr.x + 6, pr.y + 6, 12, 'rgba(255,230,120,A)', 0.55); drawStar(pr.x + 6, pr.y + 6, 5.5, '#ffe66b', S.t * 12); for (let k = 1; k < 4; k++) rect(pr.x + 6 - Math.sign(pr.vx) * k * 5, pr.y + 6 + Math.sin(S.t * 20 + k) * 2, 1.5, 1.5, '#fff6c0'); }
    else if (pr.type === 'bowl') { drawTomyumBowl(pr.x + pr.w / 2, pr.y + pr.h, 1); }
    else if (pr.type === 'firewave') {
      const f = Math.sign(pr.vx);
      for (let i = 0; i < 5; i++) { ctx.strokeStyle = ['#e2483b', '#ff6b2c', '#ff9a3d', '#ffd35a', '#fff6c8'][i]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pr.x + pr.w / 2 - f * 10 + f * i * 2, pr.y + pr.h / 2, 18 - i * 2, f > 0 ? -1.2 : Math.PI - 1.2 + 0.3, f > 0 ? 1.2 : Math.PI + 1.2 - 0.3 + 0.0, false); ctx.stroke(); }
    }
    else if (pr.type === 'spore' && E5.spore) { const im = E5.spore, w = 26, h = im.height * w / im.width; ctx.save(); ctx.translate(pr.x + pr.w / 2, pr.y + pr.h / 2); ctx.rotate(Math.atan2(pr.vy || 0, pr.vx || 1)); ctx.drawImage(im, -w * 0.686, -h * 0.416, w, h); ctx.restore(); }
    else if (pr.type === 'spore') { rect(pr.x, pr.y, pr.w, pr.h, '#1b1020'); rect(pr.x + 1, pr.y + 1, pr.w - 2, pr.h - 2, '#c88ae8'); rect(pr.x + 3, pr.y + 2, 2, 2, '#f1e3ff'); }
    else if (pr.type === 'cloud' && host.enemyArtReady) { const cl = ENEMY_ART.puff_cloud![pr.vx > 0 ? 'r' : 'l'], k = 0.2 + Math.sin(S.t * 10) * 0.01; dimg(cl, pr.x + 6 - LW(cl) * k / 2, pr.y + 6 - LH(cl) * k / 2, LW(cl) * k, LH(cl) * k); }
    else if (pr.type === 'cloud') { ctx.fillStyle = '#d9c86acc'; ctx.beginPath(); ctx.arc(pr.x + 6, pr.y + 6, 6 + Math.sin(S.t * 10) * 1, 0, 7); ctx.fill(); rect(pr.x + 3, pr.y + 4, 2, 2, '#fff8c0'); }
    else if (pr.type === 'wave' && E5.shock) { const im = E5.shock, f = Math.sign(pr.vx) || 1, w = 46 + Math.sin(S.t * 30) * 2, h = im.height * w / im.width; ctx.save(); ctx.translate(f > 0 ? pr.x + pr.w + 4 : pr.x - 4, GROUND + 2); ctx.scale(f, 1); ctx.drawImage(im, -w, -h, w, h); ctx.restore(); }
    else if (pr.type === 'wave') { for (let i = 0; i < 4; i++) rect(pr.x + i * 4, pr.y + 14 - (6 + ((i + Math.floor(S.t * 20)) % 3) * 3), 3, 6 + ((i + Math.floor(S.t * 20)) % 3) * 3, i % 2 ? '#c88ae8' : '#f1e3ff'); }
  }

  function drawStar(x: number, y: number, r: number, col: string, rot = 0) {
    ctx.fillStyle = '#1b1020'; starPath(x, y, r + 1, rot); ctx.fill(); ctx.fillStyle = col; starPath(x, y, r, rot); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 0.5, y - 1.5, 1, 1);
  }
  function starPath(x: number, y: number, r: number, rot: number) { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = rot + k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
  function drawTomyumBowl(cx: number, by: number, sc: number) {
    if (host.heroReady) { const b = HERO_ATLAS.bowl!, w = 56 * sc, h = w * b[3] / b[2]; ctx.drawImage(heroAtlas, b[0], b[1], b[2], b[3], cx - w / 2, by - h, w, h); return; }
    ctx.save(); ctx.translate(cx, by); ctx.scale(sc, sc);
    ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(0, -16, 25, 17, 0, 0, Math.PI); ctx.fill(); rect(-9, -2, 18, 3, '#1b1020');
    ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.ellipse(0, -16, 24, 16, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#c9ced8'; ctx.beginPath(); ctx.ellipse(-8, -10, 9, 6, 0, 0, Math.PI); ctx.fill(); rect(-8, -2, 16, 2, '#6f747e');
    ctx.fillStyle = '#1b1020'; ctx.beginPath(); ctx.ellipse(0, -16, 25, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e2552e'; ctx.beginPath(); ctx.ellipse(0, -16, 23, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.ellipse(-6, -17, 8, 1.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff9a7a'; ctx.beginPath(); ctx.arc(-10, -18, 4, Math.PI * 0.2, Math.PI * 1.6); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff7a5a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(8, -18, 3.5, Math.PI * 1.2, Math.PI * 2.6); ctx.stroke();
    rect(-2, -21, 3, 3, '#c6e86a'); rect(-1.5, -20.5, 2, 2, '#f0ffd0'); rect(13, -20, 4, 1.5, '#e2182a'); rect(-18, -20, 2, 6, '#9be15d'); rect(15, -27, 2, 8, '#9be15d'); rect(3, -21, 4, 1.5, '#3cbf5a');
    ctx.restore();
  }
  /* temporary Pixie/Mole helpers in stages: their map bust art until stage sprites from card F1 are cut */
  function drawBustHelper(id: string, label: string, cx: number, by: number, bob: number, flipX: boolean) {
    const bi = host.uiArtReady && UI_BIG['bust_' + id]; if (!bi) return;
    const sz = 30; ctx.save(); ctx.translate(Math.round(cx), Math.round(by + bob)); if (flipX) ctx.scale(-1, 1); ctx.drawImage(bi, -sz / 2, -sz, sz, sz); ctx.restore();
    text(label, cx, by - sz - 9 + bob, { align: 'center', size: 8, color: id === 'pixie' ? '#ffb0e0' : '#e8c79a' });
  }
  function drawGorn(g: Gorn) {
    const x = Math.round(g.x), y = GROUND - 40, bump = g.state === 'smash' && g.t < 0.4 ? 6 : 0;
    if (host.crewArtReady) {
      const gi = CREW_ART[g.state === 'smash' ? 'gorn_chop' : 'gorn_idle']![g.state === 'leave' ? 'r' : 'l'];
      const hop = g.state === 'smash' ? 0 : Math.abs(Math.sin(S.t * 14)) * 2;
      dimg(gi, Math.round(x + 15 - LW(gi) / 2 + bump), Math.round(GROUND - LH(gi) - hop));
      text('GORN', x + 15, GROUND - LH(gi) - 8, { align: 'center', size: 8, color: '#9be15d' });
      return;
    }
    rect(x + 2 + bump, y + 10, 26, 24, '#1b1020'); rect(x + 3 + bump, y + 11, 24, 22, '#6aa84f'); rect(x + 8 + bump, y + 18, 18, 14, '#f6efe0');
    rect(x + 6 + bump, y, 18, 12, '#1b1020'); rect(x + 7 + bump, y + 1, 16, 10, '#6aa84f'); rect(x + 7 + bump, y - 6, 16, 7, '#f6efe0');
    rect(x + 17 + bump, y + 4, 2, 2, '#1b1020'); rect(x + 19 + bump, y + 8, 3, 3, '#fff');
    rect(x + 6 + bump, y + 34, 6, 6, '#3a2416'); rect(x + 18 + bump, y + 34, 6, 6, '#3a2416');
    text('GORN', x + 15, y - 16, { align: 'center', size: 8, color: '#9be15d' });
  }

  function knightAtk() { return Math.round((KNIGHTS[S.active].id === 'arthur' ? 12 : KNIGHTS[S.active].id === 'rosemary' ? 8 : 10) * dmgMul() * (S.buff ? 1.3 : 1)); }
  function drawStageHud() {
    const k = activeK();
    // POWER / SPECIAL
    panel(4, 4, 156, 26, '#1b1020ee', '#8a5a2e');
    rect(7, 7, 34, 9, '#a8241c'); text('POWER', 9, 7.5, { size: 8, weight: 700, color: '#fff' });
    if (!frameBar('frame_dark', 41, 5, 117, 12.5, k.hp / k.max, '#e2382c', '#ff8a7a')) { bar(42, 7, 114, 9, k.hp / k.max, '#e2382c', '#3a1010'); rect(43, 8, 112 * clamp(k.hp / k.max, 0, 1), 2, '#ff8a7a'); }
    rect(7, 18, 34, 9, '#1c4a8a'); text('SPECIAL', 8, 18.5, { size: 7, weight: 700, color: '#fff' });
    const full = S.gauge >= 100;
    const fb = frameBar('frame_blue', 41, 16.5, 87, 12.5, S.gauge / 100, full ? (Math.floor(S.t * 8) % 2 ? '#bff4ff' : '#3fa9e0') : '#3fa9e0', '#9fe4ff');
    if (fb) rect(fb.ix + fb.iw / 2, fb.iy, 0.5, fb.ih, '#f6ead2'); else { bar(42, 18, 84, 9, S.gauge / 100, full ? (Math.floor(S.t * 8) % 2 ? '#bff4ff' : '#3fa9e0') : '#3fa9e0', '#0c1a30'); rect(84, 18, 0.5, 9, '#f6ead2'); }
    text(full ? 'MAX' : Math.floor(S.gauge) + '%', 130, 18.5, { size: 8, weight: 700, color: full ? '#bff4ff' : '#7fd6ff' });
    // party
    for (let i = 0; i < 3; i++) {
      const kk = S.knights[i], x = 6 + i * 36, y = 34, act = i === S.active;
      rect(x - 1, y - 1, 34, 26, act ? '#f2a93b' : '#3a2a40'); rect(x, y, 32, 24, '#0c1418ee');
      ctx.globalAlpha = kk.down ? 0.3 : 1; dimg(knightHead(i).r, x + 4, y - 1, 24, 20); ctx.globalAlpha = 1;
      text(String(i + 1), x + 1.5, y + 0.5, { size: 7, color: act ? '#f2a93b' : '#8a9a9a', weight: 700 });
      bar(x + 2, y + 19, 28, 4, kk.hp / kk.max, kk.hp / kk.max > 0.35 ? '#6ad36a' : '#e2483b');
      if (kk.down) text('KO', x + 16, y + 6, { size: 9, align: 'center', color: '#ff6b6b', weight: 700 });
    }
    text('พลัง: ' + knightAtk(), 6, 62, { size: 8, thai: true, color: '#ffd76a' });
    text('ดาบ Tier ' + (1 + host.save.up.blade + (host.save.up.legend ? 1 : 0)), 56, 62, { size: 8, thai: true, color: '#bfe8ff' });
    if (S.buff) text('บัฟต้มยำ ATK+30%', 6, 73, { size: 7, thai: true, color: '#ff9a5a' });
    // right column
    const m = Math.floor(S.t / 60), sec = Math.floor(S.t % 60);
    text(S.n === 2 ? 'Wine Dungeon' : 'Mushroom Forest', 394, 4, { size: 10, align: 'right', weight: 700 });
    text('เวลา: ' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0'), 394, 17, { size: 8, align: 'right', thai: true, color: '#ffd76a' });
    text('คะแนน: ' + S.score, 394, 28, { size: 8, align: 'right', thai: true, color: '#ffd76a' });
    dimg(icon('glowcap', 1), 300, 41); textC('' + S.loot.glowcap, 310, 41 + LH(icon('glowcap', 1)) / 2, { size: 8 });
    dimg(icon('chili', 1), 322, 41); textC('' + S.loot.chili, 332, 41 + LH(icon('chili', 1)) / 2, { size: 8 });
    const rare = S.n === 2 ? 'cork' : 'truffle'; dimg(icon(rare, 1), 344, 41); textC('' + (S.loot[rare] || 0), 354, 41 + LH(icon(rare, 1)) / 2, { size: 8 });
    dimg(icon('ale', 1), 366, 41); textC('' + S.sup.bart, 376, 41 + LH(icon('ale', 1)) / 2, { size: 8, color: S.sup.bart ? '#f6ead2' : '#6a5a6a' });
    text('ลูกทีม: ' + host.crewLabel() + ' (C)', 394, 52, { size: 7, align: 'right', thai: true, color: '#bfe8ff' });
    // stage tag bottom-left
    text(S.n === 2 ? 'ด่านที่ 2: ดันเจี้ยนไวน์โบราณ' : 'ด่านที่ 1: ป่าเห็ดพิษ', 6, 202, { size: 8, thai: true, color: '#f6ead2' });
    if (!S.bossOn) { rect(6, 196, 90, 1.5, '#1b1020aa'); rect(6, 196, 90 * clamp(S.p.x / ARENA, 0, 1), 1.5, '#f2a93b'); }
    // hint
    if (S.hint) { const w = 236; panel(W / 2 - w / 2, 76, w, 16, '#173a2aee', '#9be15d'); text(S.hint, W / 2, 79.5, { size: 8, align: 'center', color: '#d8ffc0', thai: true }); }
    // boss gauge bottom-right
    if (S.boss && !S.boss.dead && S.boss.state !== 'intro') {
      text(S.n === 2 ? 'บารอนฟอนบาร์เรล' : 'ราชาเห็ด', 394, 182, { size: 10, align: 'right', thai: true, weight: 600 });
      if (!frameBar('frame_dark', 296, 194, 102, 16, S.boss.hp / S.boss.max, '#e2382c', '#ff8a7a')) { panel(300, 197, 96, 12, '#1b1020ee', '#c9a24a'); bar(302, 199, 92, 8, S.boss.hp / S.boss.max, '#e2382c', '#3a1010'); }
    }
    // speech box
    if (S.speech) {
      const sp = S.speech; if (!nineBox('dialog', 94, 166, 212, 38, 16, 7)) panel(96, 168, 208, 34, '#05080cf2', '#f6f2ea');
      ctx.font = `600 10px ${THAI}`; const nameW = ctx.measureText(sp.who + ': ').width;
      text(sp.who + ':', 104, 174, { size: 10, thai: true, color: '#ffd84a' });
      wrapText(sp.line, 104 + nameW, 174, 296 - nameW - 104, 12, { size: 10, thai: true });
      if (Math.floor(S.t * 3) % 2) { ctx.fillStyle = '#f6f2ea'; ctx.beginPath(); ctx.moveTo(292, 193); ctx.lineTo(298, 196); ctx.lineTo(292, 199); ctx.fill(); }
    }
    // banner
    if (S.banner) {
      const b = S.banner, a = clamp(Math.min(b.t, 2.2 - b.t) * 3, 0, 1);
      ctx.globalAlpha = a; if (!nineBox('dialog', 64, 90, 272, 48, 16, 8)) rect(0, 92, W, 44, b.boss ? '#2a103acc' : '#05141acc');
      text(b.text, W / 2, 97, { size: 20, align: 'center', color: b.boss ? '#e8a8ff' : '#f2a93b', weight: 700 });
      text(b.sub, W / 2, 119, { size: 11, align: 'center', color: '#f6ead2', thai: true, weight: 400 });
      ctx.globalAlpha = 1;
    }
    if (S.end && S.end.t > 0.6) {
      const a = clamp((S.end.t - 0.6) * 2, 0, 1); ctx.globalAlpha = a;
      rect(0, 84, W, 54, '#05141add');
      text('ปราบราชาเห็ดสำเร็จ!', W / 2, 88, { size: 16, align: 'center', color: '#f2a93b', weight: 600, thai: true });
      text(S.end.ember ? 'ดรอปลับ: Ember Spore (ปราบตอนติดไฟ!)' : 'ได้รับ: Shroom Crown', W / 2, 114, { size: 10, align: 'center', thai: true, color: S.end.ember ? '#ffb347' : '#f6ead2' });
      ctx.globalAlpha = 1;
    }
    controlStrip(S.bossOn ? null : null);
    if (S.paused) { rect(0, 0, W, H, '#0d0812aa'); if (!nineBox('dialog', 110, 74, 180, 62, 16, 8)) panel(110, 74, 180, 62, '#1b120cf2', '#8a5a2e'); text('หยุดชั่วคราว', W / 2, 84, { size: 18, align: 'center', color: '#f2a93b', thai: true, weight: 600 }); if (host.tpOnTxt) { [['เล่นต่อ', 'sresume'], ['วิธีเล่น', 'shelp']].forEach(([lb, id], k) => { const x = 122 + k * 80; btn(id, x, 108, 76, 19); uiBtn(x, 108, 76, 19, k === 0, '#f2a93b', '#3a2a20', '#5a3a12', '#1b120c'); textC(lb, x + 38, 117.5, { size: 8.5, align: 'center', thai: true, color: k === 0 ? '#ffe9b0' : '#cfc0b0' }); }); } else text('กด P หรือ Enter เพื่อเล่นต่อ', W / 2, 114, { size: 9, align: 'center', thai: true }); }
  }
  function drawUltimate() {
    const u = S.ult; if (!u) return;
    const t = u.t;
    ctx.fillStyle = `rgba(20,6,10,${Math.min(0.7, t * 2)})`; ctx.fillRect(0, 0, W, H);
    // three knights pose
    for (let i = 0; i < 3; i++) { const spr = knightSprite(i, 'jump').r; const x = 70 + i * 40, y = 158 - Math.min(1, t * 3) * 20 - (i === 1 ? 10 : 0); dimg(spr, x, y); }
    // pot falls
    const py = Math.min(1, t / 0.75); const cy = -80 + py * py * 200;
    const cx = 250;
    if (host.fxArtReady) { if (u.hit) { const k = t - 0.75; fxB('tip', cx, 200, 1, 1); ctx.globalAlpha = clamp(2 - k * 1.4, 0, 1); fxB('wave', W + 120 - k * 360, H + 6, 1, 1); ctx.globalAlpha = 1; } else fxB('boil', cx, cy + 90, 1, 1); }
    else if (true) { drawTomyumBowl(cx, cy + 60, 2.3); for (let i = 0; i < 6; i++) { ctx.globalAlpha = 0.5; rect(cx - 40 + i * 16 + Math.sin(t * 8 + i) * 4, cy - 10 - ((t * 40 + i * 9) % 30), 4, 8, '#f6efe0'); } ctx.globalAlpha = 1; }
    if (u.hit) { const s = Math.max(0, 1 - (t - 0.75) * 1.4); ctx.globalAlpha = s * 0.55; rect(0, 0, W, H, '#ffd35a'); ctx.globalAlpha = 1; }
    if (t > 0.3) {
      text('ULTIMATE TAVERN COMBO', W / 2, 84, { size: 14, align: 'center', color: '#ffd35a', weight: 700 });
      text('หม้อต้มยำมหาภัยกระทะเหล็กเดือด!', W / 2, 102, { size: 14, align: 'center', color: '#ff8a5a', thai: true, weight: 600 });
    }
  }

  function updateResults(dt: number) { results.t += dt; if (results.t > 0.8 && (!results.net || results.net.state !== 'send' || results.t > 3) && anyConfirm()) { host.startTavern(); if (!host.save.seen['tavern']) { host.help = 'tavern'; host.save.seen['tavern'] = true; persist(); } } }
  function drawResults() {
    drawStageBg(results.n || 1, results.t * 10, results.t);
    rect(0, 0, W, H, '#05141aaa');
    panel(60, 12, 280, 196, '#101820f2', '#f2a93b');
    const r2 = results.n === 2;
    text(r2 ? 'เคลียร์ด่านที่ 2!' : 'เคลียร์ด่านที่ 1!', W / 2, 21, { size: 14, align: 'center', color: '#f2a93b', thai: true, weight: 600 });
    text(r2 ? 'ดันเจี้ยนไวน์โบราณ · Ancient Wine Dungeon' : 'ป่าเห็ดพิษ · Poison Mushroom Forest', W / 2, 40, { size: 8, align: 'center', thai: true, weight: 400, color: '#bba8ba' });
    for (let k = 0; k < 3; k++) text('★', W / 2 - 20 + k * 20, 51, { size: 15, align: 'center', color: k < results.stars ? '#f2c94c' : '#3a3a40', shadow: k < results.stars });
    const m = Math.floor(results.time / 60), s = Math.floor(results.time % 60);
    const rows: [string, string | number][] = [['เวลา', m + ':' + String(s).padStart(2, '0')], ['คะแนน', results.score], ['ปราบมอนสเตอร์', results.kills], ['Glowcap / พริก', '+' + results.loot.glowcap + ' / +' + results.loot.chili], ['Shroom Crown', '+' + results.loot.crown], ['ห้องลับ (เชฟกอร์น)', results.vault ? 'เจอ! Truffle of Ages' : 'พลาด'], ['ดรอปลับบอส', results.ember ? 'Ember Spore!' : 'พลาด (ปราบตอนติดไฟ)']];
    if (r2) rows.splice(4, 3, ['100-Year Vintage Cork', '+' + (results.loot.cork || 0)], ['อุโมงค์ลับ (ตุ่น)', results.vault ? 'เจอ! Truffle + Cork' : 'พลาด'], ['ดรอปลับบอส', results.ember ? 'Cork เพิ่ม!' : 'พลาด (ปราบตอนติดน้ำแข็ง)']);
    rows.forEach(([a, b], i) => { text(a, 78, 72 + i * 12.5, { size: 8.5, thai: true, weight: 400 }); text(String(b), 322, 72 + i * 12.5, { size: 8.5, align: 'right', thai: true, color: /พลาด/.test(String(b)) ? '#7a6a6a' : '#ffd76a' }); });
    const nl = results.net ? netLine(results.net, ['stage1_score', 'stage1_time']) : null;
    text(nl ? nl.str : 'กลับร้านกันเถอะ ลูกค้ากะดึกรออยู่!', W / 2, 159, { size: nl ? 9 : 8, align: 'center', thai: true, color: nl ? nl.col : '#bba8ba', weight: nl ? 700 : 400 });
    if (results.t > 0.8 && (!results.net || results.net.state !== 'send' || results.t > 3)) text('Enter / แตะ: เริ่มกะดึก', W / 2, 172, { size: 10, align: 'center', thai: true, color: Math.floor(results.t * 2) % 2 ? '#ffd76a' : '#f6ead2' });
  }
  function updateOver(dt: number) {
    overT += dt;
    if (overT > 0.8 && anyConfirm()) startStage(S.bossOn);
  }
  function drawOver() {
    rect(0, 0, W, H, '#0d0812ee');
    text('The knights retreat...', W / 2, 70, { size: 18, align: 'center', color: '#ff6b6b', weight: 700 });
    text('Old Bart patches everyone up with stew.', W / 2, 98, { size: 10, align: 'center', color: '#bba8ba' });
    if (overT > 0.8) text(S && S.bossOn ? 'Enter / tap: retry from the boss' : 'Enter / tap: try again', W / 2, 130, { size: 11, align: 'center', color: '#ffd76a', weight: 700 });
  }
  return {
    LEVEL_W, ARENA,
    startStage, finishStage, updateStage, makeEnemy, knightMax, dmgMul, gameOver,
    drawStageWorld, drawStageHud, drawUltimate, drawStageBg, drawForestBg,
    updateResults, drawResults, updateOver, drawOver,
    /** the running stage, or null */
    get S() { return S; },
    get results() { return results; },
    /** analog stick direction from the touch d-pad, or null */
    get stickVec() { return stickVec; },
    set stickVec(v) { stickVec = v; },
  };
}
