/**
 * Every experiment: what world it sets up, and what it is honest about. Pure.
 *
 * A scenario is two things bolted together on purpose. It builds the world the
 * lab runs in, and it declares — through `js/models.js` — the model, the
 * assumptions and the approximations that world embodies. They are in one place
 * because separating them is how a simulation ends up quietly running with air
 * resistance switched off while the interface says nothing about it.
 *
 * `build` throws if the disclosure is incomplete. A lab that forgets to say
 * what it is assuming does not start.
 */

import { vec } from './vec.js';
import { createWorld } from './world.js';
import { disclosure, equations } from './models.js';
import {
  G_STANDARD, G_ROUNDED, environmentById, fluidById, dragShapeById, surfaceById,
  sphereArea, materialById, sphereMass,
} from './constants.js';
import { fmtFixed } from './format.js';

/* ------------------------------------------------------- shared pieces -- */

/**
 * The gravitational field a set of parameters asks for, and the honest
 * description of where that number came from.
 *
 * Every lab goes through this, so there is exactly one place where "which g?"
 * is answered — and exactly one place where switching on the classroom
 * approximation gets recorded as an approximation rather than a value.
 */
export function gravityFor(params = {}) {
  const env = environmentById(params.envId || 'earth');
  const raw = env.id === 'custom' && Number.isFinite(params.customG) ? params.customG : env.g;
  const rounded = !!params.roundG;
  return {
    env,
    g: rounded ? G_ROUNDED : raw,
    exact: raw,
    rounded,
    // What the interface must show next to the number.
    source: rounded
      ? `Approximation in use: ${G_ROUNDED} m/s² instead of ${fmtFixed(raw, 3)} m/s². `
        + 'Chosen for easier arithmetic — it is not the standard value and not '
        + 'the value anywhere real.'
      : `${env.label}: ${fmtFixed(raw, env.kind === 'exact' ? 5 : 2)} m/s² (${env.kind}). ${env.varies}.`,
    note: env.note,
  };
}

/** The fluid a set of parameters asks for. `dragOn: false` means a vacuum. */
export function fluidFor(params = {}) {
  const fluid = params.dragOn ? fluidById(params.fluidId || 'air') : fluidById('vacuum');
  const shape = dragShapeById(params.shapeId || 'sphere');
  const cd = shape.id === 'custom' && Number.isFinite(params.customCd) ? params.customCd : shape.cd;
  return { fluid, shape, cd, density: fluid.density, active: fluid.density > 0 };
}

export function surfaceFor(params = {}) {
  const surface = surfaceById(params.surfaceId || 'wood');
  return {
    surface,
    muS: surface.id === 'custom' ? Math.max(0, params.customMuS ?? 0.4) : surface.muS,
    muK: surface.id === 'custom' ? Math.max(0, params.customMuK ?? 0.3) : surface.muK,
  };
}

/** The three lines every lab shows about the numbers it is using. */
const gravityNumbers = (gravity) => [
  {
    label: 'Gravitational field strength',
    value: `${fmtFixed(gravity.g, gravity.rounded ? 0 : 4)} m/s²`,
    note: gravity.source,
  },
];

const dragNumbers = (air) => (air.active
  ? [
    { label: 'Fluid density', value: `${air.density} kg/m³`, note: air.fluid.note },
    { label: 'Drag coefficient', value: String(air.cd), note: `${air.shape.label}. ${air.shape.note}` },
  ]
  : [{ label: 'Fluid density', value: '0 kg/m³', note: 'Running in a vacuum: no air resistance at all.' }]);

const frictionNumbers = (s) => [
  { label: 'Static friction μs', value: String(s.muS), note: `${s.surface.label}. ${s.surface.note}` },
  { label: 'Kinetic friction μk', value: String(s.muK), note: 'Indicative textbook figures.' },
];

/**
 * Where a body's centre must sit to rest exactly on a sloped surface.
 *
 * `distance` is measured along the slope from the origin, and `support` is the
 * body's half-height along its own normal — the same quantity `groundGap` uses,
 * so the two cannot disagree. Getting this wrong is not a cosmetic error: a
 * body placed a few centimetres under the ramp starts the experiment already
 * inside the ground, free-falls through it, and the energy readout goes
 * negative. It is worth one function.
 */
