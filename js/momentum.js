/**
 * Momentum and impulse. Pure.
 *
 * p = m·v is the classical form, and the app says so wherever it appears. The
 * fuller statement is p = γmv; at the speeds in these experiments γ differs
 * from 1 by about one part in 10¹³, which is far below the last digit on
 * screen. That is not a detail to be hidden — it is the first example a
 * learner meets of an equation being the low-speed limit of a wider one, and
 * of an approximation being *quantified* rather than waved away.
 */

import { scale, add, len, sum, ZERO } from './vec.js';
import { C_LIGHT } from './constants.js';

/** p = m·v, as a vector. Momentum points wherever the velocity points. */
export const momentum = (mass, velocity) => scale(velocity, mass);

/** The scalar version, for the one-dimensional labs. Sign carries direction. */
export const momentum1D = (mass, velocity) => mass * velocity;

/** The total momentum of a system: the vector sum, not the sum of magnitudes. */
export const systemMomentum = (bodies) => sum(bodies.map((b) => momentum(b.mass, b.vel || ZERO)));

export const systemMomentum1D = (bodies) => bodies.reduce((acc, b) => acc + b.mass * b.v, 0);

export const totalMass = (bodies) => bodies.reduce((acc, b) => acc + b.mass, 0);

/**
 * The velocity of the centre of mass.
 *
 * Worth showing during a collision: whatever the two bodies do to each other,
 * this never changes. It is conservation of momentum made visible as a single
 * dot that carries straight on through the impact.
 */
export function centreOfMassVelocity(bodies) {
  const m = totalMass(bodies);
  return m > 0 ? scale(systemMomentum(bodies), 1 / m) : ZERO;
}

export function centreOfMassVelocity1D(bodies) {
  const m = totalMass(bodies);
  return m > 0 ? systemMomentum1D(bodies) / m : 0;
}

/** J = F·Δt, for a constant force. The impulse–momentum theorem: J = Δp. */
export const impulse = (force, dt) => scale(force, dt);

/** The change in momentum an impulse produces — the same thing, said twice. */
export const velocityChangeFrom = (impulseVec, mass) =>
  (mass > 0 ? scale(impulseVec, 1 / mass) : ZERO);

/**
 * The force needed to bring a moving mass to rest in a given time.
 *
 * This is the crumple-zone calculation, and it is the most useful thing
 * momentum does outside a classroom: the change in momentum is fixed by the
 * crash, so the only way to reduce the force is to take longer over it.
 */
export function stoppingForce(mass, velocity, seconds) {
  if (!(seconds > 0)) return Infinity;
  return Math.abs(mass * velocity) / seconds;
}

/**
 * Do two objects have the same momentum despite different masses and speeds?
 *
 * The Momentum lab's opening question — a 1 kg ball at 10 m/s and a 10 kg ball
 * at 1 m/s — and it deserves a named function so the answer is not a floating
 * point comparison buried in a controller.
 */
export function sameMomentum(a, b, tolerance = 1e-9) {
  return Math.abs(momentum1D(a.mass, a.v) - momentum1D(b.mass, b.v)) <= tolerance;
}

/**
 * How much p = mv understates the true momentum at a given speed.
 *
 * Returns the Lorentz factor and the relative error, so the app can put a
 * number on "negligible" instead of asserting it. At 100 m/s the error is
 * about 5.6×10⁻¹⁴; at 0.9c it is 129%.
 */
export function relativisticCorrection(speed) {
  const beta = Math.abs(speed) / C_LIGHT;
  if (beta >= 1) return { gamma: Infinity, relativeError: Infinity, beta };
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  return { gamma, relativeError: gamma - 1, beta };
}

/**
 * A before/after summary of a system's momentum, ready to display.
 *
 * The point of the collision labs is that this number does not move, whatever
 * else does. `conserved` is computed with a tolerance relative to the total
 * momentum *magnitude* carried by the bodies, because a head-on collision
 * between equal masses has a total momentum of zero, and "zero is conserved to
 * within 1e-9 of zero" is not a meaningful statement on its own.
 */
export function momentumAudit(before, after, tolerance = 1e-6) {
  const p0 = systemMomentum1D(before);
  const p1 = systemMomentum1D(after);
  const scaleOf = Math.max(
    ...before.map((b) => Math.abs(b.mass * b.v)),
    ...after.map((b) => Math.abs(b.mass * b.v)),
    1e-12,
  );
  return {
    before: p0,
    after: p1,
    change: p1 - p0,
    scale: scaleOf,
    conserved: Math.abs(p1 - p0) <= tolerance * scaleOf,
  };
}

/** Momentum of each body, labelled — what the arrows on screen are drawn from. */
export const breakdown = (bodies) => bodies.map((b) => ({
  id: b.id,
  mass: b.mass,
  velocity: b.v,
  momentum: momentum1D(b.mass, b.v),
}));

export { len as magnitude, add as addVectors };
