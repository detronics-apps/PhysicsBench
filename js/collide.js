/**
 * Collisions. Pure.
 *
 * One number, e, spans the whole range from a perfect bounce to two bodies
 * sticking together, and the two results the labs are built to compare fall
 * straight out of it:
 *
 *   momentum        conserved for every value of e, always
 *   kinetic energy  conserved only when e = 1
 *
 * A learner is not told that. They set e, run it, and read the two totals off
 * the screen. The equations here exist so that what they read is right.
 *
 * The solution for a head-on impact comes from two statements — momentum is
 * conserved, and the separation speed is e times the approach speed — solved
 * together:
 *
 *   v₁′ = ( m₁·u₁ + m₂·u₂ + m₂·e·(u₂ − u₁) ) / (m₁ + m₂)
 *   v₂′ = ( m₁·u₁ + m₂·u₂ + m₁·e·(u₁ − u₂) ) / (m₁ + m₂)
 */

import { vec, sub, add, scale, dot, norm, len } from './vec.js';
import { kinetic } from './energy.js';

export const MODES = [
  {
    id: 'elastic',
    label: 'Perfectly elastic',
    e: 1,
    note: 'Kinetic energy is conserved as well as momentum. Nothing real is '
      + 'perfectly elastic — the nearest are colliding steel balls, at about '
      + 'e = 0.95, and gas molecules, which genuinely are.',
  },
  {
    id: 'bouncy',
    label: 'Very bouncy',
    e: 0.9,
    note: 'A superball or a snooker ball. Most of the kinetic energy comes back.',
  },
  {
    id: 'partial',
    label: 'Partially elastic',
    e: 0.5,
    note: 'A tennis ball on concrete, roughly. A quarter of the kinetic energy '
      + 'survives the bounce — energy goes as the square of speed, so e = 0.5 '
      + 'means a quarter, not a half.',
  },
  {
    id: 'inelastic',
    label: 'Perfectly inelastic',
    e: 0,
    note: 'The two move off together. This loses the most kinetic energy any '
      + 'collision can while still conserving momentum — it cannot lose all of '
      + 'it unless the total momentum happens to be zero.',
  },
  { id: 'custom', label: 'Custom', e: 0.7, note: 'Set e yourself, anywhere from 0 to 1.' },
];

export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];

/** What a given e means, in words. */
export function classify(e) {
  if (e >= 0.999) return { id: 'elastic', text: 'Perfectly elastic: kinetic energy is conserved too.' };
  if (e <= 0.001) return { id: 'inelastic', text: 'Perfectly inelastic: the bodies move off together.' };
  return { id: 'partial', text: `Partially elastic (e = ${e}): some kinetic energy is transferred elsewhere.` };
}

/**
 * A head-on collision between two bodies moving along one line.
 *
 * Returns everything the readout needs before and after, so the app can show
 * the same six quantities on both sides of the impact and let the learner spot
 * which two moved and which one did not.
 */
export function collide1D(m1, u1, m2, u2, e = 1) {
  const total = m1 + m2;
  if (!(total > 0)) throw new Error('collide1D: both masses must be positive');
  const restitution = Math.max(0, Math.min(1, Number(e)));

  const p = m1 * u1 + m2 * u2;
  const v1 = (p + m2 * restitution * (u2 - u1)) / total;
  const v2 = (p + m1 * restitution * (u1 - u2)) / total;

  const keBefore = kinetic(m1, u1) + kinetic(m2, u2);
  const keAfter = kinetic(m1, v1) + kinetic(m2, v2);

  return {
    e: restitution,
    mode: classify(restitution),
    before: {
      v1: u1,
      v2: u2,
      p1: m1 * u1,
      p2: m2 * u2,
      momentum: p,
      ke1: kinetic(m1, u1),
      ke2: kinetic(m2, u2),
      kinetic: keBefore,
      approachSpeed: u1 - u2,
    },
    after: {
      v1,
      v2,
      p1: m1 * v1,
      p2: m2 * v2,
      momentum: m1 * v1 + m2 * v2,
      ke1: kinetic(m1, v1),
      ke2: kinetic(m2, v2),
      kinetic: keAfter,
      separationSpeed: v2 - v1,
    },
    // Not "lost" — moved. Heat, sound, permanent deformation, vibration.
    energyTransferred: keBefore - keAfter,
    momentumChange: (m1 * v1 + m2 * v2) - p,
    // The one thing that never changes, whatever e is.
    centreOfMassVelocity: p / total,
  };
}

