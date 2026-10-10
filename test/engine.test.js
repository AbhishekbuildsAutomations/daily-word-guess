import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedback, pick, LENGTHS } from '../public/engine.js';

test('feedback marks repeated letters only as often as the answer has them', () => {
  assert.equal(feedback('crane', 'crane'), 'ggggg');
  assert.equal(feedback('speed', 'abide'), 'bbyby'); // ABIDE has one E: only the first E in SPEED is marked
  assert.equal(feedback('geese', 'eerie'), 'bgybg');
  assert.equal(feedback('allot', 'tally'), 'yygby');
});

test('the daily word is the same for everyone and is a valid guess', () => {
  for (const n of LENGTHS) {
    const answers = JSON.parse(readFileSync(new URL(`../public/words/answers-${n}.json`, import.meta.url)));
    const allowed = new Set(JSON.parse(readFileSync(new URL(`../public/words/allowed-${n}.json`, import.meta.url))));
    assert.equal(pick(answers, n, '2026-10-11'), pick(answers, n, '2026-10-11'));
    assert.ok(answers.every((w) => w.length === n && allowed.has(w)));
  }
});
