/**
 * One state object, three ways of keeping it.
 *
 * | Session persistence | localStorage      | stays on this device       |
 * | Sharing             | the URL fragment  | never sent to a server     |
 * | Save / open         | a local JSON file | a plain file on your disk  |
 *
 * The fragment is the important one: everything after the `#` is handled by the
 * browser alone and never travels with the request, which is what makes "send
 * someone this exact experiment" a private operation.
 *
 * Everything arriving from any of those three routes is older than the code
 * reading it, so it all goes through `migrate` — and nothing is merged with a
 * bare spread, because a key that is present but `undefined` will happily
 * overwrite a perfectly good default. See references/pitfalls.md #8.
 */

import { G_STANDARD } from './constants.js';

const KEY = 'physics-bench';
export const STATE_VERSION = 1;

export const TOOLS = [
  'mass', 'motion', 'accel', 'force', 'projectile', 'weight',
  'momentum', 'collision', 'energy', 'pendulum', 'rotation', 'engineer', 'challenge',
];

/** Play strips the interface back; Learn shows the equations; Engineer builds. */
export const MODES = ['play', 'learn', 'engineer'];

export const defaults = () => ({
  version: STATE_VERSION,
  tool: 'mass',
  mode: 'learn',
  theme: 'system',
  selectedId: null,

  // Playback is shared by every lab, so it lives once at the top.
  transport: {
    playing: false,
    speed: 1,
    stepSeconds: 0.02,
    scrubT: null,          // null means "follow the live simulation"
  },

  view: {
    showVectors: true,
    showForces: true,
    showVelocity: true,
    showAcceleration: true,
    showMomentum: false,
    showTrail: true,
    showGrid: true,
    showValues: true,
    graphChannels: ['y', 'vy', 'ay'],
  },

  compare: { on: false, params: null },

  tools: {
    mass: { m1: 1, m2: 10, force: 10, envId: 'earth', roundG: false },
    motion: { v0: 4, x0: -6, mass: 1, showSecond: true, v0b: -4, x0b: 6 },
    accel: { u: 0, a: 2, mass: 2, x0: -6 },
    force: {
      mass: 10, appliedX: 30, appliedY: 0, surfaceId: 'wood', slopeDeg: 0,
      envId: 'earth', roundG: false, dragOn: false, shapeId: 'cube',
      customMuS: 0.4, customMuK: 0.3,
    },
    projectile: {
      speed: 20, angleDeg: 45, height: 0, mass: 0.5, radius: 0.08,
      envId: 'earth', customG: G_STANDARD, roundG: false,
      dragOn: false, fluidId: 'air', shapeId: 'sphere', customCd: 0.47,
      restitution: 0,
    },
    weight: {
      m1: 1, m2: 10, material1: 'wood', material2: 'steel', sameSize: true,
      height: 40, envId: 'earth', customG: G_STANDARD, roundG: false,
      dragOn: false, fluidId: 'air', shapeId: 'sphere',
    },
    momentum: { m1: 2, v1: 6, m2: 8, v2: 0, x1: -5, x2: 4, walls: false },
    collision: { m1: 1, v1: 5, m2: 10, v2: 0, x1: -5, x2: 4, e: 1, walls: false },
    energy: { mass: 2, slopeDeg: 25, startDistance: 6, surfaceId: 'wood', envId: 'earth', roundG: false },
    pendulum: {
      length: 1, mass: 1, angleDeg: 30, damping: 0, envId: 'earth', roundG: false,
      showSmallAngle: true, double: false,
      l2: 1, m2: 1, angle2Deg: 60, nudgeDeg: 0.001, showTwin: false,
    },
    rotation: { slopeDeg: 20, envId: 'earth', roundG: false, shapes: ['solid-sphere', 'solid-disc', 'hoop'], mass: 1, radius: 0.2 },
    engineer: {
      mass: 5, stallTorque: 0.5, freeRpm: 15000, motors: 2, gearRatio: 20,
      wheelRadius: 0.05, efficiency: 0.85, mu: 0.9, drivenFraction: 1,
      crr: 0.015, slopeDeg: 20, envId: 'earth', roundG: false,
      machineId: 'lever', effortArm: 1, loadArm: 0.25, supportingRopes: 4,
      teethIn: 12, teethOut: 60, axleRadius: 0.02,
    },
    challenge: { id: 'hit-the-target', prediction: '' },
  },

  // Which concepts have been opened, for the progression hint. Chrome, not
  // design — it never changes what is simulated.
  seen: [],
  ui: { sections: {} },
});

