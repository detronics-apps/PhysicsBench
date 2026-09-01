import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGES, stageById, stageIndex, featuresAt, build, applyPush, pushState,
  channelsFor, vectorsFor, applyLive, structuralKey, MAX_OBJECTS, inSpace,
  collisionsOn, collisionsForced, startPosition,
} from '../js/stages.js';
import { defaults, VECTOR_IDS } from '../js/state.js';
import { describe as describeShape } from '../js/shapes.js';
import { advance, inspect, totals, findBody, forcesFor } from '../js/world.js';
import { CHANNELS } from '../js/recorder.js';
import { surfaceGravity } from '../js/gravitation.js';
import { len } from '../js/vec.js';
import { G } from '../js/constants.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const P = defaults().bench;

/** Run a stage forward the way the app does. */
function run(stageId, patch = {}, seconds = 0, frame = 1 / 120) {
  const p = { ...P, ...patch };
  const s = build(stageId, p);
  let world = applyPush(s.world, p, s.features);
  for (let t = 0; t < seconds - 1e-12; t += frame) {
    world = applyPush(world, p, s.features);
    world = advance(world, Math.min(frame, seconds - t));
  }
  return { scenario: s, world, p };
}

/* ------------------------------------------------------------ the shape -- */

test('the steps accumulate — nothing is ever taken away', () => {
  assert.equal(STAGES.length, 7);
  for (let i = 1; i < STAGES.length; i += 1) {
    const before = featuresAt(STAGES[i - 1].id);
    const after = featuresAt(STAGES[i].id);
    for (const f of before) {
      /*
       * Two deliberate exceptions, and both of them are the point of the step
       * that drops them.
       *
       * The second loose mass becomes a planet, so it stops being an ordinary
       * body. And putting the object on a surface swaps the exact 1/r² pull for
       * the flat-ground, uniform-field approximation — which is a change of
       * model, not of numbers, and the disclosure at that step says so.
       */
      if ((f === 'second-mass' || f === 'mutual-gravity') && after.has('ground')) continue;
      assert.ok(after.has(f), `step ${STAGES[i].id} lost "${f}"`);
    }
  }
});

test('every step builds a world with the object in it', () => {
  for (const stage of STAGES) {
    const { world, scenario } = run(stage.id);
    assert.ok(findBody(world, 'main'), `${stage.id} has no object`);
    assert.equal(scenario.focusId, 'main');
    assert.ok(scenario.disclosure.models.length > 0, `${stage.id} declared no model`);
    assert.ok(scenario.equations.length > 0, `${stage.id} offered no equations`);
    for (const b of world.bodies) {
      assert.ok(Number.isFinite(b.mass) && b.mass > 0, `${stage.id}: ${b.id} mass`);
      assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y), `${stage.id}: ${b.id} position`);
      assert.ok(Number.isFinite(b.vel.x) && Number.isFinite(b.vel.y), `${stage.id}: ${b.id} velocity`);
    }
  }
});

/* ----------------------------------------------------------- the physics -- */

test('step 1: nothing acts on a lone mass, so nothing happens', () => {
  const { world } = run('mass', {}, 3);
  const main = findBody(world, 'main');
  close(len(main.vel), 0, 1e-12);
  close(len(forcesFor(world, main).net.vec), 0, 1e-12);
});

test('step 2: the push gives a = F/m, then stops and leaves the velocity alone', () => {
  const patch = { mass: 2, pushForce: 10, pushAngleDeg: 0, pushSeconds: 2, v0: 0 };
  const during = run('push', patch, 1);
  close(inspect(during.world, 'main').acceleration.x, 5, 1e-9);
  close(inspect(during.world, 'main').vel.x, 5, 1e-6);

  const atEnd = run('push', patch, 2);
  close(inspect(atEnd.world, 'main').vel.x, 10, 1e-6);

  // The whole point of the step: after the push, nothing.
  const after = run('push', patch, 6);
  close(inspect(after.world, 'main').acceleration.x, 0, 1e-12);
  close(inspect(after.world, 'main').vel.x, 10, 1e-6);
});

test('step 2: the impulse is the momentum, and the work is the kinetic energy', () => {
  const patch = { mass: 2, pushForce: 10, pushSeconds: 2, v0: 0 };
  const { world } = run('push', patch, 4);
  const main = inspect(world, 'main');
  const sums = totals(world);
  close(main.momentum.x, 10 * 2, 1e-5);              // J = F·t
  close(main.kinetic, 0.5 * 2 * 10 ** 2, 1e-4);      // ½mv²
  close(sums.supplied, main.kinetic, 1e-3);          // W = ΔKE
  close(sums.balance, 0, 1e-6);                      // and the books balance
});

test('step 2: the push works in any direction', () => {
  const up = run('push', { mass: 1, pushForce: 10, pushAngleDeg: 90, pushSeconds: 1 }, 1);
  close(inspect(up.world, 'main').vel.y, 10, 1e-6);
  close(inspect(up.world, 'main').vel.x, 0, 1e-9);

  const back = run('push', { mass: 1, pushForce: 10, pushAngleDeg: 180, pushSeconds: 1 }, 1);
  close(inspect(back.world, 'main').vel.x, -10, 1e-6);
});

test('step 3: two masses attract by G·m₁·m₂/r², towards each other', () => {
  const { world } = run('two-masses', { mass: 1, otherMass: 1000, otherX: 4, pushForce: 0, pushSeconds: 0 });
  const pull = inspect(world, 'main').forces.find((f) => f.id === 'weight');
  close(pull.magnitude, (G * 1 * 1000) / 16, 1e-18);
  assert.ok(pull.vec.x > 0, 'it points at the other mass, not downward');
  // And it is absurdly small — which is the lesson.
  assert.ok(pull.magnitude < 1e-7);
});

