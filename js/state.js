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

import { STAGES, MAX_OBJECTS } from './stages.js';
import { MAX_WALLS } from './segments.js';
import { CONTROL_MODES } from './control.js';
import { WORLDS } from './gravitation.js';
import { SHAPES, MATERIALS } from './shapes.js';
import { FLUIDS } from './drag.js';
import { CHANNELS } from './recorder.js';

const KEY = 'physics-bench';
export const STATE_VERSION = 3;

export const STAGE_IDS = STAGES.map((s) => s.id);
const SHAPE_IDS = SHAPES.map((s) => s.id);
const FLUID_IDS = FLUIDS.map((f) => f.id);
const WORLD_IDS = [...WORLDS.map((w) => w.id), 'custom'];
const MATERIAL_IDS = MATERIALS.map((m) => m.id);
const CHANNEL_IDS = CHANNELS.map((c) => c.id);
const CONTROL_IDS = CONTROL_MODES.map((m) => m.id);
export const MAX_CANNONS = 6;

/** Every arrow that can be drawn, and whether it starts switched on. */
export const VECTOR_IDS = ['velocity', 'acceleration', 'momentum', 'applied', 'control', 'weight', 'normal', 'friction', 'drag', 'buoyancy', 'net'];

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
    buoyancy: true,
    control: true,
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
    y0: 0,
    v0: 0,

    // The push: how hard, which way, for how long.
    pushForce: 10,
    pushAngleDeg: 0,
    pushSeconds: 2,

    // The second mass, before it is a world.
    otherMass: 1000,
    otherSize: 1,
    otherX: 4,

    /*
     * Which world the bench is on. `space` takes away the floor and the field
     * together, which is the honest pairing: there is no such thing as a world
     * with gravity and nothing to stand on, or a floor with nothing holding you
     * to it.
     */
    worldMode: 'planet',

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

    // Bounciness, shared by everything that can hit anything.
    restitution: 0.6,

    /*
     * Every object after the first, each with its own size, mass and shape.
     * The main object keeps its own named parameters above because the whole
     * teaching spine refers to them; these are the ones you add.
     *
     * `y` is a height above the surface where there is a surface, so "two
     * metres up" means the same thing on a tilted ramp as on a flat floor.
     */
    objects: [
      { id: 'o2', mass: 3, size: 0.4, shapeId: 'sphere', x: 4, y: 0, vx: 0, vy: 0 },
    ],

    /** Drawn obstacles: ramps, barriers, the walls of a box. */
    walls: [],

    /** Cannons, which give an object an initial velocity and nothing more. */
    cannons: [],

    /** Driving one of the objects by hand. */
    control: { mode: 'none', targetId: 'main', strength: 15 },
  },

  graphChannels: [],
  // `tool` is what the drawing surface currently does when you drag on it.
  // It lives here rather than in the module because arming it has to survive a
  // re-render, and nowhere else does.
  ui: { sections: {}, tool: 'none' },
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
      y0: clamp(b.y0, -500, 500, d.y0),
      v0: clamp(b.v0, -500, 500, d.v0),

      pushForce: clamp(b.pushForce, -100000, 100000, d.pushForce),
      pushAngleDeg: clamp(b.pushAngleDeg, -180, 180, d.pushAngleDeg),
      pushSeconds: clamp(b.pushSeconds, 0, 120, d.pushSeconds),

      otherMass: mass(b.otherMass, d.otherMass),
      otherSize: clamp(b.otherSize, 0.01, 1e9, d.otherSize),
      otherX: clamp(b.otherX, -1000, 1000, d.otherX),

      worldMode: oneOf(b.worldMode, ['planet', 'space'], d.worldMode),
      planetId: oneOf(b.planetId, WORLD_IDS, d.planetId),
      planetMass: mass(b.planetMass, d.planetMass),
      planetRadius: clamp(b.planetRadius, 1, 1e12, d.planetRadius),

      slopeDeg: clamp(b.slopeDeg, -60, 60, d.slopeDeg),
      muS: clamp(b.muS, 0, 5, d.muS),
      // Kinetic friction cannot exceed static — that is not a preference, it is
      // what the two words mean.
      muK: Math.min(clamp(b.muK, 0, 5, d.muK), clamp(b.muS, 0, 5, d.muS)),

      fluidId: oneOf(b.fluidId, FLUID_IDS, d.fluidId),

      restitution: clamp(b.restitution, 0, 1, d.restitution),

      // Version 2 kept exactly one collision partner in five loose fields.
      // Carry it into the list rather than dropping it, so an old share link
      // opens with the experiment its author set up.
      objects: objectsFrom(b, d),
      walls: wallsFrom(b.walls),
      cannons: cannonsFrom(b.cannons),
      control: {
        mode: oneOf(b.control?.mode, CONTROL_IDS, d.control.mode),
        targetId: typeof b.control?.targetId === 'string' ? b.control.targetId.slice(0, 40) : d.control.targetId,
        strength: clamp(b.control?.strength, 0, 500, d.control.strength),
      },
    },

    graphChannels: Array.isArray(incoming.graphChannels)
      ? incoming.graphChannels.filter((id) => CHANNEL_IDS.includes(id)).slice(0, 8)
      : [],
    ui: {
      sections: sectionFlags(incoming.ui?.sections),
      tool: oneOf(incoming.ui?.tool, ['none', 'wall'], 'none'),
    },
  };
}

