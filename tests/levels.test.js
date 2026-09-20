import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_IDS, atLeast, shownAt, levelById } from '../js/levels.js';

test('the three levels are in order, simplest first', () => {
  assert.deepEqual(LEVEL_IDS, ['simple', 'advanced', 'expert']);
  assert.equal(LEVELS[0].id, 'simple');
});

test('every level carries a label and a reason', () => {
  for (const level of LEVELS) {
    assert.ok(level.label.length > 0, `${level.id} has a label`);
    assert.ok(level.note.length > 20, `${level.id} says what it is for`);
  }
});

test('atLeast is inclusive of the level itself', () => {
  for (const id of LEVEL_IDS) assert.equal(atLeast(id, id), true, `${id} is at least ${id}`);
});

test('atLeast runs the right way round', () => {
  assert.equal(atLeast('expert', 'simple'), true);
  assert.equal(atLeast('expert', 'advanced'), true);
  assert.equal(atLeast('advanced', 'simple'), true);

  assert.equal(atLeast('simple', 'advanced'), false);
  assert.equal(atLeast('simple', 'expert'), false);
  assert.equal(atLeast('advanced', 'expert'), false);
});

test('an unknown level shows the least, never the most', () => {
  // A share link or a stale save carrying a level this build does not know
  // must not silently promote its reader to Expert.
  assert.equal(atLeast('wizard', 'expert'), false);
  assert.equal(atLeast(undefined, 'advanced'), false);
  assert.equal(atLeast(null, 'simple'), true);
});

test('shownAt binds one level and answers many questions', () => {
  const at = shownAt('advanced');
  assert.equal(at('simple'), true);
  assert.equal(at('advanced'), true);
  assert.equal(at('expert'), false);
});

test('levelById falls back to the simplest, never to nothing', () => {
  assert.equal(levelById('expert').id, 'expert');
  assert.equal(levelById('nonsense').id, 'simple');
  assert.equal(levelById(undefined).id, 'simple');
});
