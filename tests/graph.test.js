import test from 'node:test';
import assert from 'node:assert/strict';

import { niceTicks, domainFor, timeDomain, scaler, layout, playhead, timeAt } from '../js/graph.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

const seriesOf = (id, points) => ({ id, label: id, unit: 'm', axis: 'length', points });
const ramp = (n, f) => Array.from({ length: n }, (_, i) => ({ x: i / 10, y: f(i / 10) }));

test('ticks land on numbers a person would have chosen', () => {
  for (const t of niceTicks(0, 10)) assert.ok(Number.isFinite(t));
  assert.deepEqual(niceTicks(0, 10, 5), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(niceTicks(0, 1, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(niceTicks(-2, 2, 4), [-2, -1, 0, 1, 2]);
  // No 0.30000000000000004 — repeated addition is re-rounded each step.
  assert.ok(niceTicks(0, 1, 10).every((t) => String(t).length <= 4));
});

test('ticks cope with a flat range and with nonsense', () => {
  const flat = niceTicks(5, 5);
  assert.equal(flat.length, 3);
  assert.ok(flat.includes(5));
  assert.deepEqual(niceTicks(NaN, 3), []);
  assert.deepEqual(niceTicks(0, Infinity), []);
});

test('the value range includes zero, because zero is where direction reverses', () => {
  const d = domainFor([seriesOf('v', ramp(20, (t) => 5 + t))]);
  assert.ok(d.min <= 0, 'zero must be on a velocity graph');
  assert.ok(d.max >= 6);
  // Unless asked otherwise.
  const tight = domainFor([seriesOf('v', ramp(20, (t) => 5 + t))], { includeZero: false });
  assert.ok(tight.min > 4);
});

test('a perfectly flat trace still gets a box to be drawn in', () => {
  // A constant acceleration is exactly this, and it must not collapse onto a
  // zero-height axis.
  const d = domainFor([seriesOf('a', ramp(20, () => -9.80665))], { includeZero: false });
  assert.ok(d.max > d.min);
  assert.ok(d.min < -9.80665 && d.max > -9.80665);
  assert.equal(d.flat, true);
});

test('an empty series produces a usable range rather than an exception', () => {
  const d = domainFor([seriesOf('x', [])]);
  assert.equal(d.empty, true);
  assert.ok(d.max > d.min);
  const t = timeDomain([seriesOf('x', [])]);
  assert.ok(t.max > t.min);
  // A single point has no time span, so one is invented.
  assert.ok(timeDomain([seriesOf('x', [{ x: 3, y: 1 }])]).max > 3);
});

test('the scaler maps a range onto pixels, and survives a zero-width domain', () => {
  const s = scaler(0, 10, 100, 300);
  close(s(0), 100);
  close(s(10), 300);
  close(s(5), 200);
  // A degenerate domain centres rather than dividing by zero.
  close(scaler(4, 4, 100, 300)(4), 200);
});

test('every drawn point stays inside the plot box', () => {
  // The graph version of pitfalls.md #4: a spike must not draw over the axis.
  const spiky = seriesOf('v', [
    ...ramp(30, (t) => Math.sin(t * 6) * 4),
    { x: 3.1, y: 1e6 },
    { x: 3.2, y: -1e6 },
  ]);
  const l = layout([spiky], { width: 600, height: 200 });
  const numbers = l.paths[0].d.match(/-?\d+(\.\d+)?/g).map(Number);
  for (let i = 0; i < numbers.length; i += 2) {
    const x = numbers[i];
    const y = numbers[i + 1];
    assert.ok(x >= l.plot.x - 0.01 && x <= l.plot.x + l.plot.width + 0.01, `x ${x} escaped`);
    assert.ok(y >= l.plot.y - 0.01 && y <= l.plot.y + l.plot.height + 0.01, `y ${y} escaped`);
  }
});

test('the y axis is inverted so graphs grow upward', () => {
  const l = layout([seriesOf('y', [{ x: 0, y: 0 }, { x: 1, y: 10 }])], { width: 400, height: 200 });
  assert.ok(l.yScale(10) < l.yScale(0), 'a larger value must sit higher on screen');
  assert.ok(l.xScale(1) > l.xScale(0));
});

test('the zero line appears only when zero is inside the range', () => {
  const straddling = layout([seriesOf('v', [{ x: 0, y: -5 }, { x: 1, y: 5 }])]);
  assert.ok(straddling.zeroY !== null);
  close(straddling.zeroY, straddling.plot.y + straddling.plot.height / 2, 1e-6);

  const allPositive = layout([seriesOf('h', [{ x: 0, y: 3 }, { x: 1, y: 9 }])], { includeZero: false });
  assert.equal(allPositive.zeroY, null);
});

test('layout returns one path per series, with its last point for the label', () => {
  const l = layout([
    seriesOf('a', ramp(20, (t) => t)),
    seriesOf('b', ramp(20, (t) => -t)),
  ]);
  assert.equal(l.paths.length, 2);
  assert.deepEqual(l.paths.map((p) => p.id), ['a', 'b']);
  assert.ok(l.paths[0].d.startsWith('M '));
  close(l.paths[0].last.y, 1.9, 1e-9);
  assert.equal(l.empty, false);
  assert.equal(layout([seriesOf('a', [])]).empty, true);
  assert.equal(layout([seriesOf('a', [])]).paths[0].d, '');
});

test('ticks never fall outside the range they label', () => {
  const l = layout([seriesOf('v', ramp(40, (t) => 3 * Math.sin(t)))]);
  for (const t of l.yTicks) assert.ok(t >= l.yDomain.min - 1e-9 && t <= l.yDomain.max + 1e-9);
  for (const t of l.xTicks) assert.ok(t >= l.xDomain.min - 1e-9 && t <= l.xDomain.max + 1e-9);
});

test('the playhead and the scrubber are inverses', () => {
  const l = layout([seriesOf('v', ramp(50, (t) => t))]);
  const head = playhead(l, 2);
  assert.ok(head);
  close(timeAt(l, head.x), 2, 1e-9);
  close(head.y1, l.plot.y);
  close(head.y2, l.plot.y + l.plot.height);
  // Outside the recording there is nothing to point at.
  assert.equal(playhead(l, 99), null);
  // And a click off the end clamps rather than inventing a time.
  close(timeAt(l, -500), l.xDomain.min, 1e-9);
  close(timeAt(l, 5000), l.xDomain.max, 1e-9);
});
