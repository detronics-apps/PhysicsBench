/**
 * One bench, one set of parameters, three ways of keeping them.
 *
 * | Session persistence | localStorage      | stays on this device       |
 * | Sharing             | the URL fragment  | never sent to a server     |
 * | Save / open         | a local JSON file | a plain file on your disk  |
 *
 * The fragment is the important one: everything after the `#` is handled by the
 * browser alone and never travels with the request, which is what makes "send
 * someone this exact experiment" a private operation.
 *
 * There is one parameter object, not one per step. The mass set in step one is
 * the mass in step eight; walking forward through the stages adds controls
 * without resetting anything, and walking back hides them without losing them.
 *
 * Everything arriving from any of those three routes is older than the code
 * reading it, so it all goes through `migrate` — and nothing is merged with a
 * bare spread, because a key that is present but `undefined` will happily
 * overwrite a perfectly good default. See references/pitfalls.md #8.
 */

import { STAGES } from './stages.js';
import { WORLDS } from './gravitation.js';
import { SHAPES, MATERIALS } from './shapes.js';
import { FLUIDS } from './drag.js';
import { CHANNELS } from './recorder.js';

const KEY = 'physics-bench';
export const STATE_VERSION = 2;

export const STAGE_IDS = STAGES.map((s) => s.id);
const SHAPE_IDS = SHAPES.map((s) => s.id);
const FLUID_IDS = FLUIDS.map((f) => f.id);
const WORLD_IDS = [...WORLDS.map((w) => w.id), 'custom'];
const MATERIAL_IDS = MATERIALS.map((m) => m.id);
const CHANNEL_IDS = CHANNELS.map((c) => c.id);

/** Every arrow that can be drawn, and whether it starts switched on. */
export const VECTOR_IDS = ['velocity', 'acceleration', 'momentum', 'applied', 'weight', 'normal', 'friction', 'drag', 'net'];

export const defaults = () => ({
  version: STATE_VERSION,
  stage: 'mass',
  theme: 'system',
  selectedId: 'main',

  transport: {
    playing: false,
    speed: 1,
    stepSeconds: 0.02,
    scrubT: null,          // null means "follow the live simulation"
  },

  /*
   * Which arrows are drawn. Everything is on by default except momentum, which
   * points the same way as velocity and only earns its place once there are two
   * objects with different masses to compare.
   */
  vectors: {
    velocity: true,
    acceleration: true,
    momentum: false,
    applied: true,
    weight: true,
    normal: true,
    friction: true,
    drag: true,
    net: true,
  },

  view: {
    showValues: true,
    showTrail: true,
    showGrid: true,
    graphs: true,
  },

  /** The one object on the bench, and everything that has been added to it. */
  bench: {
    // The object itself.
    mass: 1,
    size: 0.4,
    shapeId: 'sphere',
    materialId: 'steel',
    x0: 0,
    v0: 0,

    // The push: how hard, which way, for how long.
    pushForce: 10,
    pushAngleDeg: 0,
    pushSeconds: 2,

    // The second mass, before it is a world.
    otherMass: 1000,
    otherSize: 1,
    otherX: 4,

    // The world, given as mass and radius — g is computed, never looked up.
    planetId: 'earth',
    planetMass: 5.9722e24,
    planetRadius: 6.371e6,

    // The surface.
    slopeDeg: 0,
    muS: 0.5,
    muK: 0.35,

    // The fluid.
    fluidId: 'air',

    // The second object, for collisions.
    mass2: 3,
    size2: 0.4,
    shape2Id: 'sphere',
    x2: 4,
    v2: 0,
    restitution: 0.6,
  },

  graphChannels: [],
  ui: { sections: {} },
});

export const state = defaults();

/* ------------------------------------------------------------ coercion -- */

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, lo, hi, fallback) => Math.min(hi, Math.max(lo, num(value, fallback)));
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
/** Positive masses only. A zero mass divides by zero in F = ma. */
const mass = (value, fallback) => clamp(value, 1e-6, 1e32, fallback);

/**
 * Bring any incoming state — old, partial, or hostile — up to the current
 * shape. Every field is coerced rather than trusted: a share link is a string
 * a stranger can edit, and a NaN mass reaches the physics as a silent NaN
 * everywhere rather than an error anyone can act on.
 */
