import test from 'node:test';
import assert from 'node:assert/strict';

import { vec } from '../js/vec.js';
import { G, G_STANDARD, EARTH_MASS, EARTH_MEAN_RADIUS } from '../js/constants.js';
import {
  kinetic, kineticFromVec, rotationalKinetic, gravitationalPE, gravitationalPEExact,
  springPE, work, power, speedFromKE, heightFromSpeed, speedFromHeight,
  audit, conservation, workEnergy, liftWork,
} from '../js/energy.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('kinetic energy goes as the square of speed', () => {
  close(kinetic(2, 3), 9);
  close(kinetic(2, 6) / kinetic(2, 3), 4, 1e-12);
  // Direction does not matter: energy is a scalar.
  close(kinetic(2, -3), kinetic(2, 3));
  close(kineticFromVec(2, vec(3, 4)), 25);
});

test('kinetic energy has no direction, momentum does', () => {
  // Two bodies moving oppositely: momenta cancel, energies add.
  const a = { m: 2, v: 5 };
  const b = { m: 2, v: -5 };
  close(a.m * a.v + b.m * b.v, 0);
  close(kinetic(a.m, a.v) + kinetic(b.m, b.v), 50);
});

test('potential energy is measured from a datum of your choosing', () => {
  close(gravitationalPE(2, G_STANDARD, 10), 2 * G_STANDARD * 10);
  // Only differences matter: shifting the datum shifts both values equally.
  const withDatum = gravitationalPE(2, G_STANDARD, 10, 4) - gravitationalPE(2, G_STANDARD, 6, 4);
  const withoutDatum = gravitationalPE(2, G_STANDARD, 10) - gravitationalPE(2, G_STANDARD, 6);
  close(withDatum, withoutDatum, 1e-12);
});

test('mgh is the small-height limit of −GMm/r', () => {
  // The promise that the next lesson widens this one rather than replacing it.
  const m = 3;
  const h = 50;
  const exact = gravitationalPEExact(EARTH_MASS, m, EARTH_MEAN_RADIUS + h)
    - gravitationalPEExact(EARTH_MASS, m, EARTH_MEAN_RADIUS);
  const surfaceG = (G * EARTH_MASS) / EARTH_MEAN_RADIUS ** 2;
  const approximate = m * surfaceG * h;
  // Agreement to better than one part in ten thousand over 50 m.
  assert.ok(Math.abs(exact - approximate) / Math.abs(exact) < 1e-4);
  assert.ok(exact < 0 === false, 'moving up reduces the depth of the well, so ΔPE is positive');
  assert.equal(gravitationalPEExact(EARTH_MASS, m, 0), -Infinity);
});

test('spring energy, work and power', () => {
  close(springPE(200, 0.1), 1);
  close(springPE(200, -0.1), 1, 1e-12);
  close(work(15, 4), 60);
  close(power(60, 2), 30);
  assert.equal(power(60, 0), Infinity);
});

test('rotational energy is the twin of ½mv²', () => {
  close(rotationalKinetic(0.5, 4), 4);
  close(rotationalKinetic(0.5, 8) / rotationalKinetic(0.5, 4), 4, 1e-12);
});

test('speed and height convert both ways, and the mass cancels', () => {
  close(speedFromKE(100, 2), 10);
  assert.ok(Number.isNaN(speedFromKE(100, 0)));

  // Everything thrown up at the same speed reaches the same height.
  close(heightFromSpeed(10, G_STANDARD), 100 / (2 * G_STANDARD));
  close(speedFromHeight(heightFromSpeed(14, G_STANDARD), G_STANDARD), 14, 1e-9);
  assert.equal(heightFromSpeed(10, 0), Infinity);
  close(speedFromHeight(-5, G_STANDARD), 0);
});

test('an audit adds up the whole system and keeps the books balanced', () => {
  const bodies = [
    { id: 'a', mass: 2, vel: vec(3, 0), pos: vec(0, 5) },
    { id: 'b', mass: 1, vel: vec(0, 0), pos: vec(0, 0) },
  ];
  const a = audit(bodies, { g: G_STANDARD });
  close(a.kinetic, 9);
  close(a.potential, 2 * G_STANDARD * 5);
  close(a.mechanical, a.kinetic + a.potential);
  close(a.total, a.mechanical, 1e-12);
  assert.equal(a.perBody.length, 2);
  close(a.perBody[0].speed, 3);
});

test('energy removed by friction is relocated, not lost', () => {
  // This is the module's central promise: nothing simply shrinks.
  const start = audit([{ mass: 2, vel: vec(5, 0), pos: vec(0, 0) }], { g: G_STANDARD });
  const end = audit([{ mass: 2, vel: vec(3, 0), pos: vec(0, 0) }], { g: G_STANDARD }, { heat: 16 });

  close(start.mechanical, 25);
  close(end.mechanical, 9);
  // Mechanical energy fell by 16 J — and 16 J appears on the other side.
  close(end.total, start.total, 1e-12);
  assert.deepEqual(end.elsewhere, [{ where: 'heat', amount: 16 }]);

  const c = conservation(start, end);
  assert.equal(c.conserved, false);
  close(c.change, -16);
  assert.deepEqual(c.accountedFor, [{ where: 'heat', amount: 16 }]);
});

test('free fall converts potential energy into kinetic energy exactly', () => {
  const g = G_STANDARD;
  const top = audit([{ mass: 2, vel: vec(0, 0), pos: vec(0, 20) }], { g });
  const v = speedFromHeight(20, g);
  const bottom = audit([{ mass: 2, vel: vec(0, -v), pos: vec(0, 0) }], { g });
  const c = conservation(top, bottom);
  assert.equal(c.conserved, true);
  close(c.change, 0, 1e-9);
});

test('conservation is judged against the energies present, not against zero', () => {
  const at = (v, y) => audit([{ mass: 1, vel: vec(v, 0), pos: vec(0, y) }], { g: 0 });
  // Everything at rest at the datum: total is zero on both sides.
  assert.equal(conservation(at(0, 0), at(0, 0)).conserved, true);
  // A real change is still caught even when one side is zero.
  assert.equal(conservation(at(0, 0), at(4, 0)).conserved, false);
});

test('the work–energy theorem is v² = u² + 2as in disguise', () => {
  const m = 4;
  const u = 3;
  const a = 2;
  const s = 10;
  const v = Math.sqrt(u * u + 2 * a * s);
  // ΔKE equals the work done by the net force.
  close(workEnergy(m, u, v), work(m * a, s), 1e-9);
  close(liftWork(2, G_STANDARD, 5), gravitationalPE(2, G_STANDARD, 5));
});
