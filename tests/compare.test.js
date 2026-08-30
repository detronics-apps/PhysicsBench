import test from 'node:test';
import assert from 'node:assert/strict';

import { differences, describeChange, isControlled, runOnce, compare, channel, summarise, relationshipHint } from '../js/compare.js';
import { defaults } from '../js/state.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const params = defaults().tools;
const FAST = { seconds: 1.5, step: 1 / 120, interval: 1 / 60 };

test('differences names what changed, and by what factor', () => {
  const d = differences({ m1: 1, force: 10 }, { m1: 2, force: 10 });
  assert.equal(d.length, 1);
  assert.equal(d[0].key, 'm1');
  assert.equal(d[0].ratio, 2);
  assert.equal(d[0].delta, 1);
  assert.equal(d[0].kind, 'number');

  assert.deepEqual(differences({ a: 1 }, { a: 1 }), []);
  assert.equal(differences({ dragOn: false }, { dragOn: true })[0].kind, 'flag');
  assert.equal(differences({ envId: 'earth' }, { envId: 'moon' })[0].kind, 'choice');
  // A key present on one side only still counts as a change.
  assert.equal(differences({}, { a: 3 }).length, 1);
});

test('changing two things at once is called out, not silently allowed', () => {
  // The whole method of experimental science, enforced.
  const two = differences({ m1: 1, force: 10 }, { m1: 2, force: 20 });
  assert.equal(isControlled(two), false);
  const text = describeChange(two);
  assert.match(text, /2 things were changed at once/);
  assert.match(text, /cannot be attributed/);
  assert.match(text, /one variable at a time/);
});

test('a clean single change is described in the form it is remembered in', () => {
  assert.match(describeChange(differences({ m1: 1 }, { m1: 2 })), /multiplied by 2/);
  assert.match(describeChange(differences({ m1: 3 }, { m1: 4.5 })), /went from 3 to 4\.5/);
  assert.match(describeChange(differences({ envId: 'earth' }, { envId: 'moon' })), /earth to moon/);
  assert.match(describeChange([]), /Nothing was changed/);
});

test('a run is deterministic — two identical runs give identical recordings', () => {
  const a = runOnce('accel', params.accel, FAST);
  const b = runOnce('accel', params.accel, FAST);
  assert.equal(a.recorder.frames.length, b.recorder.frames.length);
  for (let i = 0; i < a.recorder.frames.length; i += 1) {
    close(a.recorder.frames[i].values.x, b.recorder.frames[i].values.x, 0);
    close(a.recorder.frames[i].t, b.recorder.frames[i].t, 0);
  }
});

test('doubling the mass halves the acceleration, and the ratio says so', () => {
  // The relationship the Mass lab exists to reveal, arrived at by measurement.
  const c = compare('mass', { m1: 1, m2: 10, force: 10 }, { m1: 2, m2: 10, force: 10 }, FAST);
  assert.equal(c.controlled, true);
  const vx = channel(c, 'vx');
  close(vx.ratio, 0.5, 1e-6);
  assert.ok(vx.finalA > vx.finalB);
  assert.equal(vx.unit, 'm/s');
});

test('doubling the force doubles the acceleration', () => {
  const c = compare('mass', { m1: 2, m2: 10, force: 10 }, { m1: 2, m2: 10, force: 20 }, FAST);
  close(channel(c, 'vx').ratio, 2, 1e-6);
});

test('an unchanged quantity comes out with a ratio of one', () => {
  const c = compare('accel', { ...params.accel, a: 2 }, { ...params.accel, a: 2, mass: 4 }, FAST);
  // Mass changed but the acceleration is set directly, so the motion is the same.
  close(channel(c, 'vx').ratio, 1, 1e-6);
});

test('the summary puts what moved most at the top', () => {
  const c = compare('projectile',
    { ...params.projectile, speed: 20 },
    { ...params.projectile, speed: 30 }, FAST);
  const s = summarise(c, ['x', 'y', 'vx', 'vy', 'speed', 'ke']);
  assert.ok(s.rows.length >= 5);
  // Sorted by how much each moved, most first.
  for (let i = 1; i < s.rows.length; i += 1) {
    assert.ok(s.rows[i - 1].significance >= s.rows[i].significance);
  }
  assert.ok(s.headline);
  assert.equal(s.controlled, true);
});

test('the summary flags the quantities that did not move', () => {
  // Gravity acts only vertically, so changing the horizontal launch speed must
  // leave the vertical velocity alone. That "nothing happened" is the lesson.
  const c = compare('projectile',
    { ...params.projectile, speed: 10, angleDeg: 0, height: 30, dragOn: false },
    { ...params.projectile, speed: 25, angleDeg: 0, height: 30, dragOn: false }, FAST);
  const s = summarise(c, ['x', 'vx', 'vy', 'y']);
  const vy = s.rows.find((r) => r.id === 'vy');
  assert.ok(vy.significance < 0.005, `vy moved by ${vy.significance}`);
  assert.ok(s.unchanged.some((r) => r.id === 'vy'));
  assert.ok(s.unchanged.some((r) => r.id === 'y'));
});

test('changing gravity changes the fall and nothing about the horizontal motion', () => {
  const c = compare('projectile',
    { ...params.projectile, envId: 'earth', angleDeg: 0, height: 40, speed: 15, dragOn: false },
    { ...params.projectile, envId: 'moon', angleDeg: 0, height: 40, speed: 15, dragOn: false }, FAST);
  assert.equal(c.controlled, true);
  close(channel(c, 'vx').ratio, 1, 1e-9);
  // The Moon's g is about a sixth of Earth's, and vy after the same time shows it.
  close(channel(c, 'vy').ratio, 1.62 / 9.80665, 0.01);
});

test('the relationship hint asks a question rather than announcing the answer', () => {
  const inverse = relationshipHint(2, 0.5);
  assert.ok(inverse);
  assert.match(inverse, /\?$/);
  // It must not state the conclusion the learner is meant to reach.
  assert.doesNotMatch(inverse, /inversely proportional/i);

  const direct = relationshipHint(2, 2);
  assert.match(direct, /relationship does that suggest\?/);

  assert.match(relationshipHint(2, 4), /squared/);
  assert.match(relationshipHint(4, 2), /square root/);
  assert.match(relationshipHint(2, 1), /independent/);

  // Nothing to say when nothing changed, or when the numbers are nonsense.
  assert.equal(relationshipHint(1, 1), null);
  assert.equal(relationshipHint(NaN, 2), null);
  assert.equal(relationshipHint(3, 1.37), null);
});

test('an empty channel does not break the comparison', () => {
  const c = compare('mass', { m1: 1, m2: 10, force: 10 }, { m1: 2, m2: 10, force: 10 }, FAST);
  const missing = channel(c, 'nonsense');
  assert.deepEqual(missing.a.points, []);
  assert.ok(Number.isNaN(missing.finalA));
  // And it is filtered out of the summary rather than sorted to the top.
  assert.equal(summarise(c, ['nonsense', 'vx']).rows.length, 1);
});
