/**
 * The forces acting on a body, each one named. Pure.
 *
 * Two things make this module the centre of the Force Lab rather than a helper.
 *
 * First, it never returns a bare net force. It returns the *list* — weight,
 * normal, friction, drag, applied — and the net as their sum. A learner who
 * only ever sees a net force learns that acceleration comes from "the force",
 * which is exactly the misconception the lab exists to dismantle. Seeing five
 * arrows collapse into one is the lesson.
 *
 * Second, the order the forces are computed in is physics, not convenience.
 * The normal force is a *reaction*: it is whatever it has to be to stop the
 * object sinking into the ground, so it can only be known after everything
 * pressing into the ground is known. Friction is a reaction to what is left
 * over after that. Compute them in the wrong order and a box on a ramp
 * accelerates through the floor.
 */

import { vec, sub, scale, dot, len, norm, perp, sum, ZERO } from './vec.js';

/**
 * The visual language, in one place.
 *
 * Every force has one colour and one symbol wherever it appears — on the
 * drawing, in the inspector, in the legend, in the worked example. When these
 * were defined separately the legend and the arrows disagreed, which is worse
 * than having no legend.
 */
export const FORCE_STYLE = {
  weight: { label: 'Weight (gravity)', symbol: 'W', token: '--force-weight' },
  normal: { label: 'Normal force', symbol: 'N', token: '--force-normal' },
  friction: { label: 'Friction', symbol: 'f', token: '--force-friction' },
  drag: { label: 'Air resistance', symbol: 'F_d', token: '--force-drag' },
  applied: { label: 'Applied force', symbol: 'F_app', token: '--force-applied' },
  spring: { label: 'Spring force', symbol: 'F_s', token: '--force-spring' },
  tension: { label: 'Tension', symbol: 'T', token: '--force-tension' },
  net: { label: 'Net force', symbol: 'F_net', token: '--force-net' },
};

/** Below this speed a body counts as at rest, so static friction applies. */
export const SLIDE_EPSILON = 1e-4;

const force = (id, v, note = '') => ({
  id,
  label: FORCE_STYLE[id]?.label || id,
  symbol: FORCE_STYLE[id]?.symbol || id,
  token: FORCE_STYLE[id]?.token || '--accent',
  vec: v,
  magnitude: len(v),
  note,
});

/* ------------------------------------------------------ the components -- */

/**
 * Weight: the force gravity exerts on a mass.
 *
 * Note what is multiplied by what. `field` is a property of *where the body
 * is*; the body's own mass turns that field into a force. This is the only
 * place in the app where mass and gravity meet, and keeping it explicit is
 * what stops "gravity depends on how heavy you are" creeping in.
 */
export function weightForce(mass, field) {
  const vector = scale(field, mass);
  // A zero weight always needs its reason attached. Several labs run on a level
  // track and set the field to zero, because on a level surface weight and the
  // normal force cancel exactly and neither does anything along the direction
  // of travel. Shown as a bare "0.00 N" that reads as "this cart is weightless",
  // which is not what the model says at all.
  const note = len(vector) < 1e-12
    ? 'Zero in this experiment. The surface is level, so weight and the normal '
      + 'force cancel exactly and nothing is left over to act along the track — '
      + 'which is why neither appears in the arithmetic here. The carts are not '
      + 'weightless; their weight simply has nothing to do.'
    : '';
  return force('weight', vector, note);
}

/**
 * Quadratic drag: ½·ρ·C_d·A·v², opposing the direction of travel.
 *
 * `wind` is the velocity of the fluid itself. Drag depends on the velocity of
 * the body *relative to the fluid*, and defaulting the wind to zero is an
 * assumption the disclosure names rather than something hidden in here.
 */
export function dragForce(velocity, { density = 0, cd = 0, area = 0, wind = ZERO } = {}) {
  const relative = sub(velocity, wind);
  const speed = len(relative);
  if (speed < 1e-9 || density <= 0 || cd <= 0 || area <= 0) return force('drag', vec(0, 0));
  const magnitude = 0.5 * density * cd * area * speed * speed;
  return force('drag', scale(norm(relative), -magnitude));
}

/** Terminal speed: where drag has grown to exactly balance weight. */
export function terminalSpeed(mass, g, { density = 0, cd = 0, area = 0 } = {}) {
  const k = 0.5 * density * cd * area;
  if (k <= 0 || !(g > 0)) return Infinity;
  return Math.sqrt((mass * g) / k);
}

/** Hooke's law. `x` is the extension from the natural length, as a vector. */
export const springForce = (extension, k) => force('spring', scale(extension, -k));

/* ---------------------------------------------------------- the solver -- */

/**
 * Every force on one body, in the order they can actually be determined.
 *
 * @param {object} body
 *   `{ mass, pos, vel, cd, area, applied }`
 * @param {object} env
 *   `{ field, fluidDensity, wind }` — `field` is the gravitational field
 *   vector at the body's position, already in m/s².
 * @param {object|null} contact
 *   `{ normal, muS, muK }` when the body is resting on a surface, else null.
 *   `normal` is the unit vector pointing away from the surface.
 */
