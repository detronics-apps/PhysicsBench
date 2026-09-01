/**
 * The 2D world: bodies, ground, walls, and one step of time. Pure.
 *
 * Everything in the app that moves is a `world` stepped by this module — the
 * ball in the Mass lab, the cart on the track, the box on the ramp, the pair in
 * the Collision lab. One simulation core means one place where a sign can be
 * wrong, and one place to fix it.
 *
 * `step` takes a world and returns a *new* world. Nothing is mutated, which is
 * what makes the timeline scrubber possible: a recorded frame stays exactly as
 * it was recorded, so stepping backwards is reading, not re-simulating.
 *
 * The scheme is semi-implicit Euler with small substeps rather than RK4, and
 * that is a deliberate trade. RK4 is more accurate but assumes the forces vary
 * smoothly, and contact does not: a ball meeting the floor changes its forces
 * discontinuously, mid-step, and a high-order method integrates straight
 * through the discontinuity and gets a worse answer than a small step would.
 * Where the motion *is* smooth — free flight, projectiles, pendulums — the app
 * uses the analytic solution or RK4 instead, and those two agree, which is how
 * we know this one is behaving.
 */

import { vec, add, sub, scale, dot, len, len2, norm, perp, ZERO } from './vec.js';
import { forcesOn, uniformField, buoyantMass, potentialEnergy, potentialShift } from './forces.js';
import { wall as makeWall, nearestContact, isRealWall } from './segments.js';
import { facing, settleAngle, rollAngle, alongSurface } from './orient.js';
import { attractionVector, surfaceGravity } from './gravitation.js';
import { substeps } from './integrator.js';
import { collide1D } from './collide.js';
import { G_STANDARD, C_LIGHT } from './constants.js';

/** A body counts as resting when it is this close to a surface. */
const CONTACT_TOLERANCE = 1e-3;
/** Below this approach speed a bounce is treated as settling, not bouncing. */
const BOUNCE_THRESHOLD = 0.05;

/**
 * A spent projectile stops being part of the experiment and starts being
 * clutter, so it fades out and goes.
 *
 * Only ever once it has come to rest, and that restriction is doing real work:
 * a body that vanishes takes its momentum with it, and the app puts the total
 * on screen as a conserved quantity. Something stationary has none to take. Its
 * potential energy is another matter, so that is booked on the way out rather
 * than quietly leaving the totals.
 */
const SPENT_SPEED = 0.06;
const FADE_SECONDS = 3;

/**
 * The speed at which this simulation stops being able to tell the truth.
 *
 * A tenth of the speed of light. Classical mechanics is still good to about
 * half a per cent there and getting worse fast, and a learner who invents a
 * neutron star deserves to be told that rather than shown a number with no
 * meaning behind it — or, worse, a NaN that quietly empties the drawing.
 */
const CLASSICAL_LIMIT = C_LIGHT / 10;

export const KINDS = ['ball', 'box', 'cart', 'planet'];

/** One body, with every field defaulted so a scenario can name only what matters. */
export function body(spec = {}) {
  const kind = KINDS.includes(spec.kind) ? spec.kind : 'ball';
  const mass = Number.isFinite(spec.mass) && spec.mass > 0 ? spec.mass : 1;
  const radius = Number.isFinite(spec.radius) && spec.radius > 0
    ? spec.radius
    : defaultRadius(kind, mass);
  const height = spec.height ?? radius * 2;

  return {
    id: spec.id || `b${Math.random().toString(36).slice(2, 8)}`,
    kind,
    label: spec.label || '',
    mass,
    radius,
    // A box is drawn as a rectangle but supported at one point, because
    // rotation is not modelled. The disclosure names that assumption.
    width: spec.width ?? radius * 2,
    height,
    // How far the underside is from the centre — what decides the height it
    // rests at. Not the same as the radius for anything that is not round: a
    // flat plate is ten times wider than it is thick.
    //
    // Derived from the resolved height rather than from `spec.height`, because
    // `undefined / 2` is NaN and `??` does not catch a NaN — it would have
    // reached the contact code as a silent NaN on every body given no explicit
    // height, which is most of them.
    support: spec.support ?? height / 2,
    pos: spec.pos || vec(0, radius),
    vel: spec.vel || ZERO,
    applied: spec.applied || ZERO,
    // Drag properties. Zero area means the air cannot get hold of it.
    cd: spec.cd ?? 0.47,
    area: spec.area ?? Math.PI * radius * radius,
    // Volume is a separate question from frontal area, and buoyancy needs this
    // one. A car and a cube of the same width shove aside very different
    // amounts of fluid.
    volume: spec.volume ?? (4 / 3) * Math.PI * radius ** 3,
    // Which outline to draw, so the renderer does not have to guess from kind.
    shapeId: spec.shapeId || null,
    // What it is made of, which is half of how bouncy any impact it takes part
    // in turns out to be.
    materialId: spec.materialId || null,
    // Whatever the pointer or the keyboard is asking of this body, as a force.
    controlForce: spec.controlForce || ZERO,
    restitution: clamp01(spec.restitution ?? 0.5),
    muS: Math.max(0, spec.muS ?? 0.4),
    /*
     * How hard it is to keep this thing rolling, if it is not the ground's
     * business. Null means the ground decides, which is the honest default —
     * rolling resistance is a property of the pair, not of the ball alone.
     *
     * A cannon shot is the exception worth having: it is the one body whose
     * whole job is to arrive and stop, and a ball on a hard floor rolls a very
     * long way. Sliding friction cannot help there — a rolling ball is not
     * sliding, so mu does not enter — which is why this had to exist at all.
     */
    rollingCoefficient: Number.isFinite(spec.rollingCoefficient) && spec.rollingCoefficient >= 0
      ? spec.rollingCoefficient
      : null,
    muK: Math.max(0, spec.muK ?? 0.3),
    // A planet is immovable unless told otherwise. Newton's third law does
    // apply to it — the object pulls back just as hard — but a 1 kg mass
    // accelerates the Earth by 10⁻²⁴ m/s², and pretending otherwise would
    // cost more in confusion than it buys in honesty. The disclosure says so.
    fixed: spec.fixed ?? spec.kind === 'planet',
    // Purely for the drawing: which of the palette's body colours to use, which
    // way the outline is turned, and how far a rolling one has rolled. None of
    // these is a degree of freedom — there is no moment of inertia here and
    // nothing can be spun up by a force. See js/orient.js.
    colour: spec.colour ?? 0,
    align: spec.align || 'surface',
    rolls: !!spec.rolls,
    angle: spec.angle ?? 0,
    flip: !!spec.flip,
    spin: spec.spin ?? 0,
    /*
     * Fired by a cannon, and therefore scenery rather than apparatus: it does
     * not hold the camera, it does not collide with other shots, and once it
     * has come to rest it fades out and is removed.
     */
    projectile: !!spec.projectile,
    still: spec.still ?? 0,
    fade: spec.fade ?? 1,
    trail: spec.trail ? [...spec.trail] : [],
  };
}

