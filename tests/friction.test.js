import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SURFACES, surfaceById, matchSurface, slipAngle, brakingG, describeSurface,
} from '../js/friction.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('every pair is complete, and none of it is invented precision', () => {
  for (const s of SURFACES) {
    assert.ok(s.id && s.label, 'a pair without a name');
    assert.ok(Number.isFinite(s.muS) && s.muS >= 0, `${s.id} μs`);
    assert.ok(Number.isFinite(s.muK) && s.muK >= 0, `${s.id} μk`);
    // A coefficient quoted to two decimals with no range attached is exactly
    // the false precision this app exists to avoid.
    assert.ok(typeof s.spread === 'string' && s.spread.length > 4, `${s.id} has no published range`);
  }
  assert.equal(surfaceById('nonsense'), null);
  assert.equal(surfaceById('ice-ice').muK, 0.03);
});

test('kinetic friction never exceeds static — that is what the words mean', () => {
  for (const s of SURFACES) {
    assert.ok(s.muK <= s.muS + 1e-12, `${s.id}: μk ${s.muK} above μs ${s.muS}`);
  }
});

test('the list spans the range the world actually offers', () => {
  const real = SURFACES.filter((s) => s.id !== 'frictionless');
  const grippiest = Math.max(...real.map((s) => s.muS));
  const slipperiest = Math.min(...real.map((s) => s.muS));

  // A skate on ice to rubber on concrete is a factor of thirty, and a learner
  // who has only seen a 0-to-2 slider has no idea which end is realistic.
  assert.ok(grippiest / slipperiest > 20, `only ${grippiest / slipperiest}× across the list`);
  // μ is a ratio of forces, not a percentage: it can and does exceed 1.
  assert.ok(grippiest > 1, 'nothing in the list is above μ = 1');
});

test('the idealisation is offered, and labelled as one', () => {
  const none = surfaceById('frictionless');
  assert.equal(none.muS, 0);
  assert.equal(none.muK, 0);
  assert.match(none.note, /fiction|idealisation|assumption/i);
});

test('a set of coefficients is matched back to the pair it came from', () => {
  const ice = surfaceById('steel-ice');
  assert.equal(matchSurface(ice.muS, ice.muK).id, 'steel-ice');
  // Dragged somewhere no pair sits, it says so rather than picking the nearest.
  assert.equal(matchSurface(1.73, 0.02), null);
  // A hair off is still the same pair, or reading the sliders back would snap
  // the selector to "custom" the moment it was rendered.
  assert.equal(matchSurface(ice.muS + 0.002, ice.muK - 0.002).id, 'steel-ice');
});

test('every pair matches itself, and no two pairs collide', () => {
  for (const s of SURFACES) {
    assert.equal(matchSurface(s.muS, s.muK).id, s.id, `${s.id} does not match itself`);
  }
});

test('the slip angle is the way μs is actually measured', () => {
  // tan θ = μs. A plank and a protractor.
  close(slipAngle(1), 45, 1e-9);
  close(slipAngle(0), 0, 1e-9);
  close(Math.tan((slipAngle(0.74) * Math.PI) / 180), 0.74, 1e-9);
  // Steel on ice barely has to be tilted at all.
  assert.ok(slipAngle(0.03) < 2);
});

test('braking is quoted in g, because that is a thing people have felt', () => {
  close(brakingG(0.7), 0.7, 1e-12);
  close(brakingG(-1), 0, 1e-12);
});

test('the description carries the range and the caveat, never a bare number', () => {
  const text = describeSurface(surfaceById('tyre-gravel'));
  assert.match(text, /0\.3 to 0\.7/);
  assert.match(text, /not really Coulomb friction|shoved aside/);
  // A custom value says it is one rather than pretending to be a material.
  assert.match(describeSurface(null), /value of your own/);
});
