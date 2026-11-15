// Online ranking panel, shared by the title menu and the world map: three boards, this week / all time,
// top 8 + your own rank, and the rename box. Split out of legacy-game.ts unchanged.
import type { BoardId, Period } from '@tk/shared';
import { SFX } from '../audio';
import { pressed } from '../input';
import type { Net } from '../net';
import type { DrawKit } from './host';

export interface RankingHost extends DrawKit {
  readonly NET: Net;
  readonly NET_BOARDS: [BoardId, string][];
  readonly THAI: string;
  readonly cv: HTMLCanvasElement;
  netVal(b: BoardId, v: number): string;
  tr(s: string): string;
}

export function createRanking(g: RankingHost) {
  const { ctx, W, H, NET, NET_BOARDS, THAI, cv, netVal, tr, rect, text, textC, panel, nineBox, uiBtn, btn } = g;
  /** the HTML text box used to type a ranking name (play.html) */
  const nameInput = () => document.getElementById('nameIn') as HTMLInputElement;
  let rkB = 0, rkP: Period = 'week';
  // name box: open, opened in portrait (zoomed layout), page height when it opened
  let nameEdit = false, nameZ = false, nameH0 = 0;
  function nameOpen() {
    const el = nameInput(); nameEdit = true; nameZ = innerWidth < innerHeight; nameH0 = innerHeight; /* remember: the keyboard shrinks the page and would make it look landscape */ el.value = NET.name || '';
    el.style.display = 'block';
    try { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); } catch (e) {} /* caret at the end, so backspace deletes one letter */
  }
  function nameDone(ok: boolean) {
    const el = nameInput(); if (!nameEdit) return; nameEdit = false; el.style.display = 'none';
    try { el.blur(); window.scrollTo(0, 0); } catch (e) {} cv.focus(); SFX.select();
    if (ok) NET.rename(el.value);
  }
  function rankInput(close: () => void) {
    if (nameEdit) { if (pressed['ui:nok'] || pressed.ok || pressed.atk) nameDone(true); else if (pressed['ui:ncan'] || pressed.pause || pressed.rank) nameDone(false); return; }
    if (pressed.left) { rkB = (rkB + 2) % 3; SFX.select(); }
    if (pressed.right) { rkB = (rkB + 1) % 3; SFX.select(); }
    for (let k = 0; k < 3; k++) if (pressed['ui:rk' + k]) { rkB = k; SFX.select(); }
    if (pressed.up || pressed.down) { rkP = rkP === 'week' ? 'all' : 'week'; SFX.select(); }
    if (pressed['ui:rkw'] || pressed['ui:rka']) { rkP = pressed['ui:rkw'] ? 'week' : 'all'; SFX.select(); }
    if (pressed.rename || pressed['ui:rkn']) { SFX.select(); if (!nameEdit) nameOpen(); }
    else if (pressed.ok || pressed.atk || pressed.pause || pressed.rank || pressed['ui:close']) { close(); SFX.select(); }
  }
  // online ranking panel (title menu > Ranking): three boards, this week / all time, top 8 + your own rank
  function drawRankPanel() {
    text('อันดับ (Ranking)', W / 2, 40, { size: 11, align: 'center', thai: true, color: '#f2a93b', weight: 600 });
    NET_BOARDS.forEach(([b, lb], k) => { const x = 80 + k * 82, on = k === rkB; btn('rk' + k, x, 56, 78, 16); uiBtn(x, 56, 78, 16, on); textC(lb, x + 39, 64, { size: 6.5, align: 'center', thai: true, color: on ? '#ffe9b0' : '#cfc0b0' }); });
    ([['week', 'สัปดาห์นี้', 'rkw', 140], ['all', 'ตลอดกาล', 'rka', 202]] as const).forEach(([p, lb, id, x]) => { const on = rkP === p; btn(id, x, 75, 58, 12); uiBtn(x, 75, 58, 12, on); textC(lb, x + 29, 81, { size: 6.5, align: 'center', thai: true, color: on ? '#ffe9b0' : '#a89a8a' }); });
    const b = NET_BOARDS[rkB][0], e = NET.board(b, rkP), rows = e.rows || [];
    if (!rows.length) {
      const msg = e.state === 'load' ? 'กำลังโหลด...' : e.state === 'off' ? 'ระบบอันดับออนไลน์ยังไม่เปิด หรือไม่ได้ต่อเน็ต' : 'ยังไม่มีใครติดอันดับ เป็นคนแรกเลย!';
      text(msg, W / 2, 118, { size: 7.5, align: 'center', thai: true, color: e.state === 'off' ? '#ff8a7a' : '#cfc0b0', weight: 400 });
    }
    rows.slice(0, 8).forEach((r, k) => {
      const y = 91 + k * 8.4, col = r.me ? '#9be15d' : k === 0 ? '#ffd76a' : '#f6ead2';
      const cy = y + 3.6; /* number font and Thai font sit differently from the top, so centre each on one line */
      textC(String(r.rank), 96, cy, { size: 7, align: 'right', color: col, weight: 700 });
      textC('⁠' + r.name, 104, cy, { size: 7, thai: true, color: col, weight: r.me ? 700 : 400 });
      textC(netVal(b, r.value), 318, cy, { size: 7, align: 'right', color: col, weight: 700 });
    });
    textC('คุณ:', 80, 163.6, { size: 7, thai: true, color: '#bba8ba', weight: 400 });
    ctx.font = `400 7px ${THAI}`; const lw = ctx.measureText('คุณ:').width + 3;
    if (NET.name) textC('⁠' + NET.name, 80 + lw, 163.6, { size: 7, thai: true, color: '#f6ead2', weight: 700 }); else textC('(ยังไม่ได้ตั้งชื่อ)', 80 + lw, 163.6, { size: 7, thai: true, color: '#8a7a6a', weight: 400 });
    if (e.me) { const rs = 'อันดับที่ ' + e.me.rank; textC(rs, 80, 173.1, { size: 7, thai: true, color: '#9be15d', weight: 400 }); ctx.font = `400 7px ${THAI}`; textC('· ' + netVal(b, e.me.value), 83 + ctx.measureText(rs).width, 173.1, { size: 7, color: '#9be15d', weight: 700 }); }
    btn('rkn', 248, 159, 72, 15); uiBtn(248, 159, 72, 15, false); textC('เปลี่ยนชื่อ (N)', 284, 166.5, { size: 6.5, align: 'center', thai: true, color: '#ffd7a0' });
    if (NET.msg && Date.now() - NET.msgT < 3500) { const m = { ok: ['เปลี่ยนชื่อแล้ว', '#9be15d'], bad: ['ชื่อนี้ใช้ไม่ได้', '#ff8a7a'], off: ['ต่อไม่ได้ ลองใหม่', '#ff8a7a'] }[NET.msg]; ctx.font = `700 7px ${THAI}`; const nx = 80 + lw + (NET.name ? ctx.measureText(NET.name).width : ctx.measureText(tr('(ยังไม่ได้ตั้งชื่อ)')).width) + 6; ctx.font = `400 6px ${THAI}`; const mw = ctx.measureText(tr(m[0])).width;
      if (nx + mw <= 244) textC(m[0], nx, 163.6, { size: 6, thai: true, color: m[1], weight: 400 }); else textC(m[0], 244, 163.6, { size: 6, align: 'right', thai: true, color: m[1], weight: 400 }); }
    if (nameEdit) {
      rect(0, 0, W, H, '#05050ac0'); if (!nineBox('dialog', 92, 70, 216, 88, 16, 9)) panel(96, 74, 208, 80, '#1b120cf4', '#f2a93b');
      uiBtn(110, 92, 180, 22, false);
      text('ตั้งชื่อที่จะแสดงบนตารางอันดับ', W / 2, 80, { size: 8, align: 'center', thai: true, color: '#f2a93b', weight: 600 });
      { const el = nameInput(), v = el.value, on = document.activeElement === el; /* the game draws the typed name itself so it is always crisp */
        ctx.font = `700 12px ${THAI}`; const tw = v ? ctx.measureText(v).width : 0, sz = tw > 156 ? 12 * 156 / tw : 12;
        if (v) textC('\u2060' + v, W / 2, 103, { size: sz, align: 'center', thai: true, color: '#fff4dc', weight: 700 });
        else textC(on ? '' : 'แตะเพื่อพิมพ์ชื่อ', W / 2, 103, { size: 7, align: 'center', thai: true, color: '#8aa0c0', weight: 400 });
        if (on && (performance.now() / 500 | 0) % 2 === 0) rect(W / 2 + tw * sz / 24 + 1.5, 97, 1.2, 12, '#fff4dc'); }
      text('ใช้ได้ 2-16 ตัวอักษร', W / 2, 119, { size: 6, align: 'center', thai: true, color: '#bba8ba', weight: 400 });
      ([['nok', 'ตกลง', 122, true], ['ncan', 'ยกเลิก', 204, false]] as const).forEach(([id, lb, x, on]) => { btn(id, x, 132, 74, 15); uiBtn(x, 132, 74, 15, on); textC(lb, x + 37, 139.5, { size: 7, align: 'center', thai: true, color: on ? '#ffe9b0' : '#cfc0b0' }); });
    }
  }
  return {
    input: rankInput,
    draw: drawRankPanel,
    nameOpen,
    nameDone,
    /** the rename box is open */
    get nameEdit() { return nameEdit; },
    get nameZ() { return nameZ; },
    get nameH0() { return nameH0; },
    /** pick the board and period shown (test hook) */
    setBoard(b: number, p: Period) { rkB = b; rkP = p; },
    /** fetch the selected board early so the panel opens instantly */
    prefetch() { NET.board(NET_BOARDS[rkB]![0], rkP); },
  };
}
