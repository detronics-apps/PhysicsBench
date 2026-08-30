import test from 'node:test';
import assert from 'node:assert/strict';

import { rk4, semiImplicitEuler, integrate, substeps, convergence, ORDER } from '../js/integrator.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

/** Free fall: y = [position, velocity], constant acceleration −g. */
const freeFall = (g) => (t, y) => [y[1], -g];

test('RK4 is exact for constant acceleration', () => {
  // This is the property the teaching depends on: the simulation and the
  // textbook formula v = u + at must agree to the last digit, so that any
  // later disagreement is physics rather than arithmetic.
  const g = 9.80665;
  const u = 12;
  const { y, t } = integrate([0, u], 0, 0.01, 300, freeFall(g));

  close(t, 3, 1e-9);
  close(y[1], u - g * 3, 1e-12);                       // v = u + at
  close(y[0], u * 3 - 0.5 * g * 9, 1e-10);             // s = ut + ½at²
});

test('RK4 recovers a known analytic solution of a nonlinear problem', () => {
  // Simple harmonic motion: x'' = −ω²x, so x(t) = cos(ωt) from x=1, v=0.
  const omega = 3;
  const shm = (t, y) => [y[1], -omega * omega * y[0]];
  const { y } = integrate([1, 0], 0, 0.001, 2000, shm);
  close(y[0], Math.cos(omega * 2), 1e-9);
  close(y[1], -omega * Math.sin(omega * 2), 1e-8);
});

test('RK4 converges at fourth order', () => {
  assert.equal(ORDER, 4);
  const pendulum = (t, y) => [y[1], -9.80665 * Math.sin(y[0])];
  const a = convergence([1.2, 0], 0, 0.02, 100, pendulum).difference;
  const b = convergence([1.2, 0], 0, 0.01, 200, pendulum).difference;
  // Halving the step should shrink the error by roughly 2⁴ = 16.
  assert.ok(a / b > 8, `expected ~16× improvement, got ${a / b}`);
});

test('semi-implicit Euler does not pump energy into an oscillator', () => {
  const omega = 2;
  const shm = (t, y) => [y[1], -omega * omega * y[0]];
  const energy = (y) => 0.5 * y[1] ** 2 + 0.5 * omega ** 2 * y[0] ** 2;

  const start = [1, 0];
  const { y } = integrate(start, 0, 0.001, 20000, shm, semiImplicitEuler);
  // Plain Euler would have grown this without limit over 20 000 steps.
  close(energy(y) / energy(start), 1, 0.001);
});

test('semi-implicit Euler updates velocity before position', () => {
  // One step of free fall from rest: v becomes −g·dt, and the position uses
  // that new velocity, giving −g·dt². Plain Euler would leave position at 0.
  const g = 10;
  const y = semiImplicitEuler([0, 0], 0, 0.1, freeFall(g));
  close(y[1], -1, 1e-12);
  close(y[0], -0.1, 1e-12);
});

test('semi-implicit Euler refuses a state it cannot interpret', () => {
  assert.throws(() => semiImplicitEuler([1, 2, 3], 0, 0.1, () => [0, 0, 0]), /positions followed by/);
});

test('one rk4 call does not mutate the state it was given', () => {
  const y = [0, 5];
  const next = rk4(y, 0, 0.1, freeFall(9.81));
  assert.deepEqual(y, [0, 5]);
  assert.notEqual(next, y);
});

test('substeps keep the step small however fast the playback', () => {
  // A frame at 10× speed is 167 ms of simulated time. Integrating that in one
  // go is what lets a fast ball pass straight through the floor.
  const a = substeps(0.167, 0.002);
  assert.ok(a.dt <= 0.002 + 1e-12);
  close(a.count * a.dt, 0.167, 1e-12);
  assert.equal(a.clipped, false);

  // A stalled tab must not try to catch up on a minute of simulation at once.
  const b = substeps(60, 0.002, 240);
  assert.equal(b.count, 240);
  assert.equal(b.clipped, true);

  assert.deepEqual(substeps(0), { count: 0, dt: 0, clipped: false });
  assert.deepEqual(substeps(-1), { count: 0, dt: 0, clipped: false });
});

test('convergence reports how far the answer moved', () => {
  const drag = (t, y) => [y[1], -9.81 - 0.5 * y[1] * Math.abs(y[1])];
  const result = convergence([0, 0], 0, 0.01, 200, drag);
  assert.equal(result.coarse.length, 2);
  assert.ok(result.difference >= 0);
  assert.ok(result.difference < 1e-6, 'RK4 at 10 ms should already be far below display precision');
});
