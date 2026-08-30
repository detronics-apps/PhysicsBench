/**
 * Pendulums, simple and double. Pure.
 *
 * The simple pendulum is the app's cleanest example of an approximation being
 * watched as it breaks. T = 2π√(L/g) is derived by replacing sin θ with θ, and
 * that replacement is excellent below about 10° and visibly wrong at 90°. So
 * this module computes *both*: the small-angle formula and the exact period,
 * the latter from the arithmetic–geometric mean, which converges in a handful
 * of iterations and is accurate to machine precision. A learner can then set
 * the angle and watch the two numbers separate.
 *
 * The other thing the module is built to show is what mass does, which is
 * nothing. Mass appears nowhere in either period formula, for exactly the same
 * reason it appears nowhere in free fall: a heavier bob is pulled harder and
 * resists acceleration more, by the same factor.
 *
 * The double pendulum is here because it is the honest answer to "so physics
 * lets you predict everything?". It obeys the same laws, the equations are
 * exact, and its behaviour is still unpredictable in practice, because two
 * starting angles a thousandth of a degree apart diverge completely within a
 * few seconds.
 */

import { vec } from './vec.js';
import { rk4 } from './integrator.js';

/** T = 2π√(L/g) — the small-angle result. Mass is absent, and stays absent. */
export function smallAnglePeriod(length, g) {
  if (!(length > 0) || !(g > 0)) return NaN;
  return 2 * Math.PI * Math.sqrt(length / g);
}

/**
 * The exact period of a simple pendulum, for any amplitude below 180°.
 *
 *   T = 2π√(L/g) / AGM(1, cos(θ₀/2))
 *
 * where AGM is the arithmetic–geometric mean. This is the closed form of the
 * complete elliptic integral that the exact equation of motion produces, and it
 * converges quadratically — six iterations is already machine precision.
 */
export function exactPeriod(length, g, amplitudeRad) {
  if (!(length > 0) || !(g > 0)) return NaN;
  const theta = Math.abs(amplitudeRad);
  if (theta < 1e-12) return smallAnglePeriod(length, g);
  if (theta >= Math.PI) return Infinity;   // balanced exactly at the top: never returns
  return smallAnglePeriod(length, g) / agm(1, Math.cos(theta / 2));
}

/** Arithmetic–geometric mean. Converges quadratically. */
export function agm(a0, b0, iterations = 30) {
  let a = a0;
  let b = b0;
  for (let i = 0; i < iterations; i += 1) {
    if (Math.abs(a - b) < 1e-16 * Math.abs(a)) break;
    const nextA = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = nextA;
  }
  return (a + b) / 2;
}

/**
 * How wrong the small-angle formula is at a given amplitude, as a fraction.
 *
 * The app shows this number rather than asserting "accurate for small angles",
 * because a learner deserves to know what "small" costs. 10° → 0.19%.
 * 30° → 1.74%. 90° → 18.0%.
 */
export function smallAngleError(amplitudeRad) {
  const theta = Math.abs(amplitudeRad);
  if (theta < 1e-12) return 0;
  if (theta >= Math.PI) return Infinity;
  return 1 / agm(1, Math.cos(theta / 2)) - 1;
}

/** The length a pendulum needs for a given period — the clock-maker's question. */
export const lengthForPeriod = (period, g) => (g * period * period) / (4 * Math.PI * Math.PI);

/* --------------------------------------------------- the simple bob ----- */

/**
 * The exact equation of motion, with optional linear damping.
 *
 *   θ″ = −(g/L)·sin θ − b·θ′
 *
 * Note `sin θ`, not `θ`. The simulation always uses the exact form; only the
 * *period formula* offered alongside it is ever approximate. That separation is
 * deliberate — the underlying physics is never simplified to match a lesson.
 */
export const simpleDeriv = (length, g, damping = 0) => (t, y) => [
  y[1],
  -(g / length) * Math.sin(y[0]) - damping * y[1],
];

/**
 * Run a pendulum and record it.
 *
 * @param {object} p `{ length, g, mass, angleRad, omega, damping }`
 */
