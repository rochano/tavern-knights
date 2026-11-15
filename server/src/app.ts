// Tavern Knights online API (ranking, phase 1), Hono + TypeScript.
// Runs as a Cloudflare Pages Function (functions/api/[[route]].ts), so it deploys with the site:
// develop -> staging, main -> production. It needs one D1 binding named DB (Pages project > Settings > Bindings),
// a different database for Preview and Production. Without it every call answers 503 and the game hides the
// online parts. Tables are created on first use (see SCHEMA); numbered files in server/migrations/ document them.
import { Hono, type Context } from 'hono';
import { AI_COST, BOARDS, LIMITS, SHOP, type AiMode, type BoardId, type Grant } from '@tk/shared';
import { AI_MODELS, ask, cleanCtx } from './advisor';

export type Bindings = {
  DB?: D1Database;
  /** Claude key for the advisor (Pages secret). Without it the advisor says it is closed and takes no coins. */
  ANTHROPIC_API_KEY?: string;
  /** most advisor answers per calendar month (UTC) for the whole game; default 3000 */
  AI_MONTHLY_LIMIT?: string;
  AI_MODEL_HINT?: string;
  AI_MODEL_COACH?: string;
  /** '1' lets this environment hand out free test coins (the develop site and localhost always can) */
  DEV_COINS?: string;
};
type Env = { Bindings: Bindings };
type Ctx = Context<Env>;
interface PlayerRow { id: string; name: string; banned: number }

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
     id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
     created_at INTEGER NOT NULL, ip_hash TEXT, banned INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS runs (
     id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT 0,
     seed INTEGER NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
     score INTEGER, time_ms INTEGER, kills INTEGER, gold INTEGER, ai_assisted INTEGER NOT NULL DEFAULT 0,
     client_version TEXT, status TEXT NOT NULL DEFAULT 'open', flag TEXT)`,
  `CREATE INDEX IF NOT EXISTS runs_player ON runs (player_id, started_at)`,
  `CREATE TABLE IF NOT EXISTS scores (
     board TEXT NOT NULL, period TEXT NOT NULL, player_id TEXT NOT NULL, run_id TEXT NOT NULL,
     value INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (board, period, player_id))`,
  `CREATE INDEX IF NOT EXISTS scores_rank ON scores (board, period, value)`,
  `CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL)`,
  // shop + advisor: every coin change is one ledger row; the balance is their sum
  `CREATE TABLE IF NOT EXISTS coin_ledger (
     id TEXT PRIMARY KEY, player_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS coin_ledger_player ON coin_ledger (player_id)`,
  `CREATE TABLE IF NOT EXISTS owned_items (player_id TEXT NOT NULL, item TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (player_id, item))`,
  `CREATE TABLE IF NOT EXISTS grants (
     id TEXT PRIMARY KEY, player_id TEXT NOT NULL, item TEXT NOT NULL, created_at INTEGER NOT NULL, claimed_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS grants_player ON grants (player_id, claimed_at)`,
  `CREATE TABLE IF NOT EXISTS ai_log (
     id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode TEXT NOT NULL, cost INTEGER NOT NULL, model TEXT,
     in_tok INTEGER, out_tok INTEGER, status TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ai_log_time ON ai_log (created_at)`,
];

let schemaReady = false;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...CORS },
  });
}
const fail = (status: number, error: string) => json({ ok: false, error }, status);

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Week key in Thai time (UTC+7), ISO week numbering, e.g. "2026-W45". Weeks start on Monday. */
export function weekKey(ms: number): string {
  const d = new Date(ms + 7 * 3600000);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'porn', 'ควย', 'เหี้ย', 'เย็ด', 'หี', 'สัส', 'แม่ง', 'มึง', 'กู', 'ส้นตีน', 'อีดอก', 'ไอ้สัตว์'];
export function cleanName(raw: unknown): string | null {
  let n = String(raw || '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  if ([...n].length > 16) n = [...n].slice(0, 16).join('').trim();
  if ([...n].length < 2) return null;
  const low = n.toLowerCase().replace(/[\s._-]/g, '');
  if (BAD.some(b => low.includes(b))) return null;
  return n;
}
const defaultName = () => 'Knight-' + String(1000 + Math.floor(Math.random() * 9000));

async function ensureSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map(s => db.prepare(s)));
  schemaReady = true;
}

/** Fixed-window counter: true when the call is allowed. */
async function allow(db: D1Database, key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  const row = await db.prepare('SELECT n, reset_at FROM rate WHERE k = ?').bind(key).first<{ n: number; reset_at: number }>();
  if (!row || row.reset_at <= now) {
    await db.prepare('INSERT INTO rate (k, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, reset_at = excluded.reset_at').bind(key, now + windowMs).run();
    return true;
  }
  if (row.n >= max) return false;
  await db.prepare('UPDATE rate SET n = n + 1 WHERE k = ?').bind(key).run();
  return true;
}

async function authed(db: D1Database, req: Request): Promise<PlayerRow | null> {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get('Authorization') || '');
  if (!m) return null;
  return (await db.prepare('SELECT id, name, banned FROM players WHERE token_hash = ?').bind(await sha256(m[1])).first<PlayerRow>()) || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function body(req: Request): Promise<Record<string, any> | null> {
  try { const t = await req.text(); if (t.length > 8192) return null; return t ? JSON.parse(t) : {}; } catch { return null; }
}
const int = (v: unknown) => (Number.isFinite(+(v as number)) ? Math.round(+(v as number)) : NaN);

/** Rank of a value on a board (1 = best). Banned players are left out. */
async function rankOf(db: D1Database, board: BoardId, period: string, value: number): Promise<number> {
  const op = BOARDS[board].desc ? '>' : '<';
  const r = await db.prepare(`SELECT COUNT(*) AS c FROM scores s JOIN players p ON p.id = s.player_id WHERE s.board = ? AND s.period = ? AND p.banned = 0 AND s.value ${op} ?`).bind(board, period, value).first<{ c: number }>();
  return (r ? r.c : 0) + 1;
}

/** Keeps only each player's best value per board and period. Returns the rank info for the response. */
async function submit(db: D1Database, board: BoardId, playerId: string, runId: string, value: number, now: number) {
  const desc = BOARDS[board].desc, out: Record<string, { best: number; newBest: boolean; rank: number }> = {};
  for (const period of [weekKey(now), 'all']) {
    const cur = await db.prepare('SELECT value FROM scores WHERE board = ? AND period = ? AND player_id = ?').bind(board, period, playerId).first<{ value: number }>();
    const better = !cur || (desc ? value > cur.value : value < cur.value);
    if (better) await db.prepare('INSERT INTO scores (board, period, player_id, run_id, value, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(board, period, player_id) DO UPDATE SET run_id = excluded.run_id, value = excluded.value, created_at = excluded.created_at').bind(board, period, playerId, runId, value, now).run();
    const best = better ? value : cur!.value;
    out[period === 'all' ? 'all' : 'week'] = { best, newBest: better, rank: await rankOf(db, board, period, best) };
  }
  return out;
}

const app = new Hono<Env>().basePath('/api');

app.options('*', () => new Response(null, { status: 204, headers: CORS }));
app.onError((e, c) => { console.error('api error', c.req.path, e?.stack || e); return fail(500, 'server_error'); });
app.notFound(() => fail(404, 'not_found'));

app.get('/v1/health', c => json({ ok: true, db: !!c.env.DB, week: weekKey(Date.now()) }));

// Everything below needs the database.
app.use('/v1/*', async (c, next) => {
  if (!c.env.DB) return fail(503, 'ranking_offline');
  await ensureSchema(c.env.DB);
  await next();
});
const dbOf = (c: Ctx) => c.env.DB!;

app.post('/v1/auth/guest', async c => {
  const db = dbOf(c), now = Date.now();
  const b = await body(c.req.raw); if (!b) return fail(400, 'bad_json');
  const ipHash = await sha256('tk-ip:' + (c.req.header('CF-Connecting-IP') || 'unknown'));
  if (!(await allow(db, 'guest:' + ipHash, 20, 3600000, now))) return fail(429, 'too_many');
  const name = (b['name'] && cleanName(b['name'])) || defaultName();
  const token = randomHex(32), id = randomHex(8);
  await db.prepare('INSERT INTO players (id, token_hash, name, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)').bind(id, await sha256(token), name, now, ipHash).run();
  return json({ ok: true, player: { id, name }, token });
});

app.get('/v1/boards/:board', async c => {
  const db = dbOf(c), now = Date.now();
  const board = c.req.param('board') as BoardId; if (!Object.hasOwn(BOARDS, board)) return fail(404, 'no_board');
  const period = c.req.query('period') === 'all' ? 'all' : weekKey(now);
  const limit = Math.min(100, Math.max(1, int(c.req.query('limit')) || 10));
  const order = BOARDS[board].desc ? 'DESC' : 'ASC';
  const rs = await db.prepare(`SELECT p.id, p.name, s.value FROM scores s JOIN players p ON p.id = s.player_id WHERE s.board = ? AND s.period = ? AND p.banned = 0 ORDER BY s.value ${order}, s.created_at ASC LIMIT ?`).bind(board, period, limit).all<{ id: string; name: string; value: number }>();
  const me = await authed(db, c.req.raw);
  let mine = null;
  if (me) { const row = await db.prepare('SELECT value FROM scores WHERE board = ? AND period = ? AND player_id = ?').bind(board, period, me.id).first<{ value: number }>(); if (row) mine = { value: row.value, rank: await rankOf(db, board, period, row.value) }; }
  let rank = 0, prev: number | null = null, n = 0;
  const rows = (rs.results || []).map(r => { n++; if (r.value !== prev) { rank = n; prev = r.value; } return { rank, name: r.name, value: r.value, me: !!me && r.id === me.id }; });
  return json({ ok: true, board, period: period === 'all' ? 'all' : 'week', week: weekKey(now), rows, me: mine });
});

// Signed-in routes.
const signedIn = new Hono<Env & { Variables: { me: PlayerRow } }>();
signedIn.use('*', async (c, next) => {
  const me = await authed(c.env.DB!, c.req.raw);
  if (!me) return fail(401, 'no_auth');
  c.set('me', me);
  await next();
});

signedIn.get('/me', c => { const me = c.get('me'); return json({ ok: true, player: { id: me.id, name: me.name } }); });

signedIn.post('/me/name', async c => {
  const db = c.env.DB!, me = c.get('me'), now = Date.now();
  const b = await body(c.req.raw); const name = b && cleanName(b['name']);
  if (!name) return fail(400, 'bad_name');
  if (!(await allow(db, 'name:' + me.id, 10, 86400000, now))) return fail(429, 'too_many');
  await db.prepare('UPDATE players SET name = ? WHERE id = ?').bind(name, me.id).run();
  return json({ ok: true, player: { id: me.id, name } });
});

signedIn.post('/runs/start', async c => {
  const db = c.env.DB!, me = c.get('me'), now = Date.now();
  const b = await body(c.req.raw); if (!b) return fail(400, 'bad_json');
  const mode = b['mode'] === 'tavern' ? 'tavern' : 'stage', stage = mode === 'stage' ? 1 : 0;
  if (!(await allow(db, 'run:' + me.id, 60, 3600000, now))) return fail(429, 'too_many');
  const id = randomHex(12), seed = Math.floor(Math.random() * 2147483647);
  await db.prepare('INSERT INTO runs (id, player_id, mode, stage, seed, started_at, client_version) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, me.id, mode, stage, seed, now, String(b['v'] || '').slice(0, 20)).run();
  return json({ ok: true, run: { id, seed } });
});

signedIn.post('/runs/finish', async c => {
  const db = c.env.DB!, me = c.get('me'), now = Date.now();
  const b = await body(c.req.raw); if (!b || typeof b['run'] !== 'string') return fail(400, 'bad_json');
  const run = await db.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ?').bind(b['run'], me.id).first<{ id: string; mode: string; status: string; started_at: number }>();
  if (!run) return fail(404, 'no_run');
  if (run.status !== 'open') return fail(409, 'run_closed');
  const elapsed = now - run.started_at, ai = b['ai'] ? 1 : 0;
  let flag: string | null = null, boards: [BoardId, number][] = [];
  if (run.mode === 'stage') {
    const L = LIMITS.stage1, score = int(b['score']), timeMs = int(b['timeMs']), kills = int(b['kills']);
    if (![score, timeMs, kills].every(Number.isFinite) || score < 0 || timeMs <= 0 || kills < 0) flag = 'bad_values';
    else if (timeMs < L.minMs) flag = 'too_fast';
    else if (timeMs > elapsed + 5000) flag = 'time_vs_server';
    else if (elapsed > L.maxMs) flag = 'too_long';
    else if (kills > L.maxKills || score > L.maxScore) flag = 'too_high';
    else if (score > 5000 + kills * 500 + 6000) flag = 'score_vs_kills';
    await db.prepare('UPDATE runs SET ended_at = ?, score = ?, time_ms = ?, kills = ?, ai_assisted = ?, status = ?, flag = ? WHERE id = ?').bind(now, score || 0, timeMs || 0, kills || 0, ai, flag ? 'rejected' : 'done', flag, run.id).run();
    if (!flag && !ai) boards = [['stage1_score', score], ['stage1_time', timeMs]];
  } else {
    const L = LIMITS.tavern, gold = int(b['gold']);
    if (!Number.isFinite(gold) || gold < 0) flag = 'bad_values';
    else if (elapsed < L.minMs) flag = 'too_fast';
    else if (elapsed > L.maxMs) flag = 'too_long';
    else if (gold > L.maxGold) flag = 'too_high';
    await db.prepare('UPDATE runs SET ended_at = ?, gold = ?, ai_assisted = ?, status = ?, flag = ? WHERE id = ?').bind(now, gold || 0, ai, flag ? 'rejected' : 'done', flag, run.id).run();
    if (!flag && !ai) boards = [['tavern_gold', gold]];
  }
  if (flag) return json({ ok: true, accepted: false, reason: flag });
  if (me.banned) return json({ ok: true, accepted: true, boards: {} }); // shadow ban: looks normal, never listed
  const out: Record<string, unknown> = {};
  for (const [board, value] of boards) out[board] = await submit(db, board, me.id, run.id, value, now);
  return json({ ok: true, accepted: true, boards: out });
});

/* ---------------------------------------------------------------- shop + advisor (full version only) */

async function balance(db: D1Database, playerId: string): Promise<number> {
  const r = await db.prepare('SELECT COALESCE(SUM(delta), 0) AS c FROM coin_ledger WHERE player_id = ?').bind(playerId).first<{ c: number }>();
  return r ? r.c : 0;
}

/** Takes coins only if the balance covers them (one statement, so two taps can't both spend the same coins). */
function spendStmt(db: D1Database, id: string, playerId: string, cost: number, reason: string, ref: string, now: number) {
  return db.prepare('INSERT INTO coin_ledger (id, player_id, delta, reason, ref, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(delta), 0) FROM coin_ledger WHERE player_id = ?) >= ?')
    .bind(id, playerId, -cost, reason, ref, now, playerId, cost);
}

/** The develop site and localhost may hand out test coins; production never does unless DEV_COINS is set there. */
function devCoins(c: { env: Bindings; req: { url: string } }): boolean {
  if (c.env.DEV_COINS === '1') return true;
  const h = new URL(c.req.url).hostname;
  return /^(localhost|127\.0\.0\.1)$/.test(h) || h.startsWith('develop.');
}

signedIn.get('/wallet', async c => {
  const db = c.env.DB!, me = c.get('me');
  const owned = await db.prepare('SELECT item FROM owned_items WHERE player_id = ?').bind(me.id).all<{ item: string }>();
  const grants = await db.prepare('SELECT id, item, created_at AS at FROM grants WHERE player_id = ? AND claimed_at IS NULL ORDER BY created_at LIMIT 50').bind(me.id).all<Grant>();
  return json({ ok: true, coins: await balance(db, me.id), owned: (owned.results || []).map(r => r.item), grants: grants.results || [], ai: !!c.env.ANTHROPIC_API_KEY, dev: devCoins(c) });
});

signedIn.post('/shop/buy', async c => {
  const db = c.env.DB!, me = c.get('me'), now = Date.now();
  const b = await body(c.req.raw); const item = SHOP.find(x => x.id === (b && b['item']));
  if (!item) return fail(400, 'no_item');
  if (!(await allow(db, 'buy:' + me.id, 60, 3600000, now))) return fail(429, 'too_many');
  if (item.once && await db.prepare('SELECT 1 FROM owned_items WHERE player_id = ? AND item = ?').bind(me.id, item.id).first()) return fail(409, 'owned');
  const id = randomHex(12);
  const stmts = [item.once
    ? db.prepare('INSERT INTO coin_ledger (id, player_id, delta, reason, ref, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(delta), 0) FROM coin_ledger WHERE player_id = ?) >= ? AND NOT EXISTS (SELECT 1 FROM owned_items WHERE player_id = ? AND item = ?)')
      .bind(id, me.id, -item.price, 'buy', item.id, now, me.id, item.price, me.id, item.id)
    : spendStmt(db, id, me.id, item.price, 'buy', item.id, now)];
  stmts.push(item.once
    ? db.prepare('INSERT OR IGNORE INTO owned_items (player_id, item, created_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM coin_ledger WHERE id = ?)').bind(me.id, item.id, now, id)
    : db.prepare('INSERT INTO grants (id, player_id, item, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM coin_ledger WHERE id = ?)').bind(id, me.id, item.id, now, id));
  const res = await db.batch(stmts);
  if (!res[0]!.meta.changes) return fail(402, 'no_coins');
  return json({ ok: true, coins: await balance(db, me.id), grant: { id, item: item.id, at: now } });
});

/** The client marks a gold/crate purchase as added to its save (it also remembers the id, so this is safe to repeat). */
signedIn.post('/shop/claim', async c => {
  const db = c.env.DB!, me = c.get('me');
  const b = await body(c.req.raw); const ids = Array.isArray(b && b['ids']) ? (b!['ids'] as unknown[]).filter(x => typeof x === 'string').slice(0, 50) as string[] : [];
  for (const id of ids) await db.prepare('UPDATE grants SET claimed_at = ? WHERE id = ? AND player_id = ? AND claimed_at IS NULL').bind(Date.now(), id, me.id).run();
  return json({ ok: true });
});

signedIn.post('/dev/coins', async c => {
  const db = c.env.DB!, me = c.get('me'), now = Date.now();
  if (!devCoins(c)) return fail(403, 'not_here');
  if (await balance(db, me.id) >= 500) return fail(409, 'enough');
  await db.prepare('INSERT INTO coin_ledger (id, player_id, delta, reason, ref, created_at) VALUES (?, ?, 50, ?, NULL, ?)').bind(randomHex(12), me.id, 'dev_grant', now).run();
  return json({ ok: true, coins: await balance(db, me.id) });
});

signedIn.post('/ai/ask', async c => {
  const db = c.env.DB!, me = c.get('me'), now = Date.now();
  const key = c.env.ANTHROPIC_API_KEY; if (!key) return fail(503, 'ai_offline');
  const b = await body(c.req.raw); if (!b) return fail(400, 'bad_json');
  const mode: AiMode = b['mode'] === 'coach' ? 'coach' : 'hint', cost = AI_COST[mode];
  const question = String(b['question'] || '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if ([...question].length < 2) return fail(400, 'bad_question');
  if (me.banned) return fail(403, 'banned');
  if (!(await allow(db, 'ai:' + me.id, 20, 3600000, now))) return fail(429, 'too_many');
  const month = new Date(now); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const used = await db.prepare("SELECT COUNT(*) AS c FROM ai_log WHERE created_at >= ? AND status = 'ok'").bind(month.getTime()).first<{ c: number }>();
  if ((used ? used.c : 0) >= (+(c.env.AI_MONTHLY_LIMIT || '') || 3000)) return fail(503, 'ai_busy');
  const id = randomHex(12);
  const spent = await spendStmt(db, id, me.id, cost, 'ai_' + mode, id, now).run();
  if (!spent.meta.changes) return fail(402, 'no_coins');
  const models = { hint: c.env.AI_MODEL_HINT || AI_MODELS.hint, coach: c.env.AI_MODEL_COACH || AI_MODELS.coach };
  try {
    const r = await ask(key, mode, question, cleanCtx(b['ctx']), models);
    await db.prepare('INSERT INTO ai_log (id, player_id, mode, cost, model, in_tok, out_tok, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, me.id, mode, cost, r.model, r.inTok, r.outTok, 'ok', now).run();
    return json({ ok: true, coins: await balance(db, me.id), answer: r.answer });
  } catch (e) {
    console.error('advisor failed', (e as Error)?.message || e);
    await db.batch([
      db.prepare('INSERT INTO coin_ledger (id, player_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(randomHex(12), me.id, cost, 'refund', id, Date.now()),
      db.prepare('INSERT INTO ai_log (id, player_id, mode, cost, model, status, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)').bind(id, me.id, mode, models[mode], 'failed', now),
    ]);
    return fail(502, 'ai_failed');
  }
});

app.route('/v1', signedIn);

export default app;