test('step 4: g comes out of the mass and the radius, never a lookup', () => {
  for (const [id, mass, radius] of [
    ['earth', 5.9722e24, 6.371e6],
    ['moon', 7.346e22, 1.7374e6],
    ['mars', 6.4171e23, 3.3895e6],
  ]) {
    const { world } = run('planet', { mass: 1, planetId: id, planetMass: mass, planetRadius: radius, pushForce: 0, pushSeconds: 0 });
    const main = inspect(world, 'main');
    // Measured from where the object actually is — which is a little above the
    // surface, so g is a little smaller. That is the inverse-square law being
    // obeyed rather than a surface value being looked up, and the difference is
    // real: the app is not using a stored g anywhere.
    const centre = findBody(world, 'other').pos;
    const r = Math.hypot(main.pos.x - centre.x, main.pos.y - centre.y);
    close(len(main.acceleration), G * mass / (r * r), 1e-9);
    assert.ok(r > radius, 'released above the surface');
    assert.ok(len(main.acceleration) < surfaceGravity(mass, radius), 'and so pulled very slightly less');
    close(len(main.acceleration), surfaceGravity(mass, radius), surfaceGravity(mass, radius) * 1e-4);
    assert.ok(main.acceleration.y < 0, 'it accelerates towards the world');
  }
});

test('step 4: ten times the mass is ten times the weight and the same fall', () => {
  const at = (mass) => inspect(run('planet', {
    mass, planetId: 'earth', pushForce: 0, pushSeconds: 0,
  }).world, 'main');
  const light = at(1);
  const heavy = at(10);
  close(heavy.forces.find((f) => f.id === 'weight').magnitude
    / light.forces.find((f) => f.id === 'weight').magnitude, 10, 1e-9);
  close(len(heavy.acceleration) / len(light.acceleration), 1, 1e-12);
});

test('step 4: only one weight arrow, whatever is doing the pulling', () => {
  // Two forces sharing an id would put a "Weight 0.00 N" row above the real
  // one, and hide a real gravitational pull behind a zero.
  const { world } = run('planet', { pushForce: 0, pushSeconds: 0 });
  const weights = inspect(world, 'main').forces.filter((f) => f.id === 'weight');
  assert.equal(weights.length, 1);
  assert.ok(weights[0].magnitude > 1);
});

test('a tilted surface splits the weight, and the two parts add back up', () => {
  const g = surfaceGravity(P.planetMass, P.planetRadius);
  for (const slopeDeg of [0, 20, 35, 50]) {
    // Tilt is set under "the world it is on" now, and the step that owns the
    // floor is the friction step — but the split itself is unchanged, which is
    // the point of checking it here rather than trusting the move.
    const { world } = run('friction', { mass: 4, slopeDeg, shapeId: 'cube', size: 0.4, pushForce: 0, pushSeconds: 0, muS: 0, muK: 0 });
    const main = inspect(world, 'main');
    const rad = (slopeDeg * Math.PI) / 180;
    close(main.forces.find((f) => f.id === 'normal').magnitude, 4 * g * Math.cos(rad), 1e-6);
    close(main.net.magnitude, 4 * g * Math.sin(rad), 1e-6);
  }
});

test('step 6: friction holds up to μs·N, then drops to μk·N', () => {
  const g = surfaceGravity(P.planetMass, P.planetRadius);
  // A cube, because this is about *sliding* friction. A sphere on the same
  // surface meets rolling resistance instead, which is a different mechanism
  // and has no stick-then-lurch to test.
  const base = {
    mass: 4, slopeDeg: 0, muS: 0.5, muK: 0.35,
    pushSeconds: 30, fluidId: 'vacuum', shapeId: 'cube',
  };

  const held = inspect(run('friction', { ...base, pushForce: 10 }).world, 'main');
  assert.equal(held.contact.frictionMode, 'static');
  close(held.forces.find((f) => f.id === 'friction').magnitude, 10, 1e-9);
  close(held.net.magnitude, 0, 1e-9);

  const broken = inspect(run('friction', { ...base, pushForce: 30 }).world, 'main');
  assert.equal(broken.contact.frictionMode, 'breaking-away');
  close(broken.forces.find((f) => f.id === 'friction').magnitude, 0.35 * 4 * g, 1e-6);
});

test('step 7: the fluid decides the regime, not the object', () => {
  const base = { mass: 4, size: 0.3, shapeId: 'sphere', pushForce: 40, pushSeconds: 2, muS: 0, muK: 0, slopeDeg: 0 };
  const flowIn = (fluidId) => {
    const { world } = run('fluid', { ...base, fluidId }, 4);
    return inspect(world, 'main').forces.find((f) => f.id === 'drag')?.flow;
  };
  const air = flowIn('air');
  const honey = flowIn('honey');
  assert.equal(air.regime.id, 'turbulent');
  assert.ok(air.re > 1e4, `air Re was ${air.re}`);
  assert.ok(honey.re < air.re / 1000, 'honey should be orders of magnitude lower');
  assert.ok(honey.viscousShare > air.viscousShare * 50);
});

test('step 7: energy lost to the fluid is on the books, not missing', () => {
  const base = { mass: 4, size: 0.3, pushForce: 40, pushSeconds: 2, muS: 0, muK: 0, slopeDeg: 0 };
  for (const fluidId of ['air', 'water', 'honey']) {
    const start = run('fluid', { ...base, fluidId });
    const end = run('fluid', { ...base, fluidId }, 8);
    const a = totals(start.world);
    const b = totals(end.world);
    assert.ok(b.elsewhere.heat > 0, `${fluidId} produced no heat`);
    close(b.balance, a.balance, Math.max(0.05, Math.abs(b.supplied) * 0.01));
  }
});

