import test from 'node:test';
import assert from 'node:assert/strict';

import {
  wall, wallLength, isRealWall, closestPoint, contact, nearestContact, wallBounds,
  boxWalls, alongWall, wallAngle,
} from '../js/segments.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('a wall is two points, and a zero-length one is not a wall', () => {
  const w = wall({ x1: 0, y1: 0, x2: 3, y2: 4 });
  close(wallLength(w), 5);
  assert.equal(isRealWall(w), true);
  assert.equal(isRealWall(wall({ x1: 1, y1: 1, x2: 1, y2: 1 })), false);
  // A click that missed is not an obstacle.
  assert.equal(isRealWall(wall({ x1: 0, y1: 0, x2: 1e-9, y2: 0 })), false);
});

test('the closest point stops at the ends — that is what makes it a segment', () => {
  const w = wall({ x1: 0, y1: 0, x2: 4, y2: 0 });
  const middle = closestPoint(w, { x: 2, y: 5 });
  close(middle.x, 2);
  close(middle.t, 0.5);

  // Well past the right-hand end: it clamps to the end rather than running on
  // down an infinite line, which is what lets a body roll off a ramp.
  const past = closestPoint(w, { x: 99, y: 3 });
  close(past.x, 4);
  close(past.t, 1);

  const before = closestPoint(w, { x: -99, y: -3 });
  close(before.x, 0);
  close(before.t, 0);
});

test('the normal points away from the wall, whichever way it was drawn', () => {
  const leftToRight = wall({ x1: -2, y1: 0, x2: 2, y2: 0 });
  const rightToLeft = wall({ x1: 2, y1: 0, x2: -2, y2: 0 });

  for (const w of [leftToRight, rightToLeft]) {
    const above = contact(w, { x: 0, y: 0.3 }, 0.5);
    close(above.normal.x, 0);
    close(above.normal.y, 1);
    const below = contact(w, { x: 0, y: -0.3 }, 0.5);
    close(below.normal.y, -1);
  }
  // Drawing direction is a habit, not physics.
});

test('penetration depth is what has to be undone', () => {
  const w = wall({ x1: -5, y1: 0, x2: 5, y2: 0 });
  const hit = contact(w, { x: 0, y: 0.3 }, 0.5);
  close(hit.depth, 0.2);
  // Clear of it entirely.
  assert.equal(contact(w, { x: 0, y: 2 }, 0.5), null);
  // Exactly touching is not penetrating.
  close(contact(w, { x: 0, y: 0.5 }, 0.5).depth, 0);
});

test('a body hooked on the end of a wall knows it is on the end', () => {
  const w = wall({ x1: 0, y1: 0, x2: 4, y2: 0 });
  assert.equal(contact(w, { x: 2, y: 0.2 }, 0.5).onEnd, false);
  assert.equal(contact(w, { x: 4.1, y: 0.2 }, 0.5).onEnd, true);
});

test('the deepest contact wins, because a model without rotation has one normal', () => {
  const floor = wall({ x1: -5, y1: 0, x2: 5, y2: 0 });
  const side = wall({ x1: 0.6, y1: -5, x2: 0.6, y2: 5 });
  // Wedged into the corner, but further into the side than into the floor.
  const hit = nearestContact([floor, side], { x: 0.3, y: 0.45 }, 0.5);
  close(Math.abs(hit.normal.x), 1);
  assert.equal(nearestContact([floor, side], { x: -3, y: 4 }, 0.5), null);
  assert.equal(nearestContact([], { x: 0, y: 0 }, 1), null);
});

test('a slope reports the angle a ramp is described by', () => {
  close(wallAngle(wall({ x1: 0, y1: 0, x2: 1, y2: 0 })), 0);
  close(wallAngle(wall({ x1: 0, y1: 0, x2: 1, y2: 1 })), 45);
  close(wallAngle(wall({ x1: 0, y1: 0, x2: 0, y2: 1 })), 90);
  const along = alongWall(wall({ x1: 0, y1: 0, x2: 3, y2: 4 }));
  close(Math.hypot(along.x, along.y), 1);
});

test('a box of four walls encloses exactly what it was asked to', () => {
  const walls = boxWalls({ minX: -2, maxX: 2, minY: 0, maxY: 3 });
  assert.equal(walls.length, 4);
  const box = wallBounds(walls);
  close(box.minX, -2);
  close(box.maxX, 2);
  close(box.minY, 0);
  close(box.maxY, 3);
  // Every side is a real wall, or the box has a hole in it.
  for (const w of walls) assert.ok(isRealWall(w));
});

test('bounds of nothing is nothing, not a box at the origin', () => {
  assert.equal(wallBounds([]), null);
  assert.equal(wallBounds(undefined), null);
  // A degenerate wall must not drag the bounds to it.
  assert.equal(wallBounds([wall({ x1: 1, y1: 1, x2: 1, y2: 1 })]), null);
});

test('hostile numbers become a usable wall rather than a NaN one', () => {
  const w = wall({ x1: 'nonsense', y1: null, x2: undefined, y2: NaN });
  assert.ok(Number.isFinite(w.x1) && Number.isFinite(w.y1));
  assert.ok(Number.isFinite(w.x2) && Number.isFinite(w.y2));
  assert.ok(w.restitution >= 0 && w.restitution <= 1);
  assert.ok(w.mu >= 0);
});
