/**
 * The bench, and the eight steps it grows through. Pure.
 *
 * This is one experiment, not eight. Every step adds one thing to the same
 * object on the same bench, and everything from the earlier steps stays: the
 * mass you set in step one is still the mass in step eight, and the controls
 * for it are still there.
 *
 * That matters more than it sounds. Split across separate labs, "mass",
 * "force", "gravity", "friction" and "drag" look like separate subjects with
 * separate formulas. Built up on one object they are visibly the same story —
 * each step is another force joining the same vector sum, and the sum is what
 * decides what happens next.
 *
 * `features` is the whole mechanism. A step turns features on; the controls,
 * the forces, the readouts and the drawing all ask "is this feature on?" rather
 * than "which step are we at?", so adding a control to a step is one line.
 *
 * There are two ways parameters reach the simulation, and the difference is the
 * difference between a bench and a slideshow:
 *
 *   `build`      makes a world from nothing. Used when the shape of the scene
 *                changes — a different step, an object added or removed.
 *   `applyLive`  pushes changed numbers into the world that is already running,
 *                without touching where anything is or how fast it is going.
 *
 * `applyLive` is what lets you set something moving and then turn the angle of
 * the push while watching the path bend. Rebuilding on every keystroke would
 * snap it back to the start, and an experiment you cannot adjust while it runs
 * is a diagram.
 */

import { vec } from './vec.js';
import { createWorld } from './world.js';
import { disclosure, equations } from './models.js';
import {
  describe as describeObject, shapeById, materialById, floats, rollsOn, pairBounce,
} from './shapes.js';
import { matchSurface, rollingFor } from './friction.js';
import { fluidById } from './drag.js';
import { describeWorld, uniformFieldValid, everydayComparison } from './gravitation.js';
import { isRealWall, wall as makeWall, MAX_WALLS } from './segments.js';
import { facing } from './orient.js';
import { fmtFixed } from './format.js';

/** How many objects one scene may hold, cannon shots included. */
export const MAX_OBJECTS = 10;

/* ------------------------------------------------------------- the steps -- */

export const STAGES = [
  {
    id: 'mass',
    label: 'A mass',
    short: 'Mass',
    features: ['shape'],
    ask: 'What is a mass, before anything happens to it?',
    discover: 'On its own, nothing happens. No forces act, so it stays exactly '
      + 'as it is — and that stubbornness is the only thing mass does until '
      + 'something tries to change it.',
    watch: 'Change the mass. Nothing moves, and nothing will, until you push it. '
      + 'Change the shape too, and notice that nothing happens then either — with '
      + 'no surface to rest on and no fluid to push through, a shape has nothing '
      + 'to act on. It starts mattering in step five, and you will be able to see '
      + 'exactly when.',
  },
  {
    id: 'push',
    label: 'Push it',
    short: 'Push',
    features: ['applied', 'shape'],
    ask: 'What happens if I push harder, or make it heavier?',
    discover: 'A push produces an acceleration, and the same push produces less '
      + 'acceleration on more mass. Acceleration piles up into velocity, and '
      + 'velocity piles up into position — so a push that lasts a moment keeps '
      + 'having consequences long after it has stopped.',
    watch: 'Set it running, then turn the push angle while it moves. The path '
      + 'bends from where it is now; nothing restarts. Velocity keeps its value '
      + 'after the push ends, because nothing is needed to maintain motion.',
  },
  {
    id: 'two-masses',
    label: 'A second mass',
    short: 'Two masses',
    features: ['applied', 'shape', 'second-mass', 'mutual-gravity'],
    ask: 'Do two masses pull on each other?',
    discover: 'They do — always, and by exactly the same force each way. The '
      + 'force is G·m₁·m₂/r², and for two objects you could lift it is so small '
      + 'that nothing you could measure in a room would show it.',
    watch: 'Read the attraction. It is real, and it is roughly a billionth of '
      + 'the weight of a grain of sand. Now make the second mass bigger.',
  },
  {
    id: 'planet',
    label: 'Grow it into a planet',
    short: 'Gravity',
    features: ['applied', 'shape', 'second-mass', 'mutual-gravity', 'planet'],
    ask: 'What has to change before that pull turns into weight?',
    discover: 'Nothing changes except the size of the other mass. Grow it to a '
      + 'planet and the same equation gives 9.8 m/s² — and the surface flattens '
      + 'out until "towards the centre" and "down" become the same direction. '
      + 'Weight is not a different force from that faint tug. It is that tug, '
      + 'with a planet on the other end of it.',
    watch: 'Set the mass and the radius. g is computed from them, never looked '
      + 'up — so a denser world of the same size pulls harder, and a bigger '
      + 'world of the same mass pulls less.',
  },
  {
    /*
     * The floor arrives here, along with friction.
     *
     * There was a step in between that introduced the surface on its own — the
     * normal force, the tilt, and what tilting does to the weight. Its controls
     * now live with the world they describe, so the step had nothing left that
     * this one does not also do, and what it taught is said here instead: you
     * cannot explain friction without first explaining what it is proportional
     * to, so the two were always going to be read together.
     */
    id: 'friction',
    label: 'Friction',
    short: 'Friction',
    features: ['applied', 'planet', 'ground', 'shape', 'space', 'friction'],
    ask: 'Now there is a floor. What holds the object up, and what holds it back?',
    discover: 'The surface pushes back — exactly hard enough, and no harder. '
      + 'Tilt it and only part of the weight presses in; the rest is left over '
      + 'along the slope, and that leftover is what the object slides on. '
      + 'Friction then takes whatever value it needs to stop it sliding, up to a '
      + 'limit set by how hard the surfaces are pressed together — which is the '
      + 'normal force again. Past that limit it lets go and drops to a lower '
      + 'value, which is why a stuck object lurches when it finally moves.',
    watch: 'Tilt the ground under "The world it is on" and watch the normal '
      + 'force shrink as the leftover along the slope grows. Push gently and '
      + 'watch friction match you exactly, then push past the static limit and '
      + 'watch it fall. Switch the world to deep space and the floor, the '
      + 'weight and the normal force all go together.',
  },
  {
    id: 'fluid',
    label: 'Fluids and objects',
    short: 'Fluids',
    features: ['applied', 'planet', 'ground', 'shape', 'space', 'friction', 'fluid', 'objects'],
    ask: 'Air, water, honey — what actually changes?',
    discover: 'Two things about a fluid matter: how much of it there is to shove '
      + 'aside, and how much it resists being sheared. In air, inertia wins and '
      + 'drag goes as the square of the speed. In honey, viscosity wins and drag '
      + 'goes as the speed itself. And the fluid pushes up on everything in it, '
      + 'by the weight of what it displaces — so anything less dense than the '
      + 'fluid goes up instead of down.',
    watch: 'Switch between air and honey at the same speed and watch the '
      + 'Reynolds number cross from thousands to about one. Then make the object '
      + 'a balloon and put it in water: it rises, from the same equation that '
      + 'makes the steel one sink.',
  },
  {
    id: 'collide',
    label: 'Playground',
    short: 'Playground',
    features: ['applied', 'planet', 'ground', 'shape', 'space', 'friction', 'fluid', 'objects', 'obstacles', 'collide', 'control'],
    ask: 'Everything at once — what survives a collision, and what does not?',
    discover: 'Total momentum comes out exactly as it went in, every time, '
      + 'whatever the objects do to each other. Kinetic energy does not — only a '
      + 'perfectly elastic collision keeps it, and almost nothing is. What '
      + 'leaves the kinetic account has gone somewhere: heat, sound, a dent.',
    watch: 'Change the bounciness and watch which of the two totals moves. Then '
      + 'take the controls yourself and drive one object into the others — the '
      + 'steering is a force like any other, so it appears as an arrow and its '
      + 'work is on the same books. Everything from the first seven steps is '
      + 'still here and still switched on; this is the same bench with nothing '
      + 'held back.',
  },
];

