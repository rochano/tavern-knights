// Pointer and touch input: tap regions the scenes register with btn(), mouse combat and station clicks
// on the canvas, and the on-screen pad for phones (d-pad / joystick, buttons, fullscreen, rotate-to-landscape
// layout). Split out of legacy-game.ts unchanged.
import { press, pressed, release } from './input';
import { FX_ART_SRC, UI_ART_SRC } from './data/art';
import { PXF_SRC } from './draw';

interface Region { id: string; x: number; y: number; w: number; h: number }
type Dir = 'up' | 'down' | 'left' | 'right';
declare global { interface Window { __CAUL?: string } }

export interface TouchHost {
  readonly cv: HTMLCanvasElement;
  readonly W: number;
  readonly H: number;
  readonly LANG: string;
  readonly scene: string;
  readonly mapRank: boolean;
  help: string | null;
  tpOnTxt: boolean;
  readonly ranking: { readonly nameEdit: boolean; readonly nameZ: boolean; readonly nameH0: number; nameOpen(): void };
  readonly stage: {
    readonly S: { paused: boolean; camX: number; t: number; p: { x: number; face: number; special: unknown } | null; aim?: { x: number; y: number; t: number } } | null;
    stickVec: { dx: number; dy: number } | null;
  };
  readonly tavern: { readonly T: { paused?: boolean; over: boolean; pour: unknown; cook: unknown; active: number; click?: number } | null };
  readonly STATIONS: { kind: string; x: number }[];
  readonly titlePanel: unknown;
  tr(s: string): string;
  helpPageFor(): string;
}