test('step 8: momentum survives the collision and kinetic energy does not', () => {
  const base = {
    mass: 1, mass2: 3, x0: 0, x2: 4, v0: 0, v2: 0,
    pushForce: 40, pushSeconds: 1, fluidId: 'vacuum', muS: 0, muK: 0, slopeDeg: 0,
    // Two bodies and a push, and nothing else on the bench. Said out loud
    // rather than inherited: the opening scene ships with a cannon in it, and a
    // cannon is a second source of momentum. A test about a closed system has
    // to declare the system closed.
    walls: [], cannons: [],
  };
  for (const restitution of [0, 0.5, 1]) {
    const end = run('collide', { ...base, restitution }, 6);
    const sums = totals(end.world);
    // The push delivered exactly 40 kg·m/s and nothing else acted along the track.
    close(sums.momentumX, 40, 0.05);
    close(sums.balance, totals(run('collide', { ...base, restitution }).world).balance, 0.5);
    if (restitution === 0) assert.ok(sums.elsewhere.impact > 1, 'a sticky collision must lose kinetic energy');
  }
});

/* ------------------------------------------------------- what is offered -- */

test('a step only offers arrows for forces that exist there', () => {
  const all = new Set(VECTOR_IDS);
  for (const stage of STAGES) {
    const offered = vectorsFor(stage.id);
    for (const v of offered) {
      assert.ok(all.has(v.id), `${stage.id} offers unknown arrow "${v.id}"`);
      assert.ok(v.token.startsWith('--'), `${v.id} has no colour`);
      assert.ok(['force', 'motion'].includes(v.kind));
    }
    const ids = offered.map((v) => v.id);
    assert.ok(ids.includes('velocity') && ids.includes('net'));
    // Friction cannot be offered before there is a surface to rub on.
    if (!featuresAt(stage.id).has('friction')) assert.ok(!ids.includes('friction'), stage.id);
    if (!featuresAt(stage.id).has('fluid')) assert.ok(!ids.includes('drag'), stage.id);
    if (!featuresAt(stage.id).has('ground')) assert.ok(!ids.includes('normal'), stage.id);
  }
});

test('the offered arrows only grow as the bench does', () => {
  for (let i = 1; i < STAGES.length; i += 1) {
    const before = vectorsFor(STAGES[i - 1].id).map((v) => v.id);
    const after = new Set(vectorsFor(STAGES[i].id).map((v) => v.id));
    for (const id of before) assert.ok(after.has(id), `step ${STAGES[i].id} withdrew "${id}"`);
  }
});

test('every graph channel a step asks for actually exists', () => {
  const known = new Set(CHANNELS.map((c) => c.id));
  for (const stage of STAGES) {
    for (const group of channelsFor(stage.id)) {
      assert.ok(group.label.length > 10, `${stage.id}: a graph needs a caption`);
      for (const id of group.ids) assert.ok(known.has(id), `${stage.id} wants unknown channel "${id}"`);
      // Channels on one graph must share a unit, or metres and metres-per-second
      // end up on the same ruler.
      const axes = new Set(group.ids.map((id) => CHANNELS.find((c) => c.id === id).axis));
      assert.equal(axes.size, 1, `${stage.id}: "${group.label}" mixes ${[...axes].join(' and ')}`);
    }
  }
});

test('momentum and energy are offered everywhere anything can move', () => {
  for (const stage of STAGES) {
    if (stage.id === 'mass') continue;
    const ids = channelsFor(stage.id).flatMap((g) => g.ids);
    assert.ok(ids.some((id) => ['px', 'py', 'sys-p'].includes(id)), `${stage.id} has no momentum graph`);
    assert.ok(ids.some((id) => ['ke', 'pe', 'etotal', 'sys-ke', 'sys-e'].includes(id)), `${stage.id} has no energy graph`);
  }
});

test('pushState reports what the push is doing', () => {
  const f = featuresAt('push');
  const world = { t: 1, bodies: [] };
  const at = pushState(world, { pushSeconds: 3 }, f);
  assert.equal(at.active, true);
  close(at.remaining, 2, 1e-12);
  assert.equal(pushState({ t: 5, bodies: [] }, { pushSeconds: 3 }, f).active, false);
  assert.equal(pushState(world, { pushSeconds: 0 }, f).active, false);
  assert.equal(pushState(world, { pushSeconds: 3 }, featuresAt('mass')).active, false);
});

test('stage lookups fall back rather than throwing', () => {
  assert.equal(stageById('nonsense').id, 'mass');
  assert.equal(stageIndex('nonsense'), 0);
  assert.equal(stageIndex('collide'), STAGES.length - 1);
});


/* ------------------------------------------------ live parameter editing -- */

test('changing a number does not move or stop what is already running', () => {
  const p = { ...defaults().bench };
  const f = featuresAt('push');
  let s = build('push', p);
  let w = applyPush(s.world, p, f);
  for (let i = 0; i < 200; i += 1) {
    w = applyPush(w, p, f);
    w = advance(w, 1 / 100);
  }
  const before = findBody(w, 'main');
  const wasAt = { ...before.pos };
  const wasGoing = { ...before.vel };

  // Change the mass, the shape and the push angle, all at once, mid-run.
  const after = applyLive(w, { ...p, mass: 5, shapeId: 'cube', pushAngleDeg: 90 }, f, { stageId: 'push' });
  const b = findBody(after, 'main');

  assert.deepEqual(b.pos, wasAt);
  assert.deepEqual(b.vel, wasGoing);
  assert.equal(b.mass, 5);
  assert.equal(b.shapeId, 'cube');
  assert.ok(after.t > 0);
});