export const state = defaults();

/* ------------------------------------------------------------ coercion -- */

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, lo, hi, fallback) => Math.min(hi, Math.max(lo, num(value, fallback)));
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const str = (value, fallback) => (typeof value === 'string' && value.length <= 64 ? value : fallback);

/** Positive masses only. A zero-mass body divides by zero in F = ma. */
const mass = (value, fallback) => clamp(value, 0.001, 100000, fallback);

/**
 * Bring any incoming state — old, partial, or hostile — up to the current
 * shape.
 *
 * Every field is coerced rather than trusted. A share link is just a string a
 * stranger can edit, and a NaN mass reaches the physics as a silent `NaN`
 * everywhere rather than an error anyone can act on.
 */
export function migrate(incoming) {
  const base = defaults();
  if (!incoming || typeof incoming !== 'object') return base;

  const t = incoming.tools && typeof incoming.tools === 'object' ? incoming.tools : {};
  const pick = (name) => (t[name] && typeof t[name] === 'object' ? t[name] : {});

  const b = base.tools;
  const m = pick('mass');
  const mo = pick('motion');
  const ac = pick('accel');
  const fo = pick('force');
  const pr = pick('projectile');
  const we = pick('weight');
  const mom = pick('momentum');
  const co = pick('collision');
  const en = pick('energy');
  const pe = pick('pendulum');
  const ro = pick('rotation');
  const eg = pick('engineer');
  const ch = pick('challenge');

  return {
    version: STATE_VERSION,
    tool: oneOf(incoming.tool, TOOLS, base.tool),
    mode: oneOf(incoming.mode, MODES, base.mode),
    theme: oneOf(incoming.theme, ['system', 'light', 'dark'], base.theme),
    selectedId: typeof incoming.selectedId === 'string' ? incoming.selectedId : null,

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

    view: {
      showVectors: bool(incoming.view?.showVectors, base.view.showVectors),
      showForces: bool(incoming.view?.showForces, base.view.showForces),
      showVelocity: bool(incoming.view?.showVelocity, base.view.showVelocity),
      showAcceleration: bool(incoming.view?.showAcceleration, base.view.showAcceleration),
      showMomentum: bool(incoming.view?.showMomentum, base.view.showMomentum),
      showTrail: bool(incoming.view?.showTrail, base.view.showTrail),
      showGrid: bool(incoming.view?.showGrid, base.view.showGrid),
      showValues: bool(incoming.view?.showValues, base.view.showValues),
      graphChannels: channelList(incoming.view?.graphChannels, base.view.graphChannels),
    },

    compare: {
      on: bool(incoming.compare?.on, false),
      // The stored "what if" side is migrated by the tool it belongs to when
      // it is used, not here — it is a copy of one tool's parameters.
      params: incoming.compare?.params && typeof incoming.compare.params === 'object'
        ? { ...incoming.compare.params } : null,
    },

    tools: {
      mass: {
        m1: mass(m.m1, b.mass.m1),
        m2: mass(m.m2, b.mass.m2),
        force: clamp(m.force, -1000, 1000, b.mass.force),
        envId: str(m.envId, b.mass.envId),
        roundG: bool(m.roundG, false),
      },
      motion: {
        v0: clamp(mo.v0, -200, 200, b.motion.v0),
        x0: clamp(mo.x0, -500, 500, b.motion.x0),
        mass: mass(mo.mass, b.motion.mass),
        showSecond: bool(mo.showSecond, b.motion.showSecond),
        v0b: clamp(mo.v0b, -200, 200, b.motion.v0b),
        x0b: clamp(mo.x0b, -500, 500, b.motion.x0b),
      },
      accel: {
        u: clamp(ac.u, -200, 200, b.accel.u),
        a: clamp(ac.a, -100, 100, b.accel.a),
        mass: mass(ac.mass, b.accel.mass),
        x0: clamp(ac.x0, -500, 500, b.accel.x0),
      },
      force: {
        mass: mass(fo.mass, b.force.mass),
        appliedX: clamp(fo.appliedX, -10000, 10000, b.force.appliedX),
        appliedY: clamp(fo.appliedY, -10000, 10000, b.force.appliedY),
        surfaceId: str(fo.surfaceId, b.force.surfaceId),
        slopeDeg: clamp(fo.slopeDeg, -60, 60, b.force.slopeDeg),
        envId: str(fo.envId, b.force.envId),
        roundG: bool(fo.roundG, false),
        dragOn: bool(fo.dragOn, false),
        shapeId: str(fo.shapeId, b.force.shapeId),
        customMuS: clamp(fo.customMuS, 0, 5, b.force.customMuS),
        customMuK: clamp(fo.customMuK, 0, 5, b.force.customMuK),
      },
      projectile: {
        speed: clamp(pr.speed, 0, 500, b.projectile.speed),
        angleDeg: clamp(pr.angleDeg, -90, 90, b.projectile.angleDeg),
        height: clamp(pr.height, 0, 5000, b.projectile.height),
        mass: mass(pr.mass, b.projectile.mass),
        radius: clamp(pr.radius, 0.005, 5, b.projectile.radius),
        envId: str(pr.envId, b.projectile.envId),
        customG: clamp(pr.customG, -100, 1000, b.projectile.customG),
        roundG: bool(pr.roundG, false),
        dragOn: bool(pr.dragOn, false),
        fluidId: str(pr.fluidId, b.projectile.fluidId),
        shapeId: str(pr.shapeId, b.projectile.shapeId),
        customCd: clamp(pr.customCd, 0, 5, b.projectile.customCd),
        restitution: clamp(pr.restitution, 0, 1, b.projectile.restitution),
      },
      weight: {
        m1: mass(we.m1, b.weight.m1),
        m2: mass(we.m2, b.weight.m2),
        material1: str(we.material1, b.weight.material1),
        material2: str(we.material2, b.weight.material2),
        sameSize: bool(we.sameSize, b.weight.sameSize),
        height: clamp(we.height, 1, 5000, b.weight.height),
        envId: str(we.envId, b.weight.envId),
        customG: clamp(we.customG, -100, 1000, b.weight.customG),
        roundG: bool(we.roundG, false),
        dragOn: bool(we.dragOn, false),
        fluidId: str(we.fluidId, b.weight.fluidId),
        shapeId: str(we.shapeId, b.weight.shapeId),
      },
      momentum: cartPair(mom, b.momentum),
      collision: { ...cartPair(co, b.collision), e: clamp(co.e, 0, 1, b.collision.e) },
      energy: {
        mass: mass(en.mass, b.energy.mass),
        slopeDeg: clamp(en.slopeDeg, 1, 70, b.energy.slopeDeg),
        startDistance: clamp(en.startDistance, 0.5, 100, b.energy.startDistance),
        surfaceId: str(en.surfaceId, b.energy.surfaceId),
        envId: str(en.envId, b.energy.envId),
        roundG: bool(en.roundG, false),
      },
      pendulum: {
        length: clamp(pe.length, 0.05, 50, b.pendulum.length),
        mass: mass(pe.mass, b.pendulum.mass),
        angleDeg: clamp(pe.angleDeg, -179, 179, b.pendulum.angleDeg),
        damping: clamp(pe.damping, 0, 5, b.pendulum.damping),
        envId: str(pe.envId, b.pendulum.envId),
        roundG: bool(pe.roundG, false),
        showSmallAngle: bool(pe.showSmallAngle, b.pendulum.showSmallAngle),
        double: bool(pe.double, false),
        l2: clamp(pe.l2, 0.05, 50, b.pendulum.l2),
        m2: mass(pe.m2, b.pendulum.m2),
        angle2Deg: clamp(pe.angle2Deg, -179, 179, b.pendulum.angle2Deg),
        nudgeDeg: clamp(pe.nudgeDeg, 0, 10, b.pendulum.nudgeDeg),
        showTwin: bool(pe.showTwin, false),
      },
      rotation: {
        slopeDeg: clamp(ro.slopeDeg, 1, 60, b.rotation.slopeDeg),
        envId: str(ro.envId, b.rotation.envId),
        roundG: bool(ro.roundG, false),
        shapes: shapeList(ro.shapes, b.rotation.shapes),
        mass: mass(ro.mass, b.rotation.mass),
        radius: clamp(ro.radius, 0.01, 5, b.rotation.radius),
      },
      engineer: {
        mass: mass(eg.mass, b.engineer.mass),
        stallTorque: clamp(eg.stallTorque, 0.001, 1000, b.engineer.stallTorque),
        freeRpm: clamp(eg.freeRpm, 1, 100000, b.engineer.freeRpm),
        motors: Math.round(clamp(eg.motors, 1, 12, b.engineer.motors)),
        gearRatio: clamp(eg.gearRatio, 0.1, 2000, b.engineer.gearRatio),
        wheelRadius: clamp(eg.wheelRadius, 0.005, 2, b.engineer.wheelRadius),
        efficiency: clamp(eg.efficiency, 0.05, 1, b.engineer.efficiency),
        mu: clamp(eg.mu, 0, 3, b.engineer.mu),
        drivenFraction: clamp(eg.drivenFraction, 0.05, 1, b.engineer.drivenFraction),
        crr: clamp(eg.crr, 0, 1, b.engineer.crr),
        slopeDeg: clamp(eg.slopeDeg, 0, 80, b.engineer.slopeDeg),
        envId: str(eg.envId, b.engineer.envId),
        roundG: bool(eg.roundG, false),
        machineId: str(eg.machineId, b.engineer.machineId),
        effortArm: clamp(eg.effortArm, 0.01, 100, b.engineer.effortArm),
        loadArm: clamp(eg.loadArm, 0.01, 100, b.engineer.loadArm),
        supportingRopes: Math.round(clamp(eg.supportingRopes, 1, 24, b.engineer.supportingRopes)),
        teethIn: Math.round(clamp(eg.teethIn, 6, 400, b.engineer.teethIn)),
        teethOut: Math.round(clamp(eg.teethOut, 6, 400, b.engineer.teethOut)),
        axleRadius: clamp(eg.axleRadius, 0.001, 2, b.engineer.axleRadius),
      },
      challenge: {
        id: str(ch.id, b.challenge.id),
        prediction: typeof ch.prediction === 'string' ? ch.prediction.slice(0, 32) : '',
      },
    },

    seen: Array.isArray(incoming.seen)
      ? incoming.seen.filter((s) => typeof s === 'string' && s.length <= 40).slice(0, 60)
      : [],
    ui: { sections: sectionFlags(incoming.ui?.sections) },
  };
}

