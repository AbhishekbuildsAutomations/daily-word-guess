// Game rules shared by the browser (public/game.js) and the Worker (src/worker.js).

export const LENGTHS = [4, 5, 6, 7];
/** Tries per word length: 6 for 4–5 letters, 7 for 6–7. */
export const rows = (n) => (n <= 5 ? 6 : 7);

/** Colours for `guess` against `answer`: g = right spot, y = in the word elsewhere, b = not in the word.
 *  Greens are marked first, then yellows left to right, so a repeated letter is only marked as often as the answer has it. */
export function feedback(guess, answer) {
  const out = Array(guess.length).fill('b'), left = {};
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) out[i] = 'g';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (out[i] === 'b' && left[guess[i]] > 0) { out[i] = 'y'; left[guess[i]]--; }
  }
  return out.join('');
}

/** Deterministic PRNG from a string seed (FNV-1a hash, then mulberry32). Same seed, same word, on every device. */
export function rng(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The player's local date, YYYY-MM-DD. It is the daily puzzle id. */
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The daily (or practice) answer for a puzzle id. */
export const pick = (answers, n, puzzleId) => answers[Math.floor(rng(`guess|${n}|${puzzleId}`)() * answers.length)];
