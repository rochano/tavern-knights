// Online ranking client used by the game (title/map ranking panel, results screen, rename box).
// Players are per-browser guests: the token lives in localStorage 'tk-net'; the last boards are
// cached in 'tk-boards' so the panel shows something while it loads or when offline.
// Response shapes come from shared/src/api.ts, the same types the server uses.
import type { BoardId, BoardResponse, BoardRow, GuestResponse, MeResponse, RunFinishResponse, RunStartResponse } from '@tk/shared';

type Reply<T> = (T | { ok: false; error?: string }) & { status: number };
type Period = 'week' | 'all';

export interface NetBoard { state: 'load' | 'ok' | 'off'; at: number; rows: BoardRow[]; me: { value: number; rank: number } | null }
export interface NetRun { id: string | null; p: Promise<string | null> }
export interface NetFinish { state: 'send' | 'off' | 'ok' | 'rejected'; boards?: Record<string, unknown> }
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
}

const CLIENT_VERSION = '1.0.1';

/** clearKeys runs before a rename so keys held while typing don't stay pressed. */
export function createNet(clearKeys: () => void): Net {
  // Web builds call their own domain (develop -> staging DB); store apps (app://) call production.
  const base = /^https?:$/.test(location.protocol) ? '' : 'https://tavern-knights.pages.dev';
  let st: { token?: string | null; id?: string; name?: string } = {};
  try { st = JSON.parse(localStorage.getItem('tk-net') || '{}') || {}; } catch { /* private mode */ }
  const keep = () => { try { localStorage.setItem('tk-net', JSON.stringify(st)); } catch { /* private mode */ } };

  async function call<T>(path: string, body?: object): Promise<Reply<T>> {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const to = setTimeout(() => ctl && ctl.abort(), 8000);
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
    const run = { id: null } as NetRun;
    run.p = ensure()
      .then(ok => ok ? call<RunStartResponse>('runs/start', { mode, v: CLIENT_VERSION }) : null)
      .then(j => { if (j && j.ok) { run.id = j.run.id; N.on = true; } else if (j) offline(j); return run.id; });
    return run;
  };

  N.finish = (run, data) => {
    const out: NetFinish = { state: 'send' };
    if (!run || N.on === false) { out.state = 'off'; return out; }
    run.p.then(id => id ? call<RunFinishResponse>('runs/finish', Object.assign({ run: id }, data)) : null).then(j => {
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

  return N;
}
