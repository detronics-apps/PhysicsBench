import test from 'node:test';
import assert from 'node:assert/strict';

import { G_STANDARD } from '../js/constants.js';
import {
  smallAnglePeriod, exactPeriod, agm, smallAngleError, lengthForPeriod,
  simpleDeriv, simulate, measurePeriod, dependencies,
  doubleDeriv, doublePositions, doubleEnergy, simulateDouble, divergence,
} from '../js/pendulum.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const deg = (d) => (d * Math.PI) / 180;
const g = G_STANDARD;

test('the small-angle period contains no mass and goes as √L', () => {
  close(smallAnglePeriod(1, g), 2 * Math.PI * Math.sqrt(1 / g));
  close(smallAnglePeriod(4, g) / smallAnglePeriod(1, g), 2, 1e-12);
  close(smallAnglePeriod(1, g * 4) / smallAnglePeriod(1, g), 0.5, 1e-12);
  // Mass is not even a parameter — the signature says so.
  assert.equal(smallAnglePeriod.length, 2);
  assert.ok(Number.isNaN(smallAnglePeriod(0, g)));
});

test('a one-second-per-swing pendulum is about 0.994 m long', () => {
  // The seconds pendulum: a real historical object, and a good sanity check.
  close(lengthForPeriod(2, g), 0.9938, 0.001);
  close(smallAnglePeriod(lengthForPeriod(2, g), g), 2, 1e-9);
});

test('the AGM converges, and the exact period agrees at tiny angles', () => {
  close(agm(1, 1), 1, 1e-15);
  // Gauss's own worked example: AGM(24, 6) = 13.4581714817…
  close(agm(24, 6), 13.4581714817, 1e-9);
  close(exactPeriod(1, g, 1e-9), smallAnglePeriod(1, g), 1e-9);
  close(exactPeriod(1, g, 0), smallAnglePeriod(1, g), 1e-12);
});

test('the exact period matches the textbook corrections', () => {
  // Known values of T/T₀: 1.00191 at 10°, 1.01741 at 30°, 1.18034 at 90°.
  close(exactPeriod(1, g, deg(10)) / smallAnglePeriod(1, g), 1.00191, 1e-5);
  close(exactPeriod(1, g, deg(30)) / smallAnglePeriod(1, g), 1.01741, 1e-5);
  close(exactPeriod(1, g, deg(90)) / smallAnglePeriod(1, g), 1.18034, 1e-5);
  close(exactPeriod(1, g, deg(179)) / smallAnglePeriod(1, g), 3.9, 0.2);
  // Balanced exactly at the top, it never comes back.
  assert.equal(exactPeriod(1, g, Math.PI), Infinity);
});

test('the small-angle error is quantified rather than asserted', () => {
  close(smallAngleError(deg(10)), 0.00191, 1e-5);
  close(smallAngleError(deg(30)), 0.01741, 1e-5);
  close(smallAngleError(deg(90)), 0.18034, 1e-5);
  close(smallAngleError(0), 0);
  // It only ever grows — the approximation is always an underestimate.
  let previous = 0;
  for (let d = 5; d <= 150; d += 5) {
    const err = smallAngleError(deg(d));
    assert.ok(err > previous, `error should grow with amplitude at ${d}°`);
    previous = err;
  }
});

test('the simulation uses sin θ, not θ — the physics is never simplified', () => {
  const d = simpleDeriv(2, g, 0);
  // At 90° the restoring term is −g/L exactly; the linear model would agree
  // only by coincidence, and at 150° they differ by a factor of three.
  close(d(0, [Math.PI / 2, 0])[1], -g / 2, 1e-12);
  const at150 = d(0, [deg(150), 0])[1];
  const linearWouldBe = -(g / 2) * deg(150);
  assert.ok(Math.abs(at150) < Math.abs(linearWouldBe) * 0.5);
});

test('the measured period matches the exact formula, not the approximation', () => {
  // The stopwatch reads what the pendulum actually does. At 60° that is
  // measurably longer than 2π√(L/g), and the app must not pretend otherwise.
  const r = simulate({ length: 1, g, mass: 2, angleRad: deg(60) }, { duration: 12, dt: 0.0002 });
  assert.ok(r.measuredPeriod, 'a period should be measurable over 12 seconds');
  close(r.measuredPeriod.period, r.exactPeriod, 2e-3);
  assert.ok(Math.abs(r.measuredPeriod.period - r.smallAnglePeriod) > 0.05,
    'at 60° the small-angle formula should be visibly wrong');
});

test('changing the mass changes nothing about the period', () => {
  const run = (mass) => simulate({ length: 1.5, g, mass, angleRad: deg(25) }, { duration: 10, dt: 0.0005 });
  const light = run(0.2);
  const heavy = run(20);
  close(light.measuredPeriod.period, heavy.measuredPeriod.period, 1e-6);
  // The energies do differ — by exactly the mass ratio.
  close(heavy.samples[0].potential / light.samples[0].potential, 100, 1e-9);
});

