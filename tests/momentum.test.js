import test from 'node:test';
import assert from 'node:assert/strict';

import { vec } from '../js/vec.js';
import {
  momentum, momentum1D, systemMomentum, systemMomentum1D, totalMass,
  centreOfMassVelocity, centreOfMassVelocity1D, impulse, velocityChangeFrom,
  stoppingForce, sameMomentum, relativisticCorrection, momentumAudit, breakdown,
} from '../js/momentum.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('momentum is mass times velocity and points where the motion does', () => {
  assert.deepEqual(momentum(2, vec(3, -4)), { x: 6, y: -8 });
  assert.equal(momentum1D(2, -5), -10);
});

test('a light fast object and a heavy slow one can have the same momentum', () => {
  // The Momentum lab's opening question.
  const light = { mass: 1, v: 10 };
  const heavy = { mass: 10, v: 1 };
  assert.equal(sameMomentum(light, heavy), true);
  close(momentum1D(light.mass, light.v), 10);
  // Their kinetic energies are not equal — that comes later, and is the point.
  assert.notEqual(0.5 * light.mass * light.v ** 2, 0.5 * heavy.mass * heavy.v ** 2);
});

test('system momentum is a vector sum, so opposite motions cancel', () => {
  const bodies = [{ mass: 2, v: 5 }, { mass: 2, v: -5 }];
  close(systemMomentum1D(bodies), 0);
  // Zero is a perfectly good value to conserve.
  close(centreOfMassVelocity1D(bodies), 0);
  assert.equal(totalMass(bodies), 4);

  const planar = [{ mass: 1, vel: vec(3, 0) }, { mass: 1, vel: vec(-3, 4) }];
  assert.deepEqual(systemMomentum(planar), { x: 0, y: 4 });
});

test('the centre of mass carries straight on through any collision', () => {
  const before = [{ mass: 1, v: 10 }, { mass: 3, v: -2 }];
  close(centreOfMassVelocity1D(before), (10 - 6) / 4);
  assert.equal(centreOfMassVelocity1D([]), 0);
  assert.deepEqual(centreOfMassVelocity([]), { x: 0, y: 0 });
});

test('impulse equals the change in momentum', () => {
  const j = impulse(vec(20, 0), 0.5);
  assert.deepEqual(j, { x: 10, y: 0 });
  // A 10 kg·m/s impulse on a 4 kg mass changes its velocity by 2.5 m/s.
  assert.deepEqual(velocityChangeFrom(j, 4), { x: 2.5, y: 0 });
  assert.deepEqual(velocityChangeFrom(j, 0), { x: 0, y: 0 });
});

test('stopping force is why crumple zones exist', () => {
  // The change in momentum is fixed by the crash; only the time is negotiable.
  const hard = stoppingForce(1200, 14, 0.05);
  const soft = stoppingForce(1200, 14, 0.5);
  close(hard / soft, 10, 1e-9);
  close(soft, (1200 * 14) / 0.5, 1e-9);
  assert.equal(stoppingForce(1200, 14, 0), Infinity);
});

test('the relativistic correction is quantified, not waved away', () => {
  const everyday = relativisticCorrection(100);
  assert.ok(everyday.relativeError < 1e-12, 'at 100 m/s p = mv is right to a part in 10¹³');
  assert.ok(everyday.gamma > 1);

  const fast = relativisticCorrection(0.9 * 299792458);
  assert.ok(fast.relativeError > 1.2, 'at 0.9c the true momentum is more than twice mv');
  assert.equal(relativisticCorrection(299792458).gamma, Infinity);
});

test('the audit reports conservation against the scale of the momenta present', () => {
  const before = [{ mass: 1, v: 10 }, { mass: 3, v: 0 }];
  const after = [{ mass: 1, v: -5 }, { mass: 3, v: 5 }];
  const a = momentumAudit(before, after);
  close(a.before, 10);
  close(a.after, 10);
  assert.equal(a.conserved, true);

  // A head-on pair totalling zero must not be declared "conserved" trivially:
  // the tolerance is relative to the momenta actually present, not to zero.
  const head = momentumAudit(
    [{ mass: 2, v: 5 }, { mass: 2, v: -5 }],
    [{ mass: 2, v: 5.5 }, { mass: 2, v: -5 }],
  );
  assert.equal(head.conserved, false);
  close(head.change, 1);
  close(head.scale, 11);
});

test('breakdown gives one row per body, which is what the arrows are drawn from', () => {
  const rows = breakdown([{ id: 'a', mass: 2, v: 3 }, { id: 'b', mass: 1, v: -4 }]);
  assert.deepEqual(rows.map((r) => r.momentum), [6, -4]);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b']);
});