test('at the very start, the starting position still means something', () => {
  const p = { ...defaults().bench };
  const f = featuresAt('surface');
  const w = build('surface', p).world;
  const moved = applyLive(w, { ...p, x0: 3 }, f, { stageId: 'surface' });
  // Nothing has run yet, so "starts at" and "is at" are the same statement and
  // dragging the slider ought to move it.
  assert.ok(Math.abs(findBody(moved, 'main').pos.x - 3) < 0.2);
});

test('the structural key changes only when the scene has to be rebuilt', () => {
  const p = defaults().bench;
  const same = [
    { ...p, mass: 99 },
    { ...p, pushAngleDeg: 180 },
    { ...p, fluidId: 'honey' },
    { ...p, walls: [{ x1: 0, y1: 0, x2: 1, y2: 0 }] },
  ];
  for (const q of same) assert.equal(structuralKey('collide', q), structuralKey('collide', p));

  // Adding an object changes what bodies exist, which nothing live can do.
  assert.notEqual(
    structuralKey('collide', { ...p, objects: [...p.objects, { id: 'o3', mass: 1, size: 0.3, shapeId: 'cube', x: 2, y: 0, vx: 0, vy: 0 }] }),
    structuralKey('collide', p),
  );
  assert.notEqual(structuralKey('collide', p), structuralKey('fluid', p));
  assert.notEqual(structuralKey('collide', { ...p, worldMode: 'space' }), structuralKey('collide', p));
});

/* ------------------------------------------------------------- in space -- */

test('space takes away the floor and the field together', () => {
  const p = { ...defaults().bench, worldMode: 'space' };
  const s = build('friction', p);
  assert.equal(s.world.ground, null);
  assert.equal(s.world.env.g, 0);
  close(s.world.env.field.y, 0, 1e-12);
  assert.equal(s.space, true);
  // No planet is drawn either, because there is no planet.
  assert.equal(s.world.bodies.some((b) => b.kind === 'planet'), false);
});

test('an object in space keeps whatever velocity it has', () => {
  const p = { ...defaults().bench, worldMode: 'space', v0: 2, pushSeconds: 0, fluidId: 'vacuum' };
  const f = featuresAt('friction');
  let w = build('friction', p).world;
  for (let i = 0; i < 500; i += 1) {
    w = applyPush(w, p, f);
    w = advance(w, 1 / 100);
  }
  const b = findBody(w, 'main');
  close(b.vel.x, 2, 1e-9);
  close(b.vel.y, 0, 1e-9);
  close(b.pos.x, 10, 1e-6);
});

test('the arrows offered in space are only the ones that exist there', () => {
  const p = { ...defaults().bench, worldMode: 'space' };
  const ids = vectorsFor('friction', p).map((v) => v.id);
  // No weight, no normal force, no friction — offering them would teach that
  // they are always there.
  assert.ok(!ids.includes('weight'));
  assert.ok(!ids.includes('normal'));
  assert.ok(!ids.includes('friction'));
  assert.ok(ids.includes('velocity'));

  // Draw a wall to stand on — which the sandbox steps allow — and the normal
  // force becomes real again, because now there is something to stand on.
  const withWall = vectorsFor('collide', { ...p, walls: [{ x1: -1, y1: 0, x2: 1, y2: 0 }] }).map((v) => v.id);
  assert.ok(withWall.includes('normal'));
});

test('buoyancy is offered only where there is a fluid to do the pushing', () => {
  const p = defaults().bench;
  assert.ok(vectorsFor('fluid', { ...p, fluidId: 'water' }).map((v) => v.id).includes('buoyancy'));
  assert.ok(!vectorsFor('fluid', { ...p, fluidId: 'vacuum' }).map((v) => v.id).includes('buoyancy'));
  assert.ok(!vectorsFor('surface', p).map((v) => v.id).includes('buoyancy'));
});

test('every step still declares all four kinds, in space as well as on a world', () => {
  for (const stage of STAGES) {
    for (const worldMode of ['planet', 'space']) {
      const s = build(stage.id, { ...defaults().bench, worldMode });
      assert.ok(s.disclosure.reality.length > 20, stage.id);
      assert.ok(s.disclosure.models.length > 0, stage.id);
      assert.ok(findBody(s.world, 'main'), stage.id + ' lost the object');
    }
  }
});

test('the bench fills to its limit and stops, each object its own', () => {
  // Asks for far more than the cap, and reads the cap from the source rather
  // than repeating the number — a test that hard-codes 20 does not check the
  // limit, it checks that nobody has changed their mind about it.
  const objects = Array.from({ length: MAX_OBJECTS + 15 }, (_, i) => ({
    id: 'o' + (i + 2), mass: i + 2, size: 0.2 + i * 0.01, shapeId: 'cube', x: i, y: 0, vx: 0, vy: 0,
  }));
  const s = build('collide', { ...defaults().bench, objects });
  const movable = s.world.bodies.filter((b) => !b.fixed);
  assert.equal(movable.length, MAX_OBJECTS);
  // Each really is its own object, not one copied MAX_OBJECTS times.
  assert.equal(new Set(movable.map((b) => b.mass)).size, MAX_OBJECTS);
});

/* ------------------------------------------------ the drop, and solidity -- */