export function simulate(p, { duration = 10, dt = 0.001, samples = 600 } = {}) {
  const { length, g, mass = 1, angleRad, omega = 0, damping = 0 } = p;
  const deriv = simpleDeriv(length, g, damping);

  let state = [angleRad, omega];
  let t = 0;
  const out = [snapshot(0, state, p)];
  const stride = Math.max(1, Math.round(duration / dt / samples));
  let step = 0;

  while (t < duration - dt / 2) {
    state = rk4(state, t, dt, deriv);
    t += dt;
    step += 1;
    if (step % stride === 0) out.push(snapshot(t, state, p));
  }

  return {
    samples: out,
    smallAnglePeriod: smallAnglePeriod(length, g),
    exactPeriod: exactPeriod(length, g, Math.abs(angleRad)),
    measuredPeriod: measurePeriod(out),
    mass,
    damped: damping > 0,
  };
}

function snapshot(t, [theta, omega], p) {
  const { length, g, mass = 1 } = p;
  const kinetic = 0.5 * mass * (length * omega) ** 2;
  const potential = mass * g * length * (1 - Math.cos(theta));
  return {
    t,
    theta,
    omega,
    // Cartesian, with the pivot at the origin and +y up, as everywhere else.
    pos: vec(length * Math.sin(theta), -length * Math.cos(theta)),
    // Tangential speed; the bob moves along an arc of radius L.
    speed: Math.abs(omega) * length,
    vel: vec(length * omega * Math.cos(theta), length * omega * Math.sin(theta)),
    kinetic,
    // Height measured from the lowest point of the swing.
    potential,
    energy: kinetic + potential,
  };
}

/**
 * The stopwatch: measure the period from the recorded motion itself.
 *
 * Timing a real pendulum by watching it is exactly what a learner would do, so
 * the app does the same thing rather than printing the formula's answer and
 * calling it a measurement. Crossings of the lowest point are detected and
 * interpolated; a full period is two consecutive crossings.
 */
export function measurePeriod(samples) {
  const crossings = [];
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a.theta === 0 || (a.theta < 0) !== (b.theta < 0)) {
      const fraction = a.theta === b.theta ? 0 : a.theta / (a.theta - b.theta);
      crossings.push(a.t + (b.t - a.t) * fraction);
    }
  }
  if (crossings.length < 3) return null;

  // Two crossings make a half period; average over all of them.
  const halves = [];
  for (let i = 1; i < crossings.length; i += 1) halves.push(crossings[i] - crossings[i - 1]);
  const mean = halves.reduce((a, b) => a + b, 0) / halves.length;
  return {
    period: mean * 2,
    swingsCounted: halves.length,
    firstCrossing: crossings[0],
  };
}

/**
 * What changes the period and what does not — the three experiments the
 * Pendulum lab asks the learner to run, answered in advance for comparison.
 */
export function dependencies(length, g, amplitudeRad) {
  const base = exactPeriod(length, g, amplitudeRad);
  return {
    doubleMass: { factor: 1, note: 'No change at all. Mass does not appear in the period.' },
    doubleLength: {
      factor: exactPeriod(length * 2, g, amplitudeRad) / base,
      note: 'Longer by a factor of √2 ≈ 1.414. Period goes as the square root of '
        + 'length, so four times the length doubles the period.',
    },
    doubleGravity: {
      factor: exactPeriod(length, g * 2, amplitudeRad) / base,
      note: 'Shorter by a factor of 1/√2 ≈ 0.707. Stronger gravity means a '
        + 'stronger restoring force and a faster swing.',
    },
    doubleAmplitude: {
      factor: exactPeriod(length, g, Math.min(amplitudeRad * 2, Math.PI * 0.99)) / base,
      note: 'A small increase — and this is the one the small-angle formula '
        + 'says should be zero. It is the approximation breaking down.',
    },
  };
}

/* ------------------------------------------------------ double pendulum -- */

/**
 * The exact equations of motion for two point masses on massless rods.
 *
 * State is [θ₁, θ₂, ω₁, ω₂], with angles measured from straight down.
 */
