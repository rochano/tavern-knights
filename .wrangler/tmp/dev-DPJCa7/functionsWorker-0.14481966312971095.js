var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-Sw8Vk8/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// .wrangler/tmp/pages-OMVH3a/functionsWorker-0.14481966312971095.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
function stripCfConnectingIPHeader2(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader2, "stripCfConnectingIPHeader");
__name2(stripCfConnectingIPHeader2, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader2.apply(null, argArray)
    ]);
  }
});
var SCHEMA = [
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
  `CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL)`
];
var BOARDS = {
  stage1_score: { desc: true },
  stage1_time: { desc: false },
  tavern_gold: { desc: true }
};
var LIMITS = {
  stage1: { minMs: 45e3, maxMs: 36e5, maxKills: 200, maxScore: 5e3 + 200 * 500 + 6e3 },
  tavern: { minMs: 7e4, maxMs: 9e5, maxGold: 600 }
};
var schemaReady = false;
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...CORS }
  });
}
__name(json, "json");
__name2(json, "json");
var fail = /* @__PURE__ */ __name2((status, error) => json({ ok: false, error }, status), "fail");
function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomHex, "randomHex");
__name2(randomHex, "randomHex");
async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
__name2(sha256, "sha256");
function weekKey(ms) {
  const d = new Date(ms + 7 * 36e5);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThu) / 864e5 - 3 + (firstThu.getUTCDay() + 6) % 7) / 7);
  return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}
