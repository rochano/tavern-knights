// Tavern Knights online API (ranking, phase 1).
// Runs as a Cloudflare Pages Function, so it deploys with the site: develop -> staging, main -> production.
// It needs one D1 binding named DB (Pages project > Settings > Bindings), a different database for
// Preview (develop and other branches) and Production. Without it every call answers 503 and the game
// simply hides the online parts. Tables are created on first use (see SCHEMA).

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
];

// Boards: lower is better only for times.
const BOARDS = {
  stage1_score: { desc: true },
  stage1_time: { desc: false },
  tavern_gold: { desc: true },
};

// Plausibility limits for stage 1 (score = 100 per monster, 500 per mimic, 20/50 per pickup, 5000 for the boss).
const LIMITS = {
  stage1: { minMs: 45000, maxMs: 3600000, maxKills: 200, maxScore: 5000 + 200 * 500 + 6000 },
  tavern: { minMs: 70000, maxMs: 900000, maxGold: 600 },
};

let schemaReady = false;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...CORS },
  });
}
const fail = (status, error) => json({ ok: false, error }, status);

function randomHex(bytes) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Week key in Thai time (UTC+7), ISO week numbering, e.g. "2026-W45". Weeks start on Monday.
function weekKey(ms) {
  const d = new Date(ms + 7 * 3600000);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'porn', 'ควย', 'เหี้ย', 'เย็ด', 'หี', 'สัส', 'แม่ง', 'มึง', 'กู', 'ส้นตีน', 'อีดอก', 'ไอ้สัตว์'];
function cleanName(raw) {
  let n = String(raw || '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  if ([...n].length > 16) n = [...n].slice(0, 16).join('').trim();
  if ([...n].length < 2) return null;
  const low = n.toLowerCase().replace(/[\s._-]/g, '');
  if (BAD.some(b => low.includes(b))) return null;
  return n;
}
const defaultName = () => 'Knight-' + String(1000 + Math.floor(Math.random() * 9000));

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map(s => db.prepare(s)));
  schemaReady = true;
}

// Fixed-window counter: true when the call is allowed.
async function allow(db, key, max, windowMs, now) {
  const row = await db.prepare('SELECT n, reset_at FROM rate WHERE k = ?').bind(key).first();
  if (!row || row.reset_at <= now) {
    await db.prepare('INSERT INTO rate (k, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, reset_at = excluded.reset_at').bind(key, now + windowMs).run();
    return true;
  }
  if (row.n >= max) return false;
  await db.prepare('UPDATE rate SET n = n + 1 WHERE k = ?').bind(key).run();
  return true;
}

async function authed(db, request) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer ([0-9a-f]{64})$/.exec(h);
  if (!m) return null;
  const p = await db.prepare('SELECT id, name, banned FROM players WHERE token_hash = ?').bind(await sha256(m[1])).first();
  return p || null;
}

async function body(request) {
  try { const t = await request.text(); if (t.length > 8192) return null; return t ? JSON.parse(t) : {}; } catch (e) { return null; }
}
const int = v => (Number.isFinite(+v) ? Math.round(+v) : NaN);

// Rank of a value on a board (1 = best). Banned players are left out.
async function rankOf(db, board, period, value) {
  const op = BOARDS[board].desc ? '>' : '<';
  const r = await db.prepare(`SELECT COUNT(*) AS c FROM scores s JOIN players p ON p.id = s.player_id WHERE s.board = ? AND s.period = ? AND p.banned = 0 AND s.value ${op} ?`).bind(board, period, value).first();
  return (r ? r.c : 0) + 1;
}

// Keeps only each player's best value per board and period. Returns the rank info for the response.
async function submit(db, board, playerId, runId, value, now) {
  const desc = BOARDS[board].desc, out = {};
  for (const period of [weekKey(now), 'all']) {
    const cur = await db.prepare('SELECT value FROM scores WHERE board = ? AND period = ? AND player_id = ?').bind(board, period, playerId).first();
    const better = !cur || (desc ? value > cur.value : value < cur.value);
    if (better) await db.prepare('INSERT INTO scores (board, period, player_id, run_id, value, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(board, period, player_id) DO UPDATE SET run_id = excluded.run_id, value = excluded.value, created_at = excluded.created_at').bind(board, period, playerId, runId, value, now).run();
    const best = better ? value : cur.value;
    out[period === 'all' ? 'all' : 'week'] = { best, newBest: better, rank: await rankOf(db, board, period, best) };
  }
  return out;
}

