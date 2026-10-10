import { LENGTHS, rows, feedback, dayKey, pick } from './engine.js';

const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const lists = new Map();
const list = (name) => {
  if (!lists.has(name)) lists.set(name, fetch(`/words/${name}.json`).then((r) => r.json()).catch(() => { lists.delete(name); return []; }));
  return lists.get(name);
};

let n = Number(store.get('len')) || 5, daily = true, puzzle = '', answer = '', guesses = [], cur = '', over = false, started = 0, ms = 0, token = 0;
const key = () => `wg:${n}:${puzzle}`;
const save = () => { if (daily) store.set(key(), JSON.stringify({ g: guesses, ms })); };
const say = (t) => { $('msg').textContent = t || ' '; };

$('lens').innerHTML = LENGTHS.map((k) => `<button type="button" data-len="${k}">${k}</button>`).join('');
$('keys').innerHTML = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'].map((r) =>
  `<div>${[...r].map((c) => c === '+' ? '<button class="wide" data-k="Enter">Enter</button>' : c === '-' ? '<button class="wide" data-k="Backspace" aria-label="Delete">⌫</button>' : `<button data-k="${c}">${c}</button>`).join('')}</div>`).join('');

async function load(isDaily) {
  const my = ++token;
  daily = isDaily; puzzle = daily ? dayKey() : `r${Math.floor(Math.random() * 1e9)}`;
  guesses = []; cur = ''; over = false; started = 0; ms = 0; answer = '';
  document.querySelectorAll('[data-len]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.len) === n)));
  $('daily').setAttribute('aria-pressed', String(daily)); $('practice').setAttribute('aria-pressed', String(!daily));
  $('mode').textContent = `${daily ? "Today's" : 'Practice'} ${n}-letter word · ${rows(n)} tries`;
  $('lb').hidden = true;
  draw(); say('');
  const answers = await list(`answers-${n}`);
  if (my !== token) return;
  if (!answers.length) return say('Could not load the word list.');
  answer = pick(answers, n, puzzle);
  if (daily) { try { const s = JSON.parse(store.get(key()) ?? 'null'); if (s) { guesses = s.g; ms = s.ms; } } catch {} }
  draw();
  if (guesses.at(-1) === answer || guesses.length >= rows(n)) {
    over = true;
    say(guesses.at(-1) === answer ? 'Solved today. Try Practice!' : `Today's word was ${answer.toUpperCase()}.`);
    if (daily) leaderboard(false);
  }
  list(`allowed-${n}`); // preload; only needed on Enter
}

function draw() {
  const b = $('board');
  b.style.setProperty('--n', n);
  b.replaceChildren(...Array.from({ length: rows(n) }, (_, r) => {
    const row = document.createElement('div'); row.className = 'row'; row.setAttribute('role', 'row');
    const g = guesses[r], fb = g ? feedback(g, answer) : '', text = g ?? (r === guesses.length ? cur : '');
    for (let k = 0; k < n; k++) {
      const t = document.createElement('span'); t.setAttribute('role', 'gridcell');
      t.className = 't' + (g ? ` ${fb[k]}` : text[k] ? ' typed' : '');
      t.textContent = text[k] ?? '';
      if (g) t.setAttribute('aria-label', `${text[k]}: ${{ g: 'right spot', y: 'wrong spot', b: 'not in word' }[fb[k]]}`);
      row.append(t);
    }
    return row;
  }));
  const best = {}, rank = { b: 1, y: 2, g: 3 };
  for (const g of guesses) { const fb = feedback(g, answer); [...g].forEach((c, k) => { if (rank[fb[k]] > (rank[best[c]] ?? 0)) best[c] = fb[k]; }); }
  document.querySelectorAll('[data-k]').forEach((el) => { el.className = (el.dataset.k.length > 1 ? 'wide ' : '') + (best[el.dataset.k] ?? ''); });
}

async function press(k) {
  if (over || !answer) return;
  if (k === 'Enter') {
    if (cur.length < n) return say(`Use all ${n} letters.`);
    const allowed = await list(`allowed-${n}`);
    if (allowed.length && !allowed.includes(cur) && cur !== answer) return say(`${cur.toUpperCase()} is not in the word list.`);
    guesses.push(cur); cur = '';
    ms = Date.now() - started;
    const won = guesses.at(-1) === answer;
    over = won || guesses.length >= rows(n);
    save(); draw();
    if (!over) return say('');
    say(won ? `Solved in ${guesses.length} of ${rows(n)}!` : `Out of tries. The word was ${answer.toUpperCase()}.`);
    if (daily) leaderboard(won);
    return;
  }
  if (!started) started = Date.now() - ms;
  if (k === 'Backspace') cur = cur.slice(0, -1);
  else if (/^[a-z]$/.test(k) && cur.length < n) cur += k;
  else return;
  say(''); draw();
}

const fmt = (t) => `${Math.floor(t / 60000)}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}`;
function show(data) {
  $('top').replaceChildren(...(data.today ?? []).map((s) => { const li = document.createElement('li'); li.textContent = `${s.name}: ${s.moves} guesses, ${fmt(s.timeMs)}`; return li; }));
  if (!data.today?.length) $('lbmsg').textContent = 'No scores yet today.';
}
async function leaderboard(canSave) {
  $('lb').hidden = false; $('lbmsg').textContent = '';
  $('save').hidden = !canSave || !!store.get(`saved:${key()}`);
  try { show(await (await fetch(`/api/scores?variant=${n}&puzzle=${puzzle}`)).json()); } catch { $('lbmsg').textContent = 'Leaderboard unavailable.'; }
}
$('save').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('name').value; store.set('name', name);
  const r = await fetch('/api/scores', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ variant: String(n), puzzle, timeMs: ms, moves: guesses.length, name }) });
  const data = await r.json();
  if (!r.ok) { $('lbmsg').textContent = data.error; return; }
  store.set(`saved:${key()}`, '1'); $('save').hidden = true;
  $('lbmsg').textContent = `You're #${data.rank} today.`;
  show(data);
});
$('name').value = store.get('name') ?? '';

$('keys').addEventListener('mousedown', (e) => e.preventDefault());
$('keys').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.('input')) return;
  if (e.key === 'Enter' && e.target.matches?.('button, a, summary')) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'Enter' || k === 'Backspace' || /^[a-z]$/.test(k)) { e.preventDefault(); press(k); }
});
$('lens').addEventListener('click', (e) => { const b = e.target.closest('[data-len]'); if (b) { n = Number(b.dataset.len); store.set('len', n); load(true); } });
$('daily').addEventListener('click', () => load(true));
$('practice').addEventListener('click', () => load(false));
load(true);
