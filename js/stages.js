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
import { describe as describeObject, shapeById, materialById, floats } from './shapes.js';
import { fluidById } from './drag.js';
import { describeWorld, uniformFieldValid, everydayComparison } from './gravitation.js';
import { isRealWall, wall as makeWall, MAX_WALLS } from './segments.js';
import { fmtFixed } from './format.js';

/** How many objects one scene may hold, cannon shots included. */
export const MAX_OBJECTS = 20;

/* ------------------------------------------------------------- the steps -- */

export const STAGES = [
  {
    id: 'mass',
    label: 'A mass',
    short: 'Mass',
    features: [],
    ask: 'What is a mass, before anything happens to it?',
    discover: 'On its own, nothing happens. No forces act, so it stays exactly '
      + 'as it is — and that stubbornness is the only thing mass does until '
      + 'something tries to change it.',
    watch: 'Change the mass. Nothing moves, and nothing will, until you push it.',
  },
  {
    id: 'push',
    label: 'Push it',
    short: 'Push',
    features: ['applied'],
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
    features: ['applied', 'second-mass', 'mutual-gravity'],
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
    features: ['applied', 'second-mass', 'mutual-gravity', 'planet'],
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
    id: 'surface',
    label: 'Stand it on something',
    short: 'Surface',
    features: ['applied', 'planet', 'ground', 'shape', 'space'],
    ask: 'If gravity is still pulling, what holds it up?',
    discover: 'The surface pushes back — exactly hard enough, and no harder. '
      + 'Tilt the surface and only part of the weight presses into it; the rest '
      + 'is left over, and the object slides. Change the shape and how it sits '
      + 'changes with it.',
    watch: 'Tilt the ramp and watch the normal force shrink as the leftover '
      + 'along the slope grows. Then switch the world to deep space: the floor '
      + 'and the weight both go, and the normal force goes with them, because '
      + 'there is nothing left for it to hold up.',
  },
  {
    id: 'friction',
    label: 'Make the surface grip',
    short: 'Friction',
    features: ['applied', 'planet', 'ground', 'shape', 'space', 'friction'],
    ask: 'What happens if the surface holds on?',
    discover: 'Friction takes whatever value it needs to stop the object '
      + 'sliding — up to a limit set by how hard the surfaces are pressed '
      + 'together. Past that limit it lets go, and drops to a lower value, which '
      + 'is why a stuck object lurches when it finally moves.',
    watch: 'Push gently and watch friction match you exactly. Push past the '
      + 'static limit and watch it fall.',
  },
  {
    id: 'fluid',
    label: 'Put it in a fluid',
    short: 'Fluid',
    features: ['applied', 'planet', 'ground', 'shape', 'space', 'friction', 'fluid', 'sandbox'],
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
    label: 'A second object',
    short: 'Collide',
    features: ['applied', 'planet', 'ground', 'shape', 'space', 'friction', 'fluid', 'sandbox', 'collide', 'control'],
    ask: 'What survives a collision, and what does not?',
    discover: 'Total momentum comes out exactly as it went in, every time, '
      + 'whatever the objects do to each other. Kinetic energy does not — only a '
      + 'perfectly elastic collision keeps it, and almost nothing is. What '
      + 'leaves the kinetic account has gone somewhere: heat, sound, a dent.',
    watch: 'Change the bounciness and watch which of the two totals moves. Then '
      + 'take the controls yourself and drive one object into the others — the '
      + 'steering is a force like any other, so it appears as an arrow and its '
      + 'work is on the same books.',
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
    x: p.x0 ?? 0,
    y: f.has('ground') ? 0 : (p.y0 ?? 0),
    vx: p.v0 ?? 0,
    vy: 0,
    colour: 0,
    main: true,
  }];
  if (f.has('sandbox') || f.has('collide')) {
    for (const [i, o] of (p.objects || []).slice(0, MAX_OBJECTS - 1).entries()) {
      list.push({
        id: o.id || `o${i + 2}`,
        mass: o.mass,
        size: o.size,
        shapeId: o.shapeId,
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

/** One object spec turned into the body the world wants. */
function bodyFor(spec, p, f, { space, surfaceRest }) {
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
    diameter: object.size,
    area: object.area,
    cd: object.cd,
    volume: object.volume,
    pos: surfaceRest(object, spec),
    vel: vec(spec.vx ?? 0, spec.vy ?? 0),
    restitution: p.restitution,
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

  const rad = ((p.slopeDeg || 0) * Math.PI) / 180;
  /** A body resting exactly on the ramp, `distance` along it and `up` above it. */
  const surfaceRest = (obj, spec) => {
    if (!hasGround) return vec(spec.x ?? 0, spec.y ?? 0);
    const along = spec.x ?? 0;
    const clear = obj.support + Math.max(0, spec.y ?? 0);
    return vec(
      along * Math.cos(rad) - clear * Math.sin(rad),
      along * Math.sin(rad) + clear * Math.cos(rad),
    );
  };

  const specs = objectList(p, f);
  const bodies = specs.map((spec) => {
    const b = bodyFor(spec, p, f, { space, surfaceRest });
    // On a world with no ground drawn — step four — the object is released a
    // little above the surface, so the first thing it does is fall. Free fall
    // is what makes the pull recognisable as weight.
    if (spec.main && onWorld && !hasGround) {
      b.pos = vec(p.x0 ?? 0, object.support + (p.dropHeight ?? 0.6));
    }
    return b;
  });

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

  const walls = f.has('sandbox') ? (p.walls || []).filter(isRealWall).slice(0, MAX_WALLS).map(makeWall) : [];
  const cannons = f.has('sandbox') ? (p.cannons || []).slice(0, 6) : [];

  const world = createWorld({
    g,
    field: gravityMode === 'uniform' ? vec(0, -g) : vec(0, 0),
    mutualGravity: gravityMode === 'mutual',
    fluidDensity: fluid.density,
    viscosity: fluid.viscosity,
    ground: hasGround
      ? { y: 0, slopeDeg: p.slopeDeg, muS: p.muS, muK: p.muK, restitution: p.restitution }
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
    bodyCollisions: bodies.filter((b) => !b.fixed).length > 1 || f.has('mutual-gravity'),
    collisionRestitution: p.restitution,
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
 * What the scene is made of, as a string.
 *
 * When this changes the world has to be rebuilt; when it does not, the numbers
 * can be pushed into the running world instead. Anything that adds, removes or
 * re-identifies a body belongs here — everything else is a value, and values
 * can change under a running simulation without restarting it.
 */
export function structuralKey(stageId, p) {
  const f = featuresAt(stageId);
  const objects = (f.has('sandbox') || f.has('collide')) ? (p.objects || []) : [];
  return [
    stageId,
    p.worldMode,
    objects.length,
    objects.map((o) => o.id).join(','),
    (f.has('sandbox') ? (p.cannons || []) : []).map((c) => c.id).join(','),
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
  const rad = ((p.slopeDeg || 0) * Math.PI) / 180;
  const surfaceRest = (obj, spec) => {
    if (!hasGround) return vec(spec.x ?? 0, spec.y ?? 0);
    const clear = obj.support + Math.max(0, spec.y ?? 0);
    return vec(
      (spec.x ?? 0) * Math.cos(rad) - clear * Math.sin(rad),
      (spec.x ?? 0) * Math.sin(rad) + clear * Math.cos(rad),
    );
  };

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

    const fresh = bodyFor(spec, p, f, { space, surfaceRest });
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
      label: fresh.label,
      restitution: fresh.restitution,
      muS: fresh.muS,
      muK: fresh.muK,
      pos: atStart ? fresh.pos : b.pos,
      vel: atStart ? fresh.vel : b.vel,
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
      ? { y: 0, slopeDeg: p.slopeDeg, muS: p.muS, muK: p.muK, restitution: p.restitution }
      : null,
    walls: f.has('sandbox') ? (p.walls || []).filter(isRealWall).slice(0, MAX_WALLS).map(makeWall) : [],
    // Cannons keep their own firing count, which lives on the world rather than
    // in the parameters — otherwise editing a cannon's angle would make it fire
    // its whole backlog at once.
    cannons: (world.cannons || []).map((c, i) => {
      const source = f.has('sandbox') ? (p.cannons || [])[i] : null;
      return source ? { ...c, ...source, id: c.id, fired: c.fired } : c;
    }),
    collisionRestitution: Math.max(0, Math.min(1, p.restitution)),
    trailLimit: hasGround || space || f.has('mutual-gravity') ? 700 : 0,
  };
}

/* ------------------------------------------------------- what it assumes -- */

function discloseFor(stageId, p, { object, planet, fluid, gravityMode, space, walls }) {
  const f = featuresAt(stageId);

  const models = ['classical-mechanics', 'point-mass'];
  const assumptions = ['no-rotation', 'constant-mass', 'no-relativity'];
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
    numbers.push({
      label: 'Coefficient of restitution',
      value: String(p.restitution),
      note: 'Separation speed divided by approach speed. e = 1 conserves kinetic '
        + 'energy as well as momentum; e = 0 means the objects move off together.',
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
  if (f.has('sandbox') && (p.walls || []).length) {
    // A wall is a surface too, so the normal force has to be offerable even in
    // space once something has been drawn to stand on.
    if (!out.some((v) => v.id === 'normal')) out.push({ id: 'normal', label: 'Normal force', token: '--force-normal', kind: 'force' });
  }
  if (f.has('friction') && (!space || (p.walls || []).length)) {
    out.push({ id: 'friction', label: 'Friction', token: '--force-friction', kind: 'force' });
  }
  if (f.has('fluid') && fluidById(p.fluidId).density > 0) {
    out.push({ id: 'drag', label: 'Fluid resistance', token: '--force-drag', kind: 'force' });
    out.push({ id: 'buoyancy', label: 'Buoyancy', token: '--force-buoyancy', kind: 'force' });
  }
  out.push({ id: 'net', label: 'Net force (the sum of them all)', token: '--force-net', kind: 'force' });
  return out;
}
