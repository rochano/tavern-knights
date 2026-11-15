// Online ranking client used by the game (title/map ranking panel, results screen, rename box).
// Players are per-browser guests: the token lives in localStorage 'tk-net'; the last boards are
// cached in 'tk-boards' so the panel shows something while it loads or when offline.
// Response shapes come from shared/src/api.ts, the same types the server uses.
import type { AiContext, AiMode, AskResponse, BoardId, BoardResponse, BoardResult, BoardRow, BuyResponse, Grant, GuestResponse, MeResponse, RunFinishResponse, RunStartResponse, WalletResponse } from '@tk/shared';

type Reply<T> = (T | { ok: false; error?: string }) & { status: number };
type Period = 'week' | 'all';

export interface NetBoard { state: 'load' | 'ok' | 'off'; at: number; rows: BoardRow[]; me: { value: number; rank: number } | null }
/** ai: the advisor was asked before this run started, so it stays off the main boards */
export interface NetRun { id: string | null; p: Promise<string | null>; ai?: boolean }
export interface NetFinish { state: 'send' | 'off' | 'ok' | 'rejected'; boards?: Record<string, unknown>; ai?: boolean }
/** Coins and purchases (full version only). state 'off' = no server, 'load' = asking. */
export interface NetWallet { state: 'idle' | 'load' | 'ok' | 'off'; coins: number; owned: string[]; grants: Grant[]; ai: boolean; dev: boolean }
export type NetErr = 'no_coins' | 'owned' | 'ai_offline' | 'ai_busy' | 'ai_failed' | 'too_many' | 'off' | 'bad_question' | string;
export interface Net {
  /** null until the first answer, then whether the server is reachable with a database. */
  on: boolean | null;
  name: string;
  boards: Record<string, NetBoard>;
  /** Result of the last rename ('ok' | 'bad' | 'off') and when it came back. */
  msg: 'ok' | 'bad' | 'off' | null;
  msgT: number;
  start(mode: 'stage' | 'tavern'): NetRun;
  finish(run: NetRun | null, data: { score?: number; timeMs?: number; kills?: number; gold?: number; ai?: boolean }): NetFinish;
  stale(): void;
  board(b: BoardId, period: Period): NetBoard;
  rename(v: string | null | undefined): void;
  wallet: NetWallet;
  /** the advisor answered since the last run started: the next run counts as advised */
  aiNext: boolean;
  /** reload coins, owned looks and unclaimed gold/crates */
  walletLoad(): Promise<NetWallet>;
  buy(item: string): Promise<{ ok: true; grant: Grant } | { ok: false; error: NetErr }>;
  claim(ids: string[]): void;
  devCoins(): Promise<boolean>;
  ask(mode: AiMode, question: string, ctx: AiContext): Promise<{ ok: true; answer: string } | { ok: false; error: NetErr }>;
}

const CLIENT_VERSION = '1.0.1';