export function migrate(incoming) {
  const base = defaults();
  if (!incoming || typeof incoming !== 'object') return base;

  const b = incoming.bench && typeof incoming.bench === 'object' ? incoming.bench : {};
  const d = base.bench;

  return {
    version: STATE_VERSION,
    stage: oneOf(incoming.stage, STAGE_IDS, base.stage),
    theme: oneOf(incoming.theme, ['system', 'light', 'dark'], base.theme),
    selectedId: typeof incoming.selectedId === 'string' ? incoming.selectedId : 'main',

    transport: {
      playing: bool(incoming.transport?.playing, false),
      speed: clamp(incoming.transport?.speed, 0.05, 8, base.transport.speed),
      stepSeconds: clamp(incoming.transport?.stepSeconds, 0.001, 1, base.transport.stepSeconds),
      // `null` means "follow the live simulation", and `Number(null)` is 0 —
      // which would turn every reload into a timeline scrubbed back to the
      // start, with the simulation apparently frozen.
      scrubT: incoming.transport?.scrubT === null || incoming.transport?.scrubT === undefined
        ? null
        : (Number.isFinite(Number(incoming.transport.scrubT)) ? Number(incoming.transport.scrubT) : null),
    },

    vectors: Object.fromEntries(VECTOR_IDS.map((id) =>
      [id, bool(incoming.vectors?.[id], base.vectors[id])])),

    view: {
      showValues: bool(incoming.view?.showValues, true),
      showTrail: bool(incoming.view?.showTrail, true),
      showGrid: bool(incoming.view?.showGrid, true),
      graphs: bool(incoming.view?.graphs, true),
    },

    bench: {
      mass: mass(b.mass, d.mass),
      size: clamp(b.size, 0.01, 20, d.size),
      shapeId: oneOf(b.shapeId, SHAPE_IDS, d.shapeId),
      materialId: oneOf(b.materialId, MATERIAL_IDS, d.materialId),
      x0: clamp(b.x0, -500, 500, d.x0),
      v0: clamp(b.v0, -500, 500, d.v0),

      pushForce: clamp(b.pushForce, -100000, 100000, d.pushForce),
      pushAngleDeg: clamp(b.pushAngleDeg, -180, 180, d.pushAngleDeg),
      pushSeconds: clamp(b.pushSeconds, 0, 120, d.pushSeconds),

      otherMass: mass(b.otherMass, d.otherMass),
      otherSize: clamp(b.otherSize, 0.01, 1e9, d.otherSize),
      otherX: clamp(b.otherX, -1000, 1000, d.otherX),

      planetId: oneOf(b.planetId, WORLD_IDS, d.planetId),
      planetMass: mass(b.planetMass, d.planetMass),
      planetRadius: clamp(b.planetRadius, 1, 1e12, d.planetRadius),

      slopeDeg: clamp(b.slopeDeg, -60, 60, d.slopeDeg),
      muS: clamp(b.muS, 0, 5, d.muS),
      // Kinetic friction cannot exceed static — that is not a preference, it is
      // what the two words mean.
      muK: Math.min(clamp(b.muK, 0, 5, d.muK), clamp(b.muS, 0, 5, d.muS)),

      fluidId: oneOf(b.fluidId, FLUID_IDS, d.fluidId),

      mass2: mass(b.mass2, d.mass2),
      size2: clamp(b.size2, 0.01, 20, d.size2),
      shape2Id: oneOf(b.shape2Id, SHAPE_IDS, d.shape2Id),
      x2: clamp(b.x2, -500, 500, d.x2),
      v2: clamp(b.v2, -500, 500, d.v2),
      restitution: clamp(b.restitution, 0, 1, d.restitution),
    },

    graphChannels: Array.isArray(incoming.graphChannels)
      ? incoming.graphChannels.filter((id) => CHANNEL_IDS.includes(id)).slice(0, 8)
      : [],
    ui: { sections: sectionFlags(incoming.ui?.sections) },
  };
}

/** Only `stage:section -> boolean` survives; anything else in there is noise. */
function sectionFlags(incoming) {
  const out = {};
  if (!incoming || typeof incoming !== 'object') return out;
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof key === 'string' && key.length <= 80 && typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/* ---------------------------------------------------------- the routes -- */

export function load() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { stored = null; }

  let shared = null;
  if (typeof location !== 'undefined' && location.hash.length > 1) {
    try { shared = JSON.parse(decodeURIComponent(location.hash.slice(1))); } catch { shared = null; }
  }

  Object.assign(state, migrate(shared || stored));
  // Arriving from a share link should not immediately start running: the point
  // of a shared experiment is the setup, and the recipient presses Play.
  state.transport.playing = false;
  return state;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: carry on */ }
}

let pending = null;
/** Writing on every keystroke is wasteful; writing never loses work. */
export function saveSoon() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; save(); }, 400);
}

/** A link that reopens this exact experiment. The fragment never leaves the browser. */
export function shareLink() {
  const payload = { ...state, transport: { ...state.transport, playing: false, scrubT: null } };
  return `${location.origin}${location.pathname}#${encodeURIComponent(JSON.stringify(payload))}`;
}

export const projectJson = () =>
  JSON.stringify({ app: 'physics-bench', saved: new Date().toISOString(), state }, null, 2);

/** Read a project file back, tolerating both the wrapper and a bare state. */
export function loadProject(text) {
  const parsed = JSON.parse(text);
  Object.assign(state, migrate(parsed?.state ?? parsed));
  return state;
}

export function reset() {
  Object.assign(state, defaults());
  return state;
}
