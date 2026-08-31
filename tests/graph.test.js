import test from 'node:test';
import assert from 'node:assert/strict';

import {
  niceTicks, domainFor, timeDomain, scaler, layout, playhead, timeAt,
  tickAnchor, tickFormat, exponentLabel,
} from '../js/graph.js';

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


test('the axis names have rows of their own, clear of every tick number', () => {
  /*
   * The unit used to be written in the same right-aligned column as the y-tick
   * numbers, a few pixels above the topmost one, and "time (s)" was anchored at
   * exactly the x where the last x-tick is centred. Both overlapped, in every
   * graph, and both looked like a font problem rather than a geometry one.
   */
  const box = layout([
    { id: 'v', label: 'v', unit: 'm/s', points: [{ x: 0, y: -4 }, { x: 3, y: 9 }] },
  ], { width: 880, height: 226 });

  const { labels, plot } = box;

  /*
   * Text is positioned by its baseline, so a label with baseline `y` occupies
   * the band from `y - height` to `y`. Comparing baselines alone is how a
   * label that looks clear in the numbers still overlaps on screen.
   */
  const band = (baseline, height = 11) => ({ top: baseline - height, bottom: baseline });
  const clear = (a, b) => a.bottom <= b.top || b.bottom <= a.top;

  const topTickY = Math.min(...box.yTicks.map((t) => box.yScale(t))) + labels.yTicks.dy;
  assert.ok(clear(band(labels.unit.y), band(topTickY)),
    `unit baseline ${labels.unit.y} overlaps the top tick at ${topTickY}`);
  // And it starts where the tick numbers end, so they cannot share a column
  // either, whichever way round the rows fell.
  assert.ok(labels.unit.anchor === 'start' && labels.unit.x >= labels.yTicks.x);

  // "time (s)" is a whole row below the x-tick numbers.
  assert.ok(clear(band(labels.time.y), band(labels.xTicks.y)),
    `time label at ${labels.time.y} overlaps the tick row at ${labels.xTicks.y}`);

  // Both bands are inside the graph, not hanging off the bottom of it.
  assert.ok(labels.unit.y - labels.unit.height >= 0);
  assert.ok(labels.time.y <= 226);
  assert.ok(plot.y >= labels.unit.height);
});