const defaultRadius = (kind, mass) => (kind === 'ball'
  // A visually sensible size that grows slowly with mass, so a 10 kg ball looks
  // heavier than a 1 kg one without being ten times the size on screen.
  ? 0.12 * Math.cbrt(mass)
  : 0.2 * Math.cbrt(mass));

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/**
 * A world.
 *
 * `ground` is a straight surface through `(0, y)` at `slopeDeg`, which covers
 * both the flat floor and the ramp without a second code path.
 */
export function createWorld(spec = {}) {
  const g = Number.isFinite(spec.g) ? spec.g : G_STANDARD;
  return {
    t: 0,
    bodies: (spec.bodies || []).map(body),
    env: {
      g,
      field: spec.field || uniformField(g),
      fluidDensity: Math.max(0, spec.fluidDensity ?? 0),
      viscosity: Math.max(0, spec.viscosity ?? 0),
      /*
       * Named rather than a function, so a world stays plain data and can be
       * snapshotted, restored and compared like any other. 'isa' means the
       * density is looked up at the body's own height instead of read here.
       */
      fluidProfile: spec.fluidProfile ?? null,
      // Where the height in that lookup is measured from. The ground sits at
      // y = 0, so sea level does too unless a scene says otherwise.
      seaLevel: Number.isFinite(spec.seaLevel) ? spec.seaLevel : 0,
      wind: spec.wind || ZERO,
      // When true, bodies pull on each other by G·m₁·m₂/r² instead of sitting
      // in a uniform field. That is the difference between "gravity is a
      // number pointing down" and "gravity is what masses do to each other".
      mutualGravity: !!spec.mutualGravity,
    },
    ground: spec.ground === null ? null : {
      y: spec.ground?.y ?? 0,
      slopeDeg: spec.ground?.slopeDeg ?? 0,
      muS: Math.max(0, spec.ground?.muS ?? 0.4),
      muK: Math.max(0, spec.ground?.muK ?? 0.3),
      // What something that rolls meets instead of μ. A different mechanism,
      // not a smaller version of the same one.
      rolling: Math.max(0, spec.ground?.rolling ?? 0.01),
      restitution: clamp01(spec.ground?.restitution ?? 0.5),
    },
    bounds: spec.bounds === null ? null : {
      left: spec.bounds?.left ?? -1e6,
      right: spec.bounds?.right ?? 1e6,
      top: spec.bounds?.top ?? 1e6,
      restitution: clamp01(spec.bounds?.restitution ?? 0.9),
    },
    /*
     * Drawn walls: ramps, barriers, the sides of a box. Each is two points, and
     * a body rests on one exactly as it rests on the ground — same normal force,
     * same friction, same settling. Anything less and a car could be driven up a
     * drawn ramp but not parked on it.
     */
    walls: (spec.walls || []).map(makeWall).filter(isRealWall),
    /*
     * Cannons fire copies of an object into the scene at a known speed and
     * angle, which is the cheapest way to ask "what happens to twenty of these
     * at once" without placing twenty of them by hand.
     */
    cannons: (spec.cannons || []).map(cannon),
    maxBodies: Math.max(1, spec.maxBodies ?? 20),
    shotCount: spec.shotCount ?? 0,
    bodyCollisions: spec.bodyCollisions ?? false,
    collisionRestitution: clamp01(spec.collisionRestitution ?? 1),
    // When true, each impact uses the two bodies' own bounciness rather than
    // one number for the whole scene.
    materialBounce: spec.materialBounce ?? false,
    // Energy that has left the mechanical account, and where it went. Never a
    // loss — always a destination.
    // Energy that has left the mechanical account, and where it went — plus
    // what has been put *in* by an applied force. Without that last one the
    // totals cannot balance while anything is being pushed, and an app that
    // prints "total energy" next to a number that visibly climbs has taught
    // the opposite of what it meant to.
    ledger: { heat: 0, impact: 0, input: 0, removed: 0 },
    trailLimit: spec.trailLimit ?? 0,
    events: [],
  };
}

/**
 * A cannon: a position, a direction, a muzzle speed, and what it fires.
 *
 * The muzzle speed is an initial velocity and nothing more — no force acts once
 * the shot has left. That is deliberate, and it is the same lesson as step two:
 * whatever happens to the shot afterwards is gravity, drag and walls, never a
 * lingering memory of having been fired.
 */
