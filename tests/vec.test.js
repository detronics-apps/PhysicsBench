import test from 'node:test';
import assert from 'node:assert/strict';

import {
  vec, add, sub, scale, neg, dot, cross, len, norm, sum, fromPolar, fromPolarDeg,
  angleDeg, perp, rotate, along, project, dist, clampLen, eq, lerp,
} from '../js/vec.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b}`);

test('arithmetic', () => {
  assert.deepEqual(add(vec(1, 2), vec(3, 4)), { x: 4, y: 6 });
  assert.deepEqual(sub(vec(1, 2), vec(3, 4)), { x: -2, y: -2 });
  assert.deepEqual(scale(vec(1, 2), 3), { x: 3, y: 6 });
  assert.deepEqual(neg(vec(1, -2)), { x: -1, y: 2 });
  assert.equal(dot(vec(1, 2), vec(3, 4)), 11);
  assert.equal(cross(vec(1, 0), vec(0, 1)), 1);
  assert.equal(len(vec(3, 4)), 5);
  assert.equal(dist(vec(0, 0), vec(3, 4)), 5);
});

test('sum is the net of a list of forces', () => {
  // A box being pushed right at 10 N while friction pulls left at 4 N and
  // gravity and the normal force cancel: net is 6 N to the right.
  const net = sum([vec(10, 0), vec(-4, 0), vec(0, -19.62), vec(0, 19.62)]);
  assert.ok(eq(net, vec(6, 0)));
  assert.deepEqual(sum([]), { x: 0, y: 0 });
});

test('norm returns a unit vector, and zero stays zero', () => {
  close(len(norm(vec(3, 4))), 1);
  assert.deepEqual(norm(vec(0, 0)), { x: 0, y: 0 });
});

test('angles are anticlockwise from +x, with y up', () => {
  close(angleDeg(vec(1, 0)), 0);
  close(angleDeg(vec(0, 1)), 90);
  close(angleDeg(vec(-1, 0)), 180);
  close(angleDeg(vec(0, -1)), -90);
  // A 30° launch has a positive (upward) y component in this convention.
  assert.ok(fromPolarDeg(10, 30).y > 0);
});

const wrapDeg = (d) => (((d + 180) % 360) + 360) % 360 - 180;

test('fromPolar round-trips through angle and length', () => {
  for (const deg of [0, 17, 45, 90, 143, 180, -60]) {
    const v = fromPolarDeg(7, deg);
    close(len(v), 7, 1e-12);
    close(wrapDeg(angleDeg(v) - deg), 0, 1e-9);
  }
});

test('perp and rotate agree', () => {
  assert.ok(eq(perp(vec(1, 0)), vec(0, 1)));
  assert.ok(eq(rotate(vec(1, 0), Math.PI / 2), vec(0, 1)));
  assert.ok(eq(rotate(vec(2, 3), 0), vec(2, 3)));
});

test('along and project split a vector against a direction', () => {
  // Gravity on a 30° slope: the component down the slope is g·sin30 = g/2.
  const g = vec(0, -9.80665);
  const downSlope = fromPolarDeg(1, 180 + 30);          // pointing down the ramp
  close(along(g, downSlope), 9.80665 / 2, 1e-9);
  close(len(project(g, downSlope)), 9.80665 / 2, 1e-9);
});

test('clampLen caps magnitude without turning the vector', () => {
  const capped = clampLen(vec(30, 40), 5);
  close(len(capped), 5);
  close(angleDeg(capped), angleDeg(vec(30, 40)));
  assert.ok(eq(clampLen(vec(1, 1), 10), vec(1, 1)));
});

test('lerp walks from a to b', () => {
  assert.ok(eq(lerp(vec(0, 0), vec(10, 20), 0.5), vec(5, 10)));
});

test('the convention holds: a falling body accelerates in −y', () => {
  // Guards against the sign flip that once put the acceleration arrow up while
  // the ball fell down. Screen space is the renderer's business, not this.
  const gravity = vec(0, -9.80665);
  assert.ok(gravity.y < 0);
  assert.equal(angleDeg(gravity), -90);
});
