-- Daily leaderboard. Display names and times are public.
-- ip_hash = SHA-256(IP | secret salt | UTC date): used only for rate limits, never shown, unlinkable across days.
CREATE TABLE scores (
  id INTEGER PRIMARY KEY,
  game TEXT NOT NULL,          -- 'guess' (kept so one table can hold more games)
  variant TEXT NOT NULL,       -- word length, '4' to '7'
  puzzle_id TEXT NOT NULL,     -- daily puzzle date YYYY-MM-DD
  name TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  moves INTEGER NOT NULL,      -- guesses used (ranked first, then time)
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL  -- unix ms
);
CREATE INDEX scores_board ON scores (game, variant, puzzle_id, moves, time_ms);
CREATE INDEX scores_recent ON scores (game, variant, puzzle_id, created_at);
CREATE INDEX scores_alltime ON scores (game, variant, moves, time_ms);
CREATE INDEX scores_ip ON scores (ip_hash, created_at);
