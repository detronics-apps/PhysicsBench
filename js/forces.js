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
import { drag as fluidDrag } from './drag.js';

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
  buoyancy: { label: 'Buoyancy', symbol: 'F_b', token: '--force-buoyancy' },
  control: { label: 'Your control', symbol: 'F_c', token: '--force-control' },
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
  /*
   * A zero weight always needs its reason attached, and there is only one
   * reason it can be zero: no gravitational field. Either nothing has been put
   * in this scene to do the pulling, or the bench has been set to deep space.
   *
   * What it must never say is that the object is weightless. Weight is what a
   * field does to a mass, not a property the object mislaid — and a bare
   * "0.00 N" reads as exactly the wrong one of those.
   */
  const note = len(vector) < 1e-12
    ? 'Zero here, because there is no gravitational field in this scene for the '
      + 'mass to respond to — nothing has been put here to do the pulling. The '
      + 'object has not become weightless: weight is what a field does to a mass, '
      + 'and this mass is the same as it ever was. Put it on a world and it '
      + 'weighs whatever that world makes it weigh.'
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
export function dragForce(velocity, {
  density = 0, viscosity = 0, cd = 0, area = 0, diameter = 0, wind = ZERO,
} = {}) {
  const relative = sub(velocity, wind);
  const speed = len(relative);
  if (speed < 1e-9 || density <= 0 || area <= 0) return force('drag', vec(0, 0));

  const result = fluidDrag({
    speed, density, viscosity, area, diameter, cdShape: cd > 0 ? cd : null,
  });

  const f = force('drag', scale(norm(relative), -result.force),
    `${result.regime.label}. Re ≈ ${result.re < 10 ? result.re.toFixed(2) : result.re.toPrecision(3)}, `
    + `C_d ≈ ${result.cd.toPrecision(3)}. ${result.regime.text}`);
  // The flow conditions travel with the force, so the readout can say which
  // regime it is in rather than the interface having to recompute it.
  f.flow = result;
  return f;
}

/**
 * Buoyancy: the upward push a fluid gives anything immersed in it.
 *
 * Archimedes' result, and it is worth stating in the form that makes it obvious
 * rather than the form that makes it memorable. The fluid that *would* have
 * occupied this space was being held up by the pressure around it. Put an object
 * there instead and that same pressure is still pushing up, with the same total
 * force it needed to hold up the displaced fluid — its weight, ρ·V·g.
 *
 * So the force depends on the volume and not at all on what the object is made
 * of, which is why a kilogram of lead and a kilogram of feathers really do weigh
 * differently on a kitchen scale in air, and why the answer to the riddle is
 * "the feathers, very slightly less".
 *
 * If the object displaces more than its own mass, this beats its weight and it
 * goes up. Nothing extra is switched on to make that happen: floating and
 * sinking are the same force with the comparison coming out the other way.
 */
export function buoyancyForce(volume, fluidDensity, field) {
  if (!(volume > 0) || !(fluidDensity > 0)) return force('buoyancy', vec(0, 0));
  const displaced = volume * fluidDensity;
  return force('buoyancy', scale(field, -displaced),
    `The object displaces ${volume.toPrecision(3)} m³ of fluid, which would itself `
    + `weigh ${displaced.toPrecision(3)} kg. The fluid pushes up with exactly that `
    + 'weight, whatever the object is made of.');
}

/**
 * The mass that gravity gets to keep, once the fluid has pushed back.
 *
 * Buoyancy is constant and opposite to the field, so it behaves exactly like a
 * reduction in weight — which means potential energy has to be computed against
 * this effective mass rather than the real one. Get that wrong and a floating
 * balloon rises for free: the energy books show it gaining potential energy
 * with nothing paying for it, and the invariant the app puts on screen drifts.
 *
 * Negative for anything that floats, which is not a bug. It is what floating
 * means: the effective weight points upward.
 */