export function cannon(spec = {}) {
  return {
    id: spec.id || 'c' + Math.random().toString(36).slice(2, 7),
    x: Number.isFinite(spec.x) ? spec.x : 0,
    y: Number.isFinite(spec.y) ? spec.y : 0,
    angleDeg: Number.isFinite(spec.angleDeg) ? spec.angleDeg : 45,
    speed: Math.max(0, Number.isFinite(spec.speed) ? spec.speed : 8),
    mass: Math.max(1e-6, Number.isFinite(spec.mass) ? spec.mass : 0.5),
    size: Math.max(0.01, Number.isFinite(spec.size) ? spec.size : 0.2),
    shapeId: spec.shapeId || 'sphere',
    materialId: spec.materialId || null,
    // Resolved from the material by the caller, so the stepper does not need a
    // material table to fire something with the right bounciness.
    restitution: Number.isFinite(spec.restitution) ? spec.restitution : undefined,
    /*
     * How hard its shots grip whatever they land on.
     *
     * Shots used to take the generic body default of 0.4 and nothing else,
     * which is a skid: fired along a floor they slid almost indefinitely,
     * behaving like ice regardless of what the bench was set to. Two is a
     * deliberately strong grip — rubber on dry tarmac territory — so a shot
     * lands, bites and stops, and the interesting part is the collision rather
     * than the long glide afterwards. Adjustable, because a shot skittering
     * across a smooth floor is also a thing worth seeing.
     */
    muS: Math.max(0, Number.isFinite(spec.muS) ? spec.muS : 2),
    muK: Math.max(0, Number.isFinite(spec.muK) ? spec.muK : 1.5),
    /*
     * And how hard its shots are to keep rolling.
     *
     * Round shots roll rather than slide, and rolling resistance is one to
     * three orders of magnitude weaker than friction — so a fired ball on the
     * ground's default 0.01 crosses the bench and keeps going. This is the
     * lever that actually stops one; mu above is the lever that stops a shot
     * that slides. They are different mechanisms and neither substitutes for
     * the other, which is exactly the distinction step six is about.
     */
    rolling: Math.max(0, Number.isFinite(spec.rolling) ? spec.rolling : 0.25),
    // Zero means a single shot when the run starts; anything else is a rate.
    everySeconds: Math.max(0, Number.isFinite(spec.everySeconds) ? spec.everySeconds : 1),
    fired: spec.fired ?? 0,
  };
}

/** The velocity a cannon gives whatever leaves it. */
export const muzzleVelocity = (c) => vec(
  c.speed * Math.cos((c.angleDeg * Math.PI) / 180),
  c.speed * Math.sin((c.angleDeg * Math.PI) / 180),
);

/* -------------------------------------------------------------- geometry -- */

/** The unit normal of the ground, pointing up out of the surface. */
export function groundNormal(ground) {
  if (!ground) return vec(0, 1);
  const rad = (ground.slopeDeg * Math.PI) / 180;
  // Slope direction is (cos, sin); its left perpendicular points out of the
  // surface, which for a level floor is straight up.
  return norm(vec(-Math.sin(rad), Math.cos(rad)));
}

/** Signed distance from a body's surface to the ground: negative means inside. */
export function groundGap(ground, b) {
  if (!ground) return Infinity;
  const n = groundNormal(ground);
  const support = b.kind === 'ball' ? b.radius : b.height / 2;
  return dot(sub(b.pos, vec(0, ground.y)), n) - support;
}

/**
 * Whatever this body is standing on — the ground, or a wall somebody drew.
 *
 * One contact, whichever surface it comes from, because a model without
 * rotation has one normal to work with. Returning the same shape for both means
 * the normal force, friction, the settling rule and the anti-jitter clamp all
 * work on a drawn ramp without knowing that drawn ramps exist.
 *
 * The ground wins ties. It is the surface the teaching steps are built on, and
 * a wall drawn along the floor should not quietly take over from it.
 */
export function contactFor(world, b) {
  if (b.fixed) return null;

  if (isResting(world.ground, b)) {
    return {
      normal: groundNormal(world.ground),
      muS: combine(world.ground.muS, b.muS),
      muK: combine(world.ground.muK, b.muK),
      rolling: b.rolls,
      rollingCoefficient: b.rollingCoefficient ?? world.ground.rolling,
      surface: 'ground',
    };
  }

  const hit = nearestContact(world.walls, b.pos, radiusAlong(b), CONTACT_TOLERANCE);
  if (!hit) return null;
  // Moving away from the wall fast enough not to count as resting on it.
  if (dot(b.vel, hit.normal) > BOUNCE_THRESHOLD) return null;
  return {
    normal: hit.normal,
    muS: combine(hit.mu, b.muS),
    muK: combine(hit.mu * 0.75, b.muK),
    rolling: b.rolls,
    rollingCoefficient: b.rollingCoefficient ?? world.ground?.rolling ?? 0.01,
    surface: 'wall',
  };
}

const isResting = (ground, b) => {
  if (!ground) return false;
  const gap = groundGap(ground, b);
  if (gap > CONTACT_TOLERANCE) return false;
  // Moving away fast enough not to be in contact any more.
  return dot(b.vel, groundNormal(ground)) <= BOUNCE_THRESHOLD;
};

/**
 * The forces on one body right now, with its contact worked out first.
 *
 * Exported because the inspector and the arrows need exactly this, and
 * recomputing it separately is how the numbers and the picture drift apart.
 */
