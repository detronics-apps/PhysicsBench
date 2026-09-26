import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, byId, groups, newlyEarned, progress } from '../js/achievements.js';
import { defaults } from '../js/state.js';

/** A snapshot with nothing happening in it, for a test to move one thing in. */
const quiet = () => ({
  main: { speed: 0, weight: 10, accelerationMagnitude: 0, heightAboveGround: 0, net: { magnitude: 0 } },
  forces: [],
  totals: { elsewhere: { heat: 0, impact: 0 } },
  world: { ground: { y: 0 } },
  params: defaults().bench,
  state: defaults(),
  g: 9.81,
  events: [],
  opened: [],
});

/* ------------------------------------------------------------ the shape -- */

test('every achievement is complete and says something', () => {
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id, 'an achievement with no id');
    assert.ok(a.name.length > 3, `${a.id}: no name`);
    assert.ok(a.what.length > 60, `${a.id}: the sentence it exists to deliver is too short`);
    assert.ok(a.hint.length > 15, `${a.id}: the locked hint says nothing`);
    assert.ok(a.group.length > 2, `${a.id}: no group`);
    assert.equal(typeof a.earn, 'function', `${a.id}: nothing to earn it with`);
  }
});

test('no two share an id', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
});

test('the groups come out in the order they are written, once each', () => {
  const list = groups();
  assert.equal(new Set(list).size, list.length);
  assert.equal(list[0], ACHIEVEMENTS[0].group);
});

test('byId and progress agree with the list', () => {
  assert.equal(byId(ACHIEVEMENTS[0].id).name, ACHIEVEMENTS[0].name);
  assert.equal(byId('nonsense'), null);
  assert.deepEqual(progress({}), { earned: 0, total: ACHIEVEMENTS.length });
  assert.deepEqual(progress({ [ACHIEVEMENTS[0].id]: 'now' }),
    { earned: 1, total: ACHIEVEMENTS.length });
});

/* --------------------------------------------------------- the detection -- */

/**
 * The one that matters: nothing fires for a bench nobody has touched.
 *
 * An achievement that is earned by opening the app is not a discovery, it is
 * a participation trophy, and it teaches the reader to ignore the next one.
 */
test('a bench sitting still earns nothing', () => {
  assert.deepEqual(newlyEarned(quiet()), []);
});

test('the default opening screen earns nothing either', () => {
  // The app opens on a worked example, so this is the same question asked of
  // the state a first-time reader actually meets.
  const snap = { ...quiet(), state: defaults(), params: defaults().bench };
  assert.deepEqual(newlyEarned(snap), []);
});

test('something already held is not offered twice', () => {
  const moving = { ...quiet(), main: { ...quiet().main, speed: 5 } };
  assert.deepEqual(newlyEarned(moving), ['first-push']);
  assert.deepEqual(newlyEarned(moving, { 'first-push': '2026-01-01' }), []);
});

test('each achievement fires for the thing it names, and not before', () => {
  const cases = {
    'first-push': (s) => { s.main.speed = 2; },
    'heavy-hand': (s) => { s.main.accelerationMagnitude = 9.81 * 6; },
    'every-level': (s) => { s.state.ui.level = 'expert'; },
    'made-it-float': (s) => { s.forces = [{ id: 'buoyancy', magnitude: 20 }]; },
    'terminal-velocity': (s) => {
      s.forces = [{ id: 'drag', magnitude: 10 }];
      s.main.speed = 8;
      s.main.net = { magnitude: 0 };
    },
    'into-orbit': (s) => { s.main.heightAboveGround = 4e5; s.main.speed = 7800; },
    'popped-it': (s) => { s.events = ['burst']; },
    'lost-to-heat': (s) => { s.totals.elsewhere.heat = 50; },
    'water-world': (s) => { s.params.surfaceFluidId = 'water'; },
    'built-a-track': (s) => { s.params.walls = [{}, {}, {}]; },
    'took-the-wheel': (s) => { s.forces = [{ id: 'control', magnitude: 3 }]; },
    'slowed-time': (s) => { s.state.transport.speed = 0.1; },
    'scrubbed-back': (s) => { s.state.transport.scrubT = 4; },
    'pinned-a-panel': (s) => { s.state.ui.locks = { object: true }; },
    'read-the-model': (s) => { s.opened = ['disclosure']; },
    'shared-it': (s) => { s.opened = ['share']; },
  };

  // Every achievement has a case, or the set has grown without its test.
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id).filter((id) => !cases[id]), [],
    'an achievement with nothing proving it fires');

  for (const [id, arrange] of Object.entries(cases)) {
    const snap = quiet();
    arrange(snap);
    assert.ok(newlyEarned(snap).includes(id), `${id} did not fire for its own condition`);
  }
});

test('a broken condition costs its own badge and nothing else', () => {
  // A badge that throws must never take the frame with it.
  const snap = quiet();
  snap.main = null;              // enough to upset several of them at once
  assert.doesNotThrow(() => newlyEarned(snap));
});

/* ----------------------------------------------- what they promise to be -- */

test('nothing is earned by waiting, only by doing', () => {
  // No condition may read the clock: an achievement for time spent is not a
  // discovery, and it would fire for somebody who walked away.
  for (const a of ACHIEVEMENTS) {
    const src = a.earn.toString();
    assert.ok(!/Date|\bt\b\s*>|elapsed|seconds/.test(src),
      `${a.id} looks like it rewards time rather than discovery: ${src}`);
  }
});

test('the promise each one carries is a sentence, not a label', () => {
  // The badge is the excuse to read the sentence, so the sentence has to be
  // worth reading: it says what the thing is *for*, not that you found it.
  for (const a of ACHIEVEMENTS) {
    assert.ok(/[.!]$/.test(a.what.trim()), `${a.id}: not a sentence`);
    assert.ok(!/congratulations|well done|nice work/i.test(a.what), `${a.id}: flattery, not teaching`);
  }
});
