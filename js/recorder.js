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

/** The rates the speed selector maps onto, and what each one costs in fidelity.
 *
 * Measured against the 240/s physics step across every prepared example: the
 * worst any channel's peak is understated by, when sampled at that rate. Only
 * fast-reversing quantities move — a velocity component through a bounce.
 * Height, position and energy stay under 0.6% at every rate here.
 */
export const RATE_ERROR = [
  { rate: 240, error: 0 },
  { rate: 120, error: 0.85 },
  { rate: 60, error: 3.1 },
  { rate: 30, error: 9.3 },
  { rate: 20, error: 15.5 },
  { rate: 15, error: 21.69 },
  { rate: 10, error: 34.07 },
];

/** The measured cost of sampling at a rate, for the settings panel. */
export const errorAt = (rate) => {
  const exact = RATE_ERROR.find((r) => r.rate === rate);
  if (exact) return exact.error;
  // Between two measured rates, straight-line it rather than invent precision.
  const above = [...RATE_ERROR].reverse().find((r) => r.rate >= rate);
  const below = RATE_ERROR.find((r) => r.rate <= rate);
  if (!above || !below || above.rate === below.rate) return (above || below || { error: 0 }).error;
  const f = (rate - below.rate) / (above.rate - below.rate);
  return below.error + (above.error - below.error) * f;
};

/**
 * How many frames a run of `seconds` needs under a given policy, and how much
 * of a run a budget buys. Both are wanted by the settings panel before
 * anything has been recorded, so they are arithmetic rather than measurement.
 */
export const framesFor = (seconds, { rate, historyRate, window }) =>
  (seconds <= window ? rate * seconds : rate * window + historyRate * (seconds - window));

export const secondsFor = (budget, { rate, historyRate, window }) => {
  const inWindow = rate * window;
  if (budget <= inWindow) return budget / rate;
  return window + (budget - inWindow) / historyRate;
};

/**
 * @param {object} options
 * @param {number} options.capacity     frames kept; the oldest are dropped
 * @param {number} options.rate         samples per simulated second, live end
 * @param {number} options.historyRate  samples per second once past the window
 * @param {number} options.window       simulated seconds kept at the full rate
 */
export function createRecorder({
  capacity = 18000, rate = null, historyRate = null, window = 60, interval = null,
} = {}) {
  // `interval` was the original way to ask for a rate and still reads more
  // naturally at a call site that thinks in seconds, so both are accepted.
  const perSecond = rate && rate > 0 ? rate : (interval && interval > 0 ? 1 / interval : 60);
  const history = historyRate && historyRate > 0 ? Math.min(historyRate, perSecond) : perSecond;
  return {
    frames: [],
    capacity,
    rate: perSecond,
    historyRate: history,
    window,
    // Kept so nothing outside has to know the rate is now the primary setting.
    interval: 1 / perSecond,
    lastT: -Infinity,
    lastDemoted: -Infinity,
    flags: { relativistic: false, diverged: false, collision: false },
    cannonFull: null,
    burst: null,
  };
}

/**
 * Fold a world's events into the handful of answers anything actually asks.
 *
 * The events used to be kept as a list, which sounds harmless and was not: a
 * run of the target-shooting example reaches 46,000 of them, and `record` was
 * copying the whole array on every frame that had one — O(n) per frame and
 * O(n^2) over a run, measured at 758 microseconds a frame after two minutes.
 * Nothing ever read the list. Four places ask whether a kind of event has
 * happened at all, and one wants the cannon-full event itself, so that is what
 * is kept.
 */
function foldEvents(recorder, events) {
  if (!events || !events.length) return recorder;
  let { relativistic, diverged, collision } = recorder.flags;
  let cannonFull = recorder.cannonFull;
  let burst = recorder.burst;
  let changed = false;
  for (const e of events) {
    if (e.type === 'relativistic' && !relativistic) { relativistic = true; changed = true; }
    else if (e.type === 'diverged' && !diverged) { diverged = true; changed = true; }
    else if (e.type === 'collision' && !collision) { collision = true; changed = true; }
    else if (e.type === 'cannon-full' && !cannonFull) { cannonFull = e; changed = true; }
    // The burst is kept whole, not as a flag: the banner quotes its numbers.
    else if (e.type === 'burst' && !burst) { burst = e; changed = true; }
  }
  if (!changed) return recorder;
  return { ...recorder, flags: { relativistic, diverged, collision }, cannonFull, burst };
}

