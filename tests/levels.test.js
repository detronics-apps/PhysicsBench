import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS, LEVEL_IDS, atLeast, shownAt, levelById,
  INTERACTIVE, LAYOUTS, PHONE_SIDE, defaultLayout,
} from '../js/levels.js';

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

// --- Interactive, the layout ------------------------------------------------

test('Interactive is not a fourth level', () => {
  /*
   * The guard that matters. A fourth rank would quietly rewrite every one of
   * the several hundred `at(...)` calls in the app: added at the top, every
   * `at('expert')` becomes true for it; added at the bottom, every one becomes
   * false. It has to stay outside the ranking.
   */
  assert.ok(!LEVEL_IDS.includes(INTERACTIVE.id));
  assert.equal(atLeast(INTERACTIVE.id, 'advanced'), false, 'reads as the least, like any unknown');
  assert.ok(INTERACTIVE.label.length > 0 && INTERACTIVE.note.length > 0);
  assert.deepEqual(LAYOUTS, ['page', 'interactive']);
});

test('a phone defaults into Interactive, held either way', () => {
  // The whole point: 812 across in landscape would read as a laptop on width.
  assert.equal(defaultLayout({ coarse: true, minSide: 375 }), 'interactive', 'portrait 375x812');
  assert.equal(defaultLayout({ coarse: true, minSide: 375 }), 'interactive', 'landscape 812x375');
  assert.equal(defaultLayout({ coarse: true, minSide: 430 }), 'interactive', 'the largest phones');
});

test('a tablet, a desktop and a narrow window with a mouse do not', () => {
  assert.equal(defaultLayout({ coarse: true, minSide: 768 }), 'page', 'iPad portrait');
  assert.equal(defaultLayout({ coarse: true, minSide: 1080 }), 'page', 'a touch laptop');
  assert.equal(defaultLayout({ coarse: false, minSide: 400 }), 'page', 'a narrow window, mouse');
  assert.equal(defaultLayout({}), 'page', 'nothing known reads as a desktop');
  assert.equal(defaultLayout(), 'page');
});

test('the phone threshold sits in the gap between phones and tablets', () => {
  // 430 is the widest common phone, 768 the narrowest common tablet. A number
  // outside that gap would mis-sort real hardware rather than edge cases.
  assert.ok(PHONE_SIDE > 430 && PHONE_SIDE < 768);
  assert.equal(defaultLayout({ coarse: true, minSide: PHONE_SIDE }), 'interactive');
  assert.equal(defaultLayout({ coarse: true, minSide: PHONE_SIDE + 1 }), 'page');
});
