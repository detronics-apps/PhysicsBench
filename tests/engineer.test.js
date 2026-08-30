import test from 'node:test';
import assert from 'node:assert/strict';

import { G_STANDARD } from '../js/constants.js';
import {
  motorTorqueAt, motorPowerAt, peakPower, wheelForce, roadSpeed, motorRpmFor,
  tractionLimit, slopeResistance, rollingResistance, analyse, topSpeed,
  maxClimbableSlope, MACHINES, machineById, machineResult,
} from '../js/engineer.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const MOTOR = { stallTorque: 0.5, freeRpm: 15000 };

const ROBOT = {
  mass: 5, stallTorque: 0.5, freeRpm: 15000, motors: 2, gearRatio: 20,
  wheelRadius: 0.05, efficiency: 0.85, mu: 0.9, drivenFraction: 1,
  crr: 0.015, slopeDeg: 20, g: G_STANDARD,
};

test('motor torque falls linearly from stall to free speed', () => {
  close(motorTorqueAt(0, MOTOR), 0.5);
  close(motorTorqueAt(7500, MOTOR), 0.25);
  close(motorTorqueAt(15000, MOTOR), 0);
  // Beyond free speed it does not go negative — it simply has nothing left.
  close(motorTorqueAt(20000, MOTOR), 0);
  // Direction does not matter to the magnitude.
  close(motorTorqueAt(-7500, MOTOR), 0.25);
});

test('peak power is at half the free speed', () => {
  const peak = peakPower(MOTOR);
  close(peak.rpm, 7500);
  close(peak.torque, 0.25);
  // Nothing else beats it.
  for (const rpm of [1000, 5000, 7500, 9000, 14000]) {
    assert.ok(motorPowerAt(rpm, MOTOR) <= peak.power + 1e-9, `${rpm} rpm beat the peak`);
  }
  close(peak.power, 0.25 * ((7500 * 2 * Math.PI) / 60), 1e-9);
});

test('gearing multiplies force and divides speed by the same factor', () => {
  const base = { motorTorque: 0.5, efficiency: 1, wheelRadius: 0.05, motors: 1 };
  close(wheelForce({ ...base, gearRatio: 20 }) / wheelForce({ ...base, gearRatio: 10 }), 2, 1e-9);

  const speedBase = { motorRpm: 10000, wheelRadius: 0.05 };
  close(roadSpeed({ ...speedBase, gearRatio: 10 }) / roadSpeed({ ...speedBase, gearRatio: 20 }), 2, 1e-9);

  // So the product — the power reaching the ground — is unchanged. A gearbox
  // moves power around; it never creates any.
  const p10 = wheelForce({ ...base, gearRatio: 10 }) * roadSpeed({ ...speedBase, gearRatio: 10 });
  const p20 = wheelForce({ ...base, gearRatio: 20 }) * roadSpeed({ ...speedBase, gearRatio: 20 });
  close(p10, p20, 1e-9);
});

test('a bigger wheel goes faster and pushes less hard', () => {
  const small = wheelForce({ motorTorque: 0.5, gearRatio: 20, efficiency: 1, wheelRadius: 0.05 });
  const big = wheelForce({ motorTorque: 0.5, gearRatio: 20, efficiency: 1, wheelRadius: 0.1 });
  close(small / big, 2, 1e-9);
  close(roadSpeed({ motorRpm: 5000, gearRatio: 20, wheelRadius: 0.1 })
    / roadSpeed({ motorRpm: 5000, gearRatio: 20, wheelRadius: 0.05 }), 2, 1e-9);
  assert.equal(wheelForce({ motorTorque: 1, gearRatio: 1, efficiency: 1, wheelRadius: 0 }), 0);
});

test('road speed and motor speed are inverses', () => {
  const speed = roadSpeed({ motorRpm: 12000, gearRatio: 25, wheelRadius: 0.04 });
  close(motorRpmFor({ speed, gearRatio: 25, wheelRadius: 0.04 }), 12000, 1e-6);
});

test('efficiency and extra motors scale the force directly', () => {
  const one = wheelForce({ motorTorque: 0.5, gearRatio: 20, efficiency: 1, wheelRadius: 0.05, motors: 1 });
  close(wheelForce({ motorTorque: 0.5, gearRatio: 20, efficiency: 1, wheelRadius: 0.05, motors: 2 }), one * 2, 1e-9);
  close(wheelForce({ motorTorque: 0.5, gearRatio: 20, efficiency: 0.5, wheelRadius: 0.05, motors: 1 }), one / 2, 1e-9);
});

test('the ground only pushes back as hard as friction allows', () => {
  const flat = tractionLimit({ mass: 5, mu: 0.9, slopeDeg: 0 });
  close(flat, 0.9 * 5 * G_STANDARD, 1e-9);
  // On a slope less weight presses into the surface, so there is less grip.
  assert.ok(tractionLimit({ mass: 5, mu: 0.9, slopeDeg: 30 }) < flat);
  // And only the weight on the driven wheels counts.
  close(tractionLimit({ mass: 5, mu: 0.9, drivenFraction: 0.5 }), flat / 2, 1e-9);
});

