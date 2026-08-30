/**
 * "What if?" — the same experiment run twice, one variable apart. Pure.
 *
 * This is the app's central question made mechanical. Two parameter sets go in;
 * two recordings and a difference report come out. The report names the
 * variable that changed, so the interface can say "you doubled the mass" rather
 * than leaving the learner to remember which slider they moved.
 *
 * One rule runs through the whole module: **change one thing at a time.** If
 * two parameters differ, the comparison says so and warns that the result
 * cannot be attributed to either of them. That is not pedantry — it is the
 * entire method of experimental science, and an app that quietly lets a learner
 * change three things and draw a conclusion is teaching the opposite of it.
 */

import { build } from './scenarios.js';
import { advance } from './world.js';
import { createRecorder, record, series } from './recorder.js';

/**
 * Which parameters differ between two runs, and by how much.
 *
 * Booleans and strings are reported as a straight before/after; numbers get a
 * ratio too, because "2× the mass" is the form the relationship is usually
 * remembered in.
 */
export function differences(a = {}, b = {}) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out = [];
  for (const key of keys) {
    const from = a[key];
    const to = b[key];
    if (from === to) continue;
    if (typeof from === 'number' && typeof to === 'number') {
      out.push({
        key, from, to,
        delta: to - from,
        ratio: from !== 0 ? to / from : null,
        kind: 'number',
      });
    } else {
      out.push({ key, from, to, kind: typeof to === 'boolean' ? 'flag' : 'choice' });
    }
  }
  return out;
}

/** The one-line description of what was changed. */
export function describeChange(diffs) {
  if (!diffs.length) return 'Nothing was changed — both runs are identical.';
  if (diffs.length > 1) {
    return `${diffs.length} things were changed at once (${diffs.map((d) => d.key).join(', ')}). `
      + 'Whatever the difference in the result, it cannot be attributed to any '
      + 'one of them. Change one variable at a time.';
  }
  const d = diffs[0];
  if (d.kind === 'number') {
    if (d.ratio !== null && Math.abs(d.ratio - Math.round(d.ratio)) < 1e-9 && d.ratio > 1) {
      return `${d.key} was multiplied by ${Math.round(d.ratio)} (${d.from} → ${d.to}).`;
    }
    return `${d.key} went from ${d.from} to ${d.to}.`;
  }
  return `${d.key} was changed from ${d.from} to ${d.to}.`;
}

/** Whether the comparison is a clean one-variable experiment. */
export const isControlled = (diffs) => diffs.length === 1;

/**
 * Run one parameter set and record it.
 *
 * Fixed-step and deterministic: two runs with the same parameters produce
 * byte-identical recordings, which is what lets the comparison attribute every
 * difference to the parameter rather than to timing.
 */
export function runOnce(toolId, params, { seconds = 6, step = 1 / 120, interval = 1 / 60 } = {}) {
  const scenario = build(toolId, params);
  let world = scenario.world;
  let recorder = createRecorder({ interval, capacity: 5000 });
  recorder = record(recorder, world, { bodyId: scenario.focusId, force: true });

  const steps = Math.max(1, Math.round(seconds / step));
  for (let i = 0; i < steps; i += 1) {
    world = advance(world, step);
    recorder = record(recorder, world, { bodyId: scenario.focusId });
  }

  return { scenario, world, recorder, params, seconds };
}

/**
 * Run both sides and line them up.
 *
 * @param {string} toolId
 * @param {object} paramsA the run already on screen
 * @param {object} paramsB the "what if?"
 */
export function compare(toolId, paramsA, paramsB, options = {}) {
  const diffs = differences(paramsA, paramsB);
  const a = runOnce(toolId, paramsA, options);
  const b = runOnce(toolId, paramsB, options);

  return {
    toolId,
    a,
    b,
    differences: diffs,
    controlled: isControlled(diffs),
    change: describeChange(diffs),
  };
}

/**
 * The two traces of one quantity, plus how they ended up differing.
 *
 * `ratio` is the number worth reading: when doubling the mass halves the
 * acceleration, this says 0.5, and a learner who sees 2× in and 0.5× out has
 * found an inverse relationship without being told there is one.
 */
