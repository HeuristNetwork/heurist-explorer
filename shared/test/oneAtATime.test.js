/**
 * @file oneAtATime.test.js
 * @brief A repeated click while a dialog is loading does not start a second run (2026-11-06).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { oneAtATime } from '../src/ui/oneAtATime.js';

test('a repeated call gives the running promise; after the end the action runs again', async () => {
  const single = oneAtATime();
  let runs = 0;
  let finish = null;
  const open = single(async (value) => {
    runs += 1;
    await new Promise((resolve) => { finish = resolve; });
    return value;
  });
  const first = open('a');
  const second = open('b');
  await Promise.resolve();
  assert.equal(await Promise.race([first, Promise.resolve('waiting')]), 'waiting');
  finish();
  assert.equal(await first, 'a');
  assert.equal(await second, 'a', 'the second call gets the result of the first');
  assert.equal(runs, 1);
  const third = open('c');
  await Promise.resolve();
  await Promise.resolve();
  finish();
  assert.equal(await third, 'c');
  assert.equal(runs, 2);
});

test('the guard is shared by the wrapped actions and keeps `this`', async () => {
  const single = oneAtATime();
  const owner = { name: 'x', calls: [] };
  owner.one = single(async function one() { this.calls.push('one'); });
  owner.two = single(async function two() { this.calls.push('two'); });
  await Promise.all([owner.one(), owner.two()]);
  assert.deepEqual(owner.calls, ['one']);
  await owner.two();
  assert.deepEqual(owner.calls, ['one', 'two']);
});

test('a failed run frees the guard', async () => {
  const single = oneAtATime();
  let fail = true;
  const open = single(async () => {
    if (fail) throw new Error('no');
    return 'ok';
  });
  await assert.rejects(open(), /no/);
  fail = false;
  assert.equal(await open(), 'ok');
});
