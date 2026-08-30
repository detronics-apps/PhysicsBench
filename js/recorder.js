/**
 * Recording the simulation as it runs, so it can be paused, scrubbed and
 * graphed. Pure.
 *
 * Two things make this more than a list of numbers.
 *
 * First, the graph and the animation must never disagree. They do disagree the
 * moment they are fed from different places — the drawing from the live world,
 * the graph from a separately accumulated array — because one of them will be
 * a frame behind, and a learner watching a ball reach the top of its arc while
 * the velocity trace says it is still rising has been taught something false.
 * So everything comes from here: one recording, read twice.
 *
 * Second, the channel list is data. A tool says which quantities it wants
 * plotted and this module knows how to get each one out of a world. Adding
 * "angular momentum" to the graph means adding a row here, not editing a
 * renderer.
 */

import { len } from './vec.js';
import { inspect, totals } from './world.js';

/**
 * Everything that can be plotted, and how to get it.
 *
 * `axis` groups channels that share a unit, so plotting position and velocity
 * together does not silently put metres and metres-per-second on one scale.
 *
 * `token` is the colour, and it is the *same* token the arrow for that quantity
 * uses on the drawing. A velocity trace on the graph and the velocity arrow on
 * the ball are the same green, which is what lets a learner connect the line
 * going up to the arrow getting longer without being told to.
 */
export const CHANNELS = [
  { id: 'x', label: 'Position x', unit: 'm', axis: 'length', token: '--accent-strong', of: (i) => i.pos.x },
  { id: 'y', label: 'Position y', unit: 'm', axis: 'length', token: '--accent-strong', of: (i) => i.pos.y },
  { id: 'height', label: 'Height above ground', unit: 'm', axis: 'length', token: '--accent-strong', of: (i) => i.heightAboveGround },
  { id: 'vx', label: 'Velocity x', unit: 'm/s', axis: 'velocity', token: '--vec-velocity', of: (i) => i.vel.x },
  { id: 'vy', label: 'Velocity y', unit: 'm/s', axis: 'velocity', token: '--vec-velocity', of: (i) => i.vel.y },
  { id: 'speed', label: 'Speed', unit: 'm/s', axis: 'velocity', token: '--vec-velocity', of: (i) => i.speed },
  { id: 'ax', label: 'Acceleration x', unit: 'm/s²', axis: 'acceleration', token: '--vec-acceleration', of: (i) => i.acceleration.x },
  { id: 'ay', label: 'Acceleration y', unit: 'm/s²', axis: 'acceleration', token: '--vec-acceleration', of: (i) => i.acceleration.y },
  { id: 'accel', label: 'Acceleration', unit: 'm/s²', axis: 'acceleration', token: '--vec-acceleration', of: (i) => len(i.acceleration) },
  { id: 'px', label: 'Momentum x', unit: 'kg·m/s', axis: 'momentum', token: '--vec-momentum', of: (i) => i.momentum.x },
  { id: 'py', label: 'Momentum y', unit: 'kg·m/s', axis: 'momentum', token: '--vec-momentum', of: (i) => i.momentum.y },
  { id: 'fnet', label: 'Net force', unit: 'N', axis: 'force', token: '--force-net', of: (i) => len(i.net.vec) },
  { id: 'fx', label: 'Net force x', unit: 'N', axis: 'force', token: '--force-net', of: (i) => i.net.vec.x },
  { id: 'ke', label: 'Kinetic energy', unit: 'J', axis: 'energy', token: '--vec-velocity', of: (i) => i.kinetic },
  { id: 'pe', label: 'Potential energy', unit: 'J', axis: 'energy', token: '--force-weight', of: (i) => i.potential },
  { id: 'etotal', label: 'Kinetic + potential', unit: 'J', axis: 'energy', token: '--accent-strong', of: (i) => i.kinetic + i.potential },
  // System-wide channels take the world rather than one body.
  { id: 'sys-p', label: 'Total momentum', unit: 'kg·m/s', axis: 'momentum', system: true, token: '--vec-momentum', of: (_, t) => t.momentumX },
  { id: 'sys-ke', label: 'Total kinetic energy', unit: 'J', axis: 'energy', system: true, token: '--vec-velocity', of: (_, t) => t.kinetic },
  { id: 'sys-e', label: 'Total energy', unit: 'J', axis: 'energy', system: true, token: '--accent-strong', of: (_, t) => t.total },
  { id: 'sys-heat', label: 'Energy turned to heat', unit: 'J', axis: 'energy', system: true, token: '--force-friction', of: (_, t) => t.elsewhere.heat },
];

export const channelById = (id) => CHANNELS.find((c) => c.id === id) || null;

/**
 * @param {object} options
 * @param {number} options.capacity   frames kept; the oldest are dropped
 * @param {number} options.interval   minimum simulated seconds between frames
 */
