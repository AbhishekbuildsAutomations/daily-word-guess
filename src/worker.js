// Daily leaderboard API. Static files in public/ are served by Workers Static Assets; only /api/ reaches this code.
//   GET  /api/scores?variant=5&puzzle=2026-10-11  → { last, today: top 10, all: all-time top 10, count }
//   POST /api/scores {variant, puzzle, timeMs, moves, name}  → saves a daily score, returns { rank, ...board }
// Ranked by fewest guesses, then time. Boards are cached at the edge for 30 s; a new score purges its board.
import { LENGTHS, rows } from '../public/engine.js';
import { makeNameCheck } from './names.js';
import bad from './profanity.json';

const checkName = makeNameCheck(bad);
const MIN_MS = 3000, MAX_MS = 6 * 3600e3;            // faster than 3 s is not a human; 6 h is the cap
const RATE_WINDOW = 10 * 60e3, RATE_MAX = 6, PER_PUZZLE_MAX = 3;
const TTL = 30;

const json = (data, status = 200) => new Response(typeof data === 'string' ? data : JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const utcDay = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
// The puzzle id is the player's local date, which is UTC yesterday, today or tomorrow somewhere on Earth.
const puzzleOk = (p) => typeof p === 'string' && [-1, 0, 1].map(utcDay).includes(p);
const variantOk = (v) => LENGTHS.map(String).includes(v);
const boardKey = (origin, variant, puzzle) => new Request(`${origin}/api/scores?variant=${variant}&puzzle=${puzzle}`);
const out = (r) => (r ? { name: r.name, timeMs: r.time_ms, moves: r.moves } : null);

async function board(db, variant, puzzle) {
  const [last, today, all, count] = await db.batch([
    db.prepare("SELECT name, time_ms, moves FROM scores WHERE game = 'guess' AND variant = ?1 AND puzzle_id = ?2 ORDER BY created_at DESC LIMIT 1").bind(variant, puzzle),
    db.prepare("SELECT name, time_ms, moves FROM scores WHERE game = 'guess' AND variant = ?1 AND puzzle_id = ?2 ORDER BY moves, time_ms LIMIT 10").bind(variant, puzzle),
    db.prepare("SELECT name, time_ms, moves FROM scores WHERE game = 'guess' AND variant = ?1 ORDER BY moves, time_ms LIMIT 10").bind(variant),
    db.prepare("SELECT COUNT(*) AS n FROM scores WHERE game = 'guess' AND variant = ?1 AND puzzle_id = ?2").bind(variant, puzzle),
  ]);
  return { last: out(last.results[0]), today: today.results.map(out), all: all.results.map(out), count: count.results[0]?.n ?? 0 };
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function get(url, env, ctx) {
  const variant = url.searchParams.get('variant') ?? '', puzzle = url.searchParams.get('puzzle');
  if (!variantOk(variant) || !puzzleOk(puzzle)) return json({ error: 'variant must be 4-7 and puzzle today\'s date' }, 400);
  const key = boardKey(url.origin, variant, puzzle), cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return json(await hit.text());
  const body = JSON.stringify(await board(env.SCORES, variant, puzzle));
  ctx.waitUntil(cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `s-maxage=${TTL}` } })));
  return json(body);
}

async function post(request, url, env, ctx) {
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'cross-site request' }, 403);
  const text = await request.text();
  if (text.length > 1000) return json({ error: 'too large' }, 413);
  let b;
  try { b = JSON.parse(text); } catch { return json({ error: 'bad JSON' }, 400); }

  const variant = String(b.variant ?? ''), puzzle = b.puzzle, timeMs = Number(b.timeMs), moves = Number(b.moves);
  if (!variantOk(variant)) return json({ error: 'Unknown word length.' }, 400);
  if (!puzzleOk(puzzle)) return json({ error: 'Only today\'s word goes on the leaderboard.' }, 400);
  if (!Number.isInteger(timeMs) || timeMs < MIN_MS || timeMs > MAX_MS) return json({ error: 'Invalid time.' }, 422);
  if (!Number.isInteger(moves) || moves < 1 || moves > rows(Number(variant))) return json({ error: 'Invalid guess count.' }, 400);
  const [name, why] = checkName(b.name);
  if (!name) return json({ error: why }, 422);
  if (!env.SCORE_SALT) return json({ error: 'SCORE_SALT secret is not set' }, 503);

  // Hash of IP + secret + date: enough for rate limits, never stored raw, unlinkable across days.
  const ipHash = await sha256(`${request.headers.get('cf-connecting-ip') ?? ''}|${env.SCORE_SALT}|${utcDay(0)}`);
  const db = env.SCORES, now = Date.now();
  const [recent, same] = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ?1 AND created_at > ?2').bind(ipHash, now - RATE_WINDOW),
    db.prepare("SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ?1 AND game = 'guess' AND variant = ?2 AND puzzle_id = ?3").bind(ipHash, variant, puzzle),
  ]);
  if (recent.results[0].n >= RATE_MAX || same.results[0].n >= PER_PUZZLE_MAX) return json({ error: 'Too many scores from your network. Try later.' }, 429);
  const [, rank] = await db.batch([
    db.prepare("INSERT INTO scores (game, variant, puzzle_id, name, time_ms, moves, ip_hash, created_at) VALUES ('guess', ?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(variant, puzzle, name, timeMs, moves, ipHash, now),
    db.prepare("SELECT COUNT(*) AS n FROM scores WHERE game = 'guess' AND variant = ?1 AND puzzle_id = ?2 AND (moves < ?3 OR (moves = ?3 AND time_ms < ?4))")
      .bind(variant, puzzle, moves, timeMs),
  ]);
  ctx.waitUntil(caches.default.delete(boardKey(url.origin, variant, puzzle)));
  return json({ ok: true, name, rank: rank.results[0].n + 1, ...(await board(db, variant, puzzle)) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/scores') return env.ASSETS.fetch(request);
    try {
      if (request.method === 'GET') return await get(url, env, ctx);
      if (request.method === 'POST') return await post(request, url, env, ctx);
      return json({ error: 'method not allowed' }, 405);
    } catch (e) {
      console.error(e);
      return json({ error: 'leaderboard unavailable' }, 503);
    }
  },
};