export function onSlope(distance, slopeDeg, support, groundY = 0) {
  const rad = (slopeDeg * Math.PI) / 180;
  return vec(
    distance * Math.cos(rad) - support * Math.sin(rad),
    groundY + distance * Math.sin(rad) + support * Math.cos(rad),
  );
}

/** Assumption ids every uniform-field, point-mass lab shares. */
const BASE_ASSUMPTIONS = ['no-rotation', 'constant-mass', 'no-relativity'];

const approximationsFor = (params, extra = []) => [
  ...(params.roundG ? ['g-rounded'] : []),
  ...(params.dragOn ? ['fixed-cd'] : []),
  ...extra,
];

/* --------------------------------------------------------- the labs ----- */

/**
 * Mass and inertia: the same force applied to two different masses.
 *
 * Deliberately frictionless and airless. Everything that could muddy the
 * comparison is removed so that the only difference between the two bodies is
 * the one being studied — and the disclosure says exactly that, so the removal
 * is a stated choice rather than a hidden convenience.
 */
function massLab(p) {
  const cart = (id, mass, colour, y) => ({
    id, kind: 'cart', label: `${mass} kg`, mass, colour,
    // Both carts are the same size on screen. Making the heavy one bigger
    // would suggest the size is what slows it down; it is the mass.
    width: 0.6, height: 0.4, radius: 0.3,
    pos: vec(0, y), applied: vec(p.force ?? 10, 0),
    cd: 0, area: 0, muS: 0, muK: 0,
  });

  // Two level, frictionless lanes. `g: 0` is not a claim about gravity — it is
  // a level track, where weight and the normal force cancel exactly and play
  // no part in the horizontal motion being studied. The disclosure says so.
  const world = createWorld({
    g: 0,
    fluidDensity: 0,
    ground: null,
    bounds: null,
    bodies: [cart('light', p.m1 ?? 1, 0, 0.6), cart('heavy', p.m2 ?? 10, 1, -0.6)],
    trailLimit: 0,
  });

  return {
    world,
    focusId: 'light',
    lanes: [0.6, -0.6],
    disclosure: disclosure({
      reality: 'Every object resists having its motion changed, and how strongly '
        + 'it resists is what we call its mass.',
      models: ['classical-mechanics', 'point-mass'],
      assumptions: ['no-drag', 'no-rotation', 'constant-mass', 'no-relativity'],
      approximations: approximationsFor(p),
      numbers: [
        { label: 'Applied force', value: `${p.force} N`, note: 'The same force on both carts — that is the experiment.' },
        { label: 'Friction', value: '0', note: 'Removed deliberately, so the only difference between the carts is their mass.' },
        { label: 'Gravity', value: 'not acting along the track', note: 'The lane is level, so weight and the normal force cancel and play no part.' },
      ],
    }),
    equations: equations(['newton-2']),
  };
}

/** Position, time, speed and velocity, on a long straight track. */
function motionLab(p) {
  const world = createWorld({
    g: 0,
    fluidDensity: 0,
    ground: { y: -0.5, muS: 0, muK: 0, restitution: 0 },
    bounds: null,
    bodies: [
      { id: 'a', kind: 'cart', label: 'A', mass: p.mass ?? 1, colour: 0, cd: 0, area: 0, muS: 0, muK: 0, width: 0.6, height: 0.4, radius: 0.3, pos: vec(p.x0 ?? 0, 0.2), vel: vec(p.v0 ?? 4, 0) },
      ...(p.showSecond ? [{ id: 'b', kind: 'cart', label: 'B', mass: p.mass ?? 1, colour: 2, cd: 0, area: 0, muS: 0, muK: 0, width: 0.6, height: 0.4, radius: 0.3, pos: vec(p.x0b ?? 0, -0.6), vel: vec(p.v0b ?? -4, 0) }] : []),
    ],
    trailLimit: 0,
  });

  return {
    world,
    focusId: 'a',
    disclosure: disclosure({
      reality: 'A moving object has both a speed and a direction. The pair of '
        + 'them together is its velocity, and only the pair is enough to say '
        + 'where it will be next.',
      models: ['classical-mechanics', 'point-mass'],
      assumptions: ['no-drag', 'no-rotation', 'constant-mass', 'no-relativity'],
      approximations: approximationsFor(p),
      numbers: [
        { label: 'Net force', value: '0 N', note: 'Nothing pushes or resists, so the velocity never changes. That is Newton\'s first law being demonstrated rather than asserted.' },
      ],
    }),
    equations: equations(['suvat-s']),
  };
}

