import test from 'node:test';
import assert from 'node:assert/strict';

import { SHAPES, shapeById, describe, sizeFor, dragComparison, MATERIALS, materialById, floats, outline } from '../js/shapes.js';

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
  // Helium to osmium is a factor of over a hundred thousand, which is what
  // makes "same size, wildly different mass" — and floating — set up at all.
  assert.ok(heaviest.density / lightest.density > 100000);
  assert.equal(materialById('nonsense').id, 'aluminium');
});

test('floating is decided by density, and by nothing else', () => {
  const wood = floats(500, 997);
  assert.equal(wood.floats, true);
  assert.match(wood.text, /rises/);

  const steel = floats(7850, 997);
  assert.equal(steel.floats, false);
  close(steel.ratio, 7850 / 997, 1e-9);
  // Even a sinking object is partly held up, which is the half of Archimedes
  // that people forget: the stone really is lighter underwater.
  assert.match(steel.text, /easier to lift underwater/);

  // Nothing floats in a vacuum, because there is nothing to displace.
  assert.equal(floats(1000, 0).floats, false);
  assert.match(floats(1000, 0).text, /vacuum/);
});

test('a car and a balloon are mostly not there, and buoyancy knows it', () => {
  const cube = describe({ shapeId: 'cube', size: 2, mass: 100 });
  const car = describe({ shapeId: 'car', size: 2, mass: 100 });
  // A car's bounding box is nothing like its volume, and using the box would
  // overstate the fluid it displaces by more than ten times.
  assert.ok(car.volume < cube.volume / 10);
  assert.ok(car.density > cube.density * 10);

  // The two car outlines are different drawings of the same object.
  assert.ok(outline('car', { topDown: false }));
  assert.notEqual(outline('car', { topDown: true }), outline('car', { topDown: false }));
  // A sphere has no outline to draw, because a circle is a better primitive.
  assert.equal(outline('sphere'), null);
  // Every other shape has one, or it would be drawn as a rectangle.
  for (const s of SHAPES) {
    assert.ok(s.circle || typeof outline(s.id) === 'string', s.id + ' has no outline');
  }
});


test('every outline fills its own box, so the aspect is only applied once', () => {
  /*
   * An outline that only spans part of −0.5..0.5 gets squashed twice: once by
   * its own coordinates and again by the shape's aspect ratio. That drew the
   * car at a sixth of its height — a skirting board with wheels — and it is
   * invisible in the code, because both halves look correct on their own.
   */
  const extent = (d) => {
    const numbers = d.trim().split(/[\s,]+/).filter((tok) => !/^[A-Za-z]$/.test(tok)).map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };

  for (const shape of SHAPES) {
    for (const topDown of [false, true]) {
      const d = outline(shape.id, { topDown });
      if (!d) continue;
      const box = extent(d);
      assert.ok(Math.abs(box.minX + 0.5) < 1e-9, `${shape.id} left edge at ${box.minX}`);
      assert.ok(Math.abs(box.maxX - 0.5) < 1e-9, `${shape.id} right edge at ${box.maxX}`);
      assert.ok(Math.abs(box.minY + 0.5) < 1e-9, `${shape.id} top edge at ${box.minY}`);
      assert.ok(Math.abs(box.maxY - 0.5) < 1e-9, `${shape.id} bottom edge at ${box.maxY}`);
    }
  }
});

test('a shape rests on the ground rather than sinking into it', () => {
  // The support height is how far the centre sits above the surface, and the
  // drawn height is size × aspect. If they disagree, the object visibly floats
  // above the floor or has its bottom through it.
  for (const shape of SHAPES) {
    const drawnHalfHeight = (1 * shape.aspect) / 2;
    close(shape.support(1), drawnHalfHeight, 1e-9);
  }
});
