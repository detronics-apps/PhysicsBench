import test from 'node:test';
import assert from 'node:assert/strict';

import { G_STANDARD } from '../js/constants.js';
import {
  torque, angularAcceleration, angularMomentum, rotationalEnergy,
  omegaAt, angleAt, rollingSpeed, rollingOmega, radsToRpm, rpmToRads,
  SHAPES, shapeById, inertiaOf, parallelAxis,
  rollingAcceleration, rollingRace, minimumRollingFriction, rollingEnergy, spinChange,
} from '../js/rotation.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const g = G_STANDARD;

test('torque is force times distance times how squarely it is applied', () => {
  close(torque(0.3, 100), 30);
  close(torque(0.3, 100, 30), 15);
  // Pushing straight along the spanner does nothing at all.
  close(torque(0.3, 100, 0), 0, 1e-12);
  // Twice the spanner, twice the torque, for the same push.
  close(torque(0.6, 100) / torque(0.3, 100), 2, 1e-12);
});

test('τ = Iα is the twin of F = ma', () => {
  close(angularAcceleration(30, 1.5), 20);
  assert.equal(angularAcceleration(30, 0), Infinity);
  close(angularMomentum(1.5, 20), 30);
  close(rotationalEnergy(1.5, 20), 300);
});

test('angular kinematics mirror the linear ones exactly', () => {
  close(omegaAt(2, 3, 4), 14);
  close(angleAt(0, 2, 3, 4), 2 * 4 + 0.5 * 3 * 16);
});

test('rolling without slipping ties v to ω through r', () => {
  close(rollingSpeed(20, 0.35), 7);
  close(rollingOmega(7, 0.35), 20);
  assert.equal(rollingOmega(7, 0), Infinity);
  close(radsToRpm(rpmToRads(1500)), 1500, 1e-9);
  close(radsToRpm(2 * Math.PI), 60, 1e-9);
});

test('moment of inertia depends on where the mass is, not just how much', () => {
  // The same 2 kg at the same 0.5 m gives four different answers.
  const values = ['hoop', 'solid-disc', 'solid-sphere', 'hollow-sphere']
    .map((id) => inertiaOf(id, 2, 0.5));
  assert.equal(new Set(values).size, 4);
  close(inertiaOf('hoop', 2, 0.5), 0.5);
  close(inertiaOf('solid-disc', 2, 0.5), 0.25);
  close(inertiaOf('solid-sphere', 2, 0.5), 0.2);

  // And it goes as r², not r: twice the radius is four times the inertia.
  close(inertiaOf('solid-disc', 2, 1) / inertiaOf('solid-disc', 2, 0.5), 4, 1e-12);
});

test('every shape carries the k that decides the rolling race', () => {
  for (const s of SHAPES) {
    assert.ok(s.k > 0 && s.k <= 1, `${s.id}: k out of range`);
    // k is exactly the coefficient in I = k·m·r²; check it against the formula.
    close(s.inertia(3, 0.4), s.k * 3 * 0.16, 1e-12);
  }
  assert.equal(shapeById('nonsense').id, 'solid-disc');
});

test('the parallel axis theorem explains the rod-about-its-end value', () => {
  const m = 4;
  const L = 1.2;
  const aboutCentre = inertiaOf('rod-centre', m, L);
  const aboutEnd = inertiaOf('rod-end', m, L);
  close(parallelAxis(aboutCentre, m, L / 2), aboutEnd, 1e-12);
  // Four times as hard to swing about the end as about the middle.
  close(aboutEnd / aboutCentre, 4, 1e-12);
});

test('the rolling race is decided by shape alone', () => {
  const race = rollingRace(20, g);
  assert.deepEqual(race.map((r) => r.shape.id), ['solid-sphere', 'solid-disc', 'hoop']);

  // Neither mass nor radius appears in the acceleration — only k.
  const a = rollingAcceleration('solid-disc', 20, g);
  close(a.acceleration, (g * Math.sin((20 * Math.PI) / 180)) / 1.5, 1e-12);
  // And every rolling object is slower than the same object sliding.
  assert.ok(a.acceleration < a.slidingAcceleration);
  close(a.fraction, 2 / 3, 1e-12);
  assert.match(a.note, /67% /);
});

test('a hoop loses because it puts half its energy into spinning', () => {
  const hoop = rollingEnergy('hoop', 5, 0.3, 4);
  close(hoop.spinFraction, 0.5, 1e-12);
  close(hoop.translational, hoop.rotational, 1e-12);

  const sphere = rollingEnergy('solid-sphere', 5, 0.3, 4);
  close(sphere.spinFraction, 2 / 7, 1e-12);
  assert.ok(sphere.spinFraction < hoop.spinFraction);

  // Same speed, same mass: the hoop is carrying more total energy.
  assert.ok(hoop.total > sphere.total);
  close(hoop.omega, 4 / 0.3, 1e-12);
});

test('below a minimum friction the object slides and the analysis stops applying', () => {
  const needed = minimumRollingFriction('solid-disc', 30);
  close(needed, (1 / 3) * Math.tan(Math.PI / 6), 1e-12);
  // A hoop needs more grip than a sphere on the same slope.
  assert.ok(minimumRollingFriction('hoop', 30) > minimumRollingFriction('solid-sphere', 30));
  // A level surface needs none.
  close(minimumRollingFriction('hoop', 0), 0, 1e-12);
});

test('pulling your arms in speeds up the spin and takes work', () => {
  const r = spinChange(4, 2, 1);
  close(r.angularMomentum, 8);
  close(r.omegaAfter, 8);
  close(r.energyBefore, 8);
  close(r.energyAfter, 32);
  close(r.workDone, 24);
  // The energy did not appear from nowhere, and the note says where it came from.
  assert.match(r.note, /work was\s+done/);

  const out = spinChange(1, 8, 4);
  close(out.omegaAfter, 2);
  assert.ok(out.workDone < 0);
  assert.equal(spinChange(4, 2, 0).omegaAfter, Infinity);
});