test('the drop height moves the object, on a rebuild and while live', () => {
  /*
   * It did neither. `dropHeight` was never declared in the state, so `migrate`
   * dropped it on every reload and every share link; and `applyLive` had its
   * own copy of the starting-position logic that knew nothing about it, so
   * dragging the slider put the object at y = 0 — the opposite of what the
   * control said it did.
   */
  const p = { ...defaults().bench, dropHeight: 5, size: 0.4 };
  const f = featuresAt('planet');
  const built = build('planet', p).world;
  const support = 0.2;
  close(findBody(built, 'main').pos.y, support + 5, 1e-9);

  const raised = applyLive(built, { ...p, dropHeight: 9 }, f, { stageId: 'planet' });
  close(findBody(raised, 'main').pos.y, support + 9, 1e-9);

  // And the two routes agree, which is the only way they stay agreeing.
  close(
    findBody(applyLive(built, p, f, { stageId: 'planet' }), 'main').pos.y,
    findBody(built, 'main').pos.y,
    1e-12,
  );
});

test('the drop height changes how long you watch, not how fast it falls', () => {
  /*
   * The point of the control is that where it started is not in g = G·M/r², any
   * more than the object's own mass is.
   *
   * It is not *exactly* the same, and the difference is the interesting part:
   * this step uses the real inverse-square law rather than a constant g, so
   * being fourteen metres further from the centre of the Earth really is
   * fractionally weaker — by 2·Δr/r, which is about four parts in a million.
   * A test that demanded exact equality would be demanding the app get the
   * physics wrong.
   */
  const rate = (dropHeight) => {
    const p = { ...defaults().bench, dropHeight, pushSeconds: 0, v0: 0 };
    let w = build('planet', p).world;
    // Two tenths of a second: about 20 cm of fall, so both are still in the
    // air. Run it longer and the low one has landed, which measures a bounce.
    for (let i = 0; i < 20; i += 1) w = advance(w, 1 / 100);
    return findBody(w, 'main').vel.y;
  };

  const low = rate(1);
  const high = rate(15);
  assert.ok(low < -1.5, 'it is not falling at all');

  // The same to a part in ten thousand: the drop height is not what decides it.
  assert.ok(Math.abs((high - low) / low) < 1e-4, `differ by ${(high - low) / low}`);

  // And the residue is the inverse-square law, the right way round and the
  // right size — the higher one falls very slightly more slowly.
  assert.ok(Math.abs(high) < Math.abs(low));
  const predicted = (2 * 14) / defaults().bench.planetRadius;
  close(Math.abs((high - low) / low), predicted, predicted * 0.2);
});

test('solidity can be switched off, except where the model needs it', () => {
  const p = defaults().bench;

  assert.equal(collisionsOn({ ...p, collisions: true }, featuresAt('collide')), true);
  assert.equal(collisionsOn({ ...p, collisions: false }, featuresAt('collide')), false);

  // Not a preference under mutual gravitation: 1/r² has no limit at zero
  // separation, and bodies that can pass through each other find it.
  assert.equal(collisionsOn({ ...p, collisions: false }, featuresAt('two-masses')), true);
  assert.equal(collisionsForced(featuresAt('two-masses')), true);
  assert.equal(collisionsForced(featuresAt('collide')), false);
});

test('a cannon can hit the only object on the bench', () => {
  /*
   * It could not. Whether bodies were solid used to depend on how many of them
   * there were, which looked like a free optimisation — one body has nothing to
   * collide with — and was a correctness bug. Cannons add their shots while the
   * world runs, long after that count was taken, so a bench holding one object
   * and a cannon was built with collisions off and every shot sailed straight
   * through the thing it was aimed at.
   */
  const bench = (collisions) => ({
    ...defaults().bench,
    collisions,
    objects: [],
    worldMode: 'planet',
    fluidId: 'vacuum',
    pushSeconds: 0,
    v0: 0,
    walls: [],
    cannons: [{
      id: 'cannon1', x: -4, y: 0.2, angleDeg: 0, speed: 9,
      mass: 0.5, size: 0.2, shapeId: 'sphere', everySeconds: 0,
    }],
  });

  const fire = (collisions) => {
    let w = build('collide', bench(collisions)).world;
    for (let i = 0; i < 300; i += 1) w = advance(w, 1 / 100);
    return findBody(w, 'main').pos.x;
  };

  // A single object and a cannon: the flag must be on before any shot exists.
  assert.equal(build('collide', bench(true)).world.bodyCollisions, true);
  assert.ok(fire(true) > 1, `the shot missed: the object is still at ${fire(true)}`);
  // And off, it really does pass through.
  assert.equal(fire(false), 0);
});

test('the switch reaches the world, on a rebuild and while live', () => {
  const p = { ...defaults().bench, collisions: false };
  const built = build('collide', p).world;
  assert.equal(built.bodyCollisions, false);

  const on = applyLive(built, { ...p, collisions: true }, featuresAt('collide'), { stageId: 'collide' });
  assert.equal(on.bodyCollisions, true);
});

test('with solidity off, objects pass through each other', () => {
  const make = (collisions) => {
    const p = {
      ...defaults().bench,
      collisions,
      stage: 'collide',
      worldMode: 'space',
      fluidId: 'vacuum',
      pushSeconds: 0,
      v0: 4,
      objects: [{ id: 'o2', mass: 1, size: 0.4, shapeId: 'sphere', x: 3, y: 0, vx: 0, vy: 0 }],
      walls: [],
      cannons: [],
    };
    let w = build('collide', p).world;
    for (let i = 0; i < 200; i += 1) w = advance(w, 1 / 100);
    return findBody(w, 'main').pos.x;
  };
  // Solid: it hits the other one and is slowed. Not solid: it sails on at 4 m/s
  // for two seconds, from x = 0.
  assert.ok(make(false) > 7.5, `passed through only as far as ${make(false)}`);
  assert.ok(make(true) < make(false) - 1);
});

/* ------------------------------------------------------ what they are called -- */

