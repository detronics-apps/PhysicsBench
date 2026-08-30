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

import { vec, add, sub, scale, dot, len, norm, perp, ZERO } from './vec.js';
import { forcesOn, uniformField } from './forces.js';
import { substeps } from './integrator.js';
import { collide1D } from './collide.js';
import { G_STANDARD } from './constants.js';

/** A body counts as resting when it is this close to a surface. */
const CONTACT_TOLERANCE = 1e-3;
/** Below this approach speed a bounce is treated as settling, not bouncing. */
const BOUNCE_THRESHOLD = 0.05;

export const KINDS = ['ball', 'box', 'cart'];

/** One body, with every field defaulted so a scenario can name only what matters. */
export function body(spec = {}) {
  const kind = KINDS.includes(spec.kind) ? spec.kind : 'ball';
  const mass = Number.isFinite(spec.mass) && spec.mass > 0 ? spec.mass : 1;
  const radius = Number.isFinite(spec.radius) && spec.radius > 0
    ? spec.radius
    : defaultRadius(kind, mass);

  return {
    id: spec.id || `b${Math.random().toString(36).slice(2, 8)}`,
    kind,
    label: spec.label || '',
    mass,
    radius,
    // A box is drawn as a rectangle but supported at one point, because
    // rotation is not modelled. The disclosure names that assumption.
    width: spec.width ?? radius * 2,
    height: spec.height ?? radius * 2,
    pos: spec.pos || vec(0, radius),
    vel: spec.vel || ZERO,
    applied: spec.applied || ZERO,
    // Drag properties. Zero area means the air cannot get hold of it.
    cd: spec.cd ?? 0.47,
    area: spec.area ?? Math.PI * radius * radius,
    restitution: clamp01(spec.restitution ?? 0.5),
    muS: Math.max(0, spec.muS ?? 0.4),
    muK: Math.max(0, spec.muK ?? 0.3),
    fixed: !!spec.fixed,
    // Purely for the drawing: which of the palette's body colours to use.
    colour: spec.colour ?? 0,
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
      wind: spec.wind || ZERO,
    },
    ground: spec.ground === null ? null : {
      y: spec.ground?.y ?? 0,
      slopeDeg: spec.ground?.slopeDeg ?? 0,
      muS: Math.max(0, spec.ground?.muS ?? 0.4),
      muK: Math.max(0, spec.ground?.muK ?? 0.3),
      restitution: clamp01(spec.ground?.restitution ?? 0.5),
    },
    bounds: spec.bounds === null ? null : {
      left: spec.bounds?.left ?? -1e6,
      right: spec.bounds?.right ?? 1e6,
      top: spec.bounds?.top ?? 1e6,
      restitution: clamp01(spec.bounds?.restitution ?? 0.9),
    },
    bodyCollisions: spec.bodyCollisions ?? false,
    collisionRestitution: clamp01(spec.collisionRestitution ?? 1),
    // Energy that has left the mechanical account, and where it went. Never a
    // loss — always a destination.
    ledger: { heat: 0, impact: 0 },
    trailLimit: spec.trailLimit ?? 0,
    events: [],
  };
}

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
  const contact = isResting(world.ground, b)
    ? { normal: groundNormal(world.ground), muS: combine(world.ground.muS, b.muS), muK: combine(world.ground.muK, b.muK) }
    : null;
  return forcesOn(b, world.env, b.fixed ? null : contact);
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
    const surface = result.contact.touching ? perp(groundNormal(world.ground)) : null;
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
    const pos = add(b.pos, scale(add(b.vel, vel), dt / 2));

    // Friction turns mechanical energy into heat. It goes on the ledger with a
    // destination rather than quietly vanishing from the totals.
    const friction = result.by('friction');
    if (friction && friction.magnitude > 0 && slid > 0) {
      ledger.heat += friction.magnitude * slid;
    }

    return { ...b, pos, vel };
  });

  // Contacts are resolved after everyone has moved, so an impact and a bounce
  // cannot depend on which body happens to be first in the list.
  for (let i = 0; i < bodies.length; i += 1) {
    if (bodies[i].fixed) continue;
    resolveGround(bodies, i, world, ledger, events);
    resolveBounds(bodies, i, world, ledger, events);
  }

  if (world.bodyCollisions) resolvePairs(bodies, world, ledger, events);

  const t = world.t + dt;
  if (world.trailLimit > 0) {
    for (const b of bodies) {
      b.trail = [...b.trail, { x: b.pos.x, y: b.pos.y }].slice(-world.trailLimit);
    }
  }

  return { ...world, t, bodies, ledger, events };
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
      // Energy the bounce did not return has gone into the ground and the ball.
      ledger.impact += 0.5 * b.mass * approach * approach * (1 - e * e);
      events.push({ type: 'bounce', id: b.id, speed: Math.abs(approach), e, t: world.t });
    } else {
      // Too slow to bounce: it settles. Without this a ball jitters forever on
      // the floor, gaining a pixel of height every frame.
      vel = tangentPart;
      ledger.impact += 0.5 * b.mass * approach * approach;
      events.push({ type: 'settle', id: b.id, t: world.t });
    }
  }

  bodies[index] = { ...b, pos, vel };
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
    ledger.impact += 0.5 * b.mass * (len(b.vel) ** 2 - len(vel) ** 2);
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

      const delta = sub(b.pos, a.pos);
      const distance = len(delta);
      const touchAt = radiusAlong(a) + radiusAlong(b);
      if (distance >= touchAt || distance < 1e-12) continue;

      const n = norm(delta);
      const approach = dot(sub(a.vel, b.vel), n);
      if (approach <= 0) continue;                    // already separating

      const e = world.collisionRestitution;
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

const radiusAlong = (b) => (b.kind === 'ball' ? b.radius : b.width / 2);

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
    potential: b.mass * world.env.g * (b.pos.y - (world.ground?.y ?? 0)),
    weight: b.mass * world.env.g,
    heightAboveGround: height,
    forces: result.forces,
    net: result.net,
    contact: result.contact,
  };
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
    potential += b.mass * world.env.g * (b.pos.y - (world.ground?.y ?? 0));
  }
  const moved = world.ledger.heat + world.ledger.impact;
  return {
    momentum: vec(px, py),
    momentumX: px,
    kinetic,
    potential,
    mechanical: kinetic + potential,
    elsewhere: { ...world.ledger },
    // Nothing is lost: mechanical plus relocated is the constant.
    total: kinetic + potential + moved,
  };
}

/** Put a world back to a recorded set of bodies — the timeline scrubber's undo. */
export const restore = (world, snapshot) => ({
  ...world,
  t: snapshot.t,
  bodies: snapshot.bodies.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel }, trail: [...b.trail] })),
  ledger: { ...snapshot.ledger },
  events: [],
});

/** A deep-enough copy to record. */
export const snapshot = (world) => ({
  t: world.t,
  bodies: world.bodies.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel }, trail: [...b.trail] })),
  ledger: { ...world.ledger },
});

export { perp, ZERO };