export function forcesFor(world, b) {
  const contact = contactFor(world, b);

  /*
   * Mutual gravitation is added as an extra force rather than folded into the
   * field, so it shows up in the inspector as its own labelled arrow — pointing
   * at the thing that is pulling. That is the whole point of the stage: the
   * force has a source you can see, and it is not "downward" until one of the
   * masses is big enough to make every direction but one irrelevant.
   */
  const extraForces = world.env.mutualGravity
    ? world.bodies
      .filter((other) => other.id !== b.id && other.mass > 0)
      .map((other) => ({
        id: 'weight',
        vec: attractionVector(b, other),
        towards: other.id,
        note: `Attraction towards ${other.label || other.id}. Both bodies feel `
          + 'exactly this, in opposite directions — the reason only one of them '
          + 'visibly moves is F = ma afterwards, not the pull itself.',
      }))
      .filter((f) => Number.isFinite(f.vec.x) && Number.isFinite(f.vec.y))
    : [];

  return forcesOn(
    { ...b, extraForces: [...(b.extraForces || []), ...extraForces] },
    world.env,
    b.fixed ? null : contact,
  );
}

/**
 * Two surfaces in contact, one coefficient. The geometric mean is the usual
 * engineering convention and is at least defensible; taking one surface's value
 * and ignoring the other's is not.
 */
const combine = (a, b) => Math.sqrt(Math.max(0, a) * Math.max(0, b));

/* ------------------------------------------------------------- stepping -- */

/**
 * Advance the world by `dt`, in as many substeps as accuracy needs.
 *
 * Events are gathered from every substep rather than only the last. A collision
 * happens inside one substep and is over in the next, so keeping only the final
 * step's events loses exactly the moment the Collision lab exists to capture.
 */
export function advance(world, dt, maxStep = 0.002) {
  const plan = substeps(dt, maxStep);
  let next = world;
  const events = [];
  for (let i = 0; i < plan.count; i += 1) {
    next = step(next, plan.dt);
    if (next.events.length) events.push(...next.events);
  }
  return plan.count ? { ...next, events } : world;
}

