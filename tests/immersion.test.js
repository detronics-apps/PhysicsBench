import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submergedFraction, displacedColumn } from '../js/immersion.js';

const sphere = { shapeId: 'sphere', radius: 0.5, support: 0.5, height: 1 };
const box = { shapeId: 'box', support: 0.5, height: 1 };

/* ------------------------------------------------------------ fraction -- */

test('clear of the surface either way is nothing or everything', () => {
  // Bottom at +0.5, so a surface at 0 is well below it.
  assert.equal(submergedFraction(sphere, 1, 0), 0);
  assert.equal(submergedFraction(sphere, -1, 0), 1);
  assert.equal(submergedFraction(box, 1, 0), 0);
  assert.equal(submergedFraction(box, -1, 0), 1);
});

test('exactly touching the surface counts as out of it', () => {
  // Centre at 0.5 puts the underside exactly on a surface at 0.
  assert.equal(submergedFraction(sphere, 0.5, 0), 0);
  assert.equal(submergedFraction(box, 0.5, 0), 0);
});

test('a box is linear in depth, because it is', () => {
  assert.equal(submergedFraction(box, 0.25, 0), 0.25);
  assert.equal(submergedFraction(box, 0, 0), 0.5);
  assert.equal(submergedFraction(box, -0.25, 0), 0.75);
});

test('a sphere half under the surface displaces exactly half of itself', () => {
  assert.equal(submergedFraction(sphere, 0, 0), 0.5);
});

test('a sphere is not linear — the cap formula, checked against itself', () => {
  // Cap of depth d on r = 0.5: V = pi d^2 (3r - d) / 3, whole = 4 pi r^3 / 3.
  for (const d of [0.1, 0.25, 0.4, 0.6, 0.9]) {
    const r = 0.5;
    const want = (Math.PI * d * d * (3 * r - d) / 3) / (4 * Math.PI * r * r * r / 3);
    // Centre sits at (bottom + r), bottom = surface - d, surface = 0.
    assert.ok(Math.abs(submergedFraction(sphere, -d + r, 0) - want) < 1e-12,
      `depth ${d}: ${submergedFraction(sphere, -d + r, 0)} vs ${want}`);
  }
});

test('a shallow sphere displaces far less than its depth suggests', () => {
  // A tenth of the way under is a fifth of the way for a box and 2.8% here:
  // the bottom of a sphere is a point, not a face. This is the whole reason
  // the cap formula is worth having.
  const f = submergedFraction(sphere, 0.4, 0);
  assert.ok(f > 0.027 && f < 0.029, `expected about 0.028, got ${f}`);
  assert.ok(f < submergedFraction(box, 0.4, 0));
});

test('the fraction is monotonic all the way down', () => {
  let last = -1;
  for (let y = 1; y >= -1; y -= 0.01) {
    const f = submergedFraction(sphere, y, 0);
    assert.ok(f >= last - 1e-12, `fraction went backwards at y=${y}`);
    assert.ok(f >= 0 && f <= 1, `fraction out of range at y=${y}: ${f}`);
    last = f;
  }
});

test('a body with no height is simply in or out', () => {
  const point = { shapeId: 'box', support: 0, height: 0 };
  assert.equal(submergedFraction(point, -0.5, 0), 1);
  assert.equal(submergedFraction(point, 0.5, 0), 0);
});

/* -------------------------------------------------------------- column -- */

const W = 1000;  // water
const A = 1.225; // air

test('wholly in one fluid, the column is just density times the rise', () => {
  // From -3 to -2, both well under a surface at 0.
  assert.ok(Math.abs(displacedColumn(sphere, -3, -2, 0, W, A) - W) < 1e-9);
  // And from +3 to +4, both well clear of it.
  assert.ok(Math.abs(displacedColumn(sphere, 3, 4, 0, W, A) - A) < 1e-9);
});

test('going down is the negative of going up', () => {
  const up = displacedColumn(sphere, -2, 2, 0, W, A);
  const down = displacedColumn(sphere, 2, -2, 0, W, A);
  assert.ok(Math.abs(up + down) < 1e-9, `${up} and ${down} do not cancel`);
});

test('no rise, no column', () => {
  assert.equal(displacedColumn(sphere, 0.3, 0.3, 0, W, A), 0);
});

/**
 * The property the energy ledger depends on: the integral is the area under
 * the same fraction curve the force uses. Checked against a slow, dumb sum so
 * a mistake in the banding cannot hide behind a mistake in the reasoning.
 */
test('the column integrates the very fraction the force reads', () => {
  const crude = (from, to) => {
    const n = 200000;
    const h = (to - from) / n;
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      const y = from + (i + 0.5) * h;
      const f = submergedFraction(sphere, y, 0);
      sum += (W * f + A * (1 - f)) * h;
    }
    return sum;
  };

  for (const [from, to] of [[-2, 2], [-0.4, 0.4], [0, 3], [-3, 0.2], [0.2, 0.9]]) {
    const exact = displacedColumn(sphere, from, to, 0, W, A);
    const rough = crude(from, to);
    assert.ok(Math.abs(exact - rough) < 1e-3 * Math.max(1, Math.abs(rough)),
      `${from}..${to}: ${exact} vs ${rough}`);
  }
});

test('the column is exact for a box, where the integrand is linear', () => {
  // Crossing from fully out to fully in: the mean of the two densities over
  // the band, plus nothing either side.
  const band = displacedColumn(box, -0.5, 0.5, 0, W, A);
  assert.ok(Math.abs(band - (W + A) / 2) < 1e-9, `got ${band}`);
});

test('a surface somewhere other than zero works the same way', () => {
  const atZero = displacedColumn(sphere, -2, 2, 0, W, A);
  const atFive = displacedColumn(sphere, 3, 7, 5, W, A);
  assert.ok(Math.abs(atZero - atFive) < 1e-9);
});