test('slope and rolling resistance behave as expected', () => {
  close(slopeResistance({ mass: 5, slopeDeg: 30 }), 5 * G_STANDARD * 0.5, 1e-9);
  close(slopeResistance({ mass: 5, slopeDeg: 0 }), 0, 1e-12);
  close(rollingResistance({ mass: 5, crr: 0.02, slopeDeg: 0 }), 0.02 * 5 * G_STANDARD, 1e-9);
  // Rolling resistance is much smaller than the grip available.
  assert.ok(rollingResistance({ mass: 5, crr: 0.015 }) < tractionLimit({ mass: 5, mu: 0.9 }) / 10);
});

test('analyse names which of the three limits is binding', () => {
  // Lightly geared and grippy: the drivetrain runs out before the ground does.
  const motorBound = analyse({ ...ROBOT, gearRatio: 2, mu: 1.2 });
  assert.equal(motorBound.limitedBy, 'motor');
  assert.match(motorBound.advice, /taller gear ratio|does not climb/i);

  // Massively geared on ice: the ground runs out first, and more gearing is
  // wasted — which the advice has to say rather than just reporting a number.
  const gripBound = analyse({ ...ROBOT, gearRatio: 400, mu: 0.05 });
  assert.equal(gripBound.limitedBy, 'traction');
  assert.match(gripBound.advice, /grip|ground will only accept/i);
});

test('analyse reports every force, not just the verdict', () => {
  const r = analyse(ROBOT);
  for (const key of ['stallForce', 'grip', 'gravityDrag', 'rolling', 'usableForce', 'netForce', 'acceleration']) {
    assert.ok(Number.isFinite(r[key]), `${key} missing`);
  }
  close(r.usableForce, Math.min(r.stallForce, r.grip), 1e-9);
  close(r.netForce, r.usableForce - r.gravityDrag - r.rolling, 1e-9);
  close(r.acceleration, r.netForce / ROBOT.mass, 1e-9);
  assert.equal(r.climbs, r.netForce > 0);
});

test('a robot that cannot climb is told what to change', () => {
  const stuck = analyse({ ...ROBOT, gearRatio: 1, slopeDeg: 45 });
  assert.equal(stuck.climbs, false);
  assert.ok(stuck.netForce < 0);
  assert.match(stuck.advice, /does not climb/);
  // The steepest it *could* manage is well short of the 45° being asked of it.
  assert.ok(stuck.maxSlopeDeg > 0 && stuck.maxSlopeDeg < 45, `${stuck.maxSlopeDeg}`);
});

test('top speed is where the falling torque curve meets the resistances', () => {
  const level = topSpeed({ ...ROBOT, slopeDeg: 0 });
  assert.ok(level.speed > 0);
  assert.ok(level.rpm > 0 && level.rpm <= ROBOT.freeRpm);

  // A steeper hill means a lower top speed.
  assert.ok(topSpeed({ ...ROBOT, slopeDeg: 15 }).speed < level.speed);

  // Too steep to move at all: nought.
  const stalled = topSpeed({ ...ROBOT, gearRatio: 1, slopeDeg: 60 });
  assert.equal(stalled.stalled, true);
  assert.equal(stalled.speed, 0);

  // Frictionless and level: nothing to resist it, so it reaches free speed.
  const free = topSpeed({ ...ROBOT, slopeDeg: 0, crr: 0 });
  assert.equal(free.unlimited, true);
  close(free.rpm, ROBOT.freeRpm, 1e-9);
});

test('the maximum climbable slope is consistent with the climb verdict', () => {
  const max = maxClimbableSlope(ROBOT);
  assert.ok(max > 0 && max < 90);
  assert.equal(analyse({ ...ROBOT, slopeDeg: max - 1 }).climbs, true);
  assert.equal(analyse({ ...ROBOT, slopeDeg: max + 1 }).climbs, false);
});

test('every machine states its ratio and its cost', () => {
  assert.ok(MACHINES.length >= 5);
  for (const m of MACHINES) {
    assert.ok(m.id && m.label && m.formula, `${m.id} incomplete`);
    assert.ok(m.note.length > 20, `${m.id} needs a note`);
    assert.equal(typeof m.ratio, 'function');
  }
  assert.equal(machineById('nope').id, 'lever');
});

test('mechanical advantage is exactly matched by a loss of distance', () => {
  const lever = machineResult('lever', { effortArm: 1, loadArm: 0.25 }, { inputForce: 100 });
  close(lever.ratio, 4);
  close(lever.idealOutput, 400);
  // Four times the force, a quarter of the distance. Work in equals work out.
  close(lever.distanceRatio, 0.25, 1e-12);
  close(lever.idealOutput * lever.distanceRatio, 100, 1e-9);

  close(machineResult('pulley', { supportingRopes: 4 }).ratio, 4);
  close(machineResult('ramp', { slopeDeg: 30 }).ratio, 2, 1e-9);
  close(machineResult('gear', { teethIn: 12, teethOut: 60 }).ratio, 5);
  close(machineResult('wheel-axle', { wheelRadius: 0.1, axleRadius: 0.02 }).ratio, 5);
});

test('a real machine gives back less, and says where the rest went', () => {
  const real = machineResult('lever', { effortArm: 1, loadArm: 0.25 }, { inputForce: 100, efficiency: 0.8 });
  close(real.actualOutput, 320);
  close(real.lostToFriction, 80);
  assert.ok(real.note.length > 20);

  // Degenerate inputs give infinity rather than a wrong finite number.
  assert.equal(machineResult('lever', { effortArm: 1, loadArm: 0 }).ratio, Infinity);
  assert.equal(machineResult('ramp', { slopeDeg: 0 }).ratio, Infinity);
});
