import test from 'node:test';
import assert from 'node:assert/strict';

import {
  wall, wallLength, isRealWall, closestPoint, contact, nearestContact, wallBounds,
  boxWalls, alongWall, wallAngle, arcOf, isCurved, pointAt, arcLength,
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

/* ------------------------------------------------------------- curves -- */

/**
 * A curved wall is the same wall with a bulge, and that is the whole design.
 *
 * The bulge is the sagitta: how far the middle bows off the straight line
 * between the ends. Zero has to be *exactly* straight rather than a circle of
 * enormous radius, or every wall drawn before curves existed would start
 * behaving fractionally differently.
 */
test('a wall with no bulge is straight, and stays the wall it always was', () => {
  const flat = wall({ x1: 0, y1: 0, x2: 4, y2: 0 });
  assert.equal(flat.bulge, 0);
  assert.equal(arcOf(flat), null);
  assert.equal(isCurved(flat), false);
  assert.deepEqual(pointAt(flat, 0.5), { x: 2, y: 0 });
  assert.equal(arcLength(flat), wallLength(flat));

  // And a bulge too small to see is treated as none at all, rather than
  // computing a circle whose centre is over the horizon.
  assert.equal(arcOf(wall({ x1: 0, y1: 0, x2: 4, y2: 0, bulge: 1e-12 })), null);
});

test('a bulge of half the span is exactly a semicircle', () => {
  const w = wall({ x1: 0, y1: 0, x2: 4, y2: 0, bulge: 2 });
  const arc = arcOf(w);
  close(arc.radius, 2, 1e-9);
  close(arc.sweep, Math.PI, 1e-9);
  close(arc.cx, 2, 1e-9);
  close(arc.cy, 0, 1e-9);
  close(arcLength(w), Math.PI * 2, 1e-9);
});

test('however hard it is bowed, an arc still ends where its ends are', () => {
  // Including past a half-circle, where the arc is longer than its own
  // diameter and the centre has crossed to the other side of the chord.
  for (const bulge of [-9, -3, -1, -0.2, 0, 0.2, 1, 3, 9]) {
    const w = wall({ x1: -1, y1: 0.5, x2: 3, y2: 2, bulge });
    const a = pointAt(w, 0);
    const b = pointAt(w, 1);
    close(a.x, w.x1, 1e-9);
    close(a.y, w.y1, 1e-9);
    close(b.x, w.x2, 1e-9);
    close(b.y, w.y2, 1e-9);
  }
});

test('every point along an arc is on its circle, and the middle is the apex', () => {
  const w = wall({ x1: -2, y1: 1, x2: 3, y2: -1, bulge: 1.7 });
  const arc = arcOf(w);
  for (let i = 0; i <= 20; i += 1) {
    const p = pointAt(w, i / 20);
    close(Math.hypot(p.x - arc.cx, p.y - arc.cy), arc.radius, 1e-9);
  }
  const mid = pointAt(w, 0.5);
  close(mid.x, arc.apexX, 1e-9);
  close(mid.y, arc.apexY, 1e-9);
});

test('the sign of the bulge is which side it bows to', () => {
  const up = arcOf(wall({ x1: 0, y1: 0, x2: 4, y2: 0, bulge: 1 }));
  const down = arcOf(wall({ x1: 0, y1: 0, x2: 4, y2: 0, bulge: -1 }));
  close(up.apexY, 1, 1e-9);
  close(down.apexY, -1, 1e-9);
  // Mirrored, not merely different.
  close(up.apexX, down.apexX, 1e-9);
});

test('a curved wall has ends, and past them the nearest point is the end', () => {
  const bowl = wall({ x1: -2, y1: 0, x2: 2, y2: 0, bulge: -1.5 });
  const off = closestPoint(bowl, { x: 10, y: 0 });
  close(off.x, 2, 1e-9);
  close(off.y, 0, 1e-9);
  assert.equal(off.t, 1);

  // Directly above a bowl is *outside* it: the nearest point is a rim, not the
  // far side of the circle the arc was cut from.
  const above = closestPoint(bowl, { x: 0, y: 5 });
  close(Math.abs(above.x), 2, 1e-9);
  assert.ok(above.t === 0 || above.t === 1);
});

test('a body sitting in a bowl is pushed up, wherever in the bowl it sits', () => {
  const bowl = wall({ x1: -3, y1: 0, x2: 3, y2: 0, bulge: -2 });
  const hit = contact(bowl, { x: 0, y: -1.7 }, 0.5);
  assert.ok(hit, 'nothing touching at the bottom of the bowl');
  close(hit.normal.x, 0, 1e-9);
  close(hit.normal.y, 1, 1e-9);
  assert.ok(hit.depth > 0);

  // Off to one side the normal tilts inward — that is what makes it a bowl
  // rather than a floor, and it is what rolls the body back to the middle.
  const side = contact(bowl, { x: 1.8, y: -1.2 }, 0.5);
  assert.ok(side, 'nothing touching on the side of the bowl');
  assert.ok(side.normal.y > 0, 'a bowl cannot push downward');
  assert.ok(side.normal.x < 0, 'the side of a bowl pushes back towards the middle');
});

test('the camera box covers the bulge, not just the ends', () => {
  // A dome framed to its chord would have its top cut off the drawing.
  const dome = wall({ x1: -2, y1: 0, x2: 2, y2: 0, bulge: 2 });
  const box = wallBounds([dome]);
  close(box.maxY, 2, 1e-9);
  close(box.minX, -2, 1e-9);
  close(box.maxX, 2, 1e-9);

  // And a straight wall is still bounded by its ends alone.
  const flat = wallBounds([wall({ x1: 0, y1: 0, x2: 4, y2: 1 })]);
  assert.deepEqual(flat, { minX: 0, maxX: 4, minY: 0, maxY: 1 });
});

test('the direction along a curve is the tangent there, not the chord', () => {
  const w = wall({ x1: 0, y1: 0, x2: 4, y2: 0, bulge: 2 });
  // At the top of a semicircle the surface runs horizontally.
  const top = alongWall(w, 0.5);
  close(Math.abs(top.y), 0, 1e-9);
  close(Math.abs(top.x), 1, 1e-9);
  // At the ends it runs vertically — nothing like the chord, which is flat.
  const start = alongWall(w, 0);
  close(Math.abs(start.x), 0, 1e-9);
  close(Math.abs(start.y), 1, 1e-9);
  // A straight wall answers the same thing wherever it is asked.
  const line = wall({ x1: 0, y1: 0, x2: 3, y2: 4 });
  assert.deepEqual(alongWall(line, 0), alongWall(line, 1));
});