/** Acceleration: velocity changing at a steady rate. */
function accelLab(p) {
  const world = createWorld({
    g: 0,
    fluidDensity: 0,
    ground: { y: -0.5, muS: 0, muK: 0, restitution: 0 },
    bounds: null,
    bodies: [{
      id: 'a', kind: 'cart', label: 'Cart', mass: p.mass ?? 2, colour: 0,
      cd: 0, area: 0, muS: 0, muK: 0, width: 0.6, height: 0.4, radius: 0.3,
      pos: vec(p.x0 ?? 0, 0.2), vel: vec(p.u ?? 0, 0),
      applied: vec((p.mass ?? 2) * (p.a ?? 2), 0),
    }],
    trailLimit: 0,
  });

  return {
    world,
    focusId: 'a',
    disclosure: disclosure({
      reality: 'Acceleration is the rate at which velocity changes. It is not '
        + '"getting faster" — an object slowing down, or turning, is accelerating '
        + 'just as surely.',
      models: ['classical-mechanics', 'point-mass'],
      assumptions: ['no-drag', 'no-rotation', 'constant-mass', 'no-relativity'],
      approximations: approximationsFor(p),
      numbers: [
        { label: 'Acceleration', value: `${p.a} m/s²`, note: 'Held constant, which is what allows v = u + a·t to be used at all.' },
        { label: 'Force producing it', value: `${fmtFixed((p.mass ?? 2) * (p.a ?? 2), 2)} N`, note: 'F = m·a, applied along the track.' },
      ],
    }),
    equations: equations(['suvat-v', 'suvat-s', 'suvat-v2', 'newton-2']),
  };
}

/** The Force Laboratory: a box on a surface, with every force drawn. */
function forceLab(p) {
  const gravity = gravityFor(p);
  const friction = surfaceFor(p);
  const air = fluidFor(p);
  const mass = p.mass ?? 10;
  const radius = 0.25 * Math.cbrt(mass / 10);

  const world = createWorld({
    g: gravity.g,
    fluidDensity: air.density,
    ground: { y: 0, slopeDeg: p.slopeDeg ?? 0, muS: friction.muS, muK: friction.muK, restitution: 0 },
    bounds: null,
    bodies: [{
      id: 'box', kind: 'box', label: `${mass} kg`, mass, colour: 0,
      width: radius * 2.2, height: radius * 1.6, radius,
      // Sitting on the surface, whatever angle it is at. A box placed at a
      // fixed height is under the ramp the moment the slope is tilted.
      pos: onSlope(0, p.slopeDeg ?? 0, radius * 0.8),
      applied: vec(p.appliedX ?? 0, p.appliedY ?? 0),
      cd: air.active ? air.cd : 0,
      area: air.active ? radius * 1.6 * radius * 2.2 : 0,
      muS: friction.muS, muK: friction.muK, restitution: 0,
    }],
  });

  return {
    world,
    focusId: 'box',
    disclosure: disclosure({
      reality: 'Several forces act on the box at once. What it does is decided '
        + 'by their vector sum, not by any one of them.',
      models: ['classical-mechanics', 'point-mass', 'coulomb-friction', 'flat-earth-ground'],
      assumptions: [...BASE_ASSUMPTIONS, ...(air.active ? [] : ['no-drag'])],
      approximations: approximationsFor(p, ['indicative-mu']),
      numbers: [...gravityNumbers(gravity), ...frictionNumbers(friction), ...dragNumbers(air)],
    }),
    equations: equations(['newton-2', 'friction', 'weight']),
  };
}