__name(weekKey, "weekKey");
__name2(weekKey, "weekKey");
var BAD = ["fuck", "shit", "bitch", "cunt", "nigger", "porn", "\u0E04\u0E27\u0E22", "\u0E40\u0E2B\u0E35\u0E49\u0E22", "\u0E40\u0E22\u0E47\u0E14", "\u0E2B\u0E35", "\u0E2A\u0E31\u0E2A", "\u0E41\u0E21\u0E48\u0E07", "\u0E21\u0E36\u0E07", "\u0E01\u0E39", "\u0E2A\u0E49\u0E19\u0E15\u0E35\u0E19", "\u0E2D\u0E35\u0E14\u0E2D\u0E01", "\u0E44\u0E2D\u0E49\u0E2A\u0E31\u0E15\u0E27\u0E4C"];
function cleanName(raw) {
  let n = String(raw || "").normalize("NFC").replace(/[\u0000-\u001f\u007f<>"'`\\]/g, "").replace(/\s+/g, " ").trim();
  if ([...n].length > 16)
    n = [...n].slice(0, 16).join("").trim();
  if ([...n].length < 2)
    return null;
  const low = n.toLowerCase().replace(/[\s._-]/g, "");
  if (BAD.some((b) => low.includes(b)))
    return null;
  return n;
}
__name(cleanName, "cleanName");
__name2(cleanName, "cleanName");
var defaultName = /* @__PURE__ */ __name2(() => "Knight-" + String(1e3 + Math.floor(Math.random() * 9e3)), "defaultName");
async function ensureSchema(db) {
  if (schemaReady)
    return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  schemaReady = true;
}
__name(ensureSchema, "ensureSchema");
__name2(ensureSchema, "ensureSchema");
async function allow(db, key, max, windowMs, now) {
  const row = await db.prepare("SELECT n, reset_at FROM rate WHERE k = ?").bind(key).first();
  if (!row || row.reset_at <= now) {
    await db.prepare("INSERT INTO rate (k, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, reset_at = excluded.reset_at").bind(key, now + windowMs).run();
    return true;
  }
  if (row.n >= max)
    return false;
  await db.prepare("UPDATE rate SET n = n + 1 WHERE k = ?").bind(key).run();
  return true;
}
__name(allow, "allow");
__name2(allow, "allow");
async function authed(db, request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer ([0-9a-f]{64})$/.exec(h);
  if (!m)
    return null;
  const p = await db.prepare("SELECT id, name, banned FROM players WHERE token_hash = ?").bind(await sha256(m[1])).first();
  return p || null;
}
__name(authed, "authed");
__name2(authed, "authed");
async function body(request) {
  try {
    const t = await request.text();
    if (t.length > 8192)
      return null;
    return t ? JSON.parse(t) : {};
  } catch (e) {
    return null;
  }
}
__name(body, "body");
__name2(body, "body");
var int = /* @__PURE__ */ __name2((v) => Number.isFinite(+v) ? Math.round(+v) : NaN, "int");
async function rankOf(db, board, period, value) {
  const op = BOARDS[board].desc ? ">" : "<";
  const r = await db.prepare(`SELECT COUNT(*) AS c FROM scores s JOIN players p ON p.id = s.player_id WHERE s.board = ? AND s.period = ? AND p.banned = 0 AND s.value ${op} ?`).bind(board, period, value).first();
  return (r ? r.c : 0) + 1;
}
__name(rankOf, "rankOf");
__name2(rankOf, "rankOf");
async function submit(db, board, playerId, runId, value, now) {
  const desc = BOARDS[board].desc, out = {};
  for (const period of [weekKey(now), "all"]) {
    const cur = await db.prepare("SELECT value FROM scores WHERE board = ? AND period = ? AND player_id = ?").bind(board, period, playerId).first();
    const better = !cur || (desc ? value > cur.value : value < cur.value);
    if (better)
      await db.prepare("INSERT INTO scores (board, period, player_id, run_id, value, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(board, period, player_id) DO UPDATE SET run_id = excluded.run_id, value = excluded.value, created_at = excluded.created_at").bind(board, period, playerId, runId, value, now).run();
    const best = better ? value : cur.value;
    out[period === "all" ? "all" : "week"] = { best, newBest: better, rank: await rankOf(db, board, period, best) };
  }
  return out;
}
__name(submit, "submit");
__name2(submit, "submit");
async function route(request, env, path) {
  const db = env.DB, now = Date.now(), method = request.method;
  if (path === "v1/health")
    return json({ ok: true, db: !!db, week: weekKey(now) });
  if (!db)
    return fail(503, "ranking_offline");
  await ensureSchema(db);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (path === "v1/auth/guest" && method === "POST") {
    const b = await body(request);
    if (!b)
      return fail(400, "bad_json");
    const ipHash = await sha256("tk-ip:" + ip);
    if (!await allow(db, "guest:" + ipHash, 20, 36e5, now))
      return fail(429, "too_many");
    const name = b.name && cleanName(b.name) || defaultName();
    const token = randomHex(32), id = randomHex(8);
    await db.prepare("INSERT INTO players (id, token_hash, name, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)").bind(id, await sha256(token), name, now, ipHash).run();
    return json({ ok: true, player: { id, name }, token });
  }
  if (path.startsWith("v1/boards/") && method === "GET") {
    const board = path.slice(10);
    if (!BOARDS[board])
      return fail(404, "no_board");
    const url = new URL(request.url), period = url.searchParams.get("period") === "all" ? "all" : weekKey(now);
    const limit = Math.min(100, Math.max(1, int(url.searchParams.get("limit")) || 10));
    const order = BOARDS[board].desc ? "DESC" : "ASC";
    const rs = await db.prepare(`SELECT p.id, p.name, s.value FROM scores s JOIN players p ON p.id = s.player_id WHERE s.board = ? AND s.period = ? AND p.banned = 0 ORDER BY s.value ${order}, s.created_at ASC LIMIT ?`).bind(board, period, limit).all();
    const me2 = await authed(db, request);
    let mine = null;
    if (me2) {
      const row = await db.prepare("SELECT value FROM scores WHERE board = ? AND period = ? AND player_id = ?").bind(board, period, me2.id).first();
      if (row)
        mine = { value: row.value, rank: await rankOf(db, board, period, row.value) };
    }
    let rank = 0, prev = null, n = 0;
    const rows = (rs.results || []).map((r) => {
      n++;
      if (r.value !== prev) {
        rank = n;
        prev = r.value;
      }
      return { rank, name: r.name, value: r.value, me: !!me2 && r.id === me2.id };
    });
    return json({ ok: true, board, period: period === "all" ? "all" : "week", week: weekKey(now), rows, me: mine });
  }
  const me = await authed(db, request);
  if (!me)
    return fail(401, "no_auth");
  if (path === "v1/me" && method === "GET")
    return json({ ok: true, player: { id: me.id, name: me.name } });
  if (path === "v1/me/name" && method === "POST") {
    const b = await body(request);
    const name = b && cleanName(b.name);
    if (!name)
      return fail(400, "bad_name");
    if (!await allow(db, "name:" + me.id, 10, 864e5, now))
      return fail(429, "too_many");
    await db.prepare("UPDATE players SET name = ? WHERE id = ?").bind(name, me.id).run();
    return json({ ok: true, player: { id: me.id, name } });
  }
  if (path === "v1/runs/start" && method === "POST") {
    const b = await body(request);
    if (!b)
      return fail(400, "bad_json");
    const mode = b.mode === "tavern" ? "tavern" : "stage", stage = mode === "stage" ? 1 : 0;
    if (!await allow(db, "run:" + me.id, 60, 36e5, now))
      return fail(429, "too_many");
    const id = randomHex(12), seed = Math.floor(Math.random() * 2147483647);
    await db.prepare("INSERT INTO runs (id, player_id, mode, stage, seed, started_at, client_version) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, me.id, mode, stage, seed, now, String(b.v || "").slice(0, 20)).run();
    return json({ ok: true, run: { id, seed } });
  }
  if (path === "v1/runs/finish" && method === "POST") {
    const b = await body(request);
    if (!b || typeof b.run !== "string")
      return fail(400, "bad_json");
    const run = await db.prepare("SELECT * FROM runs WHERE id = ? AND player_id = ?").bind(b.run, me.id).first();
    if (!run)
      return fail(404, "no_run");
    if (run.status !== "open")
      return fail(409, "run_closed");
    const elapsed = now - run.started_at, ai = b.ai ? 1 : 0;
    let flag = null, boards = [];
    if (run.mode === "stage") {
      const L = LIMITS.stage1, score = int(b.score), timeMs = int(b.timeMs), kills = int(b.kills);
      if (![score, timeMs, kills].every(Number.isFinite) || score < 0 || timeMs <= 0 || kills < 0)
        flag = "bad_values";
      else if (timeMs < L.minMs)
        flag = "too_fast";
      else if (timeMs > elapsed + 5e3)
        flag = "time_vs_server";
      else if (elapsed > L.maxMs)
        flag = "too_long";
      else if (kills > L.maxKills || score > L.maxScore)
        flag = "too_high";
      else if (score > 5e3 + kills * 500 + 6e3)
        flag = "score_vs_kills";
      await db.prepare("UPDATE runs SET ended_at = ?, score = ?, time_ms = ?, kills = ?, ai_assisted = ?, status = ?, flag = ? WHERE id = ?").bind(now, score || 0, timeMs || 0, kills || 0, ai, flag ? "rejected" : "done", flag, run.id).run();
      if (!flag && !ai)
        boards = [["stage1_score", score], ["stage1_time", timeMs]];
    } else {
      const L = LIMITS.tavern, gold = int(b.gold);
      if (!Number.isFinite(gold) || gold < 0)
        flag = "bad_values";
      else if (elapsed < L.minMs)
        flag = "too_fast";
      else if (elapsed > L.maxMs)
        flag = "too_long";
      else if (gold > L.maxGold)
        flag = "too_high";
      await db.prepare("UPDATE runs SET ended_at = ?, gold = ?, ai_assisted = ?, status = ?, flag = ? WHERE id = ?").bind(now, gold || 0, ai, flag ? "rejected" : "done", flag, run.id).run();
      if (!flag && !ai)
        boards = [["tavern_gold", gold]];
    }
    if (flag)
      return json({ ok: true, accepted: false, reason: flag });
    if (me.banned)
      return json({ ok: true, accepted: true, boards: {} });
    const out = {};
    for (const [board, value] of boards)
      out[board] = await submit(db, board, me.id, run.id, value, now);
    return json({ ok: true, accepted: true, boards: out });
  }
  return fail(404, "not_found");
}
__name(route, "route");
__name2(route, "route");
async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  const path = (Array.isArray(params.route) ? params.route.join("/") : String(params.route || "")).replace(/\/+$/, "");
  try {
    return await route(request, env, path);
  } catch (e) {
    console.error("api error", path, e && e.stack || e);
    return fail(500, "server_error");
  }
}
__name(onRequest, "onRequest");
__name2(onRequest, "onRequest");
var routes = [
  {
    routePath: "/api/:route*",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route2 = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route2 += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route2 += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route2 += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route2 += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route2 += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route2 += "".concat(delimiterRe, "?");
    route2 += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route2 += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route2 += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route2, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route2 of [...routes].reverse()) {
    if (route2.method && route2.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route2.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route2.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route2.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route2 of routes) {
    if (route2.method && route2.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route2.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route2.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route2.modules.length) {
      for (const handler of route2.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: () => {
            isFailOpen = true;
          }
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = /* @__PURE__ */ __name(class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
}, "__Facade_ScheduledController__");
__name2(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../tmp/claude-0/-home-user-tavern-knights/309f3ac1-12f5-5a0d-a960-051a68405508/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../tmp/claude-0/-home-user-tavern-knights/309f3ac1-12f5-5a0d-a960-051a68405508/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-Sw8Vk8/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../tmp/claude-0/-home-user-tavern-knights/309f3ac1-12f5-5a0d-a960-051a68405508/scratchpad/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-Sw8Vk8/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__2, "__Facade_ScheduledController__");
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.14481966312971095.js.map