/** One step. Returns a new world; the one passed in is untouched. */
export function step(world, dt) {
  const events = [];
  const ledger = { ...world.ledger };

  const bodies = world.bodies.map((b) => {
    if (b.fixed) return { ...b, trail: b.trail };

    const result = forcesFor(world, b);
    // Semi-implicit: velocity first, then position from the new velocity.
    let vel = add(b.vel, scale(result.acceleration, dt));

    /*
     * Friction can stop a body. It cannot drive one backwards.
     *
     * Without this the box that has just come to rest overshoots by a fraction
     * of a millimetre per second, friction reverses to chase it, and it sits
     * there twitching between two velocities for ever — creeping slowly
     * backwards up a ramp it should be sitting still on. The cure is to notice
     * when friction alone has carried the tangential velocity through zero
     * within a step, and put it exactly at zero instead.
     *
     * Only when friction alone did it: if the applied force is bigger than
     * static friction could hold, the body really is being pushed the other way
     * and must be allowed to go.
     */
    // The direction along whichever surface it is on — the ground, or a wall
    // somebody drew. Taking the ground's normal here regardless was fine while
    // the ground was the only thing to stand on, and would have let a box creep
    // sideways for ever on a ramp drawn at any other angle.
    const surface = result.contact.touching && result.contact.normal
      ? perp(result.contact.normal)
      : null;
    let slid = 0;
    if (surface) {
      const beforeT = dot(b.vel, surface);
      const afterT = dot(vel, surface);
      const heldByStatic = result.contact.tangentialDemand <= result.contact.staticLimit;
      if (beforeT !== 0 && Math.sign(afterT) !== Math.sign(beforeT) && heldByStatic) {
        vel = sub(vel, scale(surface, afterT));
      }
      // Distance slid, from the mid-step velocity: this is what makes the work
      // done by friction come out equal to the kinetic energy it removed.
      slid = Math.abs(((beforeT + dot(vel, surface)) / 2) * dt);
    }

    /*
     * Position from the *average* of the old and new velocities, not the new
     * one alone.
     *
     * Plain semi-implicit Euler advances position by v_new·dt, which
     * over-shoots by ½a·dt² every step. Individually invisible; accumulated
     * over a two-second fall it moves the ball far enough to change its
     * potential energy in the second decimal place, and an app that puts
     * "total energy" on screen and lets it drift while insisting energy is
     * conserved has undermined its own lesson. Averaging costs nothing, keeps
     * the scheme stable through contacts, and is exact for constant
     * acceleration — so free fall here agrees with the closed-form answer.
     */
    let pos = add(b.pos, scale(add(b.vel, vel), dt / 2));

    /*
     * Two guards, and both of them exist to say something rather than to hide
     * something.
     *
     * A field strong enough to matter — a neutron star, or an invented world —
     * accelerates the object past the point where classical mechanics describes
     * anything, and shortly afterwards past the point where a double can hold
     * the answer. Left alone that arrives as a NaN position, which empties the
     * drawing with no explanation at all.
     */
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)
      || !Number.isFinite(vel.x) || !Number.isFinite(vel.y)) {
      events.push({ type: 'diverged', id: b.id, t: world.t });
      return { ...b, vel: ZERO, diverged: true };
    }
    if (len(vel) > CLASSICAL_LIMIT) {
      events.push({ type: 'relativistic', id: b.id, speed: len(vel), t: world.t });
      vel = scale(norm(vel), CLASSICAL_LIMIT);
      pos = add(b.pos, scale(add(b.vel, vel), dt / 2));
    }

    // Friction turns mechanical energy into heat. It goes on the ledger with a
    // destination rather than quietly vanishing from the totals.
    const friction = result.by('friction') || result.by('rolling');
    if (friction && friction.magnitude > 0 && slid > 0) {
      ledger.heat += friction.magnitude * slid;
    }

    /*
     * Drag heats the fluid, and that has to appear on the books too.
     *
     * Friction had a destination from the start and drag did not, which meant
     * the totals balanced perfectly on a rough floor and drifted the moment the
     * object was put in air — the one place a learner would most reasonably ask
     * "where did that energy go?". It goes into the fluid, as heat, exactly as
     * friction's goes into the surfaces.
     */
    const fluidResistance = result.by('drag');
    if (fluidResistance && fluidResistance.magnitude > 0) {
      const travelled = { x: (b.vel.x + vel.x) / 2 * dt, y: (b.vel.y + vel.y) / 2 * dt };
      ledger.heat += Math.abs(fluidResistance.vec.x * travelled.x + fluidResistance.vec.y * travelled.y);
    }

    // Work done *on* the system by whatever is doing the pushing. W = F·d,
    // taken along the mid-step displacement so it matches the energy the object
    // actually gained. This is the other side of the ledger: energy is not
    // being created when you push something, it is arriving from you.
    // Both the timed push and whatever your hand is doing on the keyboard are
    // outside agents doing work on the system, and both have to be booked, or
    // the invariant on screen drifts the moment anybody drives.
    for (const id of ['applied', 'control']) {
      const external = result.by(id);
      if (!external || external.magnitude <= 0) continue;
      const step = { x: (b.vel.x + vel.x) / 2 * dt, y: (b.vel.y + vel.y) / 2 * dt };
      ledger.input += external.vec.x * step.x + external.vec.y * step.y;
    }

    /*
     * Which way it is drawn. Not a degree of freedom: the target comes from the
     * surface it is on or the direction it is going, and it eases towards that
     * at a fixed rate so landing on a slope is something you watch happen. A
     * rolling body instead turns by exactly the distance it has covered, which
     * is fixed by the contact rather than by any dynamics.
     */
    const wanted = facing({
      align: b.align,
      surfaceNormal: result.contact.touching ? result.contact.normal : null,
      velocity: vel,
      hasField: len(world.env.field) > 0,
    });
    const angle = settleAngle(b.angle, wanted, b.flip, dt);
    /*
     * How far it has rolled, measured along the surface in the direction that
     * agrees with +x on level ground.
     *
     * `perp` returns the *left* perpendicular, so on a flat floor it points
     * backwards; using it here spun the ball the wrong way for the distance it
     * had covered — visibly, since the spoke is the only thing that says
     * "rolling" rather than "sliding". The friction code is indifferent to
     * which way its tangent points, because it only ever compares signs against
     * itself, so nothing else noticed.
     */
    const rollTangent = result.contact.touching && result.contact.normal
      ? alongSurface(result.contact.normal)
      : null;
    const spin = b.rolls && rollTangent
      ? rollAngle(b.spin, ((dot(b.vel, rollTangent) + dot(vel, rollTangent)) / 2) * dt, b.radius)
      : b.spin;

    return { ...b, pos, vel, angle, flip: wanted.flip, spin };
  });

  // Contacts are resolved after everyone has moved, so an impact and a bounce
  // cannot depend on which body happens to be first in the list.
  for (let i = 0; i < bodies.length; i += 1) {
    if (bodies[i].fixed) continue;
    resolveGround(bodies, i, world, ledger, events);
    resolveWalls(bodies, i, world, ledger, events);
    resolveBounds(bodies, i, world, ledger, events);
  }

  if (world.bodyCollisions) resolvePairs(bodies, world, ledger, events);

  const t = world.t + dt;

  const surviving = retireSpentShots(bodies, dt, world, ledger, events);

  // Cannons fire inside the step, so a shot is recorded on the timeline like
  // everything else, and scrubbing back to before it was fired shows a scene
  // without it.
  const fired = fireCannons(world, surviving, t, events, ledger);

  if (world.trailLimit > 0) {
    for (const b of surviving) {
      // A shot leaves no trail: twenty fading lines is the clutter this is all
      // trying to avoid, drawn in a different colour.
      if (b.projectile) continue;
      b.trail = [...b.trail, { x: b.pos.x, y: b.pos.y }].slice(-world.trailLimit);
    }
  }

  return {
    ...world, t, bodies: surviving, ledger, events,
    cannons: fired.cannons, shotCount: fired.shotCount,
  };
}

/**
 * Spent shots fade out and go.
 *
 * The rule is deliberately narrow: a projectile that has come to rest, and only
 * that. Removing something that is still moving would take its momentum out of
 * a total the app displays as conserved, which would be a visible lie about the
 * one quantity it insists never changes. Something at rest carries none.
 *
 * Its potential energy is a different matter — a shot resting on a shelf has
 * some — so that is moved onto the ledger on the way out rather than silently
 * leaving the books.
 */
function retireSpentShots(bodies, dt, world, ledger, events) {
  if (!bodies.some((b) => b.projectile)) return bodies;
  const out = [];

  for (const b of bodies) {
    if (!b.projectile) { out.push(b); continue; }

    const spent = len(b.vel) < SPENT_SPEED;
    const still = spent ? b.still + dt : 0;

    if (still >= FADE_SECONDS) {
      const potential = potentialEnergy(b, world.env, world.ground?.y ?? 0);
      ledger.removed += 0.5 * b.mass * len2(b.vel) + potential;
      events.push({ type: 'retired', id: b.id, t: world.t });
      continue;
    }

    b.still = still;
    b.fade = 1 - still / FADE_SECONDS;
    out.push(b);
  }
  return out;
}

