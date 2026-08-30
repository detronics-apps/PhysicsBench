import test from 'node:test';
import assert from 'node:assert/strict';

import { vec } from '../js/vec.js';
import { G_STANDARD } from '../js/constants.js';
import { createWorld, advance } from '../js/world.js';
import {
  CHANNELS, channelById, createRecorder, record, clear, duration, startTime, endTime,
  frameAt, indexAt, series, multiSeries, valueAt, extremes, firstCrossing,
} from '../js/recorder.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const g = G_STANDARD;

/** A ball dropped from 20 m, recorded as it falls. */
function fallRecording({ interval = 1 / 120, seconds = 2 } = {}) {
  let world = createWorld({
    bodies: [{ id: 'a', mass: 2, radius: 0.2, pos: vec(0, 20), cd: 0, area: 0 }],
    ground: { y: 0 },
  });
  let rec = createRecorder({ interval });
  rec = record(rec, world, { bodyId: 'a', force: true });
  for (let i = 0; i < seconds * 60; i += 1) {
    world = advance(world, 1 / 60);
    rec = record(rec, world, { bodyId: 'a' });
  }
  return { rec, world };
}

test('every channel is complete and knows which axis it belongs on', () => {
  assert.ok(CHANNELS.length >= 15);
  const axes = new Set();
  for (const c of CHANNELS) {
    assert.ok(c.id && c.label && c.unit && c.axis, `${c.id} incomplete`);
    // The colour is the same token the arrow for that quantity uses on the
    // drawing, so a trace and its arrow cannot end up different colours.
    assert.match(c.token, /^--/, `${c.id} has no colour token`);
    assert.equal(typeof c.of, 'function');
    axes.add(c.axis);
  }
  // Mixing metres and metres-per-second on one scale is the failure the axis
  // grouping prevents.
  assert.ok(axes.has('length') && axes.has('velocity') && axes.has('acceleration'));
  assert.equal(channelById('speed').unit, 'm/s');
  assert.equal(channelById('speed').token, '--vec-velocity');
  assert.equal(channelById('nope'), null);
});

test('the recorder honours its interval rather than recording every step', () => {
  const { rec } = fallRecording({ interval: 0.1, seconds: 2 });
  assert.ok(rec.frames.length >= 19 && rec.frames.length <= 22, `${rec.frames.length} frames`);
  // And time only ever moves forward.
  for (let i = 1; i < rec.frames.length; i += 1) {
    assert.ok(rec.frames[i].t > rec.frames[i - 1].t);
  }
  close(startTime(rec), 0, 1e-9);
  close(duration(rec), endTime(rec) - startTime(rec), 1e-12);
});

test('the recording holds what a free fall actually does', () => {
  const { rec } = fallRecording();
  const last = rec.frames[rec.frames.length - 1];
  close(last.t, 2, 0.02);
  close(last.values.vy, -g * last.t, 0.05);
  close(last.values.y, 20 - 0.5 * g * last.t ** 2, 0.1);
  // Acceleration is constant throughout — that is the lesson, and the data
  // must show it rather than the interface asserting it.
  for (const f of rec.frames) close(f.values.ay, -g, 1e-6);
});

test('capacity drops the oldest frames rather than growing without limit', () => {
  let world = createWorld({ bodies: [{ id: 'a', pos: vec(0, 100), cd: 0, area: 0 }], ground: { y: 0 } });
  let rec = createRecorder({ capacity: 20, interval: 0 });
  for (let i = 0; i < 200; i += 1) {
    world = advance(world, 1 / 60);
    rec = record(rec, world, { bodyId: 'a' });
  }
  assert.equal(rec.frames.length, 20);
  // What survived is the most recent, not the first.
  close(rec.frames[rec.frames.length - 1].t, 200 / 60, 0.02);
});

test('recording never mutates the recorder it was given', () => {
  const world = createWorld({ bodies: [{ id: 'a', pos: vec(0, 5) }], ground: { y: 0 } });
  const rec = createRecorder();
  const next = record(rec, world, { bodyId: 'a', force: true });
  assert.equal(rec.frames.length, 0);
  assert.equal(next.frames.length, 1);
});

