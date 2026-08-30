import test from 'node:test';
import assert from 'node:assert/strict';

import { vec } from '../js/vec.js';
import { G } from '../js/constants.js';
import {
  attraction, attractionVector, surfaceGravity, fieldAt, massForGravity, radiusForGravity,
  density, escapeSpeed, WORLDS, worldById, describeWorld, everydayComparison,
  horizonSag, horizonDistance, uniformFieldValid,
} from '../js/gravitation.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const rel = (a, b, frac) => assert.ok(Math.abs(a - b) <= Math.abs(b) * frac, `${a} !≈ ${b} (±${frac * 100}%)`);

test('attraction takes two masses and one distance', () => {
  close(attraction(1, 1000, 4), (G * 1000) / 16, 1e-20);
  // Doubling either mass doubles it; doubling the distance quarters it.
  close(attraction(2, 1000, 4) / attraction(1, 1000, 4), 2, 1e-9);
  close(attraction(1, 2000, 4) / attraction(1, 1000, 4), 2, 1e-9);
  close(attraction(1, 1000, 8) / attraction(1, 1000, 4), 0.25, 1e-9);
  assert.equal(attraction(1, 1, 0), Infinity);
});

test('the pull is equal and opposite, whatever the masses', () => {
  const small = { mass: 1, pos: vec(0, 0) };
  const huge = { mass: 5.97e24, pos: vec(6.371e6, 0) };
  const onSmall = attractionVector(small, huge);
  const onHuge = attractionVector(huge, small);
  close(onSmall.x, -onHuge.x, 1e-12);
  close(onSmall.y, -onHuge.y, 1e-12);
  // It points at the other body, not "down".
  assert.ok(onSmall.x > 0 && onHuge.x < 0);
  assert.deepEqual(attractionVector(small, { ...small }), { x: 0, y: 0 });
});

test('surface gravity has no room for the falling object mass', () => {
  // g = GM/r². The signature cannot even accept a falling mass.
  assert.equal(surfaceGravity.length, 2);
  close(surfaceGravity(5.9722e24, 6.371e6), 9.8203, 1e-3);
  // Half the radius is four times the gravity; half the mass is half of it.
  close(surfaceGravity(1e24, 1e6) / surfaceGravity(1e24, 2e6), 4, 1e-9);
  close(surfaceGravity(2e24, 1e6) / surfaceGravity(1e24, 1e6), 2, 1e-9);
  assert.ok(Number.isNaN(surfaceGravity(1e24, 0)));
});

test('mass and radius can each be solved for a wanted gravity', () => {
  const r = 6.371e6;
  close(surfaceGravity(massForGravity(9.81, r), r), 9.81, 1e-9);
  const m = 5.9722e24;
  close(surfaceGravity(m, radiusForGravity(9.81, m)), 9.81, 1e-9);
});

test('every listed world computes a plausible surface gravity', () => {
  // The published figures are not stored — they are recomputed from mass and
  // radius, which is the point. Where the two differ the note explains why.
  const expected = {
    moon: 1.62, mars: 3.71, mercury: 3.70, venus: 8.87,
    earth: 9.82, uranus: 9.01, neptune: 11.28, sun: 274,
  };
  for (const [id, g] of Object.entries(expected)) {
    const w = worldById(id);
    rel(surfaceGravity(w.mass, w.radius), g, 0.02);
  }

  // The two fast-spinning gas giants are the interesting cases. Their published
  // "surface gravity" subtracts a large centrifugal effect, which this model
  // does not include — so the computed value is higher, and each note says so
  // rather than the app quietly storing the published number instead.
  for (const [id, computed, published] of [['jupiter', 25.9, 24.79], ['saturn', 11.19, 10.44]]) {
    const w = worldById(id);
    rel(surfaceGravity(w.mass, w.radius), computed, 0.02);
    assert.ok(surfaceGravity(w.mass, w.radius) > published);
    assert.match(w.note, /rotation|day/);
  }
});

test('density and escape speed follow from the same two numbers', () => {
  const earth = worldById('earth');
  rel(density(earth.mass, earth.radius), 5514, 0.02);
  rel(escapeSpeed(earth.mass, earth.radius), 11186, 0.02);
  // Saturn really is less dense than water.
  assert.ok(density(worldById('saturn').mass, worldById('saturn').radius) < 997);
});

test('describeWorld flags a field where Newton is no longer good enough', () => {
  assert.equal(describeWorld({ ...worldById('earth'), id: 'earth' }).relativisticallyWrong, false);
  assert.equal(describeWorld({ ...worldById('neutron-star'), id: 'neutron-star' }).relativisticallyWrong, true);
  const invented = describeWorld({ mass: 1e24, radius: 1e6 });
  assert.equal(invented.label, 'Custom world');
  close(invented.g, surfaceGravity(1e24, 1e6), 1e-12);
});

test('two everyday masses attract by very much less than nothing you could feel', () => {
  const c = everydayComparison(1, 1, 1);
  close(c.force, G, 1e-20);
  assert.ok(c.asFractionOfGrain < 1e-5, 'this is the whole reason nobody notices');
  assert.match(c.text, /grain of sand/);
});

test('a large enough sphere is flat, and the geometry says so rather than a flag', () => {
  // The sag across a window is what makes step four work: grow the world and
  // the curvature under the object falls below a pixel on its own.
  close(horizonSag(10, 20), 10, 1e-9);          // the whole body is in view
  close(horizonSag(1e6, 2), (2 / 2) ** 2 / (2 * 1e6), 1e-9);
  assert.ok(horizonSag(6.371e6, 2) < 1e-6, 'Earth sags under a micron across two metres');
  assert.ok(horizonSag(100, 2) > 0.004, 'a 100 m boulder is visibly curved');
  assert.equal(horizonSag(0, 2), 0);

  // And the horizon is where it should be: about 4.5 km from a 1.6 m eye.
  rel(horizonDistance(6.371e6, 1.6), 4515, 0.02);
});

test('the uniform-field approximation reports its own error', () => {
  const earth = worldById('earth');
  const overARoom = uniformFieldValid(earth.radius, 3);
  assert.equal(overARoom.valid, true);
  assert.ok(overARoom.change < 1e-5);

  // Over a hundred kilometres it stops being free.
  const overALot = uniformFieldValid(earth.radius, 100e3);
  assert.equal(overALot.valid, false);
  assert.match(overALot.text, /enough to matter/);

  // On a small asteroid it breaks down over a few metres.
  assert.equal(uniformFieldValid(500, 20).valid, false);
});

test('field strength at a distance matches the surface value at the surface', () => {
  const earth = worldById('earth');
  close(fieldAt(earth.mass, earth.radius), surfaceGravity(earth.mass, earth.radius), 1e-12);
  // The Space Station is around 400 km up and still feels ~89% of surface g.
  rel(fieldAt(earth.mass, earth.radius + 400e3) / fieldAt(earth.mass, earth.radius), 0.886, 0.01);
});

test('worldById falls back rather than returning undefined', () => {
  assert.equal(worldById('nonsense').id, 'earth');
  assert.ok(WORLDS.length >= 10);
});