export const stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
export const stageIndex = (id) => Math.max(0, STAGES.findIndex((s) => s.id === id));

/** Is a feature switched on at this step? */
export const has = (stageId, feature) => stageById(stageId).features.includes(feature);

/** Every feature available up to and including a step. */
export const featuresAt = (stageId) => new Set(stageById(stageId).features);

/** Is the bench in deep space rather than on a world? */
export const inSpace = (stageId, p) =>
  featuresAt(stageId).has('space') && p.worldMode === 'space';

/* --------------------------------------------------------- the objects -- */

/**
 * Every object in the scene, the main one first.
 *
 * The main object keeps its own named parameters because the whole teaching
 * spine refers to them — "the mass" in step one is this one. The rest live in a
 * list that can grow to twenty, each with its own size, mass and shape, and the
 * builder treats all of them identically from here on.
 *
 * `y` for the extras is a height *above the surface* where there is a surface,
 * and an ordinary coordinate in space. That is not a fudge: "two metres up" is
 * the question anyone actually has, and it has to mean the same thing whether
 * the ramp is tilted or not.
 */
export function objectList(p, f) {
  const list = [{
    id: 'main',
    mass: p.mass,
    size: p.size,
    shapeId: p.shapeId,
    materialId: p.materialId,
    x: p.x0 ?? 0,
    /*
     * On a floor, "drop it from" is the height — the same control the step
     * before used, still meaning the same thing.
     *
     * This read `0` on any step with ground, which threw the value away
     * everywhere it was most visible: the control moved the object at step
     * four, where the floor has not been drawn yet, and then appeared to do
     * nothing at all from step five on. `startPosition` was already willing to
     * lift the object — it was handed a zero and had nothing to lift.
     */
    y: f.has('ground') ? Math.max(0, p.dropHeight ?? 0) : (p.y0 ?? 0),
    vx: p.v0 ?? 0,
    vy: 0,
    colour: 0,
    main: true,
  }];
  if (f.has('objects')) {
    for (const [i, o] of (p.objects || []).slice(0, MAX_OBJECTS - 1).entries()) {
      list.push({
        id: o.id || `o${i + 2}`,
        mass: o.mass,
        size: o.size,
        shapeId: o.shapeId,
        materialId: o.materialId,
        x: o.x,
        y: o.y,
        vx: o.vx,
        vy: o.vy,
        colour: (i % 3) + 1,
        main: false,
      });
    }
  }
  return list;
}

/**
 * How far the "how hard" slider should reach, for this object on this world.
 *
 * A fixed 0-200 N slider is the wrong instrument twice over. On a gram it is a
 * cannon — every usable value crammed into the first pixel — and on a tonne it
 * is a nudge that does visibly nothing however far it is dragged. So the range
 * is set by the object: twenty times its own weight, which is twenty gravities
 * of acceleration at the top whatever is on the bench. A kilogram on Earth gets
 * a slider to 200 N; a hundred kilograms gets one to 20 kN, and both feel the
 * same to drag.
 *
 * It starts at zero because a push has a size and a direction, and the
 * direction is the other slider. A negative force was a second way of saying
 * "the other way", which is the sort of duplication that leaves two controls
 * disagreeing about which way the object is going.
 *
 * The top is rounded up to two significant figures, so the number under the
 * thumb is one a person would say out loud.
 */