test('frameAt finds the nearest recorded moment, not an invented one', () => {
  const { rec } = fallRecording({ interval: 0.1 });
  const f = frameAt(rec, 0.83);
  // The frame returned is one the simulation really passed through.
  assert.ok(rec.frames.includes(f));
  assert.ok(Math.abs(f.t - 0.83) <= 0.06, `nearest frame was ${f.t}`);

  // Off either end it clamps to the ends rather than returning nothing.
  close(frameAt(rec, -99).t, rec.frames[0].t);
  close(frameAt(rec, 999).t, rec.frames[rec.frames.length - 1].t);
  assert.equal(frameAt(createRecorder(), 1), null);
  assert.equal(indexAt(rec, rec.frames[3].t), 3);
});

test('a series is a clean list of points, with non-finite values dropped', () => {
  const { rec } = fallRecording({ interval: 0.05 });
  const s = series(rec, 'vy');
  assert.equal(s.unit, 'm/s');
  assert.ok(s.points.length > 30);
  assert.ok(s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  // Falling, so it only ever goes more negative.
  for (let i = 1; i < s.points.length; i += 1) assert.ok(s.points[i].y <= s.points[i - 1].y + 1e-9);

  assert.deepEqual(series(rec, 'nope').points, []);
  assert.equal(multiSeries(rec, ['y', 'vy']).length, 2);
});

test('system channels record the whole world, not one body', () => {
  const { rec } = fallRecording({ interval: 0.1 });
  const total = series(rec, 'sys-e');
  assert.ok(total.points.length > 5);
  // Energy is conserved during the fall: kinetic rises as potential falls.
  // The tolerance is tight on purpose — an app that shows a running "total
  // energy" and lets it drift has undermined the lesson it is teaching.
  const first = total.points[0].y;
  for (const p of total.points) close(p.y, first, 1e-9);
});

test('valueAt reads a channel at a moment — what the readout shows when paused', () => {
  const { rec } = fallRecording({ interval: 0.02 });
  close(valueAt(rec, 'vy', 1), -g, 0.06);
  assert.equal(valueAt(createRecorder(), 'vy', 1), undefined);
});

test('extremes are a measurement the learner took, with a time attached', () => {
  // A ball thrown upward: the apex is the maximum of the height channel.
  let world = createWorld({
    bodies: [{ id: 'a', mass: 1, radius: 0.1, pos: vec(0, 1), vel: vec(0, 12), cd: 0, area: 0, restitution: 0 }],
    ground: { y: 0, restitution: 0 },
  });
  let rec = createRecorder({ interval: 0.01 });
  for (let i = 0; i < 180; i += 1) {
    world = advance(world, 1 / 60);
    rec = record(rec, world, { bodyId: 'a' });
  }
  const { max } = extremes(rec, 'y');
  close(max.t, 12 / g, 0.03);
  close(max.value, 1 + (12 * 12) / (2 * g), 0.05);
  // And at that moment the vertical velocity is zero.
  close(valueAt(rec, 'vy', max.t), 0, 0.15);

  assert.equal(extremes(createRecorder(), 'y').max, null);
});

test('firstCrossing interpolates between frames', () => {
  const { rec } = fallRecording({ interval: 0.05 });
  // When did it pass 10 m? s = 20 − ½gt² = 10 → t = √(20/g).
  const t = firstCrossing(rec, 'y', 10);
  close(t, Math.sqrt(20 / g), 0.02);
  assert.equal(firstCrossing(rec, 'y', 1000), null);
});

test('clear empties the recording without losing its settings', () => {
  const { rec } = fallRecording({ interval: 0.1 });
  const empty = clear(rec);
  assert.equal(empty.frames.length, 0);
  assert.equal(empty.interval, rec.interval);
  assert.equal(empty.capacity, rec.capacity);
  assert.equal(duration(empty), 0);
});
