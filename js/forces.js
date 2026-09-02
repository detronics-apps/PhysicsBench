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
import { drag as fluidDrag, atmosphereAt, atmosphereColumn } from './drag.js';

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
  rolling: { label: 'Rolling resistance', symbol: 'f_r', token: '--force-friction' },
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
  temperature = 288.15,
} = {}) {
  const relative = sub(velocity, wind);
  const speed = len(relative);
  if (speed < 1e-9 || density <= 0 || area <= 0) return force('drag', vec(0, 0));

  const result = fluidDrag({
    speed, density, viscosity, area, diameter, temperature, cdShape: cd > 0 ? cd : null,
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
/**
 * The fluid where a body actually is, rather than everywhere at once.
 *
 * Every fluid on this bench is uniform except the atmosphere, which thins with
 * height — so this is the one place that has to ask "where?" before it can say
 * "how dense?". For everything else the answer does not depend on the position
 * and the reading is the same one it always was.
 */
/**
 * The gravitational field where a body actually is.
 *
 * `g` was computed once at the surface and applied at every height, so a rocket
 * at 14 km weighed exactly what it did on the pad. It does not: g goes as
 * 1/r², and 14 km up a 6,371 km radius is 0.44 per cent less. Small, and the
 * whole point of a step that computes g from a mass and a radius rather than
 * looking it up — a bench that then treats it as a constant is quietly
 * contradicting itself.
 *
 * `env.g` stays the *surface* value throughout, because that is the number the
 * world is described by and what every readout means by "surface gravity".
 */
export function fieldAt(env = {}, y = 0) {
  const R = env.surfaceRadius;
  if (env.fieldProfile !== 'inverse-square' || !(R > 0)) return env.field || ZERO;
  const r = Math.max(1, R + (y - (env.seaLevel ?? 0)));
  return vec(0, -(env.g ?? 0) * (R / r) ** 2);
}

/**
 * The field at the surface, for the things that are defined against it.
 *
 * Only differs from the local field where the field varies with height, and
 * falls back to whatever field the caller gave — so an env built with a plain
 * `field` and no `g`, which plenty are, behaves exactly as it always did.
 */
export function surfaceField(env = {}, local = ZERO) {
  return env.fieldProfile === 'inverse-square' && Number.isFinite(env.g)
    ? vec(0, -env.g)
    : local;
}

export function fluidAt(env = {}, y = 0) {
  if (env.fluidProfile === 'isa') {
    const air = atmosphereAt(y - (env.seaLevel ?? 0));
    return { density: air.density, viscosity: air.viscosity, temperature: air.temperature };
  }
  return {
    density: Math.max(0, env.fluidDensity ?? 0),
    viscosity: Math.max(0, env.viscosity ?? 0),
    // Room temperature for a fluid off the table. It only feeds the mean free
    // path, which in any liquid is small enough to leave the answer untouched.
    temperature: 293.15,
  };
}

export const buoyantMass = (body, env = {}) =>
  body.mass - fluidAt(env, body.pos?.y ?? 0).density * Math.max(0, body.volume ?? 0);

/**
 * Potential energy: gravitational, less whatever the fluid is holding up.
 *
 * In a uniform fluid this is just the buoyant mass times g times the height,
 * which is what it has always been. In a fluid that thins with height it is
 * not: the buoyant force changes as the body rises, so the energy is the
 * *integral* of it, and `atmosphereColumn` is that integral in closed form.
 *
 * Using the local density times the rise instead would leave the energy ledger
 * drifting by a little on every frame — in an app whose central claim is that
 * the books balance whatever you do to them.
 */
export function potentialEnergy(body, env = {}, datumY = 0) {
  const g = env.g ?? 0;
  const y = body.pos?.y ?? 0;
  const volume = Math.max(0, body.volume ?? 0);

  const sea = env.seaLevel ?? 0;
  /*
   * Lifting something against a field that weakens as you climb costs less than
   * m·g·h. The exact form is m·g₀·R²·(1/r₀ − 1/r₁), which collapses to m·g·h
   * for anything near the ground and stays honest for a rocket.
   */
  const R = env.surfaceRadius;
  const gravity = env.fieldProfile === 'inverse-square' && R > 0
    ? body.mass * g * R * R * (1 / (R + datumY - sea) - 1 / (R + y - sea))
    : body.mass * g * (y - datumY);

  if (volume <= 0) return gravity;
  const displaced = env.fluidProfile === 'isa'
    ? atmosphereColumn(y - sea) - atmosphereColumn(datumY - sea)
    : fluidAt(env, y).density * (y - datumY);
  return gravity - g * volume * displaced;
}

/**
 * How much potential a body gains moving from one place to another.
 *
 * Kept separate from `potentialEnergy` because contact resolution works with a
 * displacement against the field, which is the general form — it is still
 * correct where the field is not straight down, and the buoyancy correction is
 * the only part that has to know about height.
 */
export function potentialShift(body, env = {}, fromPos, toPos) {
  const sea = env.seaLevel ?? 0;
  const R = env.surfaceRadius;
  /*
   * Against a 1/r² field the work depends on where you started, not just how
   * far you moved — so this is a difference of two potentials rather than a
   * force times a displacement. Sideways movement costs nothing either way.
   */
  const gravity = env.fieldProfile === 'inverse-square' && R > 0
    ? body.mass * (env.g ?? 0) * R * R
      * (1 / (R + fromPos.y - sea) - 1 / (R + toPos.y - sea))
    : -body.mass * dot(env.field ?? ZERO, sub(toPos, fromPos));

  const volume = Math.max(0, body.volume ?? 0);
  if (volume <= 0) return gravity;

  const displaced = env.fluidProfile === 'isa'
    ? atmosphereColumn(toPos.y - sea) - atmosphereColumn(fromPos.y - sea)
    : fluidAt(env, fromPos.y).density * (toPos.y - fromPos.y);
  return gravity - (env.g ?? 0) * volume * displaced;
}

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
  const field = fieldAt(env, body.pos?.y ?? 0);

  /* Step one: everything that does not depend on the surface. */
  const applied = body.applied && len(body.applied) > 0 ? force('applied', body.applied) : null;
  const local = fluidAt(env, body.pos?.y ?? 0);
  const drag = local.density > 0 && body.area > 0
    ? dragForce(velocity, {
      density: local.density,
      viscosity: local.viscosity,
      temperature: local.temperature,
      cd: body.cd,
      area: body.area,
      diameter: body.diameter || body.radius * 2,
      wind: env.wind,
    })
    : null;
  const extra = (body.extraForces || []).map((f) => force(f.id || 'applied', f.vec, f.note || ''));
  // Buoyancy needs the volume, not the frontal area — a car and a cube of the
  // same width displace very different amounts of fluid.
  /*
   * Buoyancy is worked out at surface gravity even where weight is not.
   *
   * Not an oversight: the standard atmosphere's density profile is *derived*
   * assuming a constant g0, so the fluid this pushes with was defined under
   * that assumption and using a height-varying g here would be mixing two
   * models. The difference is four parts in a thousand on a term that is
   * already small, and keeping it consistent is what lets the energy ledger
   * close exactly rather than nearly.
   */
  const buoyancy = local.density > 0 && body.volume > 0
    ? buoyancyForce(body.volume, local.density, surfaceField(env, field))
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

  /*
   * Step three: friction, which reacts to whatever is left along the surface.
   *
   * Or rolling resistance, which is a different mechanism and not a smaller
   * version of the same one. Sliding friction is asperities being sheared;
   * rolling resistance is the ball and the surface flexing under the contact
   * and not giving all of it back. The second is one to three orders of
   * magnitude weaker, which is the whole reason wheels exist — and it is the
   * real answer to "does the shape change the grip", where the apparent contact
   * area is not.
   */
  const rolling = !!contact.rolling;
  const t = perp(n);                                  // unit vector along the surface
  const alongSurface = dot(beforeContact, t);
  const speedAlong = dot(velocity, t);
  const muS = rolling ? 0 : Math.max(0, contact.muS ?? 0);
  const muK = rolling
    ? Math.max(0, contact.rollingCoefficient ?? 0)
    : Math.max(0, contact.muK ?? 0);
  const maxStatic = rolling
    // A rolling body is held by the same coefficient that resists it, and there
    // is no stick-then-lurch: nothing has to break away.
    ? muK * normalMagnitude
    : muS * normalMagnitude;

  let frictionScalar = 0;
  let mode = 'none';
  let note = '';

  if (rolling && Math.abs(speedAlong) > SLIDE_EPSILON) {
    mode = 'rolling';
    frictionScalar = -Math.sign(speedAlong) * muK * normalMagnitude;
    note = 'Rolling, not sliding. What resists it is the contact flexing rather '
      + 'than surfaces being dragged across each other, and it is far weaker — '
      + 'which is the difference a wheel makes.';
  } else if (Math.abs(speedAlong) > SLIDE_EPSILON) {
    mode = 'kinetic';
    frictionScalar = -Math.sign(speedAlong) * muK * normalMagnitude;
    note = 'Sliding: friction is μk·N and points against the motion. How much '
      + 'surface is touching is not in that expression, and a wider object of '
      + 'the same mass has exactly the same friction.';
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
  // can see which force disappeared and why. Named for the mechanism actually
  // acting, because calling rolling resistance "friction" is how the two come
  // to be thought of as the same thing with a different number.
  list.push(force(rolling ? 'rolling' : 'friction', scale(t, frictionScalar), note));

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