export function pushRange(mass, g) {
  const weight = Math.max(1e-9, (Number(mass) || 0) * (Number(g) || 0));
  const max = niceCeil(20 * weight);
  return { min: 0, max, step: niceStep(max / 200) };
}

/** Round up to two significant figures: 196.1 becomes 200, 25.7 becomes 26. */
function niceCeil(v) {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(v) - 1);
  return Math.ceil(v / magnitude) * magnitude;
}

/** The nearest sensible slider increment at or above `v` — one, two or five. */
function niceStep(v) {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(v));
  const lead = v / magnitude;
  return (lead <= 1 ? 1 : lead <= 2 ? 2 : lead <= 5 ? 5 : 10) * magnitude;
}

/**
 * Where an object starts, given what there is to stand on.
 *
 * One function, called by both `build` and `applyLive`, because the two
 * disagreeing is not a cosmetic problem: `applyLive` had its own copy that
 * knew nothing about the drop height, so dragging "drop it from" — at t = 0,
 * where a starting position is still a description of where the object is —
 * put the object at y = 0 instead of raising it. The control appeared to do
 * nothing, or worse, the opposite of what it said.
 */
export function startPosition(spec, object, p, f, { hasGround, onWorld }) {
  if (hasGround) {
    const rad = ((p.slopeDeg || 0) * Math.PI) / 180;
    const clear = object.support + Math.max(0, spec.y ?? 0);
    return vec(
      (spec.x ?? 0) * Math.cos(rad) - clear * Math.sin(rad),
      (spec.x ?? 0) * Math.sin(rad) + clear * Math.cos(rad),
    );
  }
  // On a world with no ground drawn — step four — the object is released a
  // little above the surface, so the first thing it does is fall. Free fall is
  // what makes the pull recognisable as weight.
  if (spec.main && onWorld) {
    return vec(spec.x ?? 0, object.support + Math.max(0, p.dropHeight ?? 0));
  }
  return vec(spec.x ?? 0, spec.y ?? 0);
}

/**
 * The angle a body is drawn at before anything has moved.
 *
 * Without this a box built already resting on a tilted floor is drawn level
 * until the first step of the clock rotates it — so the scene you are looking
 * at before you press Play shows a box embedded in the hillside, and pressing
 * Play appears to knock it into place.
 */
function startAngle(p, f, { hasGround, align }) {
  if (!hasGround || align === 'none') return 0;
  const rad = ((p.slopeDeg || 0) * Math.PI) / 180;
  return facing({
    align,
    surfaceNormal: { x: -Math.sin(rad), y: Math.cos(rad) },
  }).angle;
}

/** One object spec turned into the body the world wants. */
function bodyFor(spec, p, f, { space, surfaceRest, hasGround }) {
  const object = describeObject({ shapeId: spec.shapeId, size: spec.size, mass: spec.mass });
  const shape = object.shape;
  const rolling = shape.id === 'sphere' || shape.id === 'cylinder';

  return {
    id: spec.id,
    kind: rolling ? 'ball' : 'box',
    shapeId: shape.id,
    label: `${fmtFixed(object.mass, object.mass < 10 ? 2 : 0)} kg`,
    mass: object.mass,
    radius: object.support,
    width: object.size,
    height: object.height,
    // How far the underside is from the centre: what it rests at.
    support: object.support,
    diameter: object.size,
    area: object.area,
    cd: object.cd,
    volume: object.volume,
    // How the outline is turned, and whether it rolls rather than slides. The
    // first is a drawing rule; the second is a different contact mechanism.
    align: object.align,
    rolls: object.rolls,
    materialId: spec.materialId,
    angle: startAngle(p, f, { hasGround, align: object.align }),
    pos: surfaceRest(object, spec),
    vel: vec(spec.vx ?? 0, spec.vy ?? 0),
    /*
     * How bouncy this body is against something hard. The pair value for an
     * actual impact is the geometric mean of the two, worked out in the world
     * stepper — so what happens depends on both objects, which is what a
     * coefficient of restitution has always meant.
     */
    restitution: p.bounceMode === 'fixed'
      ? p.restitution
      : materialById(spec.materialId).bounce ?? p.restitution,
    muS: f.has('friction') ? p.muS : 0,
    muK: f.has('friction') ? p.muK : 0,
    colour: spec.colour,
  };
}

/* ------------------------------------------------------------ the world -- */

/**
 * Turn the bench parameters into a world, for whichever step is showing.
 *
 * One builder, not eight. What differs between the steps is which features are
 * on, and every one of those is a question this function asks the stage rather
 * than a branch on the stage's name.
 */