test('the plot still gets most of the height after the label bands', () => {
  const box = layout([{ id: 'v', label: 'v', unit: 'm/s', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
    { width: 880, height: 226 });
  // Reserving room for labels must not squeeze the graph into a strip.
  assert.ok(box.plot.height > 226 * 0.6, `plot is only ${box.plot.height} of 226`);
});


test('no x-tick number strays outside the plot it belongs to', () => {
  /*
   * Centring every tick number puts half of the first one to the left of the
   * plot, in the column the y-tick numbers occupy — where it touches the
   * bottom one — and half of the last one off the right edge of the graph.
   * Both were happening in every graph in the app.
   */
  const box = layout([{ id: 'v', label: 'v', unit: 'm/s', points: [{ x: 0, y: -1 }, { x: 3, y: 2 }] }],
    { width: 880, height: 226 });
  const width = 26;                       // a generous "0.0"-sized label

  box.xTicks.forEach((tick, i) => {
    const anchor = box.labels.tickAnchor(i, box.xTicks.length);
    const x = box.xScale(tick);
    const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
    assert.ok(left >= box.plot.x - 0.5, `tick ${tick} starts at ${left}, left of the plot`);
    assert.ok(left + width <= box.plot.x + box.plot.width + 0.5,
      `tick ${tick} ends at ${left + width}, right of the plot`);
  });

  // Which means it cannot reach the y-tick column, whatever the vertical gap.
  assert.ok(box.plot.x > box.labels.yTicks.x);
});

test('the anchor rule pins only the ends', () => {
  assert.equal(tickAnchor(0, 5), 'start');
  assert.equal(tickAnchor(4, 5), 'end');
  assert.equal(tickAnchor(2, 5), 'middle');
  // A lone tick has no end to be pinned to.
  assert.equal(tickAnchor(0, 1), 'middle');
});

test('a tick label is never a rounded-away version of its own tick', () => {
  /*
   * At the two-masses step the forces are around 4×10⁻⁹ N, and fixed-point
   * formatting printed every tick as "0.00": five identical labels stacked on
   * each other, telling the reader the quantity is zero when it is the whole
   * subject of that step.
   */
  const tiny = [0, 1e-9, 2e-9, 3e-9, 4e-9];
  const f = tickFormat(tiny);
  const written = tiny.map(f.format);
  assert.equal(new Set(written).size, tiny.length, `not distinguishable: ${written.join(', ')}`);
  assert.match(exponentLabel(f.exponent), /10/);

  // And reading a label back, with the exponent, gives the tick it belongs to.
  tiny.forEach((tick, i) => {
    close(Number(written[i]) * 10 ** f.exponent, tick, Math.abs(tick) * 1e-6 + 1e-15);
  });
});

test('every tick label reads back as exactly its own value', () => {
  // A step of 0.25 used to print as 0.3, which is a label that is not the value
  // of its tick — the same failure as the 10⁻⁹ case, one bracket up.
  for (const step of [1, 2, 2.5, 5, 10, 0.1, 0.25, 0.5, 1e-9, 2.5e6]) {
    const ticks = [0, step, step * 2, step * 3];
    const f = tickFormat(ticks);
    ticks.forEach((tick) => {
      const read = Number(f.format(tick)) * 10 ** f.exponent;
      close(read, tick, Math.abs(tick) * 1e-9 + 1e-18);
    });
  }
});

test('a common power of ten is only pulled out when it helps', () => {
  // Nobody wants "0, 5, 10" rewritten as "0.0, 0.5, 1.0 ×10¹".
  assert.equal(tickFormat([0, 5, 10]).exponent, 0);
  assert.equal(tickFormat([-1, 0, 1]).exponent, 0);
  assert.equal(exponentLabel(0), '');
  assert.ok(tickFormat([0, 1e-9, 2e-9]).exponent < 0);
  assert.ok(tickFormat([0, 5e5, 1e6]).exponent > 0);
});

test('a negative zero is never written as one', () => {
  const f = tickFormat([-1, -0.5, 0, 0.5, 1]);
  assert.equal(f.format(-0), '0.0');
  assert.ok(!f.format(-1e-18).startsWith('-'));
});

test('a range is small or large, never "too small to be a range"', () => {
  /*
   * The degenerate check used to be absolute: any span under 1e-15 was treated
   * as a single point. That is a statement about metres, and the same function
   * scales joules — the kinetic energy of a gram drifting at a nanometre per
   * second is about 1e-19 J. The energy graph at the two-masses step drew every
   * tick stacked at the middle of the plot, and a rising trace as a flat line
   * through them.
   */
  const tiny = scaler(0, 5e-19, 200, 20);
  assert.notEqual(tiny(0), tiny(5e-19));
  close(tiny(0), 200, 1e-9);
  close(tiny(5e-19), 20, 1e-9);
  close(tiny(2.5e-19), 110, 1e-6);

  // A genuinely zero span still collapses to the middle rather than dividing by
  // zero, at every magnitude.
  for (const v of [0, 5, 1e-19, 1e20]) {
    const flat = scaler(v, v, 200, 20);
    close(flat(v), 110, 1e-9);
  }
});

test('a flat trace is padded in proportion to itself', () => {
  // Padding a flat 5e-19 by ±1 puts it on a ruler a billion billion times too
  // coarse to see it on.
  const tiny = domainFor([{ points: [{ x: 0, y: 5e-19 }, { x: 1, y: 5e-19 }] }], { includeZero: false });
  assert.ok(tiny.max - tiny.min < 1e-18, `padded to ${tiny.max - tiny.min}`);
  assert.ok(tiny.max > tiny.min);

  // A flat zero has no magnitude to scale by, so it keeps a usable box.
  const zero = domainFor([{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }], { includeZero: false });
  assert.ok(zero.max - zero.min >= 1);
});

test('tiny quantities get a real axis, not five ticks in one place', () => {
  const box = layout([
    { id: 'ke', label: 'KE', unit: 'J', points: [{ x: 0, y: 0 }, { x: 2, y: 5e-19 }] },
  ], { width: 880, height: 226 });
  const places = box.yTicks.map((t) => Math.round(box.yScale(t)));
  assert.equal(new Set(places).size, box.yTicks.length, `ticks landed at ${places.join(', ')}`);
});
