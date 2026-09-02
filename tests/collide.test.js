import test from 'node:test';
import assert from 'node:assert/strict';

import { vec } from '../js/vec.js';
import {
  MODES, modeById, classify, collide1D, maxEnergyTransfer, restitutionFrom,
  bounce, bounceHeightRatio, collide2D, expectation,
} from '../js/collide.js';
import { build, applyPush } from '../js/stages.js';
import { advance, totals } from '../js/world.js';
import { defaults } from '../js/state.js';
import { MATERIALS, describe as describeShape } from '../js/shapes.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('momentum is conserved for every value of e — the whole point', () => {
  const cases = [
    [1, 5, 1, 0], [1, 10, 10, 0], [10, 3, 1, -4], [2, 6, 3, -6], [0.5, 20, 7, 1],
  ];
  for (const [m1, u1, m2, u2] of cases) {
    for (const e of [0, 0.25, 0.5, 0.75, 1]) {
      const r = collide1D(m1, u1, m2, u2, e);
      close(r.after.momentum, r.before.momentum, 1e-9);
      close(r.momentumChange, 0, 1e-9);
    }
  }
});

test('kinetic energy is conserved only when e = 1', () => {
  const elastic = collide1D(1, 10, 10, 0, 1);
  close(elastic.after.kinetic, elastic.before.kinetic, 1e-9);
  close(elastic.energyTransferred, 0, 1e-9);

  for (const e of [0, 0.3, 0.7, 0.99]) {
    const r = collide1D(1, 10, 10, 0, e);
    assert.ok(r.energyTransferred > 0, `e = ${e} should move energy elsewhere`);
    assert.ok(r.after.kinetic < r.before.kinetic);
  }
});

test('equal masses in an elastic head-on collision swap velocities', () => {
  const r = collide1D(2, 5, 2, -3, 1);
  close(r.after.v1, -3);
  close(r.after.v2, 5);
});

test('a perfectly inelastic collision leaves both at the centre-of-mass speed', () => {
  const r = collide1D(1, 10, 3, 2, 0);
  close(r.after.v1, r.after.v2, 1e-12);
  close(r.after.v1, r.centreOfMassVelocity, 1e-12);
  close(r.after.v1, (1 * 10 + 3 * 2) / 4, 1e-12);
  close(r.after.separationSpeed, 0, 1e-12);
});

test('the centre of mass velocity is untouched by the collision', () => {
  for (const e of [0, 0.5, 1]) {
    const r = collide1D(1, 8, 4, -2, e);
    close(r.centreOfMassVelocity, r.before.momentum / 5, 1e-12);
    close(r.after.momentum / 5, r.centreOfMassVelocity, 1e-12);
  }
});

test('e is exactly the separation speed over the approach speed', () => {
  for (const e of [0, 0.35, 0.8, 1]) {
    const r = collide1D(3, 7, 5, -1, e);
    close(r.after.separationSpeed / r.before.approachSpeed, e, 1e-9);
    close(restitutionFrom(7, -1, r.after.v1, r.after.v2), e, 1e-9);
  }
  assert.ok(Number.isNaN(restitutionFrom(5, 5, 5, 5)));
});

test('a perfectly inelastic collision moves the most energy possible', () => {
  const m1 = 2;
  const m2 = 3;
  const u1 = 9;
  const u2 = -1;
  const r = collide1D(m1, u1, m2, u2, 0);
  close(r.energyTransferred, maxEnergyTransfer(m1, u1, m2, u2), 1e-9);
  // It cannot take all of it: what survives is the centre-of-mass energy.
  assert.ok(r.after.kinetic > 0);
  // Unless the total momentum happens to be zero, in which case it can.
  const head = collide1D(2, 5, 2, -5, 0);
  close(head.after.kinetic, 0, 1e-12);
});

test('a light ball off a heavy one bounces back; the heavy one still moves', () => {
  const r = collide1D(1, 10, 1000, 0, 1);
  assert.ok(r.after.v1 < -9.9, 'the light one comes back at almost its original speed');
  assert.ok(r.after.v2 > 0, 'the heavy one does move — it must, or momentum would not balance');
  assert.ok(r.after.v2 < 0.05);
});