export function build(stageId, p) {
  const f = featuresAt(stageId);
  const space = f.has('space') && p.worldMode === 'space';
  const object = describeObject({ shapeId: p.shapeId, size: p.size, mass: p.mass });
  const fluid = f.has('fluid') ? fluidById(p.fluidId) : fluidById('vacuum');

  /*
   * Which model of gravity is in play, and it is genuinely a different model
   * rather than a different number:
   *
   *   nothing   no gravity at all — the first two steps, so a push is the only
   *             thing acting and can be seen on its own; and deep space, where
   *             it is a deliberate choice rather than a simplification
   *   mutual    G·m₁·m₂/r² between the bodies, with no "down" anywhere
   *   uniform   the flat-ground approximation, once the other mass is a planet
   */
  const onWorld = f.has('planet') && !space;
  const planet = onWorld ? describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId }) : null;
  const hasGround = f.has('ground') && !space;
  const gravityMode = hasGround ? 'uniform' : (f.has('mutual-gravity') && !space ? 'mutual' : 'none');
  const g = planet ? planet.g : 0;

  const surfaceRest = (obj, spec) => startPosition(spec, obj, p, f, { hasGround, onWorld });
  const specs = objectList(p, f);
  const bodies = specs.map((spec) => bodyFor(spec, p, f, { space, surfaceRest, hasGround }));

  /*
   * The other mass, and what it becomes.
   *
   * In the third step it is an ordinary object a few metres away, and the pull
   * between them is real and utterly negligible. In the fourth it is a world:
   * same equation, same code path, a mass twenty-four orders of magnitude
   * bigger. Nothing about the physics changes — only the number — and that is
   * the entire point of putting the two steps next to each other.
   */
  if (onWorld && !hasGround) {
    bodies.push({
      id: 'other',
      kind: 'planet',
      label: planet.label,
      mass: p.planetMass,
      radius: p.planetRadius,
      // Centre placed so the surface sits at y = 0, whatever the radius. Grow
      // the world and the ground under the object stays exactly where it is.
      pos: vec(0, -p.planetRadius),
      fixed: true,
      colour: 1,
    });
  } else if (f.has('second-mass') && !f.has('ground')) {
    const other = describeObject({ shapeId: 'sphere', size: p.otherSize, mass: p.otherMass });
    bodies.push({
      id: 'other',
      kind: 'ball',
      shapeId: 'sphere',
      label: `${fmtFixed(other.mass, other.mass < 10 ? 2 : 0)} kg`,
      mass: other.mass,
      radius: other.size / 2,
      diameter: other.size,
      area: other.area,
      cd: other.cd,
      volume: other.volume,
      pos: vec(p.otherX, 0),
      colour: 1,
    });
  }

  const walls = f.has('obstacles') ? (p.walls || []).filter(isRealWall).slice(0, MAX_WALLS).map(makeWall) : [];
  const cannons = f.has('obstacles')
    ? (p.cannons || []).slice(0, 6).map((c) => ({
      ...c,
      // Resolved here rather than in the stepper, which has no material table.
      restitution: p.bounceMode === 'fixed'
        ? p.restitution
        : materialById(c.materialId).bounce ?? p.restitution,
    }))
    : [];

  const world = createWorld({
    g,
    field: gravityMode === 'uniform' ? vec(0, -g) : vec(0, 0),
    mutualGravity: gravityMode === 'mutual',
    fluidDensity: fluid.density,
    viscosity: fluid.viscosity,
    ground: hasGround
      ? {
        y: 0,
        slopeDeg: p.slopeDeg,
        muS: p.muS,
        muK: p.muK,
        rolling: rollingFor(matchSurface(p.muS, p.muK)),
        restitution: p.restitution,
      }
      : null,
    walls,
    cannons,
    maxBodies: MAX_OBJECTS,
    bounds: null,
    /*
     * Solid objects cannot pass through each other, and here that is not a
     * detail. G·m₁·m₂/r² has a singularity at r = 0: let two bodies
     * interpenetrate and the attraction climbs without limit, flinging the
     * small one away at half the speed of light. Letting them touch instead is
     * both the honest model and the one that behaves.
     */
    bodyCollisions: collisionsOn(p, f),
    collisionRestitution: p.restitution,
    materialBounce: p.bounceMode !== 'fixed',
    bodies,
    trailLimit: hasGround || space || f.has('mutual-gravity') ? 700 : 0,
  });

  return {
    world,
    object,
    planet,
    fluid,
    space,
    gravityMode,
    focusId: 'main',
    features: f,
    disclosure: discloseFor(stageId, p, { object, planet, fluid, gravityMode, space, walls }),
    equations: equationsFor(f, { fluid, space }),
  };
}

/**
 * Do solid objects bounce off each other in this scene?
 *
 * Switchable, because "what happens if they pass straight through" is a fair
 * thing to want to see — with twenty objects it is the difference between a
 * pile-up and a swarm — and because turning it off makes the cannon's shots
 * fly through the scene rather than scattering off it.
 *
 * It does not depend on how many bodies there are, and used to. Counting them
 * looked like a free optimisation — one body has nothing to collide with — and
 * was a correctness bug: cannons add their shots while the world is running,
 * long after the count was taken, so a bench holding one object and a cannon
 * was built with collisions off and every shot sailed straight through. The
 * pair loop over a single body is empty anyway, so the check bought nothing
 * even when it was right.
 *
 * With one exception, which is not a preference. G·m₁·m₂/r² has a singularity
 * at r = 0: let two bodies interpenetrate under mutual gravity and the
 * attraction climbs without limit, flinging the small one away at a fraction of
 * the speed of light. Where that is the model, solidity is part of it.
 */
export function collisionsOn(p, f) {
  if (f.has('mutual-gravity')) return true;
  return p.collisions !== false;
}

/** Is the collisions switch being overruled, and why? */
export const collisionsForced = (f) => f.has('mutual-gravity');

/**
 * What the scene is made of, as a string.
 *
 * When this changes the world has to be rebuilt; when it does not, the numbers
 * can be pushed into the running world instead. Anything that adds, removes or
 * re-identifies a body belongs here — everything else is a value, and values
 * can change under a running simulation without restarting it.
 */
export function structuralKey(stageId, p) {
  const f = featuresAt(stageId);
  const objects = f.has('objects') ? (p.objects || []) : [];
  return [
    stageId,
    p.worldMode,
    objects.length,
    objects.map((o) => o.id).join(','),
    (f.has('obstacles') ? (p.cannons || []) : []).map((c) => c.id).join(','),
  ].join('|');
}