test('the last two steps are named for what they are', () => {
  assert.equal(stageById('fluid').label, 'Fluids and objects');
  assert.equal(stageById('collide').label, 'Playground');
  // The short labels are what a phone shows, so they have to stand alone.
  for (const stage of STAGES) {
    assert.ok(stage.short.length <= 12, `${stage.id} short label is ${stage.short.length} characters`);
    assert.ok(stage.label && stage.ask && stage.discover && stage.watch);
  }
});


/* --------------------------------------------------- rolling and sliding -- */

test('a sphere rolls where a cube grips, and by a large factor', () => {
  /*
   * This is the difference a shape actually makes at a contact, and it is not
   * a matter of how much surface is touching. Rolling resistance comes from the
   * ball and the ground flexing under the load; sliding friction comes from
   * asperities being sheared. One is fifty-odd times weaker than the other,
   * which is why wheels were worth inventing.
   */
  const base = {
    ...defaults().bench,
    worldMode: 'planet', fluidId: 'vacuum', slopeDeg: 12,
    pushSeconds: 0, v0: 0, mass: 2, size: 0.4,
    objects: [], walls: [], cannons: [], muS: 0.5, muK: 0.3,
  };
  const slide = (shapeId) => {
    let w = build('friction', { ...base, shapeId }).world;
    const from = findBody(w, 'main').pos.x;
    for (let i = 0; i < 400; i += 1) w = advance(w, 1 / 200);
    return { moved: findBody(w, 'main').pos.x - from, world: w };
  };

  const ball = slide('sphere');
  const box = slide('cube');

  // The slope is under the cube's slip angle, so it does not move at all.
  close(box.moved, 0, 1e-6);
  // The ball is away down the hill.
  assert.ok(ball.moved < -2, `the ball only moved ${ball.moved}`);

  // And the two are named for different mechanisms, not one with two values.
  const rolling = forcesFor(ball.world, findBody(ball.world, 'main')).by('rolling');
  const sliding = forcesFor(box.world, findBody(box.world, 'main')).by('friction');
  assert.ok(rolling, 'a rolling body should meet rolling resistance');
  assert.ok(sliding, 'a sliding body should meet friction');
  assert.equal(forcesFor(ball.world, findBody(ball.world, 'main')).by('friction'), null);
  assert.ok(sliding.magnitude > rolling.magnitude * 10,
    `only ${sliding.magnitude / rolling.magnitude}× apart`);
});

test('how much surface is touching does not change the friction', () => {
  /*
   * Amontons' law, and the single most counter-intuitive true statement in this
   * whole app: F = μN, with no area in it. Real surfaces touch only at their
   * high points, and the real contact area is set by the load — spread the same
   * weight over twice the apparent area and the pressure halves, leaving the
   * same patches actually touching.
   *
   * It would have been easy, and wrong, to make a bigger box grip harder.
   */
  const base = {
    ...defaults().bench,
    worldMode: 'planet', fluidId: 'vacuum', slopeDeg: 0,
    shapeId: 'cube', mass: 4, pushForce: 8, pushSeconds: 30,
    objects: [], walls: [], cannons: [], muS: 0.5, muK: 0.35,
  };
  const frictionAt = (size) => {
    const p = { ...base, size };
    // The body has to come from the pushed world, not the one before it —
    // `applyPush` returns a new world with new bodies, and the old one is not
    // being pushed by anything.
    const w = applyPush(build('friction', p).world, p, featuresAt('friction'));
    return forcesFor(w, findBody(w, 'main')).by('friction').magnitude;
  };

  // A tenfold range of footprint, at the same mass.
  const small = frictionAt(0.2);
  const large = frictionAt(2);
  close(small, large, 1e-9);
  // And it really is holding something, or this proves nothing.
  assert.ok(small > 1);
});

test('the arrow is named for the mechanism that is actually acting', () => {
  const p = { ...defaults().bench, shapeId: 'sphere' };
  const rolling = vectorsFor('friction', p).map((v) => v.id);
  assert.ok(rolling.includes('rolling'));
  assert.ok(!rolling.includes('friction'));

  const sliding = vectorsFor('friction', { ...p, shapeId: 'cube' }).map((v) => v.id);
  assert.ok(sliding.includes('friction'));
  assert.ok(!sliding.includes('rolling'));
});

/* ------------------------------------------------------ how it is drawn -- */

test('a body resting on a tilted floor is drawn tilted before anything moves', () => {
  /*
   * The angle used to be set only by the stepper, so the scene you looked at
   * before pressing Play showed a box embedded in the hillside — and pressing
   * Play appeared to knock it into place.
   */
  const p = { ...defaults().bench, shapeId: 'cube', slopeDeg: -18, worldMode: 'planet' };
  const w = build('friction', p).world;
  close(findBody(w, 'main').angle, (-18 * Math.PI) / 180, 1e-9);

  // Tilting the floor under something that has not moved yet tilts it too.
  const tilted = applyLive(w, { ...p, slopeDeg: 30 }, featuresAt('friction'), { stageId: 'friction' });
  close(findBody(tilted, 'main').angle, (30 * Math.PI) / 180, 1e-9);

  // A round thing has no facing to set.
  const ball = build('friction', { ...p, shapeId: 'sphere' }).world;
  close(findBody(ball, 'main').angle, 0, 1e-12);
});

test('a shape that points where it is going does so, and mirrors rather than rolls over', () => {
  const fly = (vx, vy) => {
    const p = {
      ...defaults().bench, stage: 'collide', shapeId: 'spaceship', worldMode: 'space',
      fluidId: 'vacuum', pushSeconds: 0, v0: vx, objects: [], walls: [], cannons: [],
    };
    let w = build('collide', p).world;
    w = { ...w, bodies: w.bodies.map((b) => (b.id === 'main' ? { ...b, vel: { x: vx, y: vy } } : b)) };
    for (let i = 0; i < 30; i += 1) w = advance(w, 1 / 60);
    return findBody(w, 'main');
  };

  const right = fly(6, 0);
  close(right.angle, 0, 1e-6);
  assert.equal(right.flip, false);

  const up = fly(0, 6);
  close(up.angle, Math.PI / 2, 1e-6);

  // Going left it is mirrored, not turned upside down.
  const left = fly(-6, 0);
  assert.equal(left.flip, true);
  assert.ok(Math.abs(left.angle) < 1e-6);
});