/**
 * The maximum kinetic energy any collision can move elsewhere.
 *
 * A perfectly inelastic collision cannot destroy all the kinetic energy: what
 * survives is the energy of the centre of mass, which momentum conservation
 * fixes. This is a satisfying result and it is one line.
 */
export function maxEnergyTransfer(m1, u1, m2, u2) {
  const relative = u1 - u2;
  const reduced = (m1 * m2) / (m1 + m2);
  return 0.5 * reduced * relative * relative;
}

/** e measured from an observed collision — the definition, run backwards. */
export function restitutionFrom(u1, u2, v1, v2) {
  const approach = u1 - u2;
  if (Math.abs(approach) < 1e-12) return NaN;
  return (v2 - v1) / approach;
}

/**
 * A ball bouncing off an immovable surface — the m₂ → ∞ limit of the above.
 * The rebound speed is simply e times the impact speed.
 */
export const bounce = (velocity, e) => -velocity * Math.max(0, Math.min(1, e));

/** How high a ball rebounds, as a fraction of the drop height: e². */
export const bounceHeightRatio = (e) => e * e;

/**
 * A general two-body impact in the plane, resolved along the contact normal.
 *
 * The tangential components are untouched — that is the frictionless-contact
 * model, and the disclosure says so. Only the normal components take an
 * impulse, and they take exactly the one-dimensional result above.
 *
 * `normalIn` points **from a towards b**. With that convention the bodies are
 * approaching when the relative velocity has a positive component along it,
 * and the sign of the impulse falls out without a special case.
 */
export function collide2D(a, b, normalIn, e = 1) {
  const n = norm(normalIn);
  const relative = sub(a.vel, b.vel);
  const approaching = dot(relative, n);

  // Already separating: applying an impulse now would drag them back together.
  if (approaching <= 0) {
    return { applied: false, a: { ...a }, b: { ...b }, impulse: 0, reason: 'The bodies are already separating.' };
  }

  const restitution = Math.max(0, Math.min(1, Number(e)));
  const invA = a.mass > 0 ? 1 / a.mass : 0;
  const invB = b.mass > 0 ? 1 / b.mass : 0;
  if (invA + invB === 0) {
    return { applied: false, a: { ...a }, b: { ...b }, impulse: 0, reason: 'Both bodies are immovable.' };
  }

  const j = (-(1 + restitution) * approaching) / (invA + invB);
  const impulseVec = scale(n, j);

  return {
    applied: true,
    impulse: j,
    normal: n,
    a: { ...a, vel: add(a.vel, scale(impulseVec, invA)) },
    b: { ...b, vel: sub(b.vel, scale(impulseVec, invB)) },
  };
}

/**
 * A one-line answer to "what should I expect?", for each of the three mass
 * ratios the Collision lab invites the learner to try.
 *
 * These are predictions the simulation then either confirms or does not — the
 * app never presents them as the reason something happened, only as the shape
 * of the result worth looking out for.
 */
export function expectation(m1, m2, e) {
  const ratio = m1 / m2;
  if (e >= 0.999) {
    if (Math.abs(ratio - 1) < 0.02) {
      return 'Equal masses in an elastic head-on collision exchange velocities exactly.';
    }
    if (ratio < 0.2) {
      return 'A light body hitting a much heavier one bounces back at almost its '
        + 'original speed, while the heavy one barely moves — but it does move, '
        + 'and it must, or momentum would not balance.';
    }
    if (ratio > 5) {
      return 'A heavy body hitting a much lighter one carries on almost '
        + 'unchanged, and knocks the light one away at close to twice the heavy '
        + "body's speed.";
    }
  }
  if (e <= 0.001) {
    return 'The two move off together at the velocity of the centre of mass — '
      + 'which is the same before and after, because momentum is conserved.';
  }
  return 'Momentum will balance exactly. Kinetic energy will not: watch how much '
    + 'of it moves elsewhere.';
}

export { vec, len };
