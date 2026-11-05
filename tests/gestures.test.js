import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TAP_SLOP_PX, PULL_FACTOR, MAX_PULL_SPEED,
  isDrag, pullVelocity, velocityToPolar, pinchSpan, pinchCentre, pinchFactor, zoomAbout,
} from '../js/gestures.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b}`);

test('a tap is allowed to wander', () => {
  /*
   * Nobody taps without moving. A finger travels three or four pixels between
   * touching and lifting; without the tolerance every attempt to select
   * something would throw it instead, gently and bafflingly.
   */
  assert.equal(isDrag(0, 0), false);
  assert.equal(isDrag(3, 2), false, 'a steady finger');
  assert.equal(isDrag(7, 7), false, 'still within ten');
  assert.equal(isDrag(0, 11), true, 'a deliberate move');
  assert.ok(TAP_SLOP_PX > 4 && TAP_SLOP_PX < 20, 'above a wobble, below a flick');
});

test('a pull goes the way it was drawn', () => {
  // Drag it the way you want it to go. The slingshot reading needs explaining,
  // and a bench should not need explaining.
  const v = pullVelocity({ x: 0, y: 0 }, { x: 3, y: 4 });
  close(v.vx, 3 * PULL_FACTOR);
  close(v.vy, 4 * PULL_FACTOR);
  close(v.speed, 5 * PULL_FACTOR);

  const back = pullVelocity({ x: 0, y: 0 }, { x: -2, y: 0 });
  assert.ok(back.vx < 0, 'dragging left throws it left');
});

test('a pull of nothing is a velocity of nothing', () => {
  const v = pullVelocity({ x: 1, y: 1 }, { x: 1, y: 1 });
  assert.deepEqual([v.vx, v.vy, v.speed], [0, 0, 0]);
});

test('a huge pull is fast, not bent', () => {
  /*
   * Clamped along its own direction. Clamping the components separately would
   * cap whichever was larger and leave the other, which turns a long throw
   * into a sideways one - the gesture quietly changing meaning at the limit.
   */
  const v = pullVelocity({ x: 0, y: 0 }, { x: 3000, y: 4000 });
  close(v.speed, MAX_PULL_SPEED, 1e-9);
  close(v.vx / v.vy, 3 / 4, 1e-12, 'the direction survived');
});

test('a velocity reads back as a speed and a bearing', () => {
  // Anticlockwise from the right, as every angle in this app is measured.
  close(velocityToPolar({ vx: 1, vy: 0 }).angleDeg, 0);
  close(velocityToPolar({ vx: 0, vy: 1 }).angleDeg, 90);
  close(velocityToPolar({ vx: -1, vy: 0 }).angleDeg, 180);
  close(velocityToPolar({ vx: 3, vy: 4 }).speed, 5);
});

test('a pinch is a ratio, not a difference', () => {
  /*
   * Zoom is multiplicative: 100 px to 200 doubles it and so does 300 to 600.
   * A difference would make the same gesture mean different things depending
   * on where the fingers started.
   */
  close(pinchFactor(100, 200), 2);
  close(pinchFactor(300, 600), 2);
  close(pinchFactor(200, 100), 0.5);
  assert.equal(pinchFactor(0, 100), 1, 'a span of nothing changes nothing');
  assert.equal(pinchFactor(100, 0), 1);
});

test('a pinch that loses a finger cannot run away', () => {
  // Touch screens drop a contact and report it again a frame later. Without a
  // clamp, one such frame leaves the scene at a thousand times its size.
  assert.equal(pinchFactor(1, 100000), 10);
  assert.equal(pinchFactor(100000, 1), 0.1);
});

test('two fingers have a span and a middle', () => {
  close(pinchSpan({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.deepEqual(pinchCentre({ x: 0, y: 0 }, { x: 4, y: 10 }), { x: 2, y: 5 });
});

test('a pinch keeps the point between the fingers where it is', () => {
  /*
   * The whole of "it stays under your fingers". Zooming about the middle of
   * the screen instead is the version that feels broken: the thing being
   * looked at slides away while the empty space either side of it grows.
   */
  const view = { cx: 0, cy: 0, span: 10 };
  const about = { x: 4, y: 0 };
  const after = zoomAbout(view, about, 2);
  close(after.span, 5, 1e-12);

  // The fixed point sat 40% of a half-span right of centre; it still does.
  const before = (about.x - view.cx) / view.span;
  close((about.x - after.cx) / after.span, before, 1e-12);
});

test('zooming about the centre moves nothing but the span', () => {
  const after = zoomAbout({ cx: 2, cy: -3, span: 8 }, { x: 2, y: -3 }, 4);
  close(after.cx, 2);
  close(after.cy, -3);
  close(after.span, 2);
});

test('the span has limits a gesture cannot cross', () => {
  const tiny = zoomAbout({ cx: 0, cy: 0, span: 1 }, { x: 0, y: 0 }, 1e30);
  assert.ok(tiny.span >= 1e-6 && Number.isFinite(tiny.span));
  const huge = zoomAbout({ cx: 0, cy: 0, span: 1 }, { x: 0, y: 0 }, 1e-30);
  assert.ok(huge.span <= 1e12 && Number.isFinite(huge.span));
});
