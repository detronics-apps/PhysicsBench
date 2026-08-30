/**
 * Rotation: torque, moment of inertia, angular motion, rolling. Pure.
 *
 * Every rotational quantity has a linear twin, and laying them side by side is
 * the fastest way to make rotation feel like something already understood
 * rather than a new subject:
 *
 *   position x        ↔  angle θ
 *   velocity v        ↔  angular velocity ω
 *   acceleration a    ↔  angular acceleration α
 *   mass m            ↔  moment of inertia I
 *   force F           ↔  torque τ
 *   momentum p = mv   ↔  angular momentum L = Iω
 *   F = ma            ↔  τ = Iα
 *   KE = ½mv²         ↔  KE = ½Iω²
 *
 * The one that is genuinely new is moment of inertia, because unlike mass it
 * depends on *where* the mass is, not just how much there is. That is the
 * single fact the whole subject rests on, and the rolling race is built to
 * make it visible.
 */

/** τ = r·F·sin θ — the turning effect of a force applied at a distance. */
export const torque = (radius, force, angleDeg = 90) =>
  radius * force * Math.sin((angleDeg * Math.PI) / 180);

/** τ = I·α, the rotational twin of F = ma. */
export const angularAcceleration = (netTorque, inertia) => (inertia > 0 ? netTorque / inertia : Infinity);

/** L = I·ω. */
export const angularMomentum = (inertia, omega) => inertia * omega;

/** KE = ½·I·ω². */
export const rotationalEnergy = (inertia, omega) => 0.5 * inertia * omega * omega;

/** Angular kinematics, identical in form to the linear ones. */
export const omegaAt = (omega0, alpha, t) => omega0 + alpha * t;
export const angleAt = (theta0, omega0, alpha, t) => theta0 + omega0 * t + 0.5 * alpha * t * t;

/** Rolling without slipping ties the two worlds together: v = ω·r. */
export const rollingSpeed = (omega, radius) => omega * radius;
export const rollingOmega = (speed, radius) => (radius > 0 ? speed / radius : Infinity);

/** rad/s to rpm and back, because motors are specified in rpm. */
export const radsToRpm = (omega) => (omega * 60) / (2 * Math.PI);
export const rpmToRads = (rpm) => (rpm * 2 * Math.PI) / 60;

/**
 * Moments of inertia for common shapes, about the axis named.
 *
 * The `k` value is the coefficient in I = k·m·r², which is the number that
 * decides the rolling race — and which depends only on how the mass is
 * arranged, not on how much of it there is or how big the object is.
 */
export const SHAPES = [
  {
    id: 'solid-disc',
    label: 'Solid disc or cylinder',
    k: 0.5,
    inertia: (m, r) => 0.5 * m * r * r,
    note: 'Mass spread evenly from centre to rim.',
  },
  {
    id: 'hoop',
    label: 'Hoop or thin ring',
    k: 1,
    inertia: (m, r) => m * r * r,
    note: 'All the mass at the rim — the worst case, and the slowest to roll.',
  },
  {
    id: 'solid-sphere',
    label: 'Solid sphere',
    k: 0.4,
    inertia: (m, r) => 0.4 * m * r * r,
    note: 'Mass concentrated towards the centre, so it rolls fastest of the three.',
  },
  {
    id: 'hollow-sphere',
    label: 'Hollow sphere (thin shell)',
    k: 2 / 3,
    inertia: (m, r) => (2 / 3) * m * r * r,
    note: '',
  },
  {
    id: 'rod-centre',
    label: 'Rod about its centre',
    k: 1 / 12,
    inertia: (m, l) => (m * l * l) / 12,
    note: 'Here the dimension is the full length, not a radius.',
    usesLength: true,
  },
  {
    id: 'rod-end',
    label: 'Rod about one end',
    k: 1 / 3,
    inertia: (m, l) => (m * l * l) / 3,
    note: 'Four times the value about the centre — the same rod, a different axis.',
    usesLength: true,
  },
  {
    id: 'point-mass',
    label: 'Point mass on a string',
    k: 1,
    inertia: (m, r) => m * r * r,
    note: 'The definition everything else is built from: I = m·r².',
  },
];