/**
 * Push changed parameters into a world that is already running.
 *
 * Everything here is a property rather than a state: how heavy the object is,
 * how strong gravity is, what the fluid is, where the walls are. Position and
 * velocity are deliberately *not* touched, because those are what the
 * simulation has been computing and overwriting them is what "changing a slider
 * resets everything" actually is.
 *
 * The one exception is at t = 0, where the starting position and the position
 * are the same thing and dragging "starts at" ought to move the object. Once
 * the clock has run, a starting position no longer describes anything on
 * screen, so it waits for the next reset.
 */
export function applyLive(world, p, features, { stageId } = {}) {
  const f = features || featuresAt(stageId);
  const space = f.has('space') && p.worldMode === 'space';
  const fluid = f.has('fluid') ? fluidById(p.fluidId) : fluidById('vacuum');
  const onWorld = f.has('planet') && !space;
  const hasGround = f.has('ground') && !space;
  const planet = onWorld ? describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId }) : null;
  const gravityMode = hasGround ? 'uniform' : (f.has('mutual-gravity') && !space ? 'mutual' : 'none');
  const g = planet ? planet.g : 0;
  const atStart = world.t <= 1e-9;

  const specs = new Map(objectList(p, f).map((s) => [s.id, s]));
  const surfaceRest = (obj, spec) => startPosition(spec, obj, p, f, { hasGround, onWorld });

  const bodies = world.bodies.map((b) => {
    if (b.kind === 'planet') {
      return { ...b, mass: p.planetMass, radius: p.planetRadius, label: planet ? planet.label : b.label, pos: vec(0, -p.planetRadius) };
    }
    if (b.id === 'other') {
      const other = describeObject({ shapeId: 'sphere', size: p.otherSize, mass: p.otherMass });
      return {
        ...b,
        mass: other.mass,
        radius: other.size / 2,
        diameter: other.size,
        area: other.area,
        volume: other.volume,
        label: `${fmtFixed(other.mass, other.mass < 10 ? 2 : 0)} kg`,
        pos: atStart ? vec(p.otherX, 0) : b.pos,
      };
    }

    const spec = specs.get(b.id);
    // A cannon shot has no parameters of its own — it is whatever the cannon
    // fired — so it keeps everything it was born with.
    if (!spec) return b;

    const fresh = bodyFor(spec, p, f, { space, surfaceRest, hasGround });
    return {
      ...b,
      mass: fresh.mass,
      radius: fresh.radius,
      width: fresh.width,
      height: fresh.height,
      diameter: fresh.diameter,
      area: fresh.area,
      cd: fresh.cd,
      volume: fresh.volume,
      kind: fresh.kind,
      shapeId: fresh.shapeId,
      align: fresh.align,
      rolls: fresh.rolls,
      label: fresh.label,
      restitution: fresh.restitution,
      materialId: fresh.materialId,
      muS: fresh.muS,
      muK: fresh.muK,
      pos: atStart ? fresh.pos : b.pos,
      vel: atStart ? fresh.vel : b.vel,
      // Tilting the floor under something that has not moved yet tilts it too;
      // once the clock has run, the stepper owns the angle.
      angle: atStart ? fresh.angle : b.angle,
    };
  });

  return {
    ...world,
    bodies,
    env: {
      ...world.env,
      g,
      field: gravityMode === 'uniform' ? vec(0, -g) : vec(0, 0),
      mutualGravity: gravityMode === 'mutual',
      fluidDensity: fluid.density,
      viscosity: fluid.viscosity,
    },
    ground: hasGround
      ? {
        y: 0,
        slopeDeg: p.slopeDeg,
        muS: p.muS,
        muK: p.muK,
        rolling: rollingFor(matchSurface(p.muS, p.muK)),
        restitution: p.restitution,
      }
      : null,
    walls: f.has('obstacles') ? (p.walls || []).filter(isRealWall).slice(0, MAX_WALLS).map(makeWall) : [],
    // Cannons keep their own firing count, which lives on the world rather than
    // in the parameters — otherwise editing a cannon's angle would make it fire
    // its whole backlog at once.
    cannons: (world.cannons || []).map((c, i) => {
      const source = f.has('obstacles') ? (p.cannons || [])[i] : null;
      return source ? { ...c, ...source, id: c.id, fired: c.fired } : c;
    }),
    collisionRestitution: Math.max(0, Math.min(1, p.restitution)),
    materialBounce: p.bounceMode !== 'fixed',
    bodyCollisions: collisionsOn(p, f),
    trailLimit: hasGround || space || f.has('mutual-gravity') ? 700 : 0,
  };
}

/* ------------------------------------------------------- what it assumes -- */