export function forcesOn(body, env = {}, contact = null) {
  const mass = Number(body.mass) || 0;
  const velocity = body.vel || ZERO;
  const field = env.field || ZERO;

  /* Step one: everything that does not depend on the surface. */
  const applied = body.applied && len(body.applied) > 0 ? force('applied', body.applied) : null;
  const drag = env.fluidDensity > 0 && body.cd > 0 && body.area > 0
    ? dragForce(velocity, { density: env.fluidDensity, cd: body.cd, area: body.area, wind: env.wind })
    : null;
  const extra = (body.extraForces || []).map((f) => force(f.id || 'applied', f.vec, f.note || ''));

  const list = [weightForce(mass, field)];
  if (applied) list.push(applied);
  if (drag && drag.magnitude > 0) list.push(drag);
  list.push(...extra);

  if (!contact) {
    const net = sum(list.map((f) => f.vec));
    return finish(list, net, mass, { touching: false, frictionMode: 'none', normalForce: 0, slipping: false });
  }

  /* Step two: the normal force, which is whatever stops the body sinking in. */
  const n = norm(contact.normal || vec(0, 1));
  const beforeContact = sum(list.map((f) => f.vec));
  const pressing = -dot(beforeContact, n);            // positive when pushed into the surface
  const normalMagnitude = Math.max(0, pressing);
  const normal = force('normal', scale(n, normalMagnitude),
    normalMagnitude === 0 ? 'Zero — nothing is pressing the body onto the surface.' : '');
  list.push(normal);

  /* Step three: friction, which reacts to whatever is left along the surface. */
  const t = perp(n);                                  // unit vector along the surface
  const alongSurface = dot(beforeContact, t);
  const speedAlong = dot(velocity, t);
  const muS = Math.max(0, contact.muS ?? 0);
  const muK = Math.max(0, contact.muK ?? 0);
  const maxStatic = muS * normalMagnitude;

  let frictionScalar = 0;
  let mode = 'none';
  let note = '';

  if (Math.abs(speedAlong) > SLIDE_EPSILON) {
    mode = 'kinetic';
    frictionScalar = -Math.sign(speedAlong) * muK * normalMagnitude;
    note = 'Sliding: friction is μk·N and points against the motion.';
  } else if (Math.abs(alongSurface) <= maxStatic) {
    mode = 'static';
    // Exactly cancels — static friction is *at most* μs·N, not equal to it.
    frictionScalar = -alongSurface;
    note = 'At rest: friction takes exactly the value needed to prevent sliding, '
      + 'which is less than its limit of μs·N.';
  } else if (maxStatic > 0 || muK > 0) {
    mode = 'breaking-away';
    frictionScalar = -Math.sign(alongSurface) * muK * normalMagnitude;
    note = 'The push has exceeded μs·N, so the body breaks away and friction '
      + 'drops to the kinetic value.';
  }

  if (normalMagnitude === 0) {
    // Worth showing as an explicit zero rather than omitting: friction has
    // vanished *because* the normal force has, and that is the lesson.
    note = 'Zero, because friction is μ·N and the normal force is zero. Nothing '
      + 'is pressing the surfaces together, so there is nothing to rub.';
  }

  // Always listed while the body is in contact, even at zero, so the learner
  // can see which force disappeared and why.
  list.push(force('friction', scale(t, frictionScalar), note));

  const net = sum(list.map((f) => f.vec));
  return finish(list, net, mass, {
    touching: true,
    frictionMode: mode,
    normalForce: normalMagnitude,
    staticLimit: maxStatic,
    tangentialDemand: Math.abs(alongSurface),
    slipping: mode === 'kinetic' || mode === 'breaking-away',
  });
}

function finish(list, net, mass, contact) {
  return {
    forces: list,
    net: force('net', net),
    // F = ma, used in the direction it is actually used: a = F_net / m.
    acceleration: mass > 0 ? scale(net, 1 / mass) : ZERO,
    contact,
    /** Look one up by id without the caller writing a find(). */
    by: (id) => list.find((f) => f.id === id) || null,
  };
}

/**
 * Is this body in equilibrium — net force effectively zero?
 *
 * Worth its own function because "no net force" and "not moving" are different
 * statements, and confusing them is the most common error in the whole subject.
 * A car at a steady 70 mph is in equilibrium.
 */
export const inEquilibrium = (result, tolerance = 1e-6) => result.net.magnitude <= tolerance;

/**
 * The acceleration a given net force produces on a given mass.
 * Separated out so the Mass lab can call it without building a whole body.
 */
export const accelerationFrom = (netForce, mass) => (mass > 0 ? netForce / mass : Infinity);

/** The force needed to produce a given acceleration on a given mass. */
export const forceFor = (mass, acceleration) => mass * acceleration;

/**
 * The gravitational field vector of a uniform-field model.
 *
 * A separate function so no caller has to remember the sign. `g` is a field
 * *strength* — a positive number — and the field points in −y. A negative g is
 * allowed and points upward, which is not a bug: the custom environment lets a
 * learner ask what an upward field would do, and the answer should be the one
 * the maths gives.
 */
export const uniformField = (g) => vec(0, -g);
