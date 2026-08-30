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
 */

import { vec } from './vec.js';
import { createWorld } from './world.js';
import { disclosure, equations } from './models.js';
import { describe as describeObject, shapeById, materialById } from './shapes.js';
import { fluidById } from './drag.js';
import { worldById, describeWorld, surfaceGravity, uniformFieldValid, everydayComparison } from './gravitation.js';
import { fmtFixed } from './format.js';

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
    watch: 'Set a push and a duration. Watch the velocity keep its value after '
      + 'the push ends: nothing is needed to maintain motion, only to change it.',
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
    features: ['applied', 'planet', 'ground', 'shape'],
    ask: 'If gravity is still pulling, what holds it up?',
    discover: 'The surface pushes back — exactly hard enough, and no harder. '
      + 'Tilt the surface and only part of the weight presses into it; the rest '
      + 'is left over, and the object slides. Change the shape and how it sits '
      + 'changes with it.',
    watch: 'Tilt the ramp and watch the normal force shrink as the leftover '
      + 'along the slope grows. They always add up to the weight.',
  },
  {
    id: 'friction',
    label: 'Make the surface grip',
    short: 'Friction',
    features: ['applied', 'planet', 'ground', 'shape', 'friction'],
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
    features: ['applied', 'planet', 'ground', 'shape', 'friction', 'fluid'],
    ask: 'Air, water, honey — what actually changes?',
    discover: 'Two things about a fluid matter: how much of it there is to shove '
      + 'aside, and how much it resists being sheared. In air, inertia wins and '
      + 'drag goes as the square of the speed. In honey, viscosity wins and drag '
      + 'goes as the speed itself. Same object, same equation, different regime.',
    watch: 'Switch between air and honey at the same speed and watch the '
      + 'Reynolds number cross from thousands to about one — and the drag stop '
      + 'being a square law.',
  },
  {
    id: 'collide',
    label: 'A second object',
    short: 'Collide',
    features: ['applied', 'planet', 'ground', 'shape', 'friction', 'fluid', 'collide'],
    ask: 'What survives a collision, and what does not?',
    discover: 'Total momentum comes out exactly as it went in, every time, '
      + 'whatever the objects do to each other. Kinetic energy does not — only a '
      + 'perfectly elastic collision keeps it, and almost nothing is. What '
      + 'leaves the kinetic account has gone somewhere: heat, sound, a dent.',
    watch: 'Change the bounciness and watch which of the two totals moves.',
  },
];

export const stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
export const stageIndex = (id) => Math.max(0, STAGES.findIndex((s) => s.id === id));

/** Is a feature switched on at this step? */
export const has = (stageId, feature) => stageById(stageId).features.includes(feature);