function discloseFor(stageId, p, { object, planet, fluid, gravityMode, space, walls }) {
  const f = featuresAt(stageId);

  const models = ['classical-mechanics', 'point-mass'];
  const assumptions = ['no-rotation', 'drawn-orientation', 'constant-mass', 'no-relativity'];
  const approximations = [];
  const numbers = [];

  if (space) {
    assumptions.push('deep-space');
    numbers.push({
      label: 'Gravity',
      value: 'switched off',
      note: 'The world has been set to deep space, so there is no field and no '
        + 'floor. Nothing here is falling — and note that this is not what makes '
        + 'astronauts float. They are in orbit, which is falling continuously, '
        + 'with plenty of gravity acting on them.',
    });
  } else if (gravityMode === 'mutual') {
    models.push('inverse-square');
    numbers.push({
      label: 'Attraction between the two masses',
      value: `${everydayComparison(object.mass, p.otherMass, Math.abs(p.otherX)).force.toExponential(2)} N`,
      note: everydayComparison(object.mass, p.otherMass, Math.abs(p.otherX)).text,
    });
  } else if (gravityMode === 'uniform') {
    models.push('uniform-field', 'flat-earth-ground');
    const check = uniformFieldValid(p.planetRadius, 20);
    numbers.push({
      label: 'Surface gravity, computed from the world',
      value: `${fmtFixed(planet.g, 4)} m/s²`,
      note: `g = G·M/r² with M = ${p.planetMass.toExponential(3)} kg and `
        + `r = ${(p.planetRadius / 1000).toPrecision(4)} km. ${planet.note}`,
    });
    numbers.push({
      label: 'Is the uniform-field model fair here?',
      value: check.valid ? 'yes' : 'marginal',
      note: check.text,
    });
  } else {
    numbers.push({
      label: 'Gravity',
      value: 'not acting',
      note: 'There is nothing else here for the mass to be attracted to, so the '
        + 'push is the only force in play. That is a deliberate simplification '
        + 'to see one thing at a time, not a claim that gravity switches off.',
    });
  }

  if (f.has('shape')) {
    models.push('rigid-body');
    numbers.push({
      label: 'Object',
      value: `${object.shape.label}, ${fmtFixed(object.size, 2)} m across`,
      note: `${object.shape.note} Volume ${object.volume.toPrecision(3)} m³, so at `
        + `${fmtFixed(object.mass, 2)} kg its density is ${fmtFixed(object.density, 0)} kg/m³.`,
    });
  }

  if (f.has('friction') && !space) {
    models.push('coulomb-friction');
    if (rollsOn(p.shapeId)) models.push('rolling-resistance');
    approximations.push('indicative-mu');
    numbers.push({
      label: 'Friction coefficients',
      value: `μs ${p.muS}, μk ${p.muK}`,
      note: 'Indicative values. Published figures for the same pair of materials '
        + 'differ by more than a factor of two with surface finish, cleanliness '
        + 'and contact pressure.',
    });
  }

  if (fluid.density > 0) {
    models.push('quadratic-drag', 'buoyancy');
    assumptions.push('no-wind', 'fully-immersed');
    const verdict = floats(object.density, fluid.density);
    numbers.push({
      label: fluid.label,
      value: `ρ ${fluid.density} kg/m³, μ ${fluid.viscosity} Pa·s`,
      note: `${fluid.note} The drag coefficient here is not held constant: it is `
        + 'computed from the Reynolds number, so the same equation gives a square '
        + 'law in air and a linear one in honey.',
    });
    numbers.push({
      label: verdict.floats ? 'This object floats' : 'This object sinks',
      value: `object ${fmtFixed(object.density, 0)} kg/m³ vs fluid ${fluid.density}`,
      note: verdict.text,
    });
  } else {
    assumptions.push('no-drag', 'no-buoyancy');
  }

  if (walls && walls.length) {
    models.push('segment-surfaces');
    numbers.push({
      label: 'Drawn obstacles',
      value: `${walls.length} wall${walls.length === 1 ? '' : 's'}`,
      note: 'Each is a straight segment with two ends. A body rests on one '
        + 'exactly as it rests on the ground — same normal force, same friction '
        + '— and can roll off the end of it.',
    });
  }

  if (f.has('control') && p.control?.mode === 'mouse') models.push('pointer-thrust');

  if (f.has('collide')) {
    models.push('restitution');
    assumptions.push('no-heat');
    if (p.bounceMode !== 'fixed') approximations.push('mean-restitution');
    numbers.push({
      label: 'Coefficient of restitution',
      value: p.bounceMode === 'fixed'
        ? String(p.restitution)
        : `from the materials — ${fmtFixed(pairBounce(p.materialId, p.materialId), 2)} for two of these`,
      note: 'Separation speed divided by approach speed. e = 1 conserves kinetic '
        + 'energy as well as momentum; e = 0 means the objects move off together. '
        + 'It belongs to the pair that meets, not to either object on its own.',
    });
  }

  return disclosure({
    reality: realityFor(stageId, space),
    models: [...new Set(models)],
    assumptions: [...new Set(assumptions)],
    approximations,
    numbers,
  });
}

const REALITY = {
  mass: 'Every object resists having its motion changed, and how strongly it '
    + 'resists is what we call its mass.',
  push: 'A force changes an object\'s momentum. How much velocity that buys '
    + 'depends on how much mass there is to shift.',
  'two-masses': 'Every pair of masses in the universe attracts, with a force '
    + 'proportional to both masses and falling off as the square of the distance '
    + 'between them.',
  planet: 'Weight is that same universal attraction, with a planet on the other '
    + 'end of it. Nothing new is added when an object is put on a world.',
  surface: 'A surface holds an object up by pushing back on it, and can only '
    + 'push perpendicular to itself — which is why a tilted one cannot hold '
    + 'anything still on its own.',
  friction: 'Friction is countless microscopic contacts forming and breaking, '
    + 'plus material being deformed and heated.',
  fluid: 'Anything moving through a fluid has to push that fluid out of the way '
    + 'and drag a wake behind it — and the fluid pushes back up on it with the '
    + 'weight of whatever it displaced, whether it is moving or not.',
  collide: 'During an impact each object pushes on the other with an equal and '
    + 'opposite force for exactly the same length of time.',
};

const REALITY_SPACE = 'With no other mass nearby and nothing to stand on, an '
  + 'object keeps whatever velocity it has for ever. Every change you see is '
  + 'something you did to it.';

const realityFor = (stageId, space) =>
  (space ? REALITY_SPACE : (REALITY[stageId] || REALITY.mass));

