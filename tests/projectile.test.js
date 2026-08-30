import test from 'node:test';
import assert from 'node:assert/strict';

import { len } from '../js/vec.js';
import { G_STANDARD } from '../js/constants.js';
import {
  stateAt, horizontalVelocity, verticalVelocity, apex, timesAtHeight, flightTime,
  range, anglesForRange, bestAngle, trajectory, simulate, dragEffect, independenceCheck,
} from '../js/projectile.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const g = G_STANDARD;

test('horizontal velocity never changes without air resistance', () => {
  const launch = { speed: 20, angleDeg: 40, height: 0, g };
  const ux = horizontalVelocity(launch);
  for (const t of [0, 0.4, 1, 2.5]) {
    close(stateAt(launch, t).vel.x, ux, 1e-12);
  }
});

test('acceleration is constant throughout, including at the top', () => {
  const launch = { speed: 15, angleDeg: 90, height: 0, g };
  for (const t of [0, 0.5, 1.5294, 3]) {
    close(stateAt(launch, t).acc.y, -g, 1e-12);
    close(stateAt(launch, t).acc.x, 0, 1e-12);
  }
});

test('at the apex the vertical velocity is zero and the acceleration is not', () => {
  // The experiment the spec asks for by name.
  const launch = { speed: 20, angleDeg: 60, height: 0, g };
  const top = apex(launch);
  close(top.t, verticalVelocity(launch) / g, 1e-9);
  close(stateAt(launch, top.t).vel.y, 0, 1e-9);
  close(top.acceleration, -g);
  assert.match(top.note, /acceleration is not/);
  close(top.height, verticalVelocity(launch) ** 2 / (2 * g), 1e-9);
});

test('a level or downward launch is already at its highest point', () => {
  const flat = apex({ speed: 10, angleDeg: 0, height: 5, g });
  assert.equal(flat.t, 0);
  close(flat.height, 5);
  assert.match(flat.note, /already the highest/);
});

test('a given height is passed twice — once up, once down', () => {
  const launch = { speed: 20, angleDeg: 90, height: 0, g };
  const times = timesAtHeight(launch, 10);
  assert.equal(times.length, 2);
  for (const t of times) close(stateAt(launch, t).pos.y, 10, 1e-9);
  // Rising at the first, falling at the second.
  assert.ok(stateAt(launch, times[0]).vel.y > 0);
  assert.ok(stateAt(launch, times[1]).vel.y < 0);
  // A height it never reaches is never reached.
  assert.deepEqual(timesAtHeight(launch, 100), []);
});

test('range on level ground matches u²sin(2θ)/g', () => {
  const speed = 25;
  for (const angleDeg of [10, 30, 45, 60, 80]) {
    const r = range({ speed, angleDeg, height: 0, g });
    const closed = (speed * speed * Math.sin((2 * angleDeg * Math.PI) / 180)) / g;
    close(r, closed, 1e-7);
  }
});

test('flight time is symmetric about the apex on level ground', () => {
  const launch = { speed: 18, angleDeg: 35, height: 0, g };
  close(flightTime(launch), 2 * apex(launch).t, 1e-9);
});

test('45° is the best angle only when launch and landing are level', () => {
  const level = bestAngle(20, g, 0, 0);
  assert.equal(level.angleDeg, 45);
  assert.match(level.note, /only because/);

  // From a height, the best angle drops below 45°.
  const raised = bestAngle(20, g, 30, 0);
  assert.ok(raised.angleDeg < 45 && raised.angleDeg > 20, `${raised.angleDeg}`);
  assert.match(raised.note, /Below 45/);

  // And it really is best: nothing beats it.
  const best = range({ speed: 20, angleDeg: raised.angleDeg, height: 30, g });
  for (const deg of [20, 30, 35, 40, 45, 50, 60]) {
    assert.ok(range({ speed: 20, angleDeg: deg, height: 30, g }) <= best + 1e-6,
      `${deg}° beat the supposedly best angle`);
  }
});

test('two angles reach the same target, and they sum to 90°', () => {
  const r = anglesForRange(40, 25, g);
  assert.equal(r.reachable, true);
  assert.equal(r.angles.length, 2);
  close(r.angles[0] + r.angles[1], 90, 1e-9);
  for (const deg of r.angles) close(range({ speed: 25, angleDeg: deg, height: 0, g }), 40, 1e-6);
  assert.match(r.note, /add up to 90/);
});

