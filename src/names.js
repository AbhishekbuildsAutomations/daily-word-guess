// Leaderboard display-name check (server side, /api/scores/). `bad` = LDNOOBW English list (src/data/profanity.json).
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };
// 4-letter roots that are never innocent inside a longer name (other short terms only match as whole words,
// so "Cassie" or "Hancock" stay allowed).
const ROOTS = ['fuck', 'shit', 'twat', 'jizz', 'porn', 'nigg', 'fagg', 'whor', 'slut'];

export function makeNameCheck(bad) {
  const words = new Set(), long = [];
  for (const t of bad) {
    const sq = t.toLowerCase().replace(/[^a-z]/g, '');
    if (!sq) continue;
    if (!t.includes(' ')) words.add(sq);
    if (sq.length >= 5) long.push(sq);
  }
  /** Returns [cleanName, null] or [null, reason]. */
  return function check(raw) {
    if (typeof raw !== 'string') return [null, 'Enter a name.'];
    const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 20) return [null, 'Use 2 to 20 characters.'];
    if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(name)) return [null, 'Use letters, numbers, spaces and . _ \' - only.'];
    const plain = name.toLowerCase().replace(/[013457@$!8]/g, (c) => LEET[c]);
    const squashed = plain.replace(/[^a-z]/g, '');
    const tokens = plain.split(/[^a-z]+/).filter(Boolean);
    if (/www|http|\.(com|net|org|io|ru|xyz)\b/.test(plain)) return [null, 'No links, please.'];
    if (tokens.some((t) => words.has(t)) || words.has(squashed) || ROOTS.some((r) => squashed.includes(r)) || long.some((b) => squashed.includes(b)))
      return [null, 'Please pick a different name.'];
    return [name, null];
  };
}