/* ------------------------------------------------------------ projectiles -- */

test('cannon shots pass through each other but not through the experiment', () => {
  const base = {
    ...defaults().bench, worldMode: 'space', fluidId: 'vacuum',
    objects: [], walls: [], collisions: true, pushSeconds: 0, v0: 0,
    mass: 1, size: 0.4, shapeId: 'sphere',
  };

  // Two streams crossing head-on, with the object kept out of the way.
  let crossing = build('collide', {
    ...base,
    x0: 0,
    cannons: [
      { id: 'c1', x: -6, y: 4, angleDeg: 0, speed: 6, mass: 0.4, size: 0.25, shapeId: 'sphere', everySeconds: 0.4 },
      { id: 'c2', x: 6, y: 4, angleDeg: 180, speed: 6, mass: 0.4, size: 0.25, shapeId: 'sphere', everySeconds: 0.4 },
    ],
  }).world;
  for (let i = 0; i < 260; i += 1) crossing = advance(crossing, 1 / 100);

  const shots = crossing.bodies.filter((b) => b.projectile);
  assert.ok(shots.length >= 6, `only ${shots.length} shots`);
  for (const s of shots) close(Math.hypot(s.vel.x, s.vel.y), 6, 1e-9);
  assert.equal(crossing.events.filter((e) => e.type === 'collision').length, 0);

  // But one aimed at the object still hits it.
  let aimed = build('collide', {
    ...base,
    cannons: [{ id: 'c1', x: -6, y: 0, angleDeg: 0, speed: 8, mass: 0.5, size: 0.25, shapeId: 'sphere', everySeconds: 0 }],
  }).world;
  for (let i = 0; i < 250; i += 1) aimed = advance(aimed, 1 / 100);
  assert.ok(findBody(aimed, 'main').pos.x > 1, 'the shot went straight through the object');
});

test('a spent shot fades out, is removed, and takes nothing off the books', () => {
  const p = {
    ...defaults().bench, worldMode: 'planet', fluidId: 'vacuum',
    shapeId: 'cube', slopeDeg: 0, objects: [], walls: [],
    x0: 40, pushSeconds: 0, v0: 0, restitution: 0,
    cannons: [{ id: 'c1', x: -4, y: 0.3, angleDeg: 10, speed: 5, mass: 0.4, size: 0.2, shapeId: 'cube', everySeconds: 0 }],
  };
  let w = build('collide', p).world;

  let sawFading = false;
  let balanceAcrossRemoval = null;
  let previous = null;
  for (let i = 0; i < 900; i += 1) {
    const before = totals(w).balance;
    const had = !!findBody(w, 'shot-1');
    w = advance(w, 1 / 120);
    const shot = findBody(w, 'shot-1');
    if (shot && shot.fade < 1 && shot.fade > 0) sawFading = true;
    if (had && !shot && balanceAcrossRemoval === null) balanceAcrossRemoval = totals(w).balance - before;
    previous = shot;
  }

  assert.ok(sawFading, 'it never faded');
  assert.equal(findBody(w, 'shot-1'), null, 'it was never removed');
  assert.ok(w.events.some((e) => e.type === 'retired') || balanceAcrossRemoval !== null);
  // The step it vanishes on must not move the invariant the app puts on screen.
  close(balanceAcrossRemoval, 0, 1e-9);
  // Its potential energy went onto the ledger rather than out of the totals.
  assert.ok(w.ledger.removed > 0);
});

test('the growth hands over to step four with the same gap it promised', () => {
  /*
   * The animation runs in step three's coordinates — the object where it
   * already is — and step four uses its own, with the surface at zero. What has
   * to match across the handover is the *gap* between the two, not the
   * coordinates: a constant offset is invisible, because the camera frames on
   * the object.
   */
  const p = { ...defaults().bench, dropHeight: 1.4, size: 0.4, x0: 0 };
  const four = build('planet', p).world;
  const main = findBody(four, 'main');
  const planet = four.bodies.find((b) => b.kind === 'planet');
  const gap = main.pos.y - (planet.pos.y + planet.radius);

  // support (0.2) + dropHeight (1.4), and nothing else.
  close(gap, 0.2 + 1.4, 1e-6);
});

test('the shape can be chosen from the first step, and only grows in effect', () => {
  // Available everywhere, because "does the shape matter here?" is a question
  // worth being able to answer by trying it rather than by being prevented.
  for (const stage of STAGES) {
    assert.ok(featuresAt(stage.id).has('shape'), `${stage.id} cannot change the shape`);
  }
});