/** Every feature available up to and including a step. */
export const featuresAt = (stageId) => new Set(stageById(stageId).features);

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
  const object = describeObject({ shapeId: p.shapeId, size: p.size, mass: p.mass });
  const fluid = f.has('fluid') ? fluidById(p.fluidId) : fluidById('vacuum');
  const surface = f.has('friction')
    ? { muS: p.muS, muK: p.muK }
    : { muS: 0, muK: 0 };

  /*
   * Which model of gravity is in play, and it is genuinely a different model
   * rather than a different number:
   *
   *   nothing   no gravity at all — steps one and two, so a push is the only
   *             thing acting and can be seen on its own
   *   mutual    G·m₁·m₂/r² between the bodies, with no "down" anywhere
   *   uniform   the flat-ground approximation, once the other mass is a planet
   */
  const planet = f.has('planet') ? describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId }) : null;
  const gravityMode = f.has('ground') ? 'uniform' : (f.has('mutual-gravity') ? 'mutual' : 'none');
  const g = planet ? planet.g : 0;

  const bodies = [{
    id: 'main',
    kind: object.shape.id === 'sphere' || object.shape.id === 'cylinder' ? 'ball' : 'box',
    label: `${fmtFixed(object.mass, object.mass < 10 ? 2 : 0)} kg`,
    mass: object.mass,
    radius: object.size / 2,
    width: object.size,
    height: object.shape.id === 'plate' ? object.size / 10 : object.size,
    diameter: object.size,
    area: object.area,
    cd: object.cd,
    pos: startingPosition(f, p, object),
    vel: vec(p.v0 ?? 0, 0),
    restitution: p.restitution,
    muS: surface.muS,
    muK: surface.muK,
    colour: 0,
  }];

  /*
   * The other mass, and what it becomes.
   *
   * In the third step it is an ordinary object a few metres away, and the pull
   * between them is real and utterly negligible. In the fourth it is a world:
   * same equation, same code path, a mass twenty-four orders of magnitude
   * bigger. Nothing about the physics changes — only the number — and that is
   * the entire point of putting the two steps next to each other.
   */
  if (f.has('planet') && !f.has('ground')) {
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
  } else if (f.has('second-mass')) {
    const other = describeObject({ shapeId: 'sphere', size: p.otherSize, mass: p.otherMass });
    bodies.push({
      id: 'other',
      kind: 'ball',
      label: `${fmtFixed(other.mass, other.mass < 10 ? 2 : 0)} kg`,
      mass: other.mass,
      radius: other.size / 2,
      diameter: other.size,
      area: other.area,
      cd: other.cd,
      pos: vec(p.otherX, 0),
      colour: 1,
    });
  }

  if (f.has('collide')) {
    const second = describeObject({ shapeId: p.shape2Id, size: p.size2, mass: p.mass2 });
    bodies.push({
      id: 'second',
      kind: second.shape.id === 'sphere' || second.shape.id === 'cylinder' ? 'ball' : 'box',
      label: `${fmtFixed(second.mass, second.mass < 10 ? 2 : 0)} kg`,
      mass: second.mass,
      radius: second.size / 2,
      width: second.size,
      height: second.shape.id === 'plate' ? second.size / 10 : second.size,
      diameter: second.size,
      area: second.area,
      cd: second.cd,
      pos: onSurface(f, p, second, p.x2),
      vel: vec(p.v2 ?? 0, 0),
      restitution: p.restitution,
      muS: surface.muS,
      muK: surface.muK,
      colour: 2,
    });
  }

  const world = createWorld({
    g,
    field: gravityMode === 'uniform' ? vec(0, -g) : vec(0, 0),
    mutualGravity: gravityMode === 'mutual',
    fluidDensity: fluid.density,
    viscosity: fluid.viscosity,
    ground: f.has('ground')
      ? { y: 0, slopeDeg: p.slopeDeg, muS: surface.muS, muK: surface.muK, restitution: p.restitution }
      : null,
    bounds: null,
    /*
     * Solid objects cannot pass through each other, and here that is not a
     * detail. G·m₁·m₂/r² has a singularity at r = 0: let two bodies
     * interpenetrate and the attraction climbs without limit, flinging the
     * small one away at half the speed of light. Letting them touch instead is
     * both the honest model and the one that behaves.
     */
    bodyCollisions: f.has('collide') || f.has('mutual-gravity'),
    collisionRestitution: p.restitution,
    bodies,
    trailLimit: f.has('ground') || f.has('mutual-gravity') ? 700 : 0,
  });

  return {
    world,
    object,
    planet,
    fluid,
    gravityMode,
    focusId: 'main',
    features: f,
    disclosure: discloseFor(stageId, p, { object, planet, fluid, gravityMode }),
    equations: equationsFor(f),
  };
}

/** Where the object starts, which depends on what there is to stand on. */
function startingPosition(f, p, object) {
  if (f.has('ground')) return onSurface(f, p, object, p.x0 ?? 0);
  // On a world: released a little above the surface, so the first thing it does
  // is fall. Free fall is what makes the pull recognisable as weight.
  if (f.has('planet')) return vec(p.x0 ?? 0, object.support + (p.dropHeight ?? 0.6));
  return vec(p.x0 ?? 0, 0);
}

/** A body resting exactly on the ramp, `distance` metres along it. */
function onSurface(f, p, object, distance) {
  if (!f.has('ground')) return vec(distance, 0);
  const rad = ((p.slopeDeg || 0) * Math.PI) / 180;
  const support = object.support;
  return vec(
    distance * Math.cos(rad) - support * Math.sin(rad),
    distance * Math.sin(rad) + support * Math.cos(rad),
  );
}

/* ------------------------------------------------------- what it assumes -- */