/**
 * Fire whichever cannons are due, up to the body limit.
 *
 * The limit is real and it says so when it is reached: past twenty bodies the
 * drawing is a cloud rather than an experiment, and silently dropping shots
 * would look like the cannon had broken.
 */
function fireCannons(world, bodies, t, events, ledger) {
  const cannons = world.cannons || [];
  if (!cannons.length) return { cannons, shotCount: world.shotCount ?? 0 };

  let shotCount = world.shotCount ?? 0;
  const next = cannons.map((c) => {
    const due = c.everySeconds > 0 ? Math.floor(t / c.everySeconds) + 1 : 1;
    if (c.fired >= due) return c;
    if (bodies.length >= world.maxBodies) {
      events.push({ type: 'cannon-full', id: c.id, limit: world.maxBodies, t });
      return c;
    }
    shotCount += 1;
    const shot = body({
      id: 'shot-' + shotCount,
      kind: c.shapeId === 'cube' || c.shapeId === 'plate' ? 'box' : 'ball',
      shapeId: c.shapeId,
      mass: c.mass,
      radius: c.size / 2,
      width: c.size,
      height: c.size,
      diameter: c.size,
      pos: vec(c.x, c.y),
      vel: muzzleVelocity(c),
      materialId: c.materialId,
      // Its own grip, so a shot stops where it lands instead of skating on —
      // whether it gets there by sliding or by rolling.
      muS: c.muS,
      muK: c.muK,
      rollingCoefficient: c.rolling,
      // Its own bounciness, so a steel shot and a clay shot hit differently.
      restitution: world.materialBounce && c.restitution !== undefined
        ? c.restitution
        : world.collisionRestitution,
      colour: 3,
      projectile: true,
      rolls: c.shapeId === 'sphere' || c.shapeId === 'cylinder',
      align: c.shapeId === 'car' || c.shapeId === 'spaceship' || c.shapeId === 'streamlined'
        ? 'travel'
        : 'surface',
    });
    bodies.push(shot);

    /*
     * A cannon does work on its shot, and that work has to be booked.
     *
     * Without this the shot simply appears holding kinetic energy that nothing
     * paid for, and the number the app labels "the books" — the one it promises
     * does not move — climbs by half a muzzle-energy every time the cannon
     * goes off. An app that prints an invariant beside a figure visibly
     * ratcheting upward has taught the opposite of what it meant to.
     *
     * The height it appears at costs too: a shot fired from three metres up
     * arrives holding potential energy, and the cannon paid for that as well.
     */
    const kinetic = 0.5 * shot.mass * len2(shot.vel);
    const potential = buoyantMass(shot, world.env) * world.env.g * (shot.pos.y - (world.ground?.y ?? 0));
    ledger.input += kinetic + potential;

    events.push({ type: 'fired', id: c.id, shot: 'shot-' + shotCount, t, muzzleEnergy: kinetic });
    return { ...c, fired: c.fired + 1 };
  });

  return { cannons: next, shotCount };
}

function resolveGround(bodies, index, world, ledger, events) {
  const ground = world.ground;
  if (!ground) return;
  const b = bodies[index];
  const gap = groundGap(ground, b);
  if (gap >= 0) return;

  const n = groundNormal(ground);
  // Push it back out to exactly touching, rather than letting it sink.
  const pos = add(b.pos, scale(n, -gap));
  const approach = dot(b.vel, n);
  let vel = b.vel;

  if (approach < 0) {
    const e = combine(ground.restitution, b.restitution);
    const normalPart = scale(n, approach);
    const tangentPart = sub(b.vel, normalPart);

    if (Math.abs(approach) > BOUNCE_THRESHOLD) {
      vel = add(tangentPart, scale(n, -approach * e));
      events.push({ type: 'bounce', id: b.id, speed: Math.abs(approach), e, t: world.t });
    } else {
      // Too slow to bounce: it settles. Without this a ball jitters forever on
      // the floor, gaining a pixel of height every frame.
      vel = tangentPart;
      events.push({ type: 'settle', id: b.id, t: world.t });
    }
  }

  bookContact(b, pos, vel, world, ledger);
  bodies[index] = { ...b, pos, vel };
}

/**
 * Put on the ledger exactly the mechanical energy a contact removed — no more.
 *
 * The obvious version, ½m·v_approach²·(1−e²), is wrong by a little every step,
 * and the little adds up. Pushing a penetrating body back out to the surface
 * *raises* it, which hands it potential energy that nothing paid for; charging
 * the ledger for the kinetic energy alone then books that free lift as though
 * it had been lost, and the totals creep upwards through a long contact.
 *
 * Measuring the whole mechanical change instead — kinetic and potential
 * together, before and after — cannot drift, because it is the definition of
 * what went missing rather than an estimate of it.
 */
function bookContact(before, pos, vel, world, ledger) {
  const kineticBefore = 0.5 * before.mass * len2(before.vel);
  const kineticAfter = 0.5 * before.mass * len2(vel);
  // PE = −m·(field · position), so a move against the field costs energy.
  // Against the *effective* mass: a fluid holding part of the weight up means
  // less potential energy is bought by the same rise, and charging the full mass
  // would book a contact as having lost energy it never had.
  const potentialChange = potentialShift(before, world.env, before.pos, pos);
  const lost = (kineticBefore - kineticAfter) - potentialChange;
  if (lost > 0) ledger.impact += lost;
}