test('a heavy ball into a light one throws it off at nearly twice the speed', () => {
  const r = collide1D(1000, 4, 1, 0, 1);
  close(r.after.v2, 8, 0.02);
  close(r.after.v1, 4, 0.02);
});

test('e values are clamped rather than producing nonsense', () => {
  const over = collide1D(1, 5, 1, 0, 3);
  assert.equal(over.e, 1);
  const under = collide1D(1, 5, 1, 0, -2);
  assert.equal(under.e, 0);
  assert.throws(() => collide1D(0, 5, 0, 0, 1), /masses must be positive/);
});

test('bouncing off an immovable surface is the infinite-mass limit', () => {
  close(bounce(-6, 0.8), 4.8);
  close(bounce(-6, 1), 6);
  close(bounce(-6, 0), 0);
  // Height goes as the square: e = 0.8 returns to 64% of the drop height.
  close(bounceHeightRatio(0.8), 0.64, 1e-12);

  const limit = collide1D(1, -6, 1e12, 0, 0.8);
  close(limit.after.v1, 4.8, 1e-6);
});

test('modes cover the range and each explains itself', () => {
  assert.ok(MODES.length >= 4);
  for (const m of MODES) {
    assert.ok(m.e >= 0 && m.e <= 1);
    assert.ok(m.note.length > 30, `${m.id} needs a real note`);
  }
  assert.equal(modeById('elastic').e, 1);
  assert.equal(modeById('inelastic').e, 0);
  assert.equal(modeById('nope').id, 'elastic');

  assert.equal(classify(1).id, 'elastic');
  assert.equal(classify(0).id, 'inelastic');
  assert.equal(classify(0.5).id, 'partial');
});

test('a planar impact takes an impulse along the normal only', () => {
  const a = { mass: 1, vel: vec(5, 2) };
  const b = { mass: 1, vel: vec(-5, 2) };
  const r = collide2D(a, b, vec(1, 0), 1);
  assert.equal(r.applied, true);
  // The x components swap; the y components — tangential here — are untouched.
  close(r.a.vel.x, -5, 1e-9);
  close(r.b.vel.x, 5, 1e-9);
  close(r.a.vel.y, 2, 1e-12);
  close(r.b.vel.y, 2, 1e-12);
});

test('a planar impact conserves momentum in both components', () => {
  const a = { mass: 3, vel: vec(4, -1) };
  const b = { mass: 1, vel: vec(-2, 3) };
  for (const e of [0, 0.6, 1]) {
    const r = collide2D(a, b, vec(0.6, 0.8), e);
    const px = a.mass * a.vel.x + b.mass * b.vel.x;
    const py = a.mass * a.vel.y + b.mass * b.vel.y;
    close(r.a.mass * r.a.vel.x + r.b.mass * r.b.vel.x, px, 1e-9);
    close(r.a.mass * r.a.vel.y + r.b.mass * r.b.vel.y, py, 1e-9);
  }
});

test('separating bodies are left alone', () => {
  const r = collide2D({ mass: 1, vel: vec(-5, 0) }, { mass: 1, vel: vec(5, 0) }, vec(1, 0), 1);
  assert.equal(r.applied, false);
  assert.match(r.reason, /already separating/);

  const immovable = collide2D({ mass: 0, vel: vec(5, 0) }, { mass: 0, vel: vec(-5, 0) }, vec(1, 0), 1);
  assert.equal(immovable.applied, false);
  assert.match(immovable.reason, /immovable/);
});

test('the expectation text matches the situation, and never asserts a cause', () => {
  assert.match(expectation(1, 1, 1), /exchange velocities/);
  assert.match(expectation(1, 100, 1), /bounces back/);
  assert.match(expectation(100, 1, 1), /twice/);
  assert.match(expectation(3, 2, 0), /centre of mass/);
  assert.match(expectation(3, 2, 0.5), /Momentum will balance/);
});

/* ------------------------------------------------------------ bursting -- */

