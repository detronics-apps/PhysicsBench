import test from 'node:test';
import assert from 'node:assert/strict';

import {
  G, G_STANDARD, G_ROUNDED, EARTH_MASS, EARTH_MEAN_RADIUS,
  fieldStrength, altitudeForFraction,
  ENVIRONMENTS, environmentById, FLUIDS, fluidById,
  DRAG_SHAPES, dragShapeById, SURFACES, surfaceById,
  MATERIALS, materialById, sphereMass, sphereArea,
} from '../js/constants.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('standard gravity is the defined value, not a rounded one', () => {
  assert.equal(G_STANDARD, 9.80665);
  assert.equal(G_ROUNDED, 10);
  assert.notEqual(G_STANDARD, G_ROUNDED);
});

test('field strength depends on the attracting mass, never the falling one', () => {
  // g = GM/r². The falling object's mass does not appear, which is the reason
  // two different masses fall together in a vacuum.
  const g = fieldStrength(EARTH_MASS, EARTH_MEAN_RADIUS);
  close(g, 9.82, 0.02);

  // Same call, no way to pass a falling mass at all — the signature enforces it.
  assert.equal(fieldStrength.length, 2);
});

test('field strength falls off as one over r squared', () => {
  const surface = fieldStrength(EARTH_MASS, EARTH_MEAN_RADIUS);
  const doubled = fieldStrength(EARTH_MASS, 2 * EARTH_MEAN_RADIUS);
  close(doubled / surface, 0.25, 1e-12);
  assert.ok(Number.isNaN(fieldStrength(EARTH_MASS, 0)));
});

test('altitude for a given fraction of surface gravity', () => {
  // A quarter of surface gravity is one Earth radius up.
  close(altitudeForFraction(EARTH_MEAN_RADIUS, 0.25), EARTH_MEAN_RADIUS, 1);
  // The Space Station is around 400 km up and still feels ~89% of surface g.
  const h = altitudeForFraction(EARTH_MEAN_RADIUS, 0.89);
  close(h, 400e3, 60e3);
});

test('every environment carries provenance, not just a number', () => {
  assert.ok(ENVIRONMENTS.length >= 8);
  for (const env of ENVIRONMENTS) {
    assert.ok(env.id && env.label && env.short, `${env.id} needs labels`);
    assert.ok(Number.isFinite(env.g), `${env.id} needs a numeric g`);
    assert.ok(env.note.length > 40, `${env.id} needs a real note, not a stub`);
    assert.ok(['exact', 'measured', 'nominal', 'model', 'chosen'].includes(env.kind),
      `${env.id} kind must say what sort of number this is`);
    assert.ok(env.varies, `${env.id} must say how much the real value moves`);
  }
});

test('the orbit environment is labelled a model, and says why', () => {
  // "Zero gravity in orbit" is the misconception this app must not reinforce.
  const orbit = environmentById('orbit');
  assert.equal(orbit.g, 0);
  assert.equal(orbit.kind, 'model');
  assert.match(orbit.note, /free fall/i);
  assert.match(orbit.varies, /8\.7/);
});

test('lookups fall back rather than returning undefined', () => {
  assert.equal(environmentById('earth').id, 'earth');
  assert.equal(environmentById('nonsense').id, 'earth');
  assert.equal(fluidById('nope').id, 'air');
  assert.equal(dragShapeById('nope').id, 'sphere');
  assert.equal(surfaceById('nope').id, 'frictionless');
  assert.equal(materialById('nope').id, 'steel');
});

test('planetary values are ordered as expected', () => {
  const g = (id) => environmentById(id).g;
  assert.ok(g('moon') < g('mars'));
  assert.ok(g('mars') < g('venus'));
  assert.ok(g('venus') < g('earth'));
  assert.ok(g('earth') < g('jupiter'));
  assert.ok(g('jupiter') < g('sun'));
  // The equator really is weaker than the poles.
  assert.ok(g('earth-equator') < g('earth-poles'));
});

test('fluids, shapes and surfaces are complete and sane', () => {
  assert.equal(fluidById('vacuum').density, 0);
  assert.ok(fluidById('water').density > fluidById('air').density * 500);
  for (const shape of DRAG_SHAPES) assert.ok(shape.cd > 0 && shape.cd < 2);
  for (const s of SURFACES) {
    assert.ok(s.muK <= s.muS, `${s.id}: kinetic friction cannot exceed static`);
    assert.ok(s.muS >= 0);
  }
  assert.equal(surfaceById('frictionless').muS, 0);
  assert.equal(FLUIDS.length >= 4, true);
});

test('sphere mass and area follow from radius and density', () => {
  const steel = materialById('steel');
  // A 50 mm steel ball: (4/3)π(0.05)³ × 7850 ≈ 4.11 kg
  close(sphereMass(0.05, steel.density), 4.11, 0.01);
  close(sphereArea(0.05), Math.PI * 0.0025, 1e-12);
  // Doubling the radius multiplies the mass by eight and the area by four.
  close(sphereMass(0.1, 1000) / sphereMass(0.05, 1000), 8, 1e-9);
  close(sphereArea(0.1) / sphereArea(0.05), 4, 1e-9);
});

test('materials span the range a learner would compare', () => {
  assert.ok(MATERIALS.length >= 6);
  const lead = materialById('lead');
  const foam = materialById('polystyrene');
  assert.ok(lead.density / foam.density > 500);
});

test('G is the CODATA value', () => {
  close(G, 6.6743e-11, 1e-15);
});