test('a swinging pendulum conserves energy when nothing damps it', () => {
  const r = simulate({ length: 1, g, mass: 1, angleRad: deg(80) }, { duration: 20, dt: 0.0002 });
  const start = r.samples[0].energy;
  for (const s of r.samples) close(s.energy, start, 1e-6);
  // And it swaps between the two forms: all potential at the ends, all
  // kinetic at the bottom.
  const lowest = r.samples.reduce((best, s) => (Math.abs(s.theta) < Math.abs(best.theta) ? s : best));
  assert.ok(lowest.kinetic > lowest.potential * 100);
});

test('damping removes energy and shrinks the swing', () => {
  const r = simulate({ length: 1, g, mass: 1, angleRad: deg(60), damping: 0.4 }, { duration: 15, dt: 0.0005 });
  assert.equal(r.damped, true);
  const first = r.samples[0].energy;
  const last = r.samples[r.samples.length - 1].energy;
  assert.ok(last < first * 0.1, 'a damped pendulum should have nearly stopped');
});

test('measurePeriod needs enough crossings before it will answer', () => {
  assert.equal(measurePeriod([{ t: 0, theta: 0.1 }, { t: 1, theta: -0.1 }]), null);
  // A clean synthetic sine gives back its own period.
  const samples = [];
  const period = 2.5;
  for (let t = 0; t <= 12; t += 0.001) {
    samples.push({ t, theta: 0.2 * Math.sin((2 * Math.PI * t) / period) });
  }
  const m = measurePeriod(samples);
  close(m.period, period, 1e-3);
  assert.ok(m.swingsCounted >= 8);
});

test('the three pendulum experiments have the answers the lab expects', () => {
  const d = dependencies(1, g, deg(20));
  assert.equal(d.doubleMass.factor, 1);
  close(d.doubleLength.factor, Math.SQRT2, 1e-6);
  close(d.doubleGravity.factor, 1 / Math.SQRT2, 1e-6);
  // Doubling the amplitude does change the period, slightly — the effect the
  // small-angle formula claims does not exist.
  assert.ok(d.doubleAmplitude.factor > 1.005 && d.doubleAmplitude.factor < 1.05);
  assert.match(d.doubleAmplitude.note, /approximation breaking down/);
});

/* ------------------------------------------------------ double pendulum -- */

const DOUBLE = { l1: 1, l2: 1, m1: 1, m2: 1, g, theta1: deg(120), theta2: deg(60) };

test('the double pendulum bobs are where the geometry says', () => {
  const { p1, p2 } = doublePositions({ l1: 2, l2: 1 }, [0, 0]);
  close(p1.x, 0);
  close(p1.y, -2);
  close(p2.y, -3);
  const { p1: side } = doublePositions({ l1: 2, l2: 1 }, [Math.PI / 2, 0]);
  close(side.x, 2, 1e-12);
  close(side.y, 0, 1e-12);
});

test('the double pendulum conserves energy over a long chaotic run', () => {
  // The equations are exact; any drift here is the integrator, and it must be
  // far below anything visible.
  const r = simulateDouble(DOUBLE, { duration: 30, dt: 0.0002 });
  assert.ok(Math.abs(r.energyDrift / r.startEnergy) < 1e-6,
    `energy drifted by ${r.energyDrift} from ${r.startEnergy}`);
});

test('hanging straight down with no speed, the double pendulum stays put', () => {
  const rest = doubleDeriv({ l1: 1, l2: 1, m1: 1, m2: 1, g })(0, [0, 0, 0, 0]);
  close(rest[2], 0, 1e-12);
  close(rest[3], 0, 1e-12);
  const e = doubleEnergy({ l1: 1, l2: 1, m1: 1, m2: 1, g }, [0, 0, 0, 0]);
  close(e.kinetic, 0);
  close(e.total, -3 * g, 1e-9);
});

test('a thousandth of a degree changes everything, eventually', () => {
  // The honest statement of chaos: nothing is random, both runs are correct,
  // and the difference between them grows until prediction becomes useless.
  const r = divergence(DOUBLE, deg(0.001), { duration: 25, dt: 0.0005, samples: 500 });
  assert.ok(r.gaps[0].gap < 1e-4, 'they start together');
  assert.ok(r.finalGap > 0.5, `they should have separated completely, gap was ${r.finalGap}`);
  assert.ok(r.separatedAt !== null && r.separatedAt < 25);
  assert.ok(r.separatedAt > 1, 'and it should take a few seconds, not be instant');
});

test('a single pendulum given the same nudge does not diverge', () => {
  // The contrast that makes the double pendulum mean something.
  const a = simulate({ length: 1, g, mass: 1, angleRad: deg(30) }, { duration: 25, dt: 0.0005 });
  const b = simulate({ length: 1, g, mass: 1, angleRad: deg(30) + deg(0.001) }, { duration: 25, dt: 0.0005 });
  const last = Math.min(a.samples.length, b.samples.length) - 1;
  assert.ok(Math.abs(a.samples[last].theta - b.samples[last].theta) < deg(0.01),
    'a simple pendulum stays predictable indefinitely');
});
