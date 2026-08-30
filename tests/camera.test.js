import test from 'node:test';
import assert from 'node:assert/strict';

import { vec } from '../js/vec.js';
import {
  createCamera, toScreen, toWorld, toPixels, toMetres, onScreen,
  boundsFor, union, vectorScale, arrowHead, clampLabel, insideView, gridStep, gridLines, visibleWorld,
} from '../js/camera.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

const CAM = createCamera({
  world: { minX: 0, maxX: 20, minY: 0, maxY: 10 },
  viewWidth: 760, viewHeight: 380, padding: 20,
});

test('the scale is the same on both axes — a 45° launch must look like 45°', () => {
  const cam = createCamera({
    world: { minX: 0, maxX: 100, minY: 0, maxY: 2 },
    viewWidth: 800, viewHeight: 400,
  });
  const a = toScreen(cam, vec(0, 0));
  const b = toScreen(cam, vec(1, 0));
  const c = toScreen(cam, vec(0, 1));
  close(Math.abs(b.x - a.x), Math.abs(c.y - a.y), 1e-9);
});

test('y is flipped exactly once — up in the world is up on screen', () => {
  const low = toScreen(CAM, vec(5, 1));
  const high = toScreen(CAM, vec(5, 9));
  assert.ok(high.y < low.y, 'a higher body must be drawn higher up');
  // The guard against the bug where a ball falls while its arrow points up.
  const ground = toScreen(CAM, vec(0, 0));
  const ceiling = toScreen(CAM, vec(0, 10));
  assert.ok(ceiling.y < ground.y);
});

test('screen and world coordinates round-trip', () => {
  for (const p of [vec(0, 0), vec(20, 10), vec(7.3, 2.9), vec(-4, 15)]) {
    const back = toWorld(CAM, toScreen(CAM, p));
    close(back.x, p.x, 1e-9);
    close(back.y, p.y, 1e-9);
  }
  close(toMetres(CAM, toPixels(CAM, 3.5)), 3.5, 1e-12);
});

test('the scene is centred in whatever space is left over', () => {
  // A world twice as wide as it is tall, in a panel of the same proportion:
  // it should fill the padding box with equal margins.
  const cam = createCamera({
    world: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
    viewWidth: 800, viewHeight: 400, padding: 20,
  });
  const left = toScreen(cam, vec(0, 0)).x;
  const right = toScreen(cam, vec(10, 0)).x;
  close((left - 0) + (800 - right), 2 * left, 1e-6);
  assert.ok(left > 20, 'a narrow scene should be pushed towards the middle');
});

test('a tiny scene is not magnified without limit', () => {
  const cam = createCamera({
    world: { minX: 0, maxX: 0.01, minY: 0, maxY: 0.01 },
    viewWidth: 760, viewHeight: 380, maxScale: 400,
  });
  assert.equal(cam.scale, 400);
  // pitfalls.md #3 in world terms: a 1 cm scene does not fill a 760 px panel.
  assert.ok(toPixels(cam, 0.01) < 10);
});

test('onScreen answers whether a point is worth labelling', () => {
  assert.equal(onScreen(CAM, vec(10, 5)), true);
  assert.equal(onScreen(CAM, vec(500, 5)), false);
  assert.equal(onScreen(CAM, vec(-3, 5), 200), true);
});

test('bounds cover every body, its size and its trail', () => {
  const b = boundsFor([
    { pos: vec(0, 1), radius: 0.5, trail: [{ x: -4, y: 0.2 }, { x: 8, y: 6 }] },
    { pos: vec(3, 2), radius: 0.2, trail: [] },
  ], { margin: 0 });
  assert.ok(b.minX <= -4 && b.maxX >= 8);
  assert.ok(b.maxY >= 6);
});

test('bounds meet a minimum size by growing about the centre', () => {
  const b = boundsFor([{ pos: vec(5, 5), radius: 0.1, trail: [] }], { minWidth: 8, minHeight: 5, margin: 0 });
  close((b.minX + b.maxX) / 2, 5, 1e-9);
  close((b.minY + b.maxY) / 2, 5, 1e-9);
  assert.ok(b.maxX - b.minX >= 8 - 1e-9);
  assert.ok(b.maxY - b.minY >= 5 - 1e-9);
});

test('bounds cope with nothing at all, and take in the ground', () => {
  const empty = boundsFor([]);
  assert.ok(empty.maxX > empty.minX && empty.maxY > empty.minY);
  const withGround = boundsFor([{ pos: vec(0, 40), radius: 0.2, trail: [] }], { ground: { y: 0 }, margin: 0 });
  assert.ok(withGround.minY <= 0);
});

test('union widens without shifting — a camera must not retune every frame', () => {
  const a = { minX: 0, maxX: 10, minY: 0, maxY: 5 };
  const b = { minX: -3, maxX: 8, minY: 1, maxY: 9 };
  assert.deepEqual(union(a, b), { minX: -3, maxX: 10, minY: 0, maxY: 9 });
});

test('one scale per quantity, so two arrows can be compared by eye', () => {
  const s = vectorScale([10, 5, 2.5], { maxPixels: 90, minPixels: 0 });
  close(s.lengthFor(10), 90);
  close(s.lengthFor(5), 45);
  // The 10 N arrow is exactly twice the 5 N arrow. That is the information.
  close(s.lengthFor(10) / s.lengthFor(5), 2, 1e-9);
  close(s.lengthFor(0), 0);
});

