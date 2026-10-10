# Daily Word Guess

A daily word-guessing game with a global leaderboard, in about 250 lines of plain JavaScript. It runs on one Cloudflare Worker with Static Assets and a D1 database. There's no framework, no build step and no accounts.

This is the engine behind the daily [Word Guess game on WordsUnscrambler](https://wordsunscrambler.site/games/word-guess-unlimited/), pulled out into a standalone app you can deploy yourself.

- **4 to 7-letter words.** Each length has its own daily word and its own leaderboard.
- **Same word for everyone.** The answer comes from a seeded hash of the date, so the Worker never has to store or send it.
- **Practice mode.** Unlimited unranked rounds.
- **Leaderboard on D1.** Fewest guesses wins, then the fastest time. Names are checked against a profanity list. Rate limits use a daily-salted IP hash, so raw IPs are never stored.
- **Edge-cached boards.** Reads hit D1 at most once every 30 seconds per board in each data center, and a new score clears its board.

## How it works

| File | What it does |
|---|---|
| `public/engine.js` | The rules, shared by the browser and the Worker: colour feedback (with Wordle-style repeated letters), the seeded PRNG and the daily pick |
| `public/game.js` | The board, the keyboard, saved progress (localStorage) and the leaderboard UI |
| `src/worker.js` | `GET/POST /api/scores`: validation, rate limiting, D1 queries, Cache API |
| `migrations/0001_scores.sql` | The `scores` table and its indexes |
| `public/words/` | Answer lists (`answers-N.json`) and accepted guesses (`allowed-N.json`) |

Static files are served straight from Workers Static Assets, so only `/api/scores` runs Worker code.

## Run it

```bash
npm install
npx wrangler d1 create daily-word-guess   # paste the database_id into wrangler.jsonc
echo "SCORE_SALT=any-random-string" > .dev.vars
npm run dev                              # http://localhost:8787
```

## Deploy

```bash
npx wrangler secret put SCORE_SALT       # a long random string
npm run deploy
```

Everything fits in the Workers free plan. D1 reads are tiny, and the leaderboard cache keeps them low.

## Tests

```bash
npm test
```

## The word lists

- **Accepted guesses** are every word of that length in **ENABLE** (Enhanced North American Benchmark Lexicon), which is public domain.
- **Answers** are the most common of those words. Frequency comes from English Wikipedia word counts. We dropped plain plurals and past tenses, kept only words that are ordinary dictionary headwords in [WordNet](https://wordnet.princeton.edu/) (so names never become the answer), and removed offensive words.

The lists are the same ones used on [wordsunscrambler.site](https://wordsunscrambler.site/methodology/).

The display-name filter uses the [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) English list (`src/profanity.json`, CC BY 4.0).

## Licence

MIT, © 2026 WordsUnscrambler team. Not affiliated with Wordle or The New York Times.