/** Gravity and projectiles. */
function projectileLab(p) {
  const gravity = gravityFor(p);
  const air = fluidFor(p);
  const mass = p.mass ?? 0.5;
  const radius = p.radius ?? 0.08;

  const world = createWorld({
    g: gravity.g,
    fluidDensity: air.density,
    ground: { y: 0, muS: 0.5, muK: 0.4, restitution: p.restitution ?? 0 },
    bounds: null,
    bodies: [{
      id: 'ball', kind: 'ball', label: 'Ball', mass, radius, colour: 0,
      pos: vec(0, (p.height ?? 0) + radius),
      vel: vec(
        (p.speed ?? 20) * Math.cos(((p.angleDeg ?? 45) * Math.PI) / 180),
        (p.speed ?? 20) * Math.sin(((p.angleDeg ?? 45) * Math.PI) / 180),
      ),
      cd: air.active ? air.cd : 0,
      area: air.active ? sphereArea(radius) : 0,
      restitution: p.restitution ?? 0,
    }],
    trailLimit: 900,
  });

  return {
    world,
    focusId: 'ball',
    disclosure: disclosure({
      reality: 'Gravity pulls the ball towards the planet\'s centre the whole '
        + 'time it is in the air — on the way up as much as on the way down.',
      models: ['classical-mechanics', 'point-mass', 'uniform-field', 'flat-earth-ground',
        ...(air.active ? ['quadratic-drag'] : [])],
      assumptions: [
        ...BASE_ASSUMPTIONS,
        ...(air.active ? ['no-wind', 'no-air-density-change', 'no-buoyancy'] : ['no-drag']),
      ],
      approximations: approximationsFor(p),
      numbers: [...gravityNumbers(gravity), ...dragNumbers(air)],
    }),
    equations: air.active
      ? equations(['weight', 'drag', 'terminal-velocity', 'newton-2'])
      : equations(['suvat-v', 'suvat-s', 'weight', 'gravity-field']),
  };
}

/**
 * Mass versus weight, and the free-fall comparison.
 *
 * Two balls of very different mass, dropped together. In a vacuum they stay
 * level; with air they separate — and the reason they separate is not that
 * gravity pulls harder on the heavier one.
 */
function weightLab(p) {
  const gravity = gravityFor(p);
  const air = fluidFor(p);
  const height = p.height ?? 40;

  const make = (id, mass, materialId, x, colour) => {
    const material = materialById(materialId);
    // Same radius, very different mass: the comparison the experiment needs.
    const radius = p.sameSize ? 0.15 : Math.cbrt((3 * mass) / (4 * Math.PI * material.density));
    return {
      id, kind: 'ball', label: `${mass} kg`, mass, radius, colour,
      pos: vec(x, height + radius),
      cd: air.active ? air.cd : 0,
      area: air.active ? sphereArea(radius) : 0,
      restitution: 0, muS: 0.5, muK: 0.4,
    };
  };

  const world = createWorld({
    g: gravity.g,
    fluidDensity: air.density,
    ground: { y: 0, muS: 0.5, muK: 0.4, restitution: 0 },
    bounds: null,
    bodies: [
      make('light', p.m1 ?? 1, p.material1 || 'wood', -1.2, 0),
      make('heavy', p.m2 ?? 10, p.material2 || 'steel', 1.2, 1),
    ],
    trailLimit: 0,
  });

  return {
    world,
    focusId: 'heavy',
    disclosure: disclosure({
      reality: 'Mass is how much matter an object has and how strongly it '
        + 'resists acceleration. Weight is the force gravity exerts on that '
        + 'mass. Move the object to another planet and its mass is unchanged '
        + 'while its weight is not.',
      models: ['classical-mechanics', 'point-mass', 'uniform-field',
        ...(air.active ? ['quadratic-drag'] : [])],
      assumptions: [...BASE_ASSUMPTIONS, ...(air.active ? ['no-buoyancy', 'no-wind'] : ['no-drag', 'no-buoyancy'])],
      approximations: approximationsFor(p),
      numbers: [
        ...gravityNumbers(gravity),
        ...dragNumbers(air),
        {
          label: 'Why the masses cancel',
          value: 'a = F/m = (m·g)/m = g',
          note: 'A heavier object is pulled harder — and resists acceleration '
            + 'more, by exactly the same factor. The two cancel, so the mass '
            + 'divides out entirely and in a vacuum everything at the same place '
            + 'falls identically.',
        },
      ],
    }),
    equations: equations(['weight', 'gravity-field', 'newton-2',
      ...(air.active ? ['drag', 'terminal-velocity'] : [])]),
  };
}

