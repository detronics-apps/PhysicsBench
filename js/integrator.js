/**
 * Numerical integration of an ordinary differential equation. Pure.
 *
 * The state is a plain array of numbers and `deriv(t, y)` returns its rate of
 * change. That is deliberately anonymous: the same function advances a falling
 * ball, a pendulum angle and a double pendulum's four coordinates, and none of
 * them need to know how the stepping works.
 *
 * Fourth-order Runge–Kutta is the default because it is the cheapest scheme
 * that is *exact* for constant acceleration. That matters more here than in a
 * game: an app that teaches v = u + at must not then show a velocity that
 * drifts off the value that equation predicts. With RK4 the simulated free fall
 * and the textbook formula agree to the last digit, so when they disagree
 * elsewhere — the moment drag is switched on — the learner can trust that the
 * difference is physics and not arithmetic.
 */

/** The order of the default scheme: halving dt cuts the error ~16-fold. */
export const ORDER = 4;

/**
 * One classical fourth-order Runge–Kutta step.
 *
 * @param {number[]} y      current state
 * @param {number} t        current time
 * @param {number} dt       step size
 * @param {(t:number, y:number[]) => number[]} deriv
 * @returns {number[]} the state at t + dt
 */
export function rk4(y, t, dt, deriv) {
  const n = y.length;
  const k1 = deriv(t, y);
  const k2 = deriv(t + dt / 2, addScaled(y, k1, dt / 2, n));
  const k3 = deriv(t + dt / 2, addScaled(y, k2, dt / 2, n));
  const k4 = deriv(t + dt, addScaled(y, k3, dt, n));

  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = y[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  return out;
}

/**
 * Semi-implicit (symplectic) Euler, for the contact-heavy scenes.
 *
 * Kept because it is what a collision solver wants: it is only first order, but
 * it does not pump energy into a system the way plain Euler does, and it takes
 * one derivative evaluation instead of four — which matters when the derivative
 * has to be re-evaluated after every contact resolution anyway. The state must
 * be laid out as [.. positions .., .. velocities ..] in matching order.
 */
export function semiImplicitEuler(y, t, dt, deriv) {
  const n = y.length;
  const half = n / 2;
  if (!Number.isInteger(half)) {
    throw new Error('semiImplicitEuler: state must be positions followed by an equal number of velocities');
  }
  const d = deriv(t, y);
  const out = y.slice();
  // Velocities first, then advance positions using the *new* velocities. That
  // ordering is the whole trick, and reversing it is plain Euler.
  for (let i = half; i < n; i += 1) out[i] = y[i] + dt * d[i];
  for (let i = 0; i < half; i += 1) out[i] = y[i] + dt * out[i + half];
  return out;
}

function addScaled(y, k, factor, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) out[i] = y[i] + factor * k[i];
  return out;
}

/**
 * Advance by `steps` steps of `dt`, returning the final state.
 * The caller keeps the time; nothing is stored here.
 */
export function integrate(y, t0, dt, steps, deriv, step = rk4) {
  let state = y;
  let t = t0;
  for (let i = 0; i < steps; i += 1) {
    state = step(state, t, dt, deriv);
    t += dt;
  }
  return { y: state, t };
}

/**
 * Split a frame's worth of time into steps no longer than `maxStep`.
 *
 * A browser frame is about 16.7 ms, and at 10× fast-forward it stands for
 * 167 ms of simulated time. Integrating that in one go is what makes a
 * simulation visibly wrong — a fast-moving ball tunnels straight through the
 * floor. Substepping keeps the physics honest regardless of playback speed,
 * and the cap stops a stalled tab from trying to catch up on a minute of
 * simulation in a single frame.
 */
export function substeps(dt, maxStep = 0.002, maxCount = 240) {
  if (!(dt > 0)) return { count: 0, dt: 0, clipped: false };
  const wanted = Math.ceil(dt / maxStep);
  const count = Math.min(wanted, maxCount);
  return { count, dt: dt / count, clipped: count < wanted };
}

/**
 * The classic sanity check, exposed so the app can show its own working: run
 * the same problem at two step sizes and report how much the answer moved.
 * For a fourth-order scheme, halving dt should shrink the difference ~16×.
 */
export function convergence(y, t0, dt, steps, deriv, step = rk4) {
  const coarse = integrate(y, t0, dt, steps, deriv, step).y;
  const fine = integrate(y, t0, dt / 2, steps * 2, deriv, step).y;
  let worst = 0;
  for (let i = 0; i < coarse.length; i += 1) {
    worst = Math.max(worst, Math.abs(coarse[i] - fine[i]));
  }
  return { coarse, fine, difference: worst };
}
