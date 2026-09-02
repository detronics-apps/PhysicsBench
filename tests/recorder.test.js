import test from 'node:test';
import assert from 'node:assert/strict';

import { vec } from '../js/vec.js';
import { G_STANDARD } from '../js/constants.js';
import { createWorld, advance } from '../js/world.js';
import {
  CHANNELS, channelById, createRecorder, record, clear, duration, startTime, endTime,
  frameAt, indexAt, series, multiSeries, valueAt, extremes, firstCrossing,
  trailAt, errorAt, secondsFor, framesFor, RATE_ERROR,
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

/* ------------------------------------------------- rates and the history -- */

/** A ball bouncing along, recorded under a given policy. */
function bouncing({ rate = 60, historyRate = null, window = 60, capacity = 18000, seconds = 6 } = {}) {
  let world = createWorld({
    gravity: vec(0, -g),
    bodies: [{
      id: 'a', mass: 2, radius: 0.2, pos: vec(0, 4), vel: vec(1.5, 0),
      cd: 0, area: 0, restitution: 0.7,
    }],
    ground: { y: 0 },
  });
  let rec = createRecorder({ rate, historyRate, window, capacity });
  rec = record(rec, world, { bodyId: 'a', force: true });
  for (let i = 0; i < seconds * 240; i += 1) {
    world = advance(world, 1 / 240);
    rec = record(rec, world, { bodyId: 'a' });
  }
  return rec;
}

/** Gaps between consecutive frames within a stretch of the recording. */
const gaps = (rec, from, to) => {
  const out = [];
  for (let i = 1; i < rec.frames.length; i += 1) {
    const t = rec.frames[i].t;
    if (t < from || t > to) continue;
    out.push(rec.frames[i].t - rec.frames[i - 1].t);
  }
  return out;
};

/**
 * History is thinned once as it ages, and then left alone.
 *
 * Thinning it again on every overflow is the trap: it looks identical for the
 * first minute and then quietly drives the far end of the buffer toward
 * nothing - a measured 0.7 samples a second after three minutes, taking every
 * early peak with it. Demoting each frame exactly as it crosses the window
 * keeps history at a true rate however long the run goes.
 */
test('history is thinned once as it ages, and then holds its rate', () => {
  const rec = bouncing({ rate: 60, historyRate: 30, window: 2, seconds: 8 });
  const old = gaps(rec, 0.2, 5);
  const recent = gaps(rec, 6.4, 7.9);
  assert.ok(old.length > 20, `only ${old.length} old gaps`);
  assert.ok(recent.length > 20, `only ${recent.length} recent gaps`);
  for (const dt of old) close(dt, 1 / 30, 1 / 240 + 1e-9);
  for (const dt of recent) close(dt, 1 / 60, 1 / 240 + 1e-9);
});

test('an unthinned recorder keeps every frame at the one rate', () => {
  const rec = bouncing({ rate: 60, historyRate: 60, window: 1, seconds: 5 });
  for (const dt of gaps(rec, 0.2, 5)) close(dt, 1 / 60, 1 / 240 + 1e-9);
});

test('the budget is a ceiling, and the newest frames are the ones kept', () => {
  const rec = bouncing({ rate: 120, historyRate: 120, window: 0.5, capacity: 200, seconds: 5 });
  assert.ok(rec.frames.length <= 200, `${rec.frames.length} frames`);
  // The last frame is the live end: dropping it would strand the playhead.
  assert.ok(rec.frames[rec.frames.length - 1].t > 4.5, 'the newest frame was dropped');
});

test('frameAt still finds the nearest frame across a change of rate', () => {
  const rec = bouncing({ rate: 60, historyRate: 30, window: 2, seconds: 8 });
  for (const t of [0.5, 3, 5.9, 6.5, 7.9]) {
    const f = frameAt(rec, t);
    assert.ok(f, `nothing at ${t}`);
    for (const other of rec.frames) {
      assert.ok(Math.abs(other.t - t) >= Math.abs(f.t - t) - 1e-9,
        `${other.t} is nearer ${t} than ${f.t}`);
    }
  }
});

/* ------------------------------------------------------------- the trail -- */

/**
 * The trail is read back out of the frames rather than stored in each one.
 *
 * A copy per frame was 97% of a frame and 720 MB at ten objects, and every
 * position it needs was already sitting in the frames. This checks the rebuilt
 * trail really does retrace where the body went, and ends where the body is.
 */
test('a trail read back from the frames follows the path the body took', () => {
  const rec = bouncing({ rate: 120, historyRate: 120, window: 60, seconds: 4 });
  const at = 3;
  const trail = trailAt(rec, 'a', at, 1);
  assert.ok(trail.length > 50, `only ${trail.length} points`);

  const inWindow = rec.frames.filter((f) => f.t <= at + 1e-9 && f.t >= at - 1);
  assert.equal(trail.length, inWindow.length);
  trail.forEach((point, i) => {
    const b = inWindow[i].bodies.find((x) => x.id === 'a');
    close(point.x, b.pos.x, 1e-12);
    close(point.y, b.pos.y, 1e-12);
  });

  const now = frameAt(rec, at).bodies.find((x) => x.id === 'a');
  close(trail[trail.length - 1].x, now.pos.x, 1e-12);
});

test('a trail asked for before anything is recorded is empty, not broken', () => {
  const rec = createRecorder({ rate: 60 });
  assert.deepEqual(trailAt(rec, 'a', 0, 3), []);
});

/* ------------------------------------------------------------ the events -- */

/**
 * The event list became four answers.
 *
 * Nothing ever read the list: four places ask whether a kind of event has
 * happened at all, and one wants the cannon-full event itself. Keeping the
 * list cost 9.2 MB on a three-minute run and made `record` O(n) per frame.
 */
test('events are folded into the answers anything actually asks for', () => {
  let world = createWorld({
    gravity: vec(0, -g),
    bodies: [{
      id: 'a', mass: 2, radius: 0.2, pos: vec(0, 1), cd: 0, area: 0, restitution: 0.5,
    }],
    ground: { y: 0 },
  });
  let rec = createRecorder({ rate: 60 });
  assert.equal(rec.flags.collision, false);
  assert.equal(rec.cannonFull, null);

  for (let i = 0; i < 240 * 3; i += 1) {
    world = advance(world, 1 / 240);
    rec = record(rec, world, { bodyId: 'a' });
  }
  assert.equal(typeof rec.flags.collision, 'boolean');
  assert.equal(rec.flags.relativistic, false);
  assert.equal(rec.flags.diverged, false);
  // And no list is being carried around any more.
  assert.equal(rec.events, undefined);
});

test('clearing resets the flags as well as the frames', () => {
  const full = {
    ...bouncing({ seconds: 2 }),
    flags: { relativistic: true, diverged: true, collision: true },
    cannonFull: { type: 'cannon-full' },
  };
  const rec = clear(full);
  assert.equal(rec.frames.length, 0);
  assert.equal(rec.flags.collision, false);
  assert.equal(rec.cannonFull, null);
});

/* ----------------------------------------------------- sizing the buffer -- */

test('the rate ladder is ordered, and the cost of a rate reads off it', () => {
  for (let i = 1; i < RATE_ERROR.length; i += 1) {
    assert.ok(RATE_ERROR[i].rate < RATE_ERROR[i - 1].rate, 'rates descend');
    assert.ok(RATE_ERROR[i].error > RATE_ERROR[i - 1].error, 'coarser costs more');
  }
  close(errorAt(60), 3.1, 1e-9);
  close(errorAt(240), 0, 1e-9);
  const mid = errorAt(45);
  assert.ok(mid > 3.1 && mid < 9.3, `${mid} is not between 60/s and 30/s`);
});

test('frames and seconds are two views of the same budget', () => {
  const policy = { rate: 60, historyRate: 30, window: 60 };
  close(framesFor(60, policy), 3600, 1e-9);
  close(framesFor(180, policy), 3600 + 30 * 120, 1e-9);
  close(secondsFor(framesFor(180, policy), policy), 180, 1e-9);
  close(secondsFor(1800, policy), 30, 1e-9);
});