test('beyond the maximum range no angle reaches the target', () => {
  const r = anglesForRange(500, 25, g);
  assert.equal(r.reachable, false);
  assert.deepEqual(r.angles, []);
  // And it says how fast you would have to throw.
  close(r.minimumSpeed, Math.sqrt(500 * g), 1e-9);
  close(range({ speed: r.minimumSpeed, angleDeg: 45, height: 0, g }), 500, 1e-6);
});

test('from a height, the target angles are found numerically', () => {
  const r = anglesForRange(60, 22, g, 0, 15);
  assert.equal(r.reachable, true);
  for (const deg of r.angles) {
    close(range({ speed: 22, angleDeg: deg, height: 15, g }), 60, 0.05);
  }
});

test('the trajectory starts at the launch and ends on the ground', () => {
  const launch = { speed: 20, angleDeg: 40, height: 5, g };
  const path = trajectory(launch, { groundY: 0, steps: 50 });
  assert.equal(path.length, 51);
  close(path[0].pos.y, 5);
  close(path[50].pos.y, 0, 1e-6);
  close(path[50].pos.x, range(launch), 1e-6);
});

test('with no air, the simulation reproduces the exact solution', () => {
  // The two models must agree where they overlap, or nothing else can be
  // trusted. RK4 is exact for constant acceleration, so this is tight.
  const launch = { speed: 30, angleDeg: 37, height: 12, g, mass: 0.5 };
  const r = simulate(launch, { density: 0, cd: 0, area: 0 }, { dt: 0.0005 });
  close(r.range, range(launch), 1e-4);
  close(r.flightTime, flightTime(launch), 1e-4);
  close(r.apexHeight, apex(launch).height, 1e-4);
  assert.equal(r.withDrag, false);
  assert.equal(r.landed, true);
});

test('air resistance shortens the flight in every dimension', () => {
  const launch = { speed: 40, angleDeg: 45, height: 0, g, mass: 0.145 };
  const air = { density: 1.225, cd: 0.47, area: 0.00426 };   // a baseball
  const r = simulate(launch, air, { dt: 0.0005 });

  assert.equal(r.withDrag, true);
  assert.ok(r.range < r.ideal.range, 'drag must shorten the range');
  assert.ok(r.apexHeight < r.ideal.apexHeight);
  assert.ok(r.impactSpeed < r.ideal.impactSpeed);

  const effect = dragEffect(r);
  assert.ok(effect.rangePct < -10, `drag should cost a real fraction of the range, got ${effect.rangePct}%`);
  assert.ok(effect.rangePct > -95);
});

test('a heavier ball of the same size is less affected by the air', () => {
  const air = { density: 1.225, cd: 0.47, area: 0.00426 };
  const light = simulate({ speed: 40, angleDeg: 45, height: 0, g, mass: 0.05 }, air, { dt: 0.0005 });
  const heavy = simulate({ speed: 40, angleDeg: 45, height: 0, g, mass: 0.5 }, air, { dt: 0.0005 });
  // Same drag force, more inertia: the heavy one keeps more of its ideal range.
  assert.ok(dragEffect(heavy).rangePct > dragEffect(light).rangePct);
  // In a vacuum they would be identical — which is the comparison that matters.
  close(light.ideal.range, heavy.ideal.range, 1e-9);
});

test('the trajectory lands on the ground, not a step past it', () => {
  const r = simulate({ speed: 25, angleDeg: 30, height: 4, g, mass: 1 },
    { density: 1.225, cd: 0.47, area: 0.01 }, { dt: 0.002 });
  const last = r.samples[r.samples.length - 1];
  close(last.pos.y, 0, 1e-9);
  assert.ok(r.samples.length <= 401, 'samples are thinned for drawing');
  assert.ok(r.samples.every((s) => Number.isFinite(len(s.vel))));
});

test('thrown horizontally and simply dropped hit the ground together', () => {
  // Only in the no-drag model — and the explanation says exactly that.
  const check = independenceCheck(20, g, 15);
  assert.equal(check.same, true);
  close(check.droppedTime, Math.sqrt((2 * 20) / g), 1e-9);
  close(check.horizontalDistance, 15 * check.thrownTime, 1e-12);
  assert.match(check.why, /independent/);
  assert.match(check.why, /air resistance/);
});