export const shapeById = (id) => SHAPES.find((s) => s.id === id) || SHAPES[0];

export const inertiaOf = (shapeId, mass, dimension) => shapeById(shapeId).inertia(mass, dimension);

/**
 * The parallel axis theorem: moving the axis by d adds m·d².
 *
 * Worth its own function because it explains the rod result above — a rod about
 * its end is its value about the centre plus m(L/2)², which is L²/12 + L²/4 =
 * L²/3 — and a learner who checks that themselves has understood the theorem.
 */
export const parallelAxis = (inertiaAboutCentre, mass, distance) =>
  inertiaAboutCentre + mass * distance * distance;

/**
 * The rolling race: which shape reaches the bottom of a ramp first?
 *
 *   a = g·sin θ / (1 + k)
 *
 * The answer depends only on k — on how the mass is distributed. Not on the
 * mass, not on the radius. A tiny marble and a large ball bearing tie; a hoop
 * of any size loses to both. That surprises almost everyone, which makes it a
 * good experiment.
 */
export function rollingAcceleration(shapeId, slopeDeg, g) {
  const shape = shapeById(shapeId);
  const along = g * Math.sin((slopeDeg * Math.PI) / 180);
  return {
    shape,
    acceleration: along / (1 + shape.k),
    slidingAcceleration: along,
    fraction: 1 / (1 + shape.k),
    note: `Of the energy released by the drop, ${Math.round((100 * 1) / (1 + shape.k))}% `
      + `goes into moving forwards and ${Math.round((100 * shape.k) / (1 + shape.k))}% into spinning.`,
  };
}

/** The whole race, ordered — fastest first. */
export function rollingRace(slopeDeg, g, shapeIds = ['solid-sphere', 'solid-disc', 'hoop']) {
  return shapeIds
    .map((id) => rollingAcceleration(id, slopeDeg, g))
    .sort((a, b) => b.acceleration - a.acceleration);
}

/**
 * The minimum friction needed to roll rather than slide.
 *
 * Below this the object slips, and the whole rolling analysis stops applying —
 * an assumption worth naming rather than leaving silent.
 */
export const minimumRollingFriction = (shapeId, slopeDeg) => {
  const k = shapeById(shapeId).k;
  return (k / (1 + k)) * Math.tan((slopeDeg * Math.PI) / 180);
};

/**
 * A rolling object's energy, split between moving and spinning.
 *
 * This is where the rolling race's answer comes from: a hoop puts two thirds of
 * its energy into spin and only a third into travelling.
 */
export function rollingEnergy(shapeId, mass, radius, speed) {
  const shape = shapeById(shapeId);
  const inertia = shape.inertia(mass, radius);
  const omega = rollingOmega(speed, radius);
  const translational = 0.5 * mass * speed * speed;
  const rotational = 0.5 * inertia * omega * omega;
  return {
    translational,
    rotational,
    total: translational + rotational,
    spinFraction: rotational / (translational + rotational),
    omega,
    inertia,
  };
}

/**
 * Angular momentum conservation: the ice-skater result.
 *
 * Pull your arms in and I falls, so ω must rise to keep L constant. The
 * kinetic energy rises too, and does not come from nowhere — the skater does
 * work pulling their arms against the outward pull.
 */
export function spinChange(inertiaBefore, omegaBefore, inertiaAfter) {
  const L = angularMomentum(inertiaBefore, omegaBefore);
  const omegaAfter = inertiaAfter > 0 ? L / inertiaAfter : Infinity;
  const before = rotationalEnergy(inertiaBefore, omegaBefore);
  const after = rotationalEnergy(inertiaAfter, omegaAfter);
  return {
    angularMomentum: L,
    omegaAfter,
    energyBefore: before,
    energyAfter: after,
    workDone: after - before,
    note: after > before
      ? 'The kinetic energy went up. It did not appear from nowhere: work was '
        + 'done pulling the mass inward against its tendency to keep going '
        + 'straight, and that work is exactly the difference.'
      : 'The kinetic energy went down: work was done by the rotation pushing '
        + 'the mass outward.',
  };
}