export function doubleDeriv({ l1, l2, m1, m2, g }) {
  return (t, y) => {
    const [t1, t2, w1, w2] = y;
    const delta = t1 - t2;
    const den = 2 * m1 + m2 - m2 * Math.cos(2 * delta);

    const a1 = (-g * (2 * m1 + m2) * Math.sin(t1)
      - m2 * g * Math.sin(t1 - 2 * t2)
      - 2 * Math.sin(delta) * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * Math.cos(delta)))
      / (l1 * den);

    const a2 = (2 * Math.sin(delta)
      * (w1 * w1 * l1 * (m1 + m2)
        + g * (m1 + m2) * Math.cos(t1)
        + w2 * w2 * l2 * m2 * Math.cos(delta)))
      / (l2 * den);

    return [w1, w2, a1, a2];
  };
}

/** Cartesian positions of both bobs, pivot at the origin, +y up. */
export function doublePositions({ l1, l2 }, [t1, t2]) {
  const p1 = vec(l1 * Math.sin(t1), -l1 * Math.cos(t1));
  return { p1, p2: vec(p1.x + l2 * Math.sin(t2), p1.y - l2 * Math.cos(t2)) };
}

/** Total energy. Conserved exactly by the equations; a check on the maths. */
export function doubleEnergy({ l1, l2, m1, m2, g }, [t1, t2, w1, w2]) {
  const v1sq = l1 * l1 * w1 * w1;
  const v2sq = l1 * l1 * w1 * w1 + l2 * l2 * w2 * w2
    + 2 * l1 * l2 * w1 * w2 * Math.cos(t1 - t2);
  const kinetic = 0.5 * m1 * v1sq + 0.5 * m2 * v2sq;
  const y1 = -l1 * Math.cos(t1);
  const y2 = y1 - l2 * Math.cos(t2);
  const potential = m1 * g * y1 + m2 * g * y2;
  return { kinetic, potential, total: kinetic + potential };
}

export function simulateDouble(p, { duration = 20, dt = 0.0005, samples = 1200 } = {}) {
  const deriv = doubleDeriv(p);
  let state = [p.theta1, p.theta2, p.omega1 || 0, p.omega2 || 0];
  let t = 0;

  const record = () => {
    const { p1, p2 } = doublePositions(p, state);
    return { t, state: state.slice(), p1, p2, energy: doubleEnergy(p, state) };
  };

  const out = [record()];
  const stride = Math.max(1, Math.round(duration / dt / samples));
  let step = 0;

  while (t < duration - dt / 2) {
    state = rk4(state, t, dt, deriv);
    t += dt;
    step += 1;
    if (step % stride === 0) out.push(record());
  }

  const start = out[0].energy.total;
  const drift = out.reduce((worst, s) => Math.max(worst, Math.abs(s.energy.total - start)), 0);
  return { samples: out, energyDrift: drift, startEnergy: start };
}

/**
 * Run the same double pendulum twice from almost the same start, and report
 * when the two diverge past a threshold.
 *
 * This is the demonstration, and it is worth being precise about what it shows.
 * Nothing here is random. The equations are exact and the two runs are both
 * correct. What makes the system unpredictable in practice is that any
 * uncertainty in the starting angle — and there is always some — grows
 * exponentially, so a prediction far enough ahead needs impossible precision.
 */
export function divergence(p, nudgeRad = 1e-4, options = {}) {
  const a = simulateDouble(p, options);
  const b = simulateDouble({ ...p, theta1: p.theta1 + nudgeRad }, options);
  const n = Math.min(a.samples.length, b.samples.length);

  let separated = null;
  const gaps = [];
  for (let i = 0; i < n; i += 1) {
    const gap = Math.hypot(a.samples[i].p2.x - b.samples[i].p2.x, a.samples[i].p2.y - b.samples[i].p2.y);
    gaps.push({ t: a.samples[i].t, gap });
    if (separated === null && gap > 0.5 * (p.l1 + p.l2)) separated = a.samples[i].t;
  }

  return {
    a,
    b,
    gaps,
    nudgeRad,
    separatedAt: separated,
    finalGap: gaps[gaps.length - 1].gap,
  };
}