test('the shape changes nothing about the motion until there is something to act on', () => {
  /*
   * With no surface and no fluid, a shape has nothing to push against. The
   * control being present there is the point — it is how you find that out —
   * so it had better be true.
   */
  const base = {
    ...defaults().bench, worldMode: 'space', fluidId: 'vacuum',
    pushForce: 12, pushAngleDeg: 20, pushSeconds: 2, v0: 0,
    objects: [], walls: [], cannons: [], mass: 2,
  };
  const after = (shapeId, stage) => {
    const p = { ...base, shapeId };
    let w = build(stage, p).world;
    for (let i = 0; i < 300; i += 1) {
      w = applyPush(w, p, featuresAt(stage));
      w = advance(w, 1 / 100);
    }
    const b = findBody(w, 'main');
    return { x: b.pos.x, y: b.pos.y, vx: b.vel.x, vy: b.vel.y };
  };

  for (const stage of ['push', 'two-masses']) {
    const ball = after('sphere', stage);
    const plate = after('plate', stage);
    const ship = after('spaceship', stage);
    for (const other of [plate, ship]) {
      close(other.vx, ball.vx, 1e-9);
      close(other.vy, ball.vy, 1e-9);
    }
  }

  // And once there is a fluid, it very much does.
  const inAir = (shapeId) => {
    const p = { ...base, shapeId, worldMode: 'planet', fluidId: 'air', size: 1 };
    let w = build('fluid', p).world;
    for (let i = 0; i < 300; i += 1) {
      w = applyPush(w, p, featuresAt('fluid'));
      w = advance(w, 1 / 100);
    }
    return findBody(w, 'main').pos.x;
  };
  assert.ok(Math.abs(inAir('plate') - inAir('streamlined')) > 0.05,
    'a flat plate and a teardrop went the same distance through air');
});

test('a shape rests at its own height on a planet, as it does on the ground', () => {
  /*
   * Body-to-body contact treats everything as a circle, which is the point-mass
   * assumption showing through and is right for two objects meeting side on.
   * Resting on a planet is not that case: the surface is locally flat, so what
   * decides the height is the distance from the centre to the underside — the
   * same quantity the ground uses.
   *
   * Using the half-width there left a flat plate hovering ten times too high,
   * which stayed invisible until the shape could be changed at that step.
   */
  const settle = (stage, shapeId) => {
    const p = {
      ...defaults().bench, stage, worldMode: 'planet', shapeId, size: 1,
      dropHeight: 0.5, fluidId: 'vacuum', restitution: 0, slopeDeg: 0,
      objects: [], walls: [], cannons: [], pushSeconds: 0, v0: 0,
    };
    let w = build(stage, p).world;
    for (let i = 0; i < 400; i += 1) w = advance(w, 1 / 100);
    return findBody(w, 'main').pos.y;
  };

  for (const shapeId of ['sphere', 'cube', 'plate', 'streamlined', 'car', 'balloon', 'spaceship']) {
    const expected = describeShape({ shapeId, size: 1, mass: 1 }).support;
    // On a planet, where contact is with another body.
    close(settle('planet', shapeId), expected, 2e-3);
    // And on the drawn ground, which was always right — the two must agree.
    close(settle('friction', shapeId), expected, 2e-3);
  }

  // A flat plate is nowhere near as tall as a cube, which is the case that was
  // wrong: both used to come to rest at half the width.
  assert.ok(settle('planet', 'plate') < settle('planet', 'cube') / 5);
});

/**
 * Step seven is "Fluids and objects", and that is the whole of what it is.
 *
 * Walls and cannons used to arrive here too, on one `sandbox` feature that
 * meant three different things at once. That made the fluid step a playground
 * with a fluid in it — a step about drag and buoyancy that opened with a ramp,
 * a cannon and a scattering of obstacles competing for attention. Splitting the
 * feature costs nothing and keeps each step about one thing.
 */
test('step seven has the objects it is named for, and no obstacles', () => {
  const seven = featuresAt('fluid');
  assert.ok(seven.has('objects'), 'the step called "and objects" has no objects');
  assert.ok(seven.has('fluid'));
  assert.ok(!seven.has('obstacles'), 'walls and cannons are back on the fluid step');

  // Asked for anyway — from a share link, or by walking back from step eight —
  // they are held in the parameters and simply not built.
  const p = {
    ...defaults().bench,
    objects: [{ id: 'o2', mass: 2, size: 0.4, shapeId: 'cube', materialId: 'rubber', x: 2, y: 0, vx: 0, vy: 0 }],
    walls: [{ x1: -2, y1: 1, x2: 2, y2: 1, bulge: 0, restitution: 0.3, mu: 0.6 }],
    cannons: [{ id: 'cannon1', x: -4, y: 1, angleDeg: 20, speed: 8, mass: 0.4, size: 0.2, shapeId: 'sphere', materialId: 'steel', muS: 2, muK: 1.5, rolling: 0.25, everySeconds: 1 }],
  };
  const s = build('fluid', p);
  assert.equal(s.world.walls.length, 0, 'a wall was built on a step that cannot draw one');
  assert.equal(s.world.cannons.length, 0, 'a cannon was built on a step without cannons');
  assert.equal(s.world.bodies.filter((b) => !b.fixed).length, 2, 'the extra object should still be here');

  // Nothing fires, however long it runs.
  let w = applyPush(s.world, p, s.features);
  for (let i = 0; i < 600; i += 1) { w = applyPush(w, p, s.features); w = advance(w, 1 / 120); }
  assert.equal(w.bodies.filter((b) => b.projectile).length, 0, 'something was fired on the fluid step');
});

test('step eight is where obstacles arrive, and it keeps everything before it', () => {
  const seven = featuresAt('fluid');
  const eight = featuresAt('collide');
  assert.ok(eight.has('obstacles'));
  // The accumulation rule: step eight adds, and takes nothing away.
  for (const f of seven) assert.ok(eight.has(f), `step eight dropped "${f}"`);

  const p = {
    ...defaults().bench,
    walls: [{ x1: -2, y1: 1, x2: 2, y2: 1, bulge: 0.5, restitution: 0.3, mu: 0.6 }],
  };
  assert.equal(build('collide', p).world.walls.length, 1);
  // And the same parameters carried back to step seven are held, not destroyed.
  assert.equal(build('fluid', p).world.walls.length, 0);
  assert.equal(p.walls.length, 1, 'the wall was deleted rather than merely not drawn');
});