/**
 * The object list, from either the current shape or version 2's five fields.
 *
 * Ids are regenerated by position rather than trusted, because they are what
 * the live-update path matches bodies on: a duplicate id arriving from a share
 * link would silently make two objects share one set of parameters.
 */
function objectsFrom(b, d) {
  const incoming = Array.isArray(b.objects)
    ? b.objects
    : (b.mass2 !== undefined
      ? [{ mass: b.mass2, size: b.size2, shapeId: b.shape2Id, x: b.x2, y: 0, vx: b.v2, vy: 0 }]
      : null);
  if (!incoming) return d.objects.map((o) => ({ ...o }));

  return incoming
    .filter((o) => o && typeof o === 'object')
    .slice(0, MAX_OBJECTS - 1)
    .map((o, i) => ({
      id: `o${i + 2}`,
      mass: mass(o.mass, 1),
      size: clamp(o.size, 0.01, 20, 0.4),
      shapeId: oneOf(o.shapeId, SHAPE_IDS, 'sphere'),
      x: clamp(o.x, -500, 500, 0),
      y: clamp(o.y, -500, 500, 0),
      vx: clamp(o.vx, -500, 500, 0),
      vy: clamp(o.vy, -500, 500, 0),
    }));
}

function wallsFrom(incoming) {
  if (!Array.isArray(incoming)) return [];
  return incoming
    .filter((w) => w && typeof w === 'object')
    .slice(0, MAX_WALLS)
    .map((w) => ({
      x1: clamp(w.x1, -1000, 1000, 0),
      y1: clamp(w.y1, -1000, 1000, 0),
      x2: clamp(w.x2, -1000, 1000, 1),
      y2: clamp(w.y2, -1000, 1000, 0),
      restitution: clamp(w.restitution, 0, 1, 0.3),
      mu: clamp(w.mu, 0, 5, 0.6),
    }))
    // A zero-length wall is a click that missed, not an obstacle.
    .filter((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 1e-6);
}

function cannonsFrom(incoming) {
  if (!Array.isArray(incoming)) return [];
  return incoming
    .filter((c) => c && typeof c === 'object')
    .slice(0, MAX_CANNONS)
    .map((c, i) => ({
      id: `cannon${i + 1}`,
      x: clamp(c.x, -500, 500, 0),
      y: clamp(c.y, -500, 500, 1),
      angleDeg: clamp(c.angleDeg, -180, 180, 45),
      speed: clamp(c.speed, 0, 500, 8),
      mass: mass(c.mass, 0.5),
      size: clamp(c.size, 0.01, 5, 0.2),
      shapeId: oneOf(c.shapeId, SHAPE_IDS, 'sphere'),
      everySeconds: clamp(c.everySeconds, 0, 60, 1),
    }));
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