function equationsFor(f, { fluid, space } = {}) {
  const ids = ['newton-2', 'momentum', 'kinetic-energy'];
  if (f.has('mutual-gravity') && !space) ids.push('gravity-field', 'weight');
  if (f.has('ground') && !space) ids.push('weight', 'potential-energy', 'energy-conservation');
  if (f.has('friction') && !space) ids.push('friction');
  if (f.has('fluid') && fluid?.density > 0) ids.push('drag', 'terminal-velocity');
  if (f.has('collide')) ids.push('momentum-conservation', 'restitution', 'impulse');
  return equations([...new Set(ids)]);
}

/**
 * The push, which lasts a set time and then stops.
 *
 * Called before every step rather than baked into the world, because the whole
 * lesson of the second stage is what happens *after* the push ends: the object
 * carries on at whatever velocity it reached, with nothing pushing it at all.
 * A force that ran for ever would hide that completely.
 *
 * It also reads the parameters fresh every step, which is what lets the angle
 * be turned while the object is moving and the path bend from where it is.
 */
export function applyPush(world, p, features) {
  if (!features.has('applied')) return world;
  const on = world.t < (p.pushSeconds ?? 0) - 1e-12;
  const force = on
    ? vec(
      p.pushForce * Math.cos((p.pushAngleDeg * Math.PI) / 180),
      p.pushForce * Math.sin((p.pushAngleDeg * Math.PI) / 180),
    )
    : vec(0, 0);

  const current = world.bodies.find((b) => b.id === 'main')?.applied;
  if (current && current.x === force.x && current.y === force.y) return world;

  return {
    ...world,
    bodies: world.bodies.map((b) => (b.id === 'main' ? { ...b, applied: force } : b)),
  };
}

/** Is the push still running, and how long is left? */
export const pushState = (world, p, features) => {
  if (!features.has('applied') || !(p.pushSeconds > 0)) return { active: false, remaining: 0 };
  const remaining = Math.max(0, p.pushSeconds - world.t);
  return { active: remaining > 0, remaining, ends: p.pushSeconds };
};

/* --------------------------------------------------------- the readouts -- */

/**
 * Every input that is doing something at this step, as labelled rows.
 *
 * Built here rather than read off the sidebar, because the sidebar is made of
 * form controls: a printed page needs the values, not the widgets, and it needs
 * only the ones that are actually in play. A page listing a friction
 * coefficient for a step that has no surface would be a page inviting the
 * reader to draw a conclusion from a number that did nothing.
 */
export function inputSummary(stageId, p) {
  const f = featuresAt(stageId);
  const space = f.has('space') && p.worldMode === 'space';
  const object = describeObject({ shapeId: p.shapeId, size: p.size, mass: p.mass });
  const fluid = f.has('fluid') ? fluidById(p.fluidId) : null;
  const planet = f.has('planet') && !space
    ? describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId })
    : null;

  const groups = [];
  const add = (title, rows) => {
    const kept = rows.filter(Boolean);
    if (kept.length) groups.push({ title, rows: kept });
  };

  add('The object', [
    ['Mass', `${fmtFixed(p.mass, p.mass < 10 ? 3 : 0)} kg`],
    ['Shape', object.shape.label],
    ['Size', `${fmtFixed(p.size, 2)} m`],
    ['Volume', `${object.volume.toPrecision(3)} m³`],
    ['Density', `${fmtFixed(object.density, object.density < 10 ? 2 : 0)} kg/m³`],
    ['Material', materialById(p.materialId).label],
    ['Drag coefficient', `C_d ${object.cd}`],
    ['Meets a surface by', contactKindLabel(p.shapeId)],
  ]);

  if (f.has('applied')) {
    add('The push', [
      ['How hard', `${fmtFixed(p.pushForce, 2)} N`],
      ['Direction', `${fmtFixed(p.pushAngleDeg, 0)}°`],
      ['Duration', `${fmtFixed(p.pushSeconds, 2)} s`],
      ['Starting velocity', `${fmtFixed(p.v0, 2)} m/s`],
    ]);
  }

  if (f.has('second-mass') && !f.has('ground')) {
    add('The second mass', [
      ['Mass', `${p.otherMass.toPrecision(4)} kg`],
      ['Size', `${fmtFixed(p.otherSize, 2)} m`],
      ['Separation', `${fmtFixed(p.otherX, 2)} m`],
    ]);
  }

  add('The world', space
    ? [['Where', 'Deep space — no field, no floor']]
    : (planet ? [
      ['World', planet.label],
      ['Mass', `${p.planetMass.toExponential(3)} kg`],
      ['Radius', `${(p.planetRadius / 1000).toPrecision(4)} km`],
      ['Surface gravity', `${fmtFixed(planet.g, 4)} m/s² — computed from the two above`],
      f.has('planet') && !f.has('ground') ? ['Released from', `${fmtFixed(p.dropHeight, 2)} m up`] : null,
    ] : [['Gravity', 'Not acting — nothing here to be attracted to']]));

  if (f.has('ground') && !space) {
    add('The surface', [
      ['Tilt', `${fmtFixed(p.slopeDeg, 0)}°`],
      f.has('friction') ? ['Static friction', `μs ${fmtFixed(p.muS, 2)}`] : null,
      f.has('friction') ? ['Kinetic friction', `μk ${fmtFixed(p.muK, 2)}`] : null,
      f.has('friction') ? ['Rolling resistance', `C_rr ${rollingFor(matchSurface(p.muS, p.muK))}`] : null,
    ]);
  }

  if (fluid) {
    add('The fluid', [
      ['Fluid', fluid.label],
      ['Density', `${fluid.density} kg/m³`],
      ['Viscosity', `${fluid.viscosity} Pa·s`],
    ]);
  }

  if (f.has('objects')) {
    add('The bench', [
      ['Other objects', String((p.objects || []).length)],
      f.has('obstacles') ? ['Walls drawn', String((p.walls || []).length)] : null,
      f.has('obstacles') ? ['Cannons', String((p.cannons || []).length)] : null,
      ['Objects collide', collisionsOn(p, f) ? 'yes' : 'no'],
      ['Bounciness from', p.bounceMode === 'fixed'
        ? `one value, e = ${fmtFixed(p.restitution, 2)}`
        : 'the materials of whatever meets'],
    ]);
  }

  if (f.has('control') && p.control?.mode !== 'none') {
    add('The controls', [
      ['Driving', p.control.mode === 'mouse' ? 'thrust towards the pointer' : 'arrow keys or WASD'],
      ['Strength', `${fmtFixed(p.control.strength, 0)} m/s² of engine`],
    ]);
  }

  return groups;
}