export function channel(comparison, channelId) {
  const a = series(comparison.a.recorder, channelId);
  const b = series(comparison.b.recorder, channelId);
  const lastA = a.points.length ? a.points[a.points.length - 1].y : NaN;
  const lastB = b.points.length ? b.points[b.points.length - 1].y : NaN;

  let peakA = -Infinity;
  let peakB = -Infinity;
  for (const p of a.points) peakA = Math.max(peakA, Math.abs(p.y));
  for (const p of b.points) peakB = Math.max(peakB, Math.abs(p.y));

  return {
    id: channelId,
    label: a.label || b.label,
    unit: a.unit || b.unit,
    axis: a.axis || b.axis,
    a: { ...a, id: `${channelId}:a` },
    b: { ...b, id: `${channelId}:b` },
    finalA: lastA,
    finalB: lastB,
    delta: lastB - lastA,
    ratio: Number.isFinite(lastA) && lastA !== 0 ? lastB / lastA : null,
    peakA: Number.isFinite(peakA) ? peakA : null,
    peakB: Number.isFinite(peakB) ? peakB : null,
  };
}

/**
 * A summary across several channels, sorted by how much each one moved.
 *
 * Sorting matters: a comparison that lists twelve quantities in declaration
 * order buries the one that actually changed. What moved most goes first.
 */
export function summarise(comparison, channelIds) {
  const rows = channelIds
    .map((id) => channel(comparison, id))
    .filter((row) => Number.isFinite(row.finalA) || Number.isFinite(row.finalB))
    .map((row) => ({
      ...row,
      // Relative movement, against the larger of the two, so a change from 0.01
      // to 0.02 does not outrank one from 100 to 180.
      significance: significanceOf(row),
    }))
    .sort((x, y) => y.significance - x.significance);

  return {
    change: comparison.change,
    controlled: comparison.controlled,
    rows,
    unchanged: rows.filter((r) => r.significance < 0.005),
    // The headline: the quantity the change actually acted on.
    headline: rows.length ? rows[0] : null,
  };
}

function significanceOf(row) {
  const scaleOf = Math.max(Math.abs(row.finalA || 0), Math.abs(row.finalB || 0), Math.abs(row.peakA || 0), Math.abs(row.peakB || 0));
  if (!(scaleOf > 0)) return 0;
  return Math.abs((row.finalB || 0) - (row.finalA || 0)) / scaleOf;
}

/**
 * The relationship a ratio suggests, stated as a question rather than a fact.
 *
 * The app must not announce "acceleration is inversely proportional to mass" —
 * that is the conclusion the learner is meant to reach. It points at the
 * pattern and asks.
 */
export function relationshipHint(inputRatio, outputRatio) {
  if (!Number.isFinite(inputRatio) || !Number.isFinite(outputRatio) || inputRatio === 1) return null;
  const near = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9) < 0.06;

  if (near(outputRatio, inputRatio)) {
    return `You changed the input by ${fmtRatio(inputRatio)} and the result changed `
      + `by ${fmtRatio(outputRatio)} as well. What kind of relationship does that suggest?`;
  }
  if (near(outputRatio, 1 / inputRatio)) {
    return `You changed the input by ${fmtRatio(inputRatio)} and the result changed `
      + `by ${fmtRatio(outputRatio)} — the other way round. What happens if you `
      + 'try a different factor and check whether that holds?';
  }
  if (near(outputRatio, inputRatio * inputRatio)) {
    return `The input changed by ${fmtRatio(inputRatio)} and the result by `
      + `${fmtRatio(outputRatio)}, which is that factor squared. Where might a `
      + 'square be coming from?';
  }
  if (near(outputRatio, Math.sqrt(inputRatio))) {
    return `The input changed by ${fmtRatio(inputRatio)} and the result by `
      + `${fmtRatio(outputRatio)} — the square root of it. Which quantity is under `
      + 'a root sign?';
  }
  if (near(outputRatio, 1)) {
    return 'The result barely moved. Is this quantity independent of what you '
      + 'changed — and if so, why?';
  }
  return null;
}

const fmtRatio = (r) => (r >= 1 ? `${round(r)}×` : `1/${round(1 / r)}`);
const round = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(2));