function cartPair(slice, base) {
  return {
    m1: mass(slice.m1, base.m1),
    v1: clamp(slice.v1, -200, 200, base.v1),
    m2: mass(slice.m2, base.m2),
    v2: clamp(slice.v2, -200, 200, base.v2),
    x1: clamp(slice.x1, -100, 100, base.x1),
    x2: clamp(slice.x2, -100, 100, base.x2),
    walls: bool(slice.walls, base.walls),
  };
}

function channelList(incoming, fallback) {
  if (!Array.isArray(incoming)) return [...fallback];
  const clean = incoming.filter((id) => typeof id === 'string' && id.length <= 20).slice(0, 6);
  return clean.length ? clean : [...fallback];
}

function shapeList(incoming, fallback) {
  if (!Array.isArray(incoming)) return [...fallback];
  const clean = incoming.filter((id) => typeof id === 'string' && id.length <= 24).slice(0, 5);
  return clean.length ? clean : [...fallback];
}

/** Only `tool:section -> boolean` survives; anything else in there is noise. */
function sectionFlags(incoming) {
  const out = {};
  if (!incoming || typeof incoming !== 'object') return out;
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof key === 'string' && key.length <= 80 && typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/* ---------------------------------------------------------- the routes -- */

/** Load from localStorage, then let a share link override it. */
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

/**
 * A link that reopens this exact experiment.
 *
 * Playback state is stripped: a link that arrives half-way through a fall is
 * confusing, and the transport is chrome rather than part of the experiment.
 */
export function shareLink() {
  const payload = { ...state, transport: { ...state.transport, playing: false, scrubT: null } };
  const base = location.origin + location.pathname;
  return `${base}#${encodeURIComponent(JSON.stringify(payload))}`;
}

export function projectJson() {
  return JSON.stringify({ app: 'physics-bench', saved: new Date().toISOString(), state }, null, 2);
}

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

/** The parameters of the tool currently on screen. */
export const currentParams = (s = state) => s.tools[s.tool] || {};

/** Mark a concept as met, for the progression hint. */
export function markSeen(conceptId) {
  if (conceptId && !state.seen.includes(conceptId)) state.seen = [...state.seen, conceptId];
  return state.seen;
}