/** Momentum, and collisions — the same world, different readouts. */
function collisionLab(p, { colliding = true } = {}) {
  const friction = { muS: 0, muK: 0 };
  /*
   * Both carts are the same height and sit on one line.
   *
   * This is not cosmetic. The impact is resolved along the line joining the two
   * centres, so carts at different heights collide along a slightly tilted line
   * and come away with a little sideways motion — which leaves kinetic energy
   * the closed-form answer says should have gone, and makes the simulated
   * result disagree with the table printed beside it. Mass shows as length
   * instead, which reads better anyway.
   */
  const HEIGHT = 0.4;
  const halfWidth = (m) => 0.16 + 0.07 * Math.cbrt(m);

  const cart = (id, label, mass, colour, x, v) => ({
    id, kind: 'cart', label, mass, colour,
    width: halfWidth(mass) * 2, height: HEIGHT, radius: halfWidth(mass),
    pos: vec(x, HEIGHT / 2), vel: vec(v, 0),
    cd: 0, area: 0, ...friction,
  });

  // A level, frictionless track. With no gravitational field along it, weight
  // and the normal force are both zero and nothing acts in the direction of
  // travel — which is exactly the condition for momentum to be conserved, and
  // the disclosure names it rather than leaving it implied.
  const world = createWorld({
    g: 0,
    fluidDensity: 0,
    ground: { y: 0, muS: 0, muK: 0, restitution: 0 },
    bounds: p.walls ? { left: -8, right: 8, top: 6, restitution: 1 } : null,
    bodyCollisions: colliding,
    collisionRestitution: p.e ?? 1,
    bodies: [
      cart('a', 'A', p.m1 ?? 1, 0, p.x1 ?? -4, p.v1 ?? 4),
      cart('b', 'B', p.m2 ?? 3, 1, p.x2 ?? 3, p.v2 ?? 0),
    ],
  });

  return {
    world,
    focusId: 'a',
    disclosure: disclosure({
      reality: colliding
        ? 'During the impact each cart pushes on the other with equal and '
          + 'opposite force for exactly the same length of time. That is why the '
          + 'momentum one gains, the other loses.'
        : 'Momentum is the quantity that describes how much motion an object '
          + 'carries — it depends on mass and velocity together, and it has a '
          + 'direction.',
      models: ['classical-mechanics', 'point-mass', ...(colliding ? ['rigid-body', 'restitution'] : [])],
      assumptions: ['no-drag', 'no-rotation', 'constant-mass', 'no-relativity',
        ...(colliding ? ['no-heat'] : [])],
      approximations: approximationsFor(p),
      numbers: [
        { label: 'Track friction', value: '0', note: 'Removed so that momentum has no outside force acting on it — which is the condition for it to be conserved.' },
        ...(colliding
          ? [{ label: 'Coefficient of restitution e', value: String(p.e ?? 1), note: 'e = 1 conserves kinetic energy as well as momentum; e = 0 means the carts move off together.' }]
          : []),
      ],
    }),
    equations: colliding
      ? equations(['momentum', 'momentum-conservation', 'restitution', 'kinetic-energy', 'impulse'])
      : equations(['momentum', 'impulse']),
  };
}

/** Energy: a ball on a ramp, trading height for speed. */
function energyLab(p) {
  const gravity = gravityFor(p);
  const friction = surfaceFor(p);
  const radius = 0.18;

  const world = createWorld({
    g: gravity.g,
    fluidDensity: 0,
    ground: { y: 0, slopeDeg: p.slopeDeg ?? 25, muS: friction.muS, muK: friction.muK, restitution: 0 },
    bounds: null,
    bodies: [{
      id: 'ball', kind: 'ball', label: `${p.mass ?? 2} kg`, mass: p.mass ?? 2, radius, colour: 0,
      // Resting exactly on the ramp, `startDistance` metres up it.
      pos: onSlope(p.startDistance ?? 6, p.slopeDeg ?? 25, radius),
      cd: 0, area: 0, muS: friction.muS, muK: friction.muK, restitution: 0,
    }],
    trailLimit: 0,
  });

  return {
    world,
    focusId: 'ball',
    disclosure: disclosure({
      reality: 'Energy is never created or destroyed. What falls as height rises '
        + 'as speed, and whatever friction removes has become heat in the ramp '
        + 'and the ball.',
      models: ['classical-mechanics', 'point-mass', 'uniform-field', 'coulomb-friction'],
      assumptions: [...BASE_ASSUMPTIONS, 'no-drag', 'no-heat'],
      approximations: approximationsFor(p, ['indicative-mu']),
      numbers: [
        ...gravityNumbers(gravity),
        ...frictionNumbers(friction),
        { label: 'Height datum', value: 'the foot of the ramp', note: 'Only differences in potential energy matter, so the zero can go anywhere convenient.' },
      ],
    }),
    equations: equations(['kinetic-energy', 'potential-energy', 'energy-conservation', 'suvat-v2']),
  };
}