/** clearKeys runs before a rename so keys held while typing don't stay pressed. */
export function createNet(clearKeys: () => void): Net {
  // Web builds call their own domain (develop -> staging DB); store apps (app://) call production.
  const base = /^https?:$/.test(location.protocol) ? '' : 'https://tavern-knights.pages.dev';
  let st: { token?: string | null; id?: string; name?: string; ai?: boolean } = {};
  try { st = JSON.parse(localStorage.getItem('tk-net') || '{}') || {}; } catch { /* private mode */ }
  const keep = () => { try { localStorage.setItem('tk-net', JSON.stringify(st)); } catch { /* private mode */ } };

  async function call<T>(path: string, body?: object, ms = 8000): Promise<Reply<T>> {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = setTimeout(() => ctl && ctl.abort(), ms);
    try {
      const h: Record<string, string> = { 'Content-Type': 'application/json' };
      if (st.token) h['Authorization'] = 'Bearer ' + st.token;
      const r = await fetch(base + '/api/v1/' + path, { method: body ? 'POST' : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      j.status = r.status;
      if (r.status === 401 && st.token) { st.token = null; keep(); }
      return j;
    } catch {
      return { ok: false, status: 0, error: 'network' };
    } finally { clearTimeout(to); }
  }

  const N = { on: null, name: st.name || '', boards: {}, msg: null, msgT: 0 } as unknown as Net;
  const offline = (j: { error?: string; status: number }) => { if (!j.error || j.status === 503) N.on = false; };

  let acct: Promise<boolean> | null = null;
  function ensure(): Promise<boolean> {
    if (st.token) return Promise.resolve(true);
    if (!acct) acct = call<GuestResponse>('auth/guest', {}).then(j => {
      acct = null;
      if (j.ok) { st.token = j.token; st.id = j.player.id; st.name = N.name = j.player.name; keep(); N.on = true; return true; }
      offline(j); return false;
    });
    return acct;
  }

  N.start = mode => {
    const run = { id: null, ai: !!st.ai } as NetRun;
    if (st.ai) { st.ai = false; keep(); }
    run.p = ensure()
      .then(ok => ok ? call<RunStartResponse>('runs/start', { mode, v: CLIENT_VERSION }) : null)
      .then(j => { if (j && j.ok) { run.id = j.run.id; N.on = true; } else if (j) offline(j); return run.id; });
    return run;
  };

  N.finish = (run, data) => {
    const out: NetFinish = { state: 'send', ai: !!(run && run.ai) };
    if (!run || N.on === false) { out.state = 'off'; return out; }
    run.p.then(id => id ? call<RunFinishResponse>('runs/finish', Object.assign({ run: id }, data, { ai: !!run.ai })) : null).then(j => {
      if (!j || !j.ok) { out.state = 'off'; return; }
      out.state = j.accepted ? 'ok' : 'rejected';
      out.boards = (j.accepted ? j.boards : undefined) || {};
      N.stale();
    });
    return out;
  };

  try {
    const c = JSON.parse(localStorage.getItem('tk-boards') || '{}');
    for (const k in c) N.boards[k] = { state: 'ok', at: 0, rows: c[k].rows || [], me: c[k].me || null };
  } catch { /* bad cache */ }

  N.stale = () => { for (const k in N.boards) if (N.boards[k].state !== 'load') N.boards[k].at = 0; };

  N.board = (b, period) => {
    const k = b + '|' + period;
    let e = N.boards[k];
    if (e && (e.state === 'load' || Date.now() - e.at < 30000)) return e;
    const entry: NetBoard = N.boards[k] = { state: 'load', at: Date.now(), rows: e ? e.rows : [], me: e ? e.me : null };
    e = entry;
    call<BoardResponse>('boards/' + b + '?period=' + period + '&limit=8').then(j => {
      if (j.ok) {
        entry.state = 'ok'; entry.rows = j.rows; entry.me = j.me; N.on = true;
        try {
          const c: Record<string, { rows: BoardRow[]; me: NetBoard['me'] }> = {};
          for (const q in N.boards) if (N.boards[q].rows.length) c[q] = { rows: N.boards[q].rows, me: N.boards[q].me };
          localStorage.setItem('tk-boards', JSON.stringify(c));
        } catch { /* private mode */ }
      } else { entry.state = 'off'; offline(j); }
      entry.at = Date.now();
    });
    return e;
  };

  N.rename = v => {
    clearKeys();
    if (v == null || !v.trim()) return;
    ensure().then(ok => ok ? call<MeResponse>('me/name', { name: v }) : null).then(j => {
      if (j && j.ok) { st.name = N.name = j.player.name; keep(); N.stale(); N.msg = 'ok'; }
      else N.msg = j && !j.ok && j.error === 'bad_name' ? 'bad' : 'off';
      N.msgT = Date.now();
    });
  };

  Object.defineProperty(N, 'aiNext', { get: () => !!st.ai });
  N.wallet = { state: 'idle', coins: 0, owned: [], grants: [], ai: false, dev: false };
  const err = (j: { error?: string; status: number }): NetErr => (j.status === 0 ? 'off' : j.error || 'off');
  N.walletLoad = async () => {
    const w = N.wallet; w.state = 'load';
    const j = (await ensure()) ? await call<WalletResponse>('wallet') : null;
    if (j && j.ok) { Object.assign(w, { state: 'ok', coins: j.coins, owned: j.owned, grants: j.grants, ai: j.ai, dev: j.dev }); N.on = true; }
    else { w.state = 'off'; if (j) offline(j); }
    return w;
  };
  N.buy = async item => {
    const j = (await ensure()) ? await call<BuyResponse>('shop/buy', { item }) : null;
    if (!j) return { ok: false, error: 'off' };
    if (!j.ok) return { ok: false, error: err(j) };
    N.wallet.coins = j.coins;
    return { ok: true, grant: j.grant };
  };
  N.claim = ids => { if (ids.length) call('shop/claim', { ids }); };
  N.devCoins = async () => {
    const j = (await ensure()) ? await call<{ ok: true; coins: number }>('dev/coins', {}) : null;
    if (j && j.ok) { N.wallet.coins = j.coins; return true; }
    return false;
  };
  N.ask = async (mode, question, ctx) => {
    const j = (await ensure()) ? await call<AskResponse>('ai/ask', { mode, question, ctx }, 30000) : null;
    if (!j) return { ok: false, error: 'off' };
    if (!j.ok) return { ok: false, error: err(j) };
    N.wallet.coins = j.coins; st.ai = true; keep();
    return { ok: true, answer: j.answer };
  };

  return N;
}

/** Boards shown in the ranking panel, with their Thai titles (tr() turns them into English). */
export const NET_BOARDS: [BoardId, string][] = [['stage1_score', 'คะแนนด่าน 1'], ['stage1_time', 'เวลาผ่านด่าน 1'], ['tavern_gold', 'รายได้ร้านในคืนเดียว']];
/** A board value as the panel shows it: clear time as m:ss.s, gold with a g, scores as a number. */
export function netVal(b: BoardId, v: number): string { if (b === 'stage1_time') { const t = v / 1000, m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); } return b === 'tavern_gold' ? v + 'g' : String(v); }
/** One line for the results screens: null when offline (the screen keeps its own line). */
export function netLine(net: NetFinish | null, boards: string[]): { str: string; col: string } | null {
  if (!net || net.state === 'off') return null;
  if (net.state === 'send') return { str: 'กำลังส่งคะแนนขึ้นตารางอันดับ...', col: '#bba8ba' };
  if (net.ai && net.state === 'ok') return { str: 'รอบนี้ใช้ที่ปรึกษา จึงไม่ขึ้นตารางอันดับหลัก', col: '#bfe8ff' };
  if (net.state === 'rejected') return { str: 'คะแนนรอบนี้ไม่ผ่านการตรวจ จึงไม่ขึ้นตารางอันดับ', col: '#ff8a7a' };
  const nb = net.boards as Record<string, { week?: BoardResult } | undefined>;
  const r = boards.map(b => nb[b] && nb[b].week).filter(Boolean) as BoardResult[]; if (!r.length) return null;
  const best = r.some(x => x.newBest);
  const str = boards.length > 1 ? 'อันดับสัปดาห์นี้: คะแนนที่ ' + r[0].rank + ' · เวลาที่ ' + (r[1] ? r[1].rank : '-') : 'อันดับรายได้สัปดาห์นี้: ที่ ' + r[0].rank;
  return { str: best ? str + ' · สถิติใหม่!' : str, col: '#9be15d' };
}