/**
 * Contact with a drawn wall, resolved exactly as the ground is.
 *
 * Deliberately the same shape as resolveGround rather than something cleverer,
 * because the two have to agree: a ball dropped on the floor and the same ball
 * dropped onto a wall drawn along the floor must bounce to the same height, or
 * the drawing tool has quietly become a second physics engine.
 *
 * Repeated a few times, because a body in a corner is touching two walls and
 * pushing it out of one can push it into the other.
 */
function resolveWalls(bodies, index, world, ledger, events) {
  if (!world.walls?.length) return;
  for (let pass = 0; pass < 3; pass += 1) {
    const b = bodies[index];
    const hit = nearestContact(world.walls, b.pos, radiusAlong(b));
    if (!hit || hit.depth <= 0) return;

    const pos = add(b.pos, scale(hit.normal, hit.depth));
    const approach = dot(b.vel, hit.normal);
    let vel = b.vel;

    if (approach < 0) {
      const e = combine(hit.restitution, b.restitution);
      const normalPart = scale(hit.normal, approach);
      const tangentPart = sub(b.vel, normalPart);
      if (Math.abs(approach) > BOUNCE_THRESHOLD) {
        vel = add(tangentPart, scale(hit.normal, -approach * e));
        events.push({ type: 'bounce', id: b.id, surface: 'wall', speed: Math.abs(approach), e, t: world.t });
      } else {
        vel = tangentPart;
      }
    }

    bookContact(b, pos, vel, world, ledger);
    bodies[index] = { ...b, pos, vel };
  }
}

function resolveBounds(bodies, index, world, ledger, events) {
  const bounds = world.bounds;
  if (!bounds) return;
  const b = bodies[index];
  const r = b.kind === 'ball' ? b.radius : b.width / 2;
  let { pos, vel } = b;
  let hit = null;

  if (pos.x - r < bounds.left && vel.x < 0) {
    pos = vec(bounds.left + r, pos.y);
    vel = vec(-vel.x * bounds.restitution, vel.y);
    hit = 'left';
  } else if (pos.x + r > bounds.right && vel.x > 0) {
    pos = vec(bounds.right - r, pos.y);
    vel = vec(-vel.x * bounds.restitution, vel.y);
    hit = 'right';
  }

  const top = b.kind === 'ball' ? b.radius : b.height / 2;
  if (pos.y + top > bounds.top && vel.y > 0) {
    pos = vec(pos.x, bounds.top - top);
    vel = vec(vel.x, -vel.y * bounds.restitution);
    hit = 'top';
  }

  if (hit) {
    bookContact(b, pos, vel, world, ledger);
    events.push({ type: 'wall', id: b.id, side: hit, t: world.t });
    bodies[index] = { ...b, pos, vel };
  }
}

/**
 * Body-to-body contact.
 *
 * The labs that use this are one-dimensional — carts on a track, balls in a
 * line — so the impact is resolved along the line of centres with the exact
 * one-dimensional solution rather than an iterative solver. That keeps the
 * simulated result identical to the closed-form answer shown in the readout,
 * which matters: a learner comparing the two must not find them disagreeing in
 * the third decimal place.
 */
function resolvePairs(bodies, world, ledger, events) {
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      if (a.fixed && b.fixed) continue;
      /*
       * Two cannon shots pass through each other.
       *
       * They are not the experiment, they are what is being fired at it, and a
       * stream of them ricocheting off one another turns a demonstration into a
       * ball pit. Everything else on the bench still stops them, so what they
       * are aimed at behaves exactly as before.
       */
      if (a.projectile && b.projectile) continue;

      const delta = sub(b.pos, a.pos);
      const distance = len(delta);
      const touchAt = reachToward(a, b) + reachToward(b, a);
      if (distance >= touchAt || distance < 1e-12) continue;

      const n = norm(delta);
      const approach = dot(sub(a.vel, b.vel), n);
      if (approach <= 0) continue;                    // already separating

      // Below the bounce threshold the contact is a rest, not an impact. Without
      // this a ball sitting on a planet jitters for ever, gaining a fraction of
      // a millimetre every frame — the same bug the ground already guards
      // against, arriving through a different door.
      /*
       * Bounciness belongs to the pair that is meeting, not to the scene.
       *
       * Each body carries how bouncy it is against something hard, and the
       * geometric mean of the two is what this impact gets — so rubber into
       * rubber is lively, rubber into clay is dead, and neither is decided by a
       * single slider that applies to everything at once. `combine` is that
       * mean, and it is the same one two surfaces already use for friction.
       */
      const pairE = world.materialBounce
        ? combine(a.restitution, b.restitution)
        : world.collisionRestitution;
      const e = Math.abs(approach) > BOUNCE_THRESHOLD ? pairE : 0;
      const ua = dot(a.vel, n);
      const ub = dot(b.vel, n);
      const solved = collide1D(a.mass, ua, b.mass, ub, e);

      const newA = add(sub(a.vel, scale(n, ua)), scale(n, solved.after.v1));
      const newB = add(sub(b.vel, scale(n, ub)), scale(n, solved.after.v2));

      // Separate them so they are exactly touching, sharing the correction in
      // inverse proportion to mass — the heavy one barely moves.
      const overlap = touchAt - distance;
      const totalMass = a.mass + b.mass;
      const shiftA = a.fixed ? 0 : overlap * (b.mass / totalMass);
      const shiftB = b.fixed ? 0 : overlap * (a.mass / totalMass);

      bodies[i] = { ...a, vel: a.fixed ? a.vel : newA, pos: add(a.pos, scale(n, -shiftA)) };
      bodies[j] = { ...b, vel: b.fixed ? b.vel : newB, pos: add(b.pos, scale(n, shiftB)) };

      ledger.impact += solved.energyTransferred;
      events.push({
        type: 'collision',
        t: world.t,
        between: [a.id, b.id],
        e,
        before: { v1: ua, v2: ub, momentum: solved.before.momentum, kinetic: solved.before.kinetic },
        after: { v1: solved.after.v1, v2: solved.after.v2, momentum: solved.after.momentum, kinetic: solved.after.kinetic },
        energyTransferred: solved.energyTransferred,
      });
    }
  }
}