test('small forces stay visible, and nothing is ever drawn longer than the largest', () => {
  const s = vectorScale([100, 0.4], { maxPixels: 90, minPixels: 14 });
  assert.ok(s.lengthFor(0.4) >= 14, 'a small but real force must not vanish');
  assert.ok(s.lengthFor(1000) <= 90, 'nothing may exceed the full-scale length');
  assert.equal(s.visible(0), false);
  assert.equal(s.visible(0.001), true);
});

test('when every force is zero, nothing is drawn at all', () => {
  const s = vectorScale([0, 0]);
  assert.equal(s.lengthFor(5), 0);
  assert.equal(s.visible(5), false);
  assert.equal(s.pixelsPer, 0);
});

test('an arrowhead has its apex exactly on the tip, barbs trailing back', () => {
  const d = arrowHead(100, 50, 1, 0, 10);
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const [ax, ay, tx, ty, bx, by] = n;
  // The middle point is the tip.
  close(tx, 100);
  close(ty, 50);
  // Both barbs trail behind it, and sit symmetrically either side.
  assert.ok(ax < 100 && bx < 100, 'barbs must trail back from the tip');
  close(ay - 50, -(by - 50), 1e-6);
});

test('an arrowhead points the way it is travelling, whatever that way is', () => {
  // pitfalls.md #6: emission arrows that appeared to point into the device.
  for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0], [1, -1], [-3, 4]]) {
    const n = arrowHead(0, 0, dx, dy, 10).match(/-?\d+(\.\d+)?/g).map(Number);
    const m = Math.hypot(dx, dy);
    // Both barbs lie behind the tip along the direction of travel.
    for (const [bx, by] of [[n[0], n[1]], [n[4], n[5]]]) {
      assert.ok((bx * dx + by * dy) / m < 0, `barb ahead of the tip for ${dx},${dy}`);
    }
  }
});

test('labels are clamped inside the canvas rather than trusted to fit', () => {
  // pitfalls.md #4: text hung off a symbol runs to negative x and vanishes
  // from the export even though the browser still paints it.
  const clamped = clampLabel({ x: -80, y: 20, width: 120, height: 12 }, 760, 380);
  assert.ok(clamped.x >= 0);
  const right = clampLabel({ x: 700, y: 20, width: 120, height: 12 }, 760, 380);
  assert.ok(right.x + 120 <= 760);

  assert.equal(insideView({ x: 10, y: 10, width: 100, height: 20 }, 760, 380), true);
  assert.equal(insideView({ x: -10, y: 10, width: 100, height: 20 }, 760, 380), false);
  assert.equal(insideView({ x: 700, y: 10, width: 100, height: 20 }, 760, 380), false);
});

test('the visible rectangle is what the canvas shows, not the world bounds', () => {
  // The two differ whenever the scene is a different shape from the canvas.
  // Background furniture drawn to the world bounds instead lands outside the
  // viewBox: invisible in an export, and overflowing the panel on screen.
  const box = visibleWorld(CAM);
  assert.ok(box.minX < CAM.world.minX, 'the canvas shows more than the fitted box');
  assert.ok(box.maxX > CAM.world.maxX);

  // Its corners map exactly to the corners of the viewBox.
  const topLeft = toScreen(CAM, { x: box.minX, y: box.maxY });
  const bottomRight = toScreen(CAM, { x: box.maxX, y: box.minY });
  close(topLeft.x, 0, 1e-9);
  close(topLeft.y, 0, 1e-9);
  close(bottomRight.x, CAM.viewWidth, 1e-9);
  close(bottomRight.y, CAM.viewHeight, 1e-9);
});

test('a scene of any size fits, however tall', () => {
  // A 2 km drop is a legitimate experiment; a scale floor that stopped it
  // fitting would push the balls off the canvas rather than protect anything.
  const cam = createCamera({
    world: { minX: -5, maxX: 5, minY: 0, maxY: 2000 },
    viewWidth: 880, viewHeight: 500, padding: 30,
  });
  const top = toScreen(cam, { x: 0, y: 2000 });
  const bottom = toScreen(cam, { x: 0, y: 0 });
  assert.ok(top.y >= 0 && bottom.y <= 500, `${top.y} … ${bottom.y} escaped the canvas`);
});

test('the grid is capped, so a huge scene is not two thousand lines', () => {
  const cam = createCamera({
    world: { minX: -5, maxX: 5, minY: 0, maxY: 2000 },
    viewWidth: 880, viewHeight: 500, padding: 30,
  });
  const { xs, ys } = gridLines(cam);
  assert.ok(ys.length <= 200 && xs.length <= 200, `${xs.length} × ${ys.length} lines`);
  assert.ok(ys.length > 2, 'but there should still be a grid');
});

test('the grid picks a round spacing and only the visible lines', () => {
  const step = gridStep(CAM);
  assert.ok([0.1, 0.2, 0.5, 1, 2, 5, 10, 20].some((s) => Math.abs(s - step) < 1e-9), `${step} is not round`);

  const { xs, ys } = gridLines(CAM);
  assert.ok(xs.length > 2 && ys.length > 1);
  for (const x of xs) assert.ok(x >= CAM.world.minX - 1e-9 && x <= CAM.world.maxX + 1e-9);
  for (const y of ys) assert.ok(y >= CAM.world.minY - 1e-9 && y <= CAM.world.maxY + 1e-9);
  // Lines land 40–120 px apart at any zoom, so the grid never becomes a smear.
  const spacing = toPixels(CAM, step);
  assert.ok(spacing > 30 && spacing < 160, `${spacing} px apart`);
});
