import test from 'node:test';
import assert from 'node:assert/strict';

import {
  velocityAt, displacementAt, positionAt, averageVelocity, velocityAfter, bothRoots,
  timeToVelocity, timesToDisplacement, solveSuvat, describeMotion, sample, speed, compareMotion,
} from '../js/kinematics.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('the three constant-acceleration relations agree with each other', () => {
  const u = 4;
  const a = -9.80665;
  const t = 0.7;
  const v = velocityAt(u, a, t);
  const s = displacementAt(u, a, t);

  close(v, 4 - 9.80665 * 0.7);
  close(s, averageVelocity(u, v) * t, 1e-12);
  close(v * v, u * u + 2 * a * s, 1e-9);
  close(positionAt(10, u, a, t), 10 + s, 1e-12);
});

test('velocityAfter has two roots, and both are physical', () => {
  // A ball thrown up at 10 m/s passes 3 m twice: once rising, once falling.
  const roots = bothRoots(10, -9.80665, 3);
  assert.equal(roots.length, 2);
  close(roots[0], -roots[1], 1e-12);
  assert.ok(velocityAfter(10, -9.80665, 3, 1) > 0);
  assert.ok(velocityAfter(10, -9.80665, 3, -1) < 0);
  // A height it never reaches has no root at all.
  assert.ok(Number.isNaN(velocityAfter(10, -9.80665, 50)));
  assert.deepEqual(bothRoots(10, -9.80665, 50), []);
});

test('timesToDisplacement returns both passes, in order', () => {
  const times = timesToDisplacement(10, -9.80665, 3);
  assert.equal(times.length, 2);
  assert.ok(times[0] < times[1]);
  // Check them: the displacement really is 3 m at both.
  for (const t of times) close(displacementAt(10, -9.80665, t), 3, 1e-9);
});

test('timesToDisplacement copes with zero acceleration and unreachable targets', () => {
  assert.deepEqual(timesToDisplacement(5, 0, 10), [2]);
  assert.deepEqual(timesToDisplacement(5, 0, -10), []);
  assert.deepEqual(timesToDisplacement(0, 0, 0), [0]);
  assert.deepEqual(timesToDisplacement(10, -9.80665, 100), []);
});

test('timeToVelocity handles the zero-acceleration case honestly', () => {
  close(timeToVelocity(0, 20, 4), 5);
  assert.equal(timeToVelocity(5, 5, 0), 0);
  assert.equal(timeToVelocity(5, 9, 0), Infinity);
});

test('solveSuvat fills in the gaps and says which equation it used', () => {
  const r = solveSuvat({ u: 0, a: 2, t: 5 });
  assert.equal(r.ok, true);
  close(r.v, 10);
  close(r.s, 25);
  assert.ok(r.steps.some((s) => s.equation === 'v = u + a·t'));
  assert.ok(r.steps.some((s) => s.equation.startsWith('s = u·t')));
  assert.match(r.validWhen, /constant/);
});

test('solveSuvat works from any three quantities', () => {
  const fromVAS = solveSuvat({ v: 30, a: 3, s: 150 });
  assert.equal(fromVAS.ok, true);
  close(fromVAS.u, Math.sqrt(900 - 900), 1e-9);
  close(fromVAS.t, 10, 1e-9);

  const fromUVT = solveSuvat({ u: 20, v: 0, t: 4 });
  assert.equal(fromUVT.ok, true);
  close(fromUVT.a, -5);
  close(fromUVT.s, 40);

  const fromUST = solveSuvat({ u: 2, s: 30, t: 4 });
  assert.equal(fromUST.ok, true);
  close(fromUST.a, 2.75);
  close(fromUST.v, 13);
});

test('solveSuvat refuses to guess from too little', () => {
  const r = solveSuvat({ u: 3, t: 2 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.given, ['u', 't']);
  assert.match(r.reason, /Three of/);
});

test('a solved set is internally consistent', () => {
  // Round-trip: whatever route it took, the answers must satisfy all three
  // relations. This is the invariant worth having, not a list of examples.
  const cases = [
    { u: 0, a: 9.80665, t: 3 },
    { u: 25, v: 0, s: 40 },
    { u: -4, a: 1.5, t: 6 },
    { v: 12, a: -2, t: 3 },
    { u: 5, v: 15, a: 2 },
  ];
  for (const c of cases) {
    const r = solveSuvat(c);
    assert.equal(r.ok, true, `${JSON.stringify(c)} should solve`);
    close(r.v, r.u + r.a * r.t, 1e-7);
    close(r.s, r.u * r.t + 0.5 * r.a * r.t * r.t, 1e-6);
    close(r.v * r.v, r.u * r.u + 2 * r.a * r.s, 1e-5);
  }
});

test('describeMotion separates accelerating from getting faster', () => {
  // The distinction the whole acceleration lesson turns on.
  assert.equal(describeMotion(5, 2).state, 'speeding-up');
  assert.equal(describeMotion(5, -2).state, 'slowing-down');
  assert.match(describeMotion(5, -2).text, /still accelerating/);
  assert.equal(describeMotion(-5, -2).state, 'speeding-up');
  assert.equal(describeMotion(-5, 2).state, 'slowing-down');
  assert.equal(describeMotion(7, 0).state, 'constant-velocity');
  assert.equal(describeMotion(0, 0).state, 'at-rest');

  // The top of a throw: stationary, and still accelerating downward.
  const apex = describeMotion(0, -9.80665);
  assert.equal(apex.state, 'turning-point');
  assert.match(apex.text, /still accelerating/);
});

test('sample walks the motion at regular intervals', () => {
  const rows = sample(0, -9.80665, { from: 0, to: 2, steps: 4, x0: 100 });
  assert.equal(rows.length, 5);
  close(rows[0].t, 0);
  close(rows[0].s, 100);
  close(rows[4].t, 2);
  close(rows[4].v, -2 * 9.80665, 1e-9);
  // Acceleration is constant by construction — that is the model.
  assert.ok(rows.every((r) => r.a === -9.80665));
});

test('speed is the magnitude of velocity, velocity carries direction', () => {
  assert.equal(speed(-5), 5);
  assert.equal(speed(5), 5);
  const c = compareMotion(5, -5);
  assert.equal(c.sameSpeed, true);
  assert.equal(c.sameVelocity, false);
  assert.equal(c.oppositeDirections, true);

  const same = compareMotion(5, 5);
  assert.equal(same.sameVelocity, true);
  assert.equal(same.oppositeDirections, false);
});
