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

/** Steps that have been folded into others, and where their readers go now. */
const RETIRED_STAGES = { surface: 'friction' };
const SHAPE_IDS = SHAPES.map((s) => s.id);
const FLUID_IDS = FLUIDS.map((f) => f.id);
const WORLD_IDS = [...WORLDS.map((w) => w.id), 'custom'];
const MATERIAL_IDS = MATERIALS.map((m) => m.id);
const CHANNEL_IDS = CHANNELS.map((c) => c.id);
const CONTROL_IDS = CONTROL_MODES.map((m) => m.id);
export const MAX_CANNONS = 6;

/** The parts of the page that can be printed, each switchable. */
export const PRINT_PARTS = ['drawing', 'inputs', 'measurements', 'graphs', 'working'];

/** Every arrow that can be drawn, and whether it starts switched on. */
export const VECTOR_IDS = ['velocity', 'acceleration', 'momentum', 'applied', 'control', 'weight', 'normal', 'friction', 'rolling', 'drag', 'buoyancy', 'net'];

export const defaults = () => ({
  version: STATE_VERSION,
  stage: 'mass',
  theme: 'system',
  selectedId: 'main',
  /*
   * Which prepared experiment is on the bench, if any.
   *
   * Kept so the explanation of it survives a reload and travels in a share
   * link — someone sent a prepared scene should get the scene *and* the note
   * about what to do with it. Cleared the moment the reader changes the step,
   * because at that point they have left the experiment and the note would be
   * describing something no longer on screen.
   */
  exampleId: null,

  transport: {
    playing: false,
    speed: 1,
    stepSeconds: 0.02,
    scrubT: null,          // null means "follow the live simulation"
  },

  /*
   * Which arrows are drawn to begin with. Every one of them is switchable, so
   * this is only a question of what the first look should be — and a first look
   * with a dozen arrows on one object teaches nothing but that there are a lot
   * of arrows.
   *
   * The ones that start on are the ones a reader can name before they arrive:
   * how fast it is going, what it weighs, what is holding it back, and the sum.
   * The rest earn their place when they are the subject:
   *
   *   acceleration  reads as a second velocity arrow until something changes speed
   *   applied       zero-length until there is a push to draw
   *   normal        sits under the object, opposing a weight already shown
   *   rolling       so much smaller than the others that it reads as a dot
   *   momentum      points exactly where velocity points, and only separates
   *                 from it once two objects of different mass are compared
   */
  vectors: {
    velocity: true,
    acceleration: false,
    momentum: false,
    applied: false,
    weight: true,
    normal: false,
    friction: true,
    rolling: false,
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

    /*
     * How far apart the metre grid is drawn. 'auto' picks a spacing that keeps
     * the lines 40–120 px apart whatever the zoom, which is right for reading
     * and wrong for comparing two runs at different scales.
     */
    grid: 'auto',

    /*
     * Where the drawing is looking.
     *
     * 'auto' frames whatever is on the bench, which is what you want until it
     * is not: a cannon shot arcing away or a planet arriving pulls the view out
     * until the thing you were watching is a speck, and there was no way back
     * except resetting the whole experiment. 'manual' holds a centre and a
     * width, and Home returns to following the scene.
     */
    camera: { mode: 'auto', cx: 0, cy: 0, span: 6 },

    /*
     * What goes on the printed sheet — which is also what goes into a PDF,
     * since "save as PDF" is a printer as far as a browser is concerned. No
     * library is involved and none is needed: the page already knows how to lay
     * itself out on paper, and a second renderer would be a second thing to
     * keep in step with the first.
     */
    print: {
      drawing: true, inputs: true, measurements: true, graphs: true, working: true,
    },
  },

  /** The one object on the bench, and everything that has been added to it. */
  bench: {
    /*
     * The object itself.
     *
     * The mass is not a round number because it is not chosen: a 0.5 m sphere
     * of expanded polystyrene at 20 kg/m3 weighs 20 x (4/3)pi(0.25)^3 kg, and
     * that is where every digit of it comes from. Rounding it to 1.3 would put
     * the density panel at 19.86 kg/m3 and quietly make the app disagree with
     * its own material table on the very first screen.
     *
     * Starting on a foam rather than a steel ball also means the fluid step has
     * something to show: at this density air is worth noticing, and water lifts
     * it rather than swallowing it.
     */
    mass: 1.308996938995747,
    size: 0.5,
    shapeId: 'sphere',
    materialId: 'polystyrene',
    x0: 0,
    y0: 0,
    v0: 0,

    /*
     * The push: how hard, which way, for how long.
     *
     * Zero to begin with, so nothing moves until the reader moves it. Note that
     * this leaves step two inert on arrival — the step is about the push, and
     * the push is off. Raise this to 10 if the opening should demonstrate
     * itself rather than wait.
     */
    pushForce: 0,
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

    /*
     * How far above the surface the object is released, at the step where the
     * ground has not been drawn yet.
     *
     * This lived only in `state.bench` as an undeclared extra: `migrate` builds
     * a fresh object from the keys it knows, so every reload and every share
     * link silently dropped it back to the default. Declared, it survives.
     */
    dropHeight: 0,

    /*
     * The surface. The coefficients start on a real named pair rather than a
     * round pair of numbers, so the selector opens on "steel on steel, oiled"
     * instead of "a value of my own" — which would be the app admitting on
     * first sight that it does not know what its own defaults represent.
     */
    slopeDeg: 0,
    muS: 0.15,
    muK: 0.09,

    // The fluid.
    fluidId: 'air',

    // Bounciness, where every object does not bring its own.
    restitution: 0.6,

    /*
     * Where bounciness comes from.
     *
     *   material  each impact uses the two objects' own materials, so A into B
     *             and A into C are different collisions
     *   fixed     one number for the whole scene
     */
    bounceMode: 'material',

    /*
     * Whether solid objects bounce off each other at all.
     *
     * Overruled where mutual gravitation is the model, because there it is not
     * a preference: 1/r² has a singularity at zero separation, and two bodies
     * that can pass through each other find it.
     */
    collisions: true,

    /*
     * Every object after the first, each with its own size, mass and shape.
     * The main object keeps its own named parameters above because the whole
     * teaching spine refers to them; these are the ones you add.
     *
     * `y` is a height above the surface where there is a surface, so "two
     * metres up" means the same thing on a tilted ramp as on a flat floor.
     */
    objects: [
      { id: 'o2', mass: 1, size: 0.4, shapeId: 'sphere', materialId: 'rubber', x: 1, y: 0, vx: 0, vy: 0 },
    ],

    /*
     * Drawn obstacles: ramps, barriers, the walls of a box.
     *
     * One ramp, sitting just past the second ball. Its coordinates came from
     * dragging on the drawing, so they are rounded to the centimetre here and
     * the near end is snapped to the floor — it was drawn 17 mm underneath it,
     * which is a hand missing by a pixel and not a decision.
     */
    walls: [
      { x1: 1.68, y1: 0, x2: 3.56, y2: 1.2, bulge: 0, restitution: 0.3, mu: 0.6 },
    ],

    /*
     * Cannons, which give an object an initial velocity and nothing more.
     *
     * These three lines are one scene: a cannon at the left lobs a steel ball
     * along the floor every two seconds, into the polystyrene sphere at the
     * origin, which shunts the rubber ball into the ramp. Light thing hit by
     * heavy thing, then heavy thing hit by light thing, then a slope — three
     * collisions worth watching in one shot, and none of it visible until the
     * step that introduces cannons, because the steps gate what is drawn.
     */
    cannons: [
      {
        id: 'cannon1', x: -3, y: 0.2, angleDeg: 5, speed: 9,
        mass: 0.5, size: 0.2, shapeId: 'sphere', materialId: 'steel',
        muS: 2, muK: 1.5, rolling: 0.25, everySeconds: 2,
      },
    ],

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
 * A push, as a size and a direction — never a negative size.
 *
 * The force slider used to run from -200 to 200, so a saved experiment can
 * carry a negative one, meaning "the same push, the other way". That is what
 * the angle says, and having two controls able to say it left them free to
 * disagree. Clamping the force to zero would silently delete somebody's push,
 * so it is turned through half a turn instead and comes out doing exactly what
 * it did before.
 */
function pushFrom(b, d) {
  const force = clamp(b.pushForce, -100000, 100000, d.pushForce);
  const angleDeg = clamp(b.pushAngleDeg, -180, 180, d.pushAngleDeg);
  if (force >= 0) return { force, angleDeg };
  const turned = angleDeg > 0 ? angleDeg - 180 : angleDeg + 180;
  return { force: -force, angleDeg: clamp(turned, -180, 180, d.pushAngleDeg) };
}

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
  const push = pushFrom(b, d);

  return {
    version: STATE_VERSION,
    // A saved session or a share link may name the surface step, which no
    // longer exists. Sending it to the step that absorbed it is the only
    // answer that keeps the reader where they were; the plain fallback would
    // drop them back at step one.
    stage: oneOf(RETIRED_STAGES[incoming.stage] ?? incoming.stage, STAGE_IDS, base.stage),
    theme: oneOf(incoming.theme, ['system', 'light', 'dark'], base.theme),
    selectedId: typeof incoming.selectedId === 'string' ? incoming.selectedId : 'main',
    exampleId: typeof incoming.exampleId === 'string' ? incoming.exampleId : null,

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
      // A grid may be as fine as a millimetre now, so the floor comes down
      // with the ceiling — the old guard only refused values at or below zero.
      grid: incoming.view?.grid === 'auto' || !(Number(incoming.view?.grid) > 0)
        ? 'auto'
        : Math.min(1000, Math.max(1e-4, Number(incoming.view.grid))),
      camera: {
        mode: oneOf(incoming.view?.camera?.mode, ['auto', 'manual', 'follow'], 'auto'),
        cx: clamp(incoming.view?.camera?.cx, -1e6, 1e6, 0),
        cy: clamp(incoming.view?.camera?.cy, -1e6, 1e6, 0),
        span: clamp(incoming.view?.camera?.span, 1e-4, 1e9, 6),
      },
      print: Object.fromEntries(PRINT_PARTS.map((k) =>
        [k, bool(incoming.view?.print?.[k], true)])),
    },

    bench: {
      mass: mass(b.mass, d.mass),
      size: clamp(b.size, 0.01, 200, d.size),
      shapeId: oneOf(b.shapeId, SHAPE_IDS, d.shapeId),
      materialId: oneOf(b.materialId, MATERIAL_IDS, d.materialId),
      x0: clamp(b.x0, -500, 500, d.x0),
      y0: clamp(b.y0, -500, 500, d.y0),
      v0: clamp(b.v0, -500, 500, d.v0),

      pushForce: push.force,
      pushAngleDeg: push.angleDeg,
      pushSeconds: clamp(b.pushSeconds, 0, 120, d.pushSeconds),

      otherMass: mass(b.otherMass, d.otherMass),
      otherSize: clamp(b.otherSize, 0.01, 1e9, d.otherSize),
      otherX: clamp(b.otherX, -1000, 1000, d.otherX),

      worldMode: oneOf(b.worldMode, ['planet', 'space'], d.worldMode),
      planetId: oneOf(b.planetId, WORLD_IDS, d.planetId),
      planetMass: mass(b.planetMass, d.planetMass),
      planetRadius: clamp(b.planetRadius, 1, 1e12, d.planetRadius),

      dropHeight: clamp(b.dropHeight, 0, 500, d.dropHeight),
      slopeDeg: clamp(b.slopeDeg, -60, 60, d.slopeDeg),
      muS: clamp(b.muS, 0, 5, d.muS),
      // Kinetic friction cannot exceed static — that is not a preference, it is
      // what the two words mean.
      muK: Math.min(clamp(b.muK, 0, 5, d.muK), clamp(b.muS, 0, 5, d.muS)),

      fluidId: oneOf(b.fluidId, FLUID_IDS, d.fluidId),

      restitution: clamp(b.restitution, 0, 1, d.restitution),
      collisions: bool(b.collisions, d.collisions),
      bounceMode: oneOf(b.bounceMode, ['material', 'fixed'], d.bounceMode),

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
      tool: oneOf(incoming.ui?.tool, ['none', 'wall', 'arc', 'pan'], 'none'),
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
      materialId: oneOf(o.materialId, MATERIAL_IDS, 'rubber'),
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
      // How far it bows off straight. Absent means zero means straight, which
      // is what every wall drawn before curves existed is.
      bulge: clamp(w.bulge, -1000, 1000, 0),
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
      materialId: oneOf(c.materialId, MATERIAL_IDS, 'steel'),
      muS: clamp(c.muS, 0, 5, 2),
      muK: Math.min(clamp(c.muK, 0, 5, 1.5), clamp(c.muS, 0, 5, 2)),
      rolling: clamp(c.rolling, 0, 2, 0.25),
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