function discloseFor(stageId, p, { object, planet, fluid, gravityMode }) {
  const f = featuresAt(stageId);

  const models = ['classical-mechanics', 'point-mass'];
  const assumptions = ['no-rotation', 'constant-mass', 'no-relativity'];
  const approximations = [];
  const numbers = [];

  if (gravityMode === 'mutual') {
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

  if (f.has('ground')) {
    models.push('rigid-body');
    numbers.push({
      label: 'Object',
      value: `${object.shape.label}, ${fmtFixed(object.size, 2)} m across`,
      note: `${object.shape.note} Volume ${object.volume.toPrecision(3)} m³, so at `
        + `${fmtFixed(object.mass, 2)} kg its density is ${fmtFixed(object.density, 0)} kg/m³.`,
    });
  }

  if (f.has('friction')) {
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
    models.push('quadratic-drag');
    assumptions.push('no-buoyancy', 'no-wind');
    numbers.push({
      label: fluid.label,
      value: `ρ ${fluid.density} kg/m³, μ ${fluid.viscosity} Pa·s`,
      note: `${fluid.note} The drag coefficient here is not held constant: it is `
        + 'computed from the Reynolds number, so the same equation gives a square '
        + 'law in air and a linear one in honey.',
    });
  } else {
    assumptions.push('no-drag');
  }

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
    reality: realityFor(stageId),
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
    + 'and drag a wake behind it, and which of those two costs more depends on '
    + 'the fluid.',
  collide: 'During an impact each object pushes on the other with an equal and '
    + 'opposite force for exactly the same length of time.',
};

const realityFor = (stageId) => REALITY[stageId] || REALITY.mass;

function equationsFor(f) {
  const ids = ['newton-2', 'momentum', 'kinetic-energy'];
  if (f.has('mutual-gravity')) ids.push('gravity-field', 'weight');
  if (f.has('ground')) ids.push('weight', 'potential-energy', 'energy-conservation');
  if (f.has('friction')) ids.push('friction');
  if (f.has('fluid')) ids.push('drag', 'terminal-velocity');
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
export function channelsFor(stageId) {
  const f = featuresAt(stageId);
  const groups = [];
  const moving = f.has('applied') || f.has('mutual-gravity');

  if (moving) {
    groups.push({ label: 'Velocity against time — the gradient is the acceleration', ids: ['vx', 'vy'] });
    // Momentum and energy from the moment anything can move, and for the rest
    // of the bench. They are not a later topic; they are two more ways of
    // describing what is already on screen, and holding them back until a
    // "momentum chapter" is what makes them feel like one.
    groups.push({ label: 'Momentum against time — mass and velocity together', ids: ['px', 'py'] });
    groups.push({ label: 'Energy against time', ids: f.has('ground') ? ['ke', 'pe', 'etotal'] : ['ke'] });
  }

  if (f.has('ground')) {
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

  if (moving && !f.has('ground')) {
    groups.push({ label: 'Net force against time', ids: ['fx', 'fnet'] });
  }
  return groups;
}

/**
 * Which arrows can be drawn at this step.
 *
 * The picker is built from this, so an arrow can never be offered for a force
 * that does not exist yet — and every force that does exist can be turned off.
 */
export function vectorsFor(stageId) {
  const f = featuresAt(stageId);
  const out = [
    { id: 'velocity', label: 'Velocity', token: '--vec-velocity', kind: 'motion' },
    { id: 'acceleration', label: 'Acceleration', token: '--vec-acceleration', kind: 'motion' },
    { id: 'momentum', label: 'Momentum', token: '--vec-momentum', kind: 'motion' },
  ];
  if (f.has('applied')) out.push({ id: 'applied', label: 'Applied push', token: '--force-applied', kind: 'force' });
  if (f.has('mutual-gravity') || f.has('planet')) out.push({ id: 'weight', label: f.has('ground') ? 'Weight' : 'Gravitational pull', token: '--force-weight', kind: 'force' });
  if (f.has('ground')) out.push({ id: 'normal', label: 'Normal force', token: '--force-normal', kind: 'force' });
  if (f.has('friction')) out.push({ id: 'friction', label: 'Friction', token: '--force-friction', kind: 'force' });
  if (f.has('fluid')) out.push({ id: 'drag', label: 'Fluid resistance', token: '--force-drag', kind: 'force' });
  out.push({ id: 'net', label: 'Net force (the sum of them all)', token: '--force-net', kind: 'force' });
  return out;
}
