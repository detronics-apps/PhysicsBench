/**
 * Energy. Pure.
 *
 * The recurring lesson of this module is that energy is never lost, only moved
 * somewhere harder to see. So `audit` never reports a total that has simply
 * shrunk: whatever leaves the mechanical account is added to a named
 * destination — heat from friction, the energy absorbed by an inelastic
 * collision — and the books balance. A learner who watches KE + PE fall during
 * a slide, with nothing on the other side of the ledger, learns that energy
 * can disappear. It cannot.
 */

import { len2, len } from './vec.js';
import { G } from './constants.js';

/** KE = ½·m·v². Translational only; spin is counted separately. */
export const kinetic = (mass, velocity) => 0.5 * mass * velocity * velocity;

/** The vector form — the speed is what matters, so direction drops out. */
export const kineticFromVec = (mass, velocityVec) => 0.5 * mass * len2(velocityVec);

/** Rotational kinetic energy: ½·I·ω². The rotational twin of ½mv². */
export const rotationalKinetic = (inertia, omega) => 0.5 * inertia * omega * omega;

/**
 * PE = m·g·h, in the uniform-field model.
 *
 * `h` is measured from whatever datum the caller picks, and that freedom is
 * itself worth teaching: only *differences* in potential energy have physical
 * meaning, so the zero can go wherever is convenient.
 */
export const gravitationalPE = (mass, g, height, datum = 0) => mass * g * (height - datum);

/**
 * The general form: PE = −G·M·m/r, measured from infinity.
 *
 * Negative because the zero is placed infinitely far away, where the two
 * bodies no longer interact. Getting closer means going further into the well.
 */
export const gravitationalPEExact = (bigMass, smallMass, r) =>
  (r > 0 ? (-G * bigMass * smallMass) / r : -Infinity);

/** Spring: PE = ½·k·x², the work done stretching it against Hooke's law. */
export const springPE = (k, extension) => 0.5 * k * extension * extension;

/** W = F·d for a force along the displacement; the dot product in general. */
export const work = (force, displacement) => force * displacement;

/** P = W/t. */
export const power = (workDone, seconds) => (seconds > 0 ? workDone / seconds : Infinity);

/** Speed for a given kinetic energy — the inverse of ½mv². */
export const speedFromKE = (ke, mass) => (mass > 0 && ke >= 0 ? Math.sqrt((2 * ke) / mass) : NaN);

/**
 * The height a given speed buys, ignoring drag.
 *
 * ½mv² = mgh, and the mass cancels: everything thrown upward at the same speed
 * reaches the same height, for the same reason everything falls together.
 */
export const heightFromSpeed = (speed, g) => (g > 0 ? (speed * speed) / (2 * g) : Infinity);

/** And the reverse: the speed a drop of h produces. */
export const speedFromHeight = (height, g) => Math.sqrt(Math.max(0, 2 * g * height));

/**
 * A complete energy account for a set of bodies.
 *
 * @param {Array} bodies each `{ mass, vel, pos, inertia?, omega? }`
 * @param {object} env   `{ g, datum }`
 * @param {object} [ledger] energy already moved elsewhere:
 *                 `{ heat, deformation, ... }` — named destinations, not losses
 */
export function audit(bodies, env = {}, ledger = {}) {
  const g = Number(env.g) || 0;
  const datum = Number(env.datum) || 0;

  let ke = 0;
  let rotational = 0;
  let pe = 0;
  const perBody = [];

  for (const body of bodies) {
    const bodyKE = kineticFromVec(body.mass, body.vel || { x: 0, y: 0 });
    const bodyRot = body.inertia && body.omega ? rotationalKinetic(body.inertia, body.omega) : 0;
    const bodyPE = gravitationalPE(body.mass, g, body.pos ? body.pos.y : 0, datum);
    ke += bodyKE;
    rotational += bodyRot;
    pe += bodyPE;
    perBody.push({
      id: body.id,
      kinetic: bodyKE,
      rotational: bodyRot,
      potential: bodyPE,
      speed: len(body.vel || { x: 0, y: 0 }),
      total: bodyKE + bodyRot + bodyPE,
    });
  }

  const elsewhere = Object.entries(ledger)
    .filter(([, v]) => Number.isFinite(v) && v !== 0)
    .map(([where, amount]) => ({ where, amount }));
  const moved = elsewhere.reduce((acc, e) => acc + e.amount, 0);

  return {
    kinetic: ke,
    rotational,
    potential: pe,
    mechanical: ke + rotational + pe,
    elsewhere,
    // The books balance: nothing has been lost, only relocated.
    total: ke + rotational + pe + moved,
    perBody,
    datum,
  };
}

/**
 * Has mechanical energy been conserved between two audits?
 *
 * Reported against the largest total either side has seen, so a system that
 * starts at rest at the datum — total zero — does not produce a meaningless
 * "conserved to within 1e-9 of nothing".
 */
export function conservation(before, after, tolerance = 1e-6) {
  const scaleOf = Math.max(Math.abs(before.mechanical), Math.abs(after.mechanical), Math.abs(before.total), 1e-12);
  const change = after.mechanical - before.mechanical;
  return {
    before: before.mechanical,
    after: after.mechanical,
    change,
    fraction: change / scaleOf,
    conserved: Math.abs(change) <= tolerance * scaleOf,
    // Where it went, if it went anywhere.
    accountedFor: after.elsewhere,
  };
}

/**
 * The work–energy theorem, which is v² = u² + 2as multiplied by m/2.
 *
 * Showing the two side by side is worth a whole lesson: they look like
 * different equations from different chapters and they are the same statement.
 */
export const workEnergy = (mass, u, v) => kinetic(mass, v) - kinetic(mass, u);

/** Energy stored by lifting, in the uniform-field model. */
export const liftWork = (mass, g, height) => mass * g * height;
