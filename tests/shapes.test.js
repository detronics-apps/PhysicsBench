import test from 'node:test';
import assert from 'node:assert/strict';

import { SHAPES, shapeById, describe, sizeFor, dragComparison, MATERIALS, materialById, floats } from '../js/shapes.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('every shape gives a volume, an area and a support height from one size', () => {
  for (const s of SHAPES) {
    const v = s.volume(1);
    assert.ok(v > 0 && Number.isFinite(v), `${s.id} volume`);
    assert.ok(s.area(1) > 0, `${s.id} area`);
    assert.ok(s.support(1) > 0, `${s.id} support`);
    assert.ok(s.cd > 0 && s.cd < 2, `${s.id} cd`);
    // Every volume is a constant times s³, which is what lets `sizeFor` invert
    // it with a single sample.
    close(s.volume(2) / v, 8, 1e-9);
    close(s.area(2) / s.area(1), 4, 1e-9);
  }
  assert.equal(shapeById('nonsense').id, 'sphere');
});

test('a sphere and a cube of the same width differ in the right direction', () => {
  const sphere = describe({ shapeId: 'sphere', size: 1, mass: 1 });
  const cube = describe({ shapeId: 'cube', size: 1, mass: 1 });
  // π/6 of the cube's volume, π/4 of its frontal area, and about half its drag.
  close(sphere.volume / cube.volume, Math.PI / 6, 1e-9);
  close(sphere.area / cube.area, Math.PI / 4, 1e-9);
  assert.ok(sphere.cd < cube.cd);
});

test('mass either comes from the density or sets it', () => {
  const fromDensity = describe({ shapeId: 'cube', size: 0.5, density: 7850 });
  close(fromDensity.mass, 0.125 * 7850, 1e-9);
  close(fromDensity.density, 7850, 1e-9);

  const fromMass = describe({ shapeId: 'cube', size: 0.5, mass: 10 });
  close(fromMass.mass, 10, 1e-12);
  close(fromMass.density, 10 / 0.125, 1e-9);
});

test('sizeFor inverts describe, for every shape', () => {
  for (const s of SHAPES) {
    const size = sizeFor(s.id, 12, 2700);
    const back = describe({ shapeId: s.id, size, density: 2700 });
    close(back.mass, 12, 1e-6);
  }
  assert.equal(sizeFor('sphere', 0, 1000), 0);
  assert.equal(sizeFor('sphere', 5, 0), 0);
});

test('drag comparison is stated against a sphere, because 1.28 means nothing alone', () => {
  close(dragComparison('sphere', 1).ratio, 1, 1e-9);
  // A flat plate: 1.28 × s² against a sphere's 0.47 × πs²/4.
  close(dragComparison('plate', 1).ratio, (1.28 * 1) / (0.47 * Math.PI / 4), 1e-9);
  assert.ok(dragComparison('streamlined', 1).ratio < 0.1);
  assert.match(dragComparison('cube', 1).text, /× a sphere of the same width/);
});

test('a rolling shape is marked as one, and a flat plate sits low', () => {
  assert.equal(shapeById('sphere').rolls, true);
  assert.equal(shapeById('cylinder').rolls, true);
  assert.equal(shapeById('cube').rolls, false);
  // A plate is a tenth as thick as it is wide, so its centre sits a twentieth up.
  close(shapeById('plate').support(1), 0.05, 1e-9);
  close(shapeById('cube').support(1), 0.5, 1e-9);
});

test('materials span the range that makes same-size-different-mass possible', () => {
  assert.ok(MATERIALS.length >= 8);
  const heaviest = MATERIALS.reduce((a, b) => (a.density > b.density ? a : b));
  const lightest = MATERIALS.reduce((a, b) => (a.density < b.density ? a : b));
  assert.ok(heaviest.density / lightest.density > 500);
  assert.equal(materialById('nonsense').id, 'aluminium');
});

test('floating is decided by density, and the app admits it does not model it', () => {
  const wood = floats(500, 997);
  assert.equal(wood.floats, true);
  assert.match(wood.text, /does not model buoyancy/);

  const steel = floats(7850, 997);
  assert.equal(steel.floats, false);
  close(steel.ratio, 7850 / 997, 1e-9);
  assert.match(steel.text, /does not model/);

  assert.equal(floats(1000, 0).floats, false);
});