/** A sphere of one material dropped into a fluid, run for a while. */
function inFluid(materialId, fluidId, { size = 0.4, seconds = 6 } = {}) {
  const material = MATERIALS.find((m) => m.id === materialId);
  const object = describeShape({ shapeId: 'sphere', size, density: material.density });
  const p = {
    ...defaults().bench,
    shapeId: 'sphere', size, mass: object.mass, materialId,
    x0: 0, dropHeight: 2, v0: 0, slopeDeg: 0, pushForce: 0,
    fluidId, worldMode: 'planet', objects: [], cannons: [], walls: [],
  };
  const scenario = build('fluid', p);
  let world = applyPush(scenario.world, p, scenario.features);
  const before = totals(world).mechanical;
  let burst = null;
  for (let i = 0; i < 240 * seconds; i += 1) {
    world = applyPush(world, p, scenario.features);
    world = advance(world, 1 / 240);
    const hit = world.events.find((e) => e.type === 'burst');
    if (hit && !burst) burst = hit;
  }
  return { world, burst, before };
}

/**
 * An object under an impossible sustained load bursts instead of being drawn.
 *
 * A 0.4 m helium sphere weighs 5.6 grams and shoves 47 kilograms of honey out
 * of the way, so the buoyancy on it is 467 N - about 8,500 g, held, from the
 * first instant. No integrator makes that sensible: before this, the ball
 * reached 7,343,385 m/s within two steps and sat there. Bursting says the true
 * thing instead, which is that the object is absurd.
 */
test('an object under thousands of g bursts rather than being simulated', () => {
  const { world, burst } = inFluid('helium', 'honey');
  assert.ok(burst, 'a helium ball in honey should burst');
  // Before the clock has moved: the load is there from the start.
  assert.ok(burst.t < 0.01, `burst at t = ${burst.t}`);
  assert.ok(burst.g > 5000, `only ${burst.g} g`);
  close(burst.force, 467, 5);
  assert.equal(world.bodies.length, 0, 'the burst body should leave the scene');
});

test('a burst takes its energy off the books, so the totals still add up', () => {
  const { world, before } = inFluid('helium', 'honey');
  const after = totals(world).mechanical + world.ledger.removed;
  close(after, before, 1e-6);
});

/**
 * Nothing that is merely dramatic bursts.
 *
 * A hard landing is a large acceleration for one step - a steel ball dropped a
 * hundred metres pulls 1,719 g as it arrives - and it is perfectly real. Only
 * the forces that keep acting are counted, so a collision is never mistaken for
 * an impossible load.
 */
test('hard landings and honest buoyancy do not burst', () => {
  for (const [material, fluid] of [
    ['polystyrene', 'honey'], ['balsa', 'honey'], ['helium', 'air'], ['steel', 'air'],
  ]) {
    const { world, burst } = inFluid(material, fluid);
    assert.equal(burst, null, `${material} in ${fluid} should not burst`);
    assert.equal(world.bodies.length, 1, `${material} in ${fluid} lost its body`);
  }

  const p = {
    ...defaults().bench,
    shapeId: 'sphere', size: 0.3, mass: 20, materialId: 'steel',
    x0: 0, dropHeight: 100, v0: 0, slopeDeg: 0, pushForce: 0,
    fluidId: 'air', worldMode: 'planet', objects: [], cannons: [], walls: [],
  };
  const scenario = build('collide', p);
  let world = applyPush(scenario.world, p, scenario.features);
  for (let i = 0; i < 240 * 10; i += 1) {
    world = applyPush(world, p, scenario.features);
    world = advance(world, 1 / 240);
    assert.ok(!world.events.some((e) => e.type === 'burst'), 'a landing burst the ball');
  }
  assert.equal(world.bodies.length, 1);
});

/** A helium balloon in air is the whole point of helium, and still works. */
test('helium still rises in air', () => {
  const { world } = inFluid('helium', 'air');
  const b = world.bodies[0];
  assert.ok(b.vel.y > 1, `it should be going up, not ${b.vel.y} m/s`);
  assert.ok(b.vel.y < 10, `${b.vel.y} m/s is not a terminal speed`);
});