export const buoyantMass = (body, env = {}) =>
  body.mass - Math.max(0, env.fluidDensity ?? 0) * Math.max(0, body.volume ?? 0);

/** Terminal speed, re-exported: the search lives with the drag model. */
export { terminalSpeed } from './drag.js';

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
  const drag = env.fluidDensity > 0 && body.area > 0
    ? dragForce(velocity, {
      density: env.fluidDensity,
      viscosity: env.viscosity ?? 0,
      cd: body.cd,
      area: body.area,
      diameter: body.diameter || body.radius * 2,
      wind: env.wind,
    })
    : null;
  const extra = (body.extraForces || []).map((f) => force(f.id || 'applied', f.vec, f.note || ''));
  // Buoyancy needs the volume, not the frontal area — a car and a cube of the
  // same width displace very different amounts of fluid.
  const buoyancy = env.fluidDensity > 0 && body.volume > 0
    ? buoyancyForce(body.volume, env.fluidDensity, field)
    : null;
  // The control force is whatever the pointer or the keyboard is asking for. It
  // is an ordinary force in the ordinary sum — that is the whole reason driving
  // an object here is a physics experiment rather than a puppet show.
  const control = body.controlForce && len(body.controlForce) > 0
    ? force('control', body.controlForce)
    : null;

  const extraGravity = (body.extraForces || []).some((f) => f.id === 'weight');
  // A zero uniform field alongside a real pull is not a force, it is an absence
  // — and listing it would put a "Weight 0.00 N" row above the real one.
  const list = extraGravity && len(scale(field, mass)) < 1e-12 ? [] : [weightForce(mass, field)];
  if (applied) list.push(applied);
  if (control) list.push(control);
  if (buoyancy && buoyancy.magnitude > 0) list.push(buoyancy);
  if (drag && drag.magnitude > 0) list.push(drag);
  list.push(...extra);

  if (!contact) {
    const net = sum(list.map((f) => f.vec));
    return finish(list, net, mass, { touching: false, frictionMode: 'none', normalForce: 0, slipping: false, normal: null });
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
    // The surface normal travels with the result, so the stepper does not have
    // to work out for itself whether the body is on the ground or on a wall
    // somebody drew. There is one contact, and this is which way it faces.
    normal: n,
    surface: contact.surface || 'ground',
    frictionMode: mode,
    normalForce: normalMagnitude,
    staticLimit: maxStatic,
    tangentialDemand: Math.abs(alongSurface),
    slipping: mode === 'kinetic' || mode === 'breaking-away',
  });
}

/**
 * Two contributions of the same kind are one force, not two.
 *
 * A body being pulled by several masses feels one gravitational force — their
 * vector sum — not a list of them. Left unmerged, the inspector shows two rows
 * both labelled "Weight", the arrow picker toggles them together but draws them
 * separately, and `by('weight')` returns whichever happened to be added first.
 * That last one hid a real gravitational pull behind a zero for an afternoon.
 */
function mergeById(list) {
  const out = [];
  const seen = new Map();
  for (const f of list) {
    const at = seen.get(f.id);
    if (at === undefined) {
      seen.set(f.id, out.length);
      out.push({ ...f, sources: f.towards ? [f.towards] : [] });
      continue;
    }
    const merged = out[at];
    merged.vec = { x: merged.vec.x + f.vec.x, y: merged.vec.y + f.vec.y };
    merged.magnitude = len(merged.vec);
    if (f.towards) merged.sources.push(f.towards);
    // Keep whichever note actually says something; a zero contribution's
    // apology is not worth more than a real one's explanation.
    if (!merged.note || (f.note && f.magnitude > merged.magnitude * 0.5)) merged.note = f.note || merged.note;
    if (f.flow) merged.flow = f.flow;
  }
  return out;
}

function finish(rawList, net, mass, contact) {
  const list = mergeById(rawList);
  return {
    forces: list,
    net: force('net', sum(list.map((f) => f.vec))),
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