async function route(request, env, path) {
  const db = env.DB, now = Date.now(), method = request.method;
  if (path === 'v1/health') return json({ ok: true, db: !!db, week: weekKey(now) });
  if (!db) return fail(503, 'ranking_offline');
  await ensureSchema(db);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  if (path === 'v1/auth/guest' && method === 'POST') {
    const b = await body(request); if (!b) return fail(400, 'bad_json');
    const ipHash = await sha256('tk-ip:' + ip);
    if (!(await allow(db, 'guest:' + ipHash, 20, 3600000, now))) return fail(429, 'too_many');
    const name = (b.name && cleanName(b.name)) || defaultName();
    const token = randomHex(32), id = randomHex(8);
    await db.prepare('INSERT INTO players (id, token_hash, name, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)').bind(id, await sha256(token), name, now, ipHash).run();
    return json({ ok: true, player: { id, name }, token });
  }

  if (path.startsWith('v1/boards/') && method === 'GET') {
    const board = path.slice(10); if (!BOARDS[board]) return fail(404, 'no_board');
    const url = new URL(request.url), period = url.searchParams.get('period') === 'all' ? 'all' : weekKey(now);
    const limit = Math.min(100, Math.max(1, int(url.searchParams.get('limit')) || 10));
    const order = BOARDS[board].desc ? 'DESC' : 'ASC';
    const rs = await db.prepare(`SELECT p.id, p.name, s.value FROM scores s JOIN players p ON p.id = s.player_id WHERE s.board = ? AND s.period = ? AND p.banned = 0 ORDER BY s.value ${order}, s.created_at ASC LIMIT ?`).bind(board, period, limit).all();
    const me = await authed(db, request);
    let mine = null;
    if (me) { const row = await db.prepare('SELECT value FROM scores WHERE board = ? AND period = ? AND player_id = ?').bind(board, period, me.id).first(); if (row) mine = { value: row.value, rank: await rankOf(db, board, period, row.value) }; }
    let rank = 0, prev = null, n = 0;
    const rows = (rs.results || []).map(r => { n++; if (r.value !== prev) { rank = n; prev = r.value; } return { rank, name: r.name, value: r.value, me: !!me && r.id === me.id }; });
    return json({ ok: true, board, period: period === 'all' ? 'all' : 'week', week: weekKey(now), rows, me: mine });
  }

  const me = await authed(db, request);
  if (!me) return fail(401, 'no_auth');

  if (path === 'v1/me' && method === 'GET') return json({ ok: true, player: { id: me.id, name: me.name } });

  if (path === 'v1/me/name' && method === 'POST') {
    const b = await body(request); const name = b && cleanName(b.name);
    if (!name) return fail(400, 'bad_name');
    if (!(await allow(db, 'name:' + me.id, 10, 86400000, now))) return fail(429, 'too_many');
    await db.prepare('UPDATE players SET name = ? WHERE id = ?').bind(name, me.id).run();
    return json({ ok: true, player: { id: me.id, name } });
  }

  if (path === 'v1/runs/start' && method === 'POST') {
    const b = await body(request); if (!b) return fail(400, 'bad_json');
    const mode = b.mode === 'tavern' ? 'tavern' : 'stage', stage = mode === 'stage' ? 1 : 0;
    if (!(await allow(db, 'run:' + me.id, 60, 3600000, now))) return fail(429, 'too_many');
    const id = randomHex(12), seed = Math.floor(Math.random() * 2147483647);
    await db.prepare('INSERT INTO runs (id, player_id, mode, stage, seed, started_at, client_version) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, me.id, mode, stage, seed, now, String(b.v || '').slice(0, 20)).run();
    return json({ ok: true, run: { id, seed } });
  }

  if (path === 'v1/runs/finish' && method === 'POST') {
    const b = await body(request); if (!b || typeof b.run !== 'string') return fail(400, 'bad_json');
    const run = await db.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ?').bind(b.run, me.id).first();
    if (!run) return fail(404, 'no_run');
    if (run.status !== 'open') return fail(409, 'run_closed');
    const elapsed = now - run.started_at, ai = b.ai ? 1 : 0;
    let flag = null, boards = [];
    if (run.mode === 'stage') {
      const L = LIMITS.stage1, score = int(b.score), timeMs = int(b.timeMs), kills = int(b.kills);
      if (![score, timeMs, kills].every(Number.isFinite) || score < 0 || timeMs <= 0 || kills < 0) flag = 'bad_values';
      else if (timeMs < L.minMs) flag = 'too_fast';
      else if (timeMs > elapsed + 5000) flag = 'time_vs_server';
      else if (elapsed > L.maxMs) flag = 'too_long';
      else if (kills > L.maxKills || score > L.maxScore) flag = 'too_high';
      else if (score > 5000 + kills * 500 + 6000) flag = 'score_vs_kills';
      await db.prepare('UPDATE runs SET ended_at = ?, score = ?, time_ms = ?, kills = ?, ai_assisted = ?, status = ?, flag = ? WHERE id = ?').bind(now, score || 0, timeMs || 0, kills || 0, ai, flag ? 'rejected' : 'done', flag, run.id).run();
      if (!flag && !ai) boards = [['stage1_score', score], ['stage1_time', timeMs]];
    } else {
      const L = LIMITS.tavern, gold = int(b.gold);
      if (!Number.isFinite(gold) || gold < 0) flag = 'bad_values';
      else if (elapsed < L.minMs) flag = 'too_fast';
      else if (elapsed > L.maxMs) flag = 'too_long';
      else if (gold > L.maxGold) flag = 'too_high';
      await db.prepare('UPDATE runs SET ended_at = ?, gold = ?, ai_assisted = ?, status = ?, flag = ? WHERE id = ?').bind(now, gold || 0, ai, flag ? 'rejected' : 'done', flag, run.id).run();
      if (!flag && !ai) boards = [['tavern_gold', gold]];
    }
    if (flag) return json({ ok: true, accepted: false, reason: flag });
    if (me.banned) return json({ ok: true, accepted: true, boards: {} }); // shadow ban: looks normal, never listed
    const out = {};
    for (const [board, value] of boards) out[board] = await submit(db, board, me.id, run.id, value, now);
    return json({ ok: true, accepted: true, boards: out });
  }

  return fail(404, 'not_found');
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const path = (Array.isArray(params.route) ? params.route.join('/') : String(params.route || '')).replace(/\/+$/, '');
  try {
    return await route(request, env, path);
  } catch (e) {
    console.error('api error', path, e && e.stack || e);
    return fail(500, 'server_error');
  }
}