const contactKindLabel = (shapeId) => (rollsOn(shapeId) ? 'rolling' : 'sliding');

/**
 * Which quantities are worth showing at this step.
 *
 * Momentum and energy appear the moment anything can move, and stay for the
 * rest of the bench — they are not a topic that arrives late, they are two more
 * ways of describing what is already on screen.
 */
export function channelsFor(stageId, p = {}) {
  const f = featuresAt(stageId);
  const space = f.has('space') && p.worldMode === 'space';
  const groups = [];
  const moving = f.has('applied') || f.has('mutual-gravity');
  const grounded = f.has('ground') && !space;

  if (moving) {
    groups.push({ label: 'Velocity against time — the gradient is the acceleration', ids: ['vx', 'vy'] });
    // Momentum and energy from the moment anything can move, and for the rest
    // of the bench. They are not a later topic; they are two more ways of
    // describing what is already on screen, and holding them back until a
    // "momentum chapter" is what makes them feel like one.
    groups.push({ label: 'Momentum against time — mass and velocity together', ids: ['px', 'py'] });
    groups.push({ label: 'Energy against time', ids: grounded ? ['ke', 'pe', 'etotal'] : ['ke'] });
  }

  if (grounded) {
    groups.push({ label: 'Position against time', ids: ['x', 'height'] });
  }

  // Graphs never mix units: momentum in kg·m/s and energy in joules on one
  // ruler is two graphs pretending to be one.
  if (f.has('collide')) {
    groups.push({ label: 'Total momentum — flat straight through the impact', ids: ['sys-p'] });
    groups.push({ label: 'Total energy — and where the missing kinetic energy went', ids: ['sys-ke', 'sys-heat', 'sys-e'] });
  } else if (f.has('fluid') || f.has('friction')) {
    groups.push({ label: 'Where the energy has gone', ids: ['sys-ke', 'sys-heat', 'sys-e'] });
  }

  if (moving && !grounded) {
    groups.push({ label: 'Net force against time', ids: ['fx', 'fnet'] });
  }
  return groups;
}

/**
 * Which arrows can be drawn at this step.
 *
 * The picker is built from this, so an arrow can never be offered for a force
 * that does not exist yet — and every force that does exist can be turned off.
 * In space most of them genuinely do not exist, and the picker says so by not
 * offering them rather than by offering a chip that does nothing.
 */
export function vectorsFor(stageId, p = {}) {
  const f = featuresAt(stageId);
  const space = f.has('space') && p.worldMode === 'space';
  const out = [
    { id: 'velocity', label: 'Velocity', token: '--vec-velocity', kind: 'motion' },
    { id: 'acceleration', label: 'Acceleration', token: '--vec-acceleration', kind: 'motion' },
    { id: 'momentum', label: 'Momentum', token: '--vec-momentum', kind: 'motion' },
  ];
  if (f.has('applied')) out.push({ id: 'applied', label: 'Applied push', token: '--force-applied', kind: 'force' });
  if (f.has('control') && p.control?.mode && p.control.mode !== 'none') {
    out.push({ id: 'control', label: 'Your control', token: '--force-control', kind: 'force' });
  }
  if ((f.has('mutual-gravity') || f.has('planet')) && !space) {
    out.push({ id: 'weight', label: f.has('ground') ? 'Weight' : 'Gravitational pull', token: '--force-weight', kind: 'force' });
  }
  if (f.has('ground') && !space) out.push({ id: 'normal', label: 'Normal force', token: '--force-normal', kind: 'force' });
  if (f.has('obstacles') && (p.walls || []).length) {
    // A wall is a surface too, so the normal force has to be offerable even in
    // space once something has been drawn to stand on.
    if (!out.some((v) => v.id === 'normal')) out.push({ id: 'normal', label: 'Normal force', token: '--force-normal', kind: 'force' });
  }
  if (f.has('friction') && (!space || (p.walls || []).length)) {
    /*
     * One chip, named for what is actually resisting this object. A ball meets
     * rolling resistance and a box meets sliding friction, and they are
     * different mechanisms rather than the same one with a different number —
     * offering a "friction" arrow for something that rolls would teach exactly
     * the thing the difference exists to correct.
     */
    out.push(rollsOn(p.shapeId)
      ? { id: 'rolling', label: 'Rolling resistance', token: '--force-friction', kind: 'force' }
      : { id: 'friction', label: 'Friction', token: '--force-friction', kind: 'force' });
  }
  if (f.has('fluid') && fluidById(p.fluidId).density > 0) {
    out.push({ id: 'drag', label: 'Fluid resistance', token: '--force-drag', kind: 'force' });
    out.push({ id: 'buoyancy', label: 'Buoyancy', token: '--force-buoyancy', kind: 'force' });
  }
  out.push({ id: 'net', label: 'Net force (the sum of them all)', token: '--force-net', kind: 'force' });
  return out;
}