const radiusAlong = (b) => (b.kind === 'ball' || b.kind === 'planet' ? b.radius : b.width / 2);

/**
 * How far one body reaches towards another before they touch.
 *
 * Everything here is a circle for the purpose of body-to-body contact, which is
 * the point-mass assumption showing through, and for two objects meeting side
 * on the half-width is the right radius to use.
 *
 * Resting on a planet is not that case. A planet's surface is locally flat —
 * that is the whole lesson of the fourth step — so what decides the height a
 * body settles at is the distance from its centre to its underside, exactly as
 * on the ground. Using the half-width there left a flat plate hovering ten
 * times too high above the surface, which was invisible until the shape could
 * be changed at that step.
 */
function reachToward(b, other) {
  if (b.kind === 'planet') return b.radius;
  if (other.kind === 'planet') return b.support ?? radiusAlong(b);
  return radiusAlong(b);
}

/* -------------------------------------------------------------- reading -- */

export const findBody = (world, id) => world.bodies.find((b) => b.id === id) || null;

/**
 * Everything the Physics Inspector shows for one body, from one call.
 *
 * The inspector and the arrows draw from this same object, so a number on the
 * panel and an arrow on the drawing can never disagree.
 */
export function inspect(world, id) {
  const b = findBody(world, id);
  if (!b) return null;
  const result = forcesFor(world, b);
  const height = world.ground ? groundGap(world.ground, b) + (b.kind === 'ball' ? b.radius : b.height / 2) : b.pos.y;

  return {
    body: b,
    t: world.t,
    mass: b.mass,
    pos: b.pos,
    vel: b.vel,
    speed: len(b.vel),
    acceleration: result.acceleration,
    momentum: scale(b.vel, b.mass),
    kinetic: 0.5 * b.mass * len(b.vel) ** 2,
    potential: potentialEnergy(b, world.env, world.ground?.y ?? 0),
    weight: b.mass * world.env.g,
    buoyantWeight: buoyantMass(b, world.env) * world.env.g,
    heightAboveGround: height,
    forces: result.forces,
    net: result.net,
    contact: result.contact,
  };
}

/**
 * How high a body is above whatever it would land on, or `null` if nothing.
 *
 * Two different surfaces can be underneath: a drawn floor, where the answer is
 * the gap plus the body's own support so it reads zero when resting; or a
 * planet, where it is the distance between the centres less the planet's radius
 * and the body's support. In deep space with neither, there is no such thing as
 * an elevation and the honest answer is nothing at all rather than the y
 * coordinate, which would be a height above an origin nobody chose.
 */
export function elevation(world, bodyId = 'main') {
  const b = world.bodies.find((x) => x.id === bodyId) || world.bodies.find((x) => !x.fixed);
  if (!b) return null;
  const support = b.kind === 'ball' ? b.radius : b.height / 2;

  if (world.ground) return groundGap(world.ground, b);

  const planet = world.bodies.find((x) => x.kind === 'planet');
  if (planet) {
    const gap = len(sub(b.pos, planet.pos)) - (planet.radius || 0) - support;
    return Number.isFinite(gap) ? gap : null;
  }
  return null;
}

/** Total momentum and energy of the whole world, for the conservation readouts. */
export function totals(world) {
  let px = 0;
  let py = 0;
  let kinetic = 0;
  let potential = 0;
  for (const b of world.bodies) {
    if (b.fixed) continue;
    px += b.mass * b.vel.x;
    py += b.mass * b.vel.y;
    kinetic += 0.5 * b.mass * len(b.vel) ** 2;
    potential += potentialEnergy(b, world.env, world.ground?.y ?? 0);
  }
  // Energy that has left the mechanical account: turned to heat, spent in an
  // impact, or carried off the bench by a shot that was cleared away.
  const moved = world.ledger.heat + world.ledger.impact + (world.ledger.removed || 0);
  const supplied = world.ledger.input;
  return {
    momentum: vec(px, py),
    momentumX: px,
    kinetic,
    potential,
    mechanical: kinetic + potential,
    elsewhere: { ...world.ledger },
    // Everything the system currently holds or has passed on.
    total: kinetic + potential + moved,
    // What has been put in from outside. An applied force is an outside agent
    // doing work, so the conserved quantity is the difference, not the total.
    supplied,
    // The number that does not move. Whatever is pushed, heated or dropped,
    // this stays where it started.
    balance: kinetic + potential + moved - supplied,
  };
}

/** Put a world back to a recorded set of bodies — the timeline scrubber's undo. */
export const restore = (world, snapshot) => ({
  ...world,
  t: snapshot.t,
  bodies: snapshot.bodies.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel }, trail: [...b.trail] })),
  ledger: { ...snapshot.ledger },
  cannons: snapshot.cannons ? snapshot.cannons.map((c) => ({ ...c })) : world.cannons,
  shotCount: snapshot.shotCount ?? world.shotCount,
  events: [],
});

/** A deep-enough copy to record. */
export const snapshot = (world) => ({
  t: world.t,
  bodies: world.bodies.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel }, trail: [...b.trail] })),
  ledger: { ...world.ledger },
  cannons: (world.cannons || []).map((c) => ({ ...c })),
  shotCount: world.shotCount ?? 0,
});

export { perp, ZERO };