export function createTouch(host: TouchHost) {
  const { cv, W, H, tr } = host;
  let uiRegions: Region[] = [];
  function localFrac(e: PointerEvent, el: Element): [number, number] { const r = el.getBoundingClientRect(); if (document.body.classList.contains('tp-rot')) return [(e.clientY - r.top) / r.height, (r.right - e.clientX) / r.width]; return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
  function btn(id: string, x: number, y: number, w: number, h: number) { uiRegions.push({ id, x, y, w, h }); }
  /* phones only open the keyboard when focus() runs inside the tap itself, so the rename button focuses the name field right here */
  document.addEventListener('mousedown', e => { if (host.ranking.nameEdit && (e.target as HTMLElement).id !== 'nameIn') e.preventDefault(); }, true); /* the mouse event a tap sends afterwards would move focus back to the canvas */
  cv.addEventListener('pointerup', e => {
    const lf = localFrac(e, cv), x = lf[0] * W, y = lf[1] * H;
    const hit = uiRegions.slice().reverse().find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (!host.ranking.nameEdit && hit && hit.id === 'rkn' && !host.help) host.ranking.nameOpen();
    else if (host.ranking.nameEdit && !(hit && (hit.id === 'nok' || hit.id === 'ncan'))) { try { const el = (document.getElementById('nameIn')! as HTMLInputElement), n = el.value.length; el.focus(); el.setSelectionRange(n, n); } catch (x) {} }
  });
  cv.addEventListener('pointerdown', e => {
    const lf = localFrac(e, cv); const x = lf[0] * W, y = lf[1] * H;
    const hit = uiRegions.slice().reverse().find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit && !host.help) pressed['ui:' + hit.id] = true;
    // mouse combat in a host.stage: left button = attack, right button = special, middle = ultimate; the knight turns toward the cursor
    if ((e.pointerType === 'mouse' || e.pointerType === 'touch') && host.scene === 'stage' && host.stage.S && !host.stage.S.paused && !host.help && !hit) {
      const a = e.button === 0 ? 'atk' : e.button === 2 ? 'sp' : e.button === 1 ? 'ult' : null; if (!a) return;
      if (host.stage.S.p && !host.stage.S.p.special) { const dx = host.stage.S.camX + x - (host.stage.S.p.x + 9); if (Math.abs(dx) > 4) host.stage.S.p.face = dx > 0 ? 1 : -1; }
      if (a === 'atk') host.stage.S.aim = { x: host.stage.S.camX + x, y, t: host.stage.S.t };
      mouseHeld = a; press(a);
    }
    // mouse in the night shift: left click a station = walk there with the right knight and work (same as J), right click = skill (K)
    if ((e.pointerType === 'mouse' || e.pointerType === 'touch') && host.scene === 'tavern' && host.tavern.T && !host.tavern.T.paused && !host.tavern.T.over && !host.help && !hit) {
      if (e.button === 2) { pressed.sp = true; return; }
      if (e.button !== 0) return;
      if (host.tavern.T.pour) { pressed.atk = true; return; }
      if (host.tavern.T.cook || y < 40 || y > 200) return;
      let bi = -1, bd = 26; host.STATIONS.forEach((st, i) => { const d = Math.abs(st.x - x); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0) host.tavern.T.click = bi;
    }
  });
  let mouseHeld: 'atk' | 'sp' | 'ult' | null = null;
  window.addEventListener('pointerup', e => { if (mouseHeld && (e.pointerType === 'mouse' || e.pointerType === 'touch')) { release(mouseHeld); mouseHeld = null; } });
  cv.addEventListener('contextmenu', e => { if (host.scene === 'stage' || host.scene === 'tavern') e.preventDefault(); });
  document.getElementById('btnHelp')!.addEventListener('click', () => { host.help = host.help ? null : host.helpPageFor(); cv.focus(); });
  /* on-screen touch buttons show only on touch-screen devices (no option for it) */
  document.body.classList.toggle('touch-on', matchMedia('(pointer: coarse)').matches);

  /* ---- mobile landscape controls ---- */
  const TOUCH_DEV = matchMedia('(pointer: coarse)').matches;
  if (TOUCH_DEV) { const stop = (e: Event) => { if (e.cancelable) e.preventDefault(); }; document.addEventListener('touchmove', stop, { passive: false }); document.addEventListener('gesturestart', stop, { passive: false }); document.addEventListener('dblclick', stop, { passive: false }); let lastT = 0; document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastT < 350 && e.cancelable) e.preventDefault(); lastT = n; }, { passive: false }); }
  const tpEl = document.getElementById('tpad')!;
  {
    const big = UI_ART_SRC.big, ic = UI_ART_SRC.icons;
    tpEl.querySelectorAll<HTMLElement>('.tp-dpad i').forEach(i => { i.style.backgroundImage = `url(${([] as string[]).concat(big['ar_' + i.dataset['d']] as string | string[])[0]})`; });
    const TB = {"atk": "art/1d49f6e542e5.webp", "sp": "art/5b41ee0111f4.webp", "ult": "art/d0df181ca6fe.webp", "bowl": "art/fb1025919639.webp", "swap": "art/6d49bb9cbb72.webp", "crew": "art/5f1580632b25.webp", "harp": "art/5987157def42.webp", "close": "art/cf2bcf9cc425.webp", "pause": "art/a177c75724f2.webp", "rotate": "art/35f3fa8159e8.webp", "full": "art/f6d3526c2f94.webp", "base": "art/88d408978b29.webp", "knob": "art/8d2d0d34962d.webp", "knobon": "art/0c5a8837e78f.webp", "ok": "art/229b6170159d.webp", "okon": "art/e6448512c78c.webp"};

    tpEl.querySelector<HTMLElement>('.tp-pause')!.style.backgroundImage = `url(${TB['pause']})`; tpEl.querySelector<HTMLElement>('.tp-full')!.style.backgroundImage = `url(${TB['full']})`;
    tpEl.querySelector<HTMLElement>('.tp-next')!.style.backgroundImage = `url(${TB['swap']})`; tpEl.querySelector<HTMLElement>('.tp-ult')!.style.backgroundImage = `url(${TB['ult']})`; tpEl.querySelector<HTMLElement>('.tp-sup')!.style.backgroundImage = `url(${TB['crew']})`; tpEl.querySelector<HTMLElement>('.tp-back')!.style.backgroundImage = `url(${TB['close']})`;
    document.querySelector<HTMLElement>('#rotate .rot-box')!.style.borderImageSource = `url(${PXF_SRC['e6_window']})`; document.getElementById('rotIc')!.style.backgroundImage = `url(${TB['rotate']})`;
    window.__TB = TB; window.__CAUL = FX_ART_SRC['cauldron'];
    document.getElementById('tpDpad')!.style.backgroundImage = `url(${TB['base']})`; document.getElementById('tpKnob')!.style.backgroundImage = `url(${TB['knob']})`;
    const tb = document.getElementById('tpad')!;
    tb.querySelectorAll<HTMLElement>('.tp-b').forEach(b => {
      const a = b.dataset['k']; if (!a) return; const on = (v: boolean) => { b.classList.toggle('on', v); if (b.classList.contains('tp-atk') && (document.body.dataset['tp'] === 'title' || document.body.dataset['tp'] === 'map')) b.style.backgroundImage = `url(${v ? window.__TB!['okon'] : window.__TB!['ok']})`; };
      b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} press(a); on(true); });
      const up = (e: Event) => { e.preventDefault(); release(a); on(false); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', () => { release(a); on(false); });
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    // d-pad: one touch zone, direction from finger position (diagonals only in action stages)
    const dp = document.getElementById('tpDpad')!, cur: Record<Dir, boolean> = { up: false, down: false, left: false, right: false }; let pid: number | null = null;
    const set = (want: Partial<Record<Dir, number>>) => { for (const d of Object.keys(cur) as Dir[]) { if (want[d] && !cur[d]) press(d); else if (!want[d] && cur[d]) release(d); cur[d] = !!want[d]; dp.querySelector<HTMLElement>(`[data-d=${d}]`)!.classList.toggle('on', cur[d]); } };
    const kn = document.getElementById('tpKnob')!, knob = (dx: number | null, dy?: number) => { if (dx === null) { kn.classList.remove('on'); kn.style.transform = ''; kn.style.backgroundImage = `url(${window.__TB!['knob']})`; return; } const l = Math.hypot(dx, dy!), k = l > 0.62 ? 0.62 / l : 1, r = dp.getBoundingClientRect(); kn.classList.add('on'); kn.style.backgroundImage = `url(${window.__TB!['knobon']})`; kn.style.transform = `translate(${dx * k * r.width / 2}px,${dy! * k * r.height / 2}px)`; };
    const aim = (e: PointerEvent) => { const lf = localFrac(e, dp), dx = lf[0] * 2 - 1, dy = lf[1] * 2 - 1, w: Partial<Record<Dir, number>> = {}; knob(dx, dy);
      if (Math.hypot(dx, dy) < 0.22) { host.stage.stickVec = null; return set(w); }
      if (document.body.dataset['tp'] === 'act') { const l = Math.hypot(dx, dy); host.stage.stickVec = { dx: dx / l, dy: dy / l }; if (dx < -0.3) w.left = 1; if (dx > 0.3) w.right = 1; if (dy / l < -0.55) w.up = 1; if (dy / l > 0.6) w.down = 1; }
      else if (Math.abs(dx) > Math.abs(dy)) w[dx < 0 ? 'left' : 'right'] = 1; else w[dy < 0 ? 'up' : 'down'] = 1;
      set(w); };
    dp.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; try { dp.setPointerCapture(pid); } catch (_) {} aim(e); });
    dp.addEventListener('pointermove', e => { if (e.pointerId === pid) aim(e); });
    const end = (e: PointerEvent) => { if (e.pointerId !== pid) return; pid = null; host.stage.stickVec = null; set({}); knob(null); };
    dp.addEventListener('pointerup', end); dp.addEventListener('pointercancel', end);
    // first touch: try fullscreen + landscape lock (Android); iPhone keeps the browser bar
    const fb = document.getElementById('tpFull')!, canFs = !!document.documentElement.requestFullscreen;
    const goFs = () => { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); };
    const fsUpd = () => fb.classList.toggle('hide', !canFs || !!document.fullscreenElement); document.addEventListener('fullscreenchange', fsUpd); fsUpd();
    fb.addEventListener('pointerdown', e => { e.preventDefault(); goFs(); });
    if (TOUCH_DEV) window.addEventListener('pointerdown', function fs() { window.removeEventListener('pointerdown', fs, true); const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); }, true);
  }
  let tpKey = '';
  let tpRotKey = '';
  function tpRotFit(rot: boolean) { /* Safari/LINE: 100vh includes the area under the browser bars, so size the rotated game to the real visible box */
    const w = window.innerWidth, h = window.innerHeight, k = rot + ':' + w + 'x' + h; if (k === tpRotKey) return; tpRotKey = k;
    const st = document.querySelector<HTMLElement>('.wrap')!.style;
    if (rot) { st.left = w + 'px'; st.width = h + 'px'; st.height = w + 'px'; } else { st.left = st.width = st.height = ''; }
  }
  function tpSync() {
    if (!TOUCH_DEV) return;
    const land = innerWidth >= innerHeight || host.ranking.nameEdit; /* while typing a name, lay the game flat at the top so the phone keyboard never covers it (X/FB in-app browsers don't resize for the keyboard) */
    document.body.classList.toggle('tp-name', host.ranking.nameEdit); const nz = host.ranking.nameEdit && host.ranking.nameZ; document.body.classList.toggle('tp-namez', nz);
    { /* upright phone: zoom in on the name box and centre it in the space above the keyboard */
      const sc = document.querySelector<HTMLElement>('.screen')!, vv = window.visualViewport;
      if (nz) { const k = 1.75, wd = innerWidth, hd = wd * 9 / 16, avail = innerHeight < host.ranking.nameH0 * 0.8 ? innerHeight : vv && vv.height < innerHeight * 0.9 ? vv.height : innerHeight * 0.56;
        sc.style.transformOrigin = '0 0'; sc.style.transform = `translate(${wd / 2 * (1 - k)}px, ${avail / 2 - 114 / 225 * hd * k}px) scale(${k})`; }
      else if (sc.style.transform) sc.style.transform = sc.style.transformOrigin = ''; }
    document.body.classList.toggle('tp-on', true); host.tpOnTxt = true; document.body.classList.toggle('tp-rot', !land); tpRotFit(!land);
    const mode = host.help ? 'menu' : (host.scene === 'stage' || host.scene === 'gameover') ? 'act' : host.scene === 'tavern' ? 'tav' : host.scene === 'title' ? 'title' : host.scene === 'map' ? 'map' : 'menu';
    if ((host.titlePanel && host.scene === 'title') || (host.mapRank && host.scene === 'map')) document.body.dataset['tpp'] = '1'; else delete document.body.dataset['tpp'];
    if (host.ranking.nameEdit) document.body.dataset['tpn'] = '1'; else delete document.body.dataset['tpn'];
    const key = mode + host.LANG + (mode === 'tav' && host.tavern.T ? host.tavern.T.active : ''); if (key === tpKey) return; tpKey = key; document.body.dataset['tp'] = mode;
    const TB = window.__TB!, Q = (s: string) => tpEl.querySelector<HTMLElement>(s)!;
    const lab = (sel: string, img: string | null | undefined, txt: string) => { const b = Q(sel); if (img) b.style.backgroundImage = `url(${img})`; b.querySelector('span')!.textContent = tr(txt); };
    if (mode === 'tav') { const who = host.tavern.T ? host.tavern.T.active : 0; lab('.tp-atk', TB['bowl'], 'ทำงาน'); lab('.tp-sp', who === 2 ? TB['harp'] : TB['sp'], 'สกิล'); lab('.tp-next', null, 'สลับคน'); }
    else if (mode === 'title') { lab('.tp-atk', TB['ok'], 'ตกลง'); lab('.tp-back', null, '\u200bปิด'); }
    else if (mode === 'map') { lab('.tp-atk', TB['ok'], 'ลุยเลย!'); lab('.tp-sp', window.__CAUL, 'ห้องปรุงยา'); lab('.tp-back', null, '\u200bปิด'); }
    else { lab('.tp-atk', TB['atk'], 'โจมตี'); lab('.tp-sp', TB['sp'], 'ท่าพิเศษ'); lab('.tp-next', null, 'สลับตัว'); }
    lab('.tp-ult', null, 'ท่าประสาน'); lab('.tp-sup', null, 'ลูกทีม');
    document.getElementById('rotTxt')!.textContent = tr('หมุนมือถือเป็นแนวนอนเพื่อเล่น');
  }

  return { btn, sync: tpSync, TOUCH_DEV, clearRegions() { uiRegions = []; } };
}