/* ------------------------------------------------------------ registry -- */

const BUILDERS = {
  mass: massLab,
  motion: motionLab,
  accel: accelLab,
  force: forceLab,
  projectile: projectileLab,
  weight: weightLab,
  momentum: (p) => collisionLab(p, { colliding: false }),
  collision: (p) => collisionLab(p, { colliding: true }),
  energy: energyLab,
};

export const hasWorld = (id) => Object.prototype.hasOwnProperty.call(BUILDERS, id);

/**
 * Build a lab's world and its disclosure together.
 *
 * Throws if the disclosure is incomplete — `models.disclosure` refuses a
 * scenario that has not said what it is standing in for. A lab that does not
 * declare its assumptions does not run, which is the only enforcement that
 * actually holds over time.
 */
export function build(id, params = {}) {
  const builder = BUILDERS[id];
  if (!builder) throw new Error(`No scenario named "${id}"`);
  return builder(params);
}

/**
 * The disclosures for the labs that do not use the world stepper — the
 * pendulum, the rolling race and Engineer Mode run their own maths, and still
 * have to say what they are assuming.
 */
export function standaloneDisclosure(id, params = {}) {
  const gravity = gravityFor(params);

  if (id === 'pendulum') {
    return {
      disclosure: disclosure({
        reality: 'A pendulum swings because gravity pulls the bob back towards '
          + 'the lowest point, and its own momentum carries it past.',
        models: ['classical-mechanics', 'point-mass', 'uniform-field', 'ideal-rod', 'numeric-integration'],
        assumptions: [
          'no-drag', 'no-rotation', 'constant-mass', 'no-relativity',
          ...(params.damping > 0 ? [] : ['no-pivot-friction']),
        ],
        approximations: approximationsFor(params, params.showSmallAngle ? ['small-angle'] : []),
        numbers: [
          ...gravityNumbers(gravity),
          {
            label: 'Equation of motion',
            value: 'θ″ = −(g/L)·sin θ',
            note: 'The simulation uses sin θ, not θ. Only the period formula '
              + 'offered alongside it is ever the small-angle approximation — the '
              + 'motion itself is never simplified.',
          },
        ],
      }),
      equations: equations(['pendulum-period', 'energy-conservation', 'newton-2']),
    };
  }

  if (id === 'rotation') {
    return {
      disclosure: disclosure({
        reality: 'A rolling object stores part of its energy as spin, and how '
          + 'much depends on where its mass sits relative to its axis.',
        models: ['classical-mechanics', 'rigid-body', 'uniform-field'],
        assumptions: ['no-drag', 'constant-mass', 'no-relativity'],
        approximations: approximationsFor(params),
        numbers: [
          ...gravityNumbers(gravity),
          {
            label: 'Rolling without slipping',
            value: 'v = ω·r',
            note: 'Assumed throughout. Below a minimum friction the object slips '
              + 'instead, and this analysis stops applying — the lab shows that '
              + 'threshold.',
          },
        ],
      }),
      equations: equations(['newton-2-rotational', 'torque', 'kinetic-energy', 'energy-conservation']),
    };
  }

  if (id === 'engineer') {
    return {
      disclosure: disclosure({
        reality: 'A motor produces torque; gears trade torque against speed; the '
          + 'wheel turns torque into a push against the ground — and the ground '
          + 'can only push back as hard as friction allows.',
        models: ['classical-mechanics', 'rigid-body', 'coulomb-friction', 'uniform-field'],
        assumptions: ['no-drag', 'no-relativity', 'constant-mass'],
        approximations: approximationsFor(params, ['indicative-mu']),
        numbers: [
          ...gravityNumbers(gravity),
          {
            label: 'Motor curve',
            value: 'linear between stall torque and free speed',
            note: 'A reasonable first model for a brushed DC motor and a poor one '
              + 'for anything with a controller, which will hold torque flat and '
              + 'then fall off a cliff.',
          },
        ],
      }),
      equations: equations(['gear-ratio', 'torque', 'newton-2', 'friction']),
    };
  }

  throw new Error(`No standalone disclosure for "${id}"`);
}