export function createRecorder({ capacity = 3000, interval = 1 / 120 } = {}) {
  return { frames: [], capacity, interval, lastT: -Infinity, events: [] };
}

/**
 * Record the current state, if enough simulated time has passed.
 *
 * Returns a new recorder. Frames carry both the numbers for the graph and a
 * full body snapshot, so scrubbing backwards restores the drawing exactly
 * rather than re-simulating and hoping for the same answer.
 */
export function record(recorder, world, { bodyId = null, force = false } = {}) {
  if (!force && world.t - recorder.lastT < recorder.interval - 1e-12) {
    return recorder.events.length === world.events.length
      ? recorder
      : { ...recorder, events: [...recorder.events, ...world.events] };
  }

  const t = totals(world);
  const i = bodyId ? inspect(world, bodyId) : null;
  const values = {};
  for (const channel of CHANNELS) {
    if (channel.system) values[channel.id] = channel.of(world, t);
    else if (i) values[channel.id] = channel.of(i, t);
  }

  const frame = {
    t: world.t,
    values,
    bodies: world.bodies.map((b) => ({
      id: b.id, pos: { ...b.pos }, vel: { ...b.vel }, mass: b.mass,
      radius: b.radius, width: b.width, height: b.height, kind: b.kind,
      colour: b.colour, label: b.label, fixed: b.fixed, trail: [...b.trail],
    })),
    ledger: { ...world.ledger },
  };

  const frames = [...recorder.frames, frame];
  return {
    ...recorder,
    lastT: world.t,
    frames: frames.length > recorder.capacity ? frames.slice(frames.length - recorder.capacity) : frames,
    events: world.events.length ? [...recorder.events, ...world.events] : recorder.events,
  };
}

export const clear = (recorder) => ({ ...recorder, frames: [], events: [], lastT: -Infinity });

export const duration = (recorder) =>
  (recorder.frames.length ? recorder.frames[recorder.frames.length - 1].t - recorder.frames[0].t : 0);

export const startTime = (recorder) => (recorder.frames.length ? recorder.frames[0].t : 0);
export const endTime = (recorder) => (recorder.frames.length ? recorder.frames[recorder.frames.length - 1].t : 0);

/**
 * The frame nearest a given time, found by bisection.
 *
 * Nearest rather than interpolated on purpose: the scrubber shows a state the
 * simulation actually passed through, not a blend of two that it did not.
 */
export function frameAt(recorder, t) {
  const { frames } = recorder;
  if (!frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(frames[lo].t - t) <= Math.abs(frames[hi].t - t) ? frames[lo] : frames[hi];
}

export const indexAt = (recorder, t) => {
  const frame = frameAt(recorder, t);
  return frame ? recorder.frames.indexOf(frame) : -1;
};

/**
 * One channel as a list of points, ready for the graph.
 *
 * Non-finite values are dropped rather than plotted: a NaN in the middle of a
 * path silently breaks the whole line in SVG, which looks like a bug in the
 * physics rather than a gap in the data.
 */
export function series(recorder, channelId) {
  const channel = channelById(channelId);
  if (!channel) return { id: channelId, points: [], channel: null };
  const points = [];
  for (const frame of recorder.frames) {
    const value = frame.values[channelId];
    if (Number.isFinite(value)) points.push({ x: frame.t, y: value });
  }
  return {
    id: channelId, channel, points,
    label: channel.label, unit: channel.unit, axis: channel.axis, token: channel.token,
  };
}

/** Several channels at once, which is what a multi-trace graph needs. */
export const multiSeries = (recorder, ids) => ids.map((id) => series(recorder, id));

/** The value of one channel at one moment — what the readout shows when paused. */
export function valueAt(recorder, channelId, t) {
  const frame = frameAt(recorder, t);
  return frame ? frame.values[channelId] : undefined;
}

/**
 * The extremes of a channel over the whole recording, and when they happened.
 *
 * "The highest point of the flight was 12.4 m, 1.59 s in" is a measurement the
 * learner took, which is a different thing from a number the app asserted.
 */
export function extremes(recorder, channelId) {
  let min = null;
  let max = null;
  for (const frame of recorder.frames) {
    const value = frame.values[channelId];
    if (!Number.isFinite(value)) continue;
    if (min === null || value < min.value) min = { value, t: frame.t };
    if (max === null || value > max.value) max = { value, t: frame.t };
  }
  return { min, max };
}

/** When a channel first crosses a value, interpolated between frames. */
export function firstCrossing(recorder, channelId, target) {
  const { frames } = recorder;
  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1].values[channelId];
    const b = frames[i].values[channelId];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if ((a - target) === 0) return frames[i - 1].t;
    if ((a - target < 0) !== (b - target < 0)) {
      const fraction = (target - a) / (b - a);
      return frames[i - 1].t + (frames[i].t - frames[i - 1].t) * fraction;
    }
  }
  return null;
}