/**
 * Demote everything that has just aged out of the window.
 *
 * Each frame is thinned exactly once, as it crosses the boundary, so history
 * settles at a true `historyRate` and stays there however long the run goes.
 * Thinning repeatedly instead would drive the oldest data toward nothing: the
 * same buffer measured 0.7 samples a second at the far end after three
 * minutes, and the peaks in it went with it.
 *
 * `lastDemoted` is the boundary already dealt with, so a step only ever looks
 * at the sliver of frames that crossed since the last one.
 */
function demote(recorder, now) {
  const edge = now - recorder.window;
  if (recorder.historyRate >= recorder.rate || edge <= recorder.lastDemoted) return recorder;

  const gap = 1 / recorder.historyRate;
  const kept = [];
  let lastKept = -Infinity;
  let dropped = false;
  for (const f of recorder.frames) {
    if (f.t >= edge) { kept.push(f); continue; }
    // Already demoted on an earlier pass: leave it exactly as it is.
    if (f.t < recorder.lastDemoted) { kept.push(f); lastKept = f.t; continue; }
    if (f.t - lastKept >= gap - 1e-9) { kept.push(f); lastKept = f.t; }
    else dropped = true;
  }
  if (!dropped) return { ...recorder, lastDemoted: edge };
  return { ...recorder, frames: kept, lastDemoted: edge };
}

/**
 * Record the current state, if enough simulated time has passed.
 *
 * Returns a new recorder. A frame carries the numbers for the graph and where
 * every body was, which is enough to redraw the scene when scrubbing. What it
 * deliberately does not carry is each body's trail: that was 97% of a frame
 * and 720 MB at ten objects, and it is already implied by the positions in the
 * frames before it — `trailAt` reads it back out.
 */
export function record(recorder, world, { bodyId = null, force = false } = {}) {
  if (!force && world.t - recorder.lastT < recorder.interval - 1e-12) {
    return foldEvents(recorder, world.events);
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
      colour: b.colour, label: b.label, fixed: b.fixed,
    })),
    ledger: { ...world.ledger },
  };

  let next = foldEvents({ ...recorder, lastT: world.t, frames: [...recorder.frames, frame] },
    world.events);
  next = demote(next, world.t);
  if (next.frames.length > next.capacity) {
    next = { ...next, frames: next.frames.slice(next.frames.length - next.capacity) };
  }
  return next;
}

/**
 * A body's trail at a moment, read back out of the frames.
 *
 * The live world keeps a trail as it goes; a scrubbed frame has to have one
 * rebuilt, and every position it needs is already sitting in the frames before
 * it. Reading it back costs nothing to store and is exact wherever the path is
 * smooth — the worst it drifts from the true 240/s path across the prepared
 * examples is 26 mm, on the corner of a bounce, which is 9% of the ball
 * drawing it.
 */
export function trailAt(recorder, bodyId, t, seconds = 3) {
  const { frames } = recorder;
  const out = [];
  for (const f of frames) {
    if (f.t > t + 1e-9) break;
    if (f.t < t - seconds) continue;
    const b = f.bodies.find((x) => x.id === bodyId);
    if (b) out.push({ x: b.pos.x, y: b.pos.y });
  }
  return out;
}

export const clear = (recorder) => ({
  ...recorder,
  frames: [],
  lastT: -Infinity,
  lastDemoted: -Infinity,
  flags: { relativistic: false, diverged: false, collision: false },
  cannonFull: null,
  burst: null,
});

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
export function series(recorder, channelId, { maxPoints = Infinity } = {}) {
  const channel = channelById(channelId);
  if (!channel) return { id: channelId, points: [], channel: null };
  const points = [];
  for (const frame of recorder.frames) {
    const value = frame.values[channelId];
    if (Number.isFinite(value)) points.push({ x: frame.t, y: value });
  }
  return {
    id: channelId, channel, points: thin(points, maxPoints),
    label: channel.label, unit: channel.unit, axis: channel.axis, token: channel.token,
  };
}

/**
 * Drop points a graph has no pixels to draw.
 *
 * The recorder samples 120 times a second and keeps three thousand frames, so a
 * long run hands a nine-hundred-pixel graph three points per pixel — and every
 * one of them is an SVG coordinate that has to be built, parsed and rasterised,
 * several graphs over, several times a second. That cost grows with the length
 * of the run, which is why the controls got less responsive the longer
 * something was left going: on a phone the main thread had nothing left over to
 * answer a tap on Pause with.
 *
 * The last point is always kept. It is the live end of the trace, and dropping
 * it would make the line stop short of the playhead.
 */
function thin(points, maxPoints) {
  if (!(maxPoints > 1) || points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += stride) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Several channels at once, which is what a multi-trace graph needs. */
export const multiSeries = (recorder, ids, options) => ids.map((id) => series(recorder, id, options));

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
