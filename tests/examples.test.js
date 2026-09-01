import test from 'node:test';
import assert from 'node:assert/strict';

import { EXAMPLES, exampleById, exampleState } from '../js/examples.js';
import { STAGE_IDS, defaults } from '../js/state.js';
import { build, applyPush, featuresAt } from '../js/stages.js';
import { advance, inspect, totals, findBody } from '../js/world.js';
import { slipAngle, ROLLING_DEFAULT } from '../js/friction.js';
import { SHAPES, MATERIALS } from '../js/shapes.js';
import { FLUIDS } from '../js/drag.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

/** Run an example forward the way the app does. */
function play(id, seconds = 4, frame = 1 / 240) {
  const state = exampleState(id);
  const scenario = build(state.stage, state.bench);
  let world = applyPush(scenario.world, state.bench, scenario.features);
  for (let t = 0; t < seconds - 1e-12; t += frame) {
    world = applyPush(world, state.bench, scenario.features);
    world = advance(world, Math.min(frame, seconds - t));
  }
  return { state, scenario, world };
}

/* --------------------------------------------------------- the contract -- */

/**
 * Every example still works.
 *
 * This is the test the whole idea rests on. A prepared scene is written once
 * and then left alone while the app changes underneath it — in one week the
 * surface step was deleted, the push force stopped being allowed to go
 * negative, `sandbox` split in two, and bodies became capsules. Any of those
 * could have quietly broken a hand-written scene, and without this nobody finds
 * out until a visitor clicks it and sees nothing happen.
 */
test('every example names a step that exists and settings that are real', () => {
  assert.ok(EXAMPLES.length > 0, 'there should be at least one example');

  const ids = new Set();
  for (const e of EXAMPLES) {
    assert.ok(e.id && !ids.has(e.id), `duplicate or missing id: ${e.id}`);
    ids.add(e.id);
    assert.ok(e.title && e.title.length < 60, `${e.id} needs a short title`);
    assert.ok(e.blurb && e.blurb.length < 200, `${e.id} needs a one-line blurb`);
    assert.ok(e.watch && e.watch.length > 40, `${e.id} should say what to watch`);
    assert.ok(STAGE_IDS.includes(e.stage), `${e.id} names a step that does not exist: ${e.stage}`);

    // Every id it mentions has to be one the app knows.
    const p = e.params || {};
    if (p.shapeId) assert.ok(SHAPES.some((s) => s.id === p.shapeId), `${e.id}: shape ${p.shapeId}`);
    if (p.materialId) assert.ok(MATERIALS.some((m) => m.id === p.materialId), `${e.id}: material ${p.materialId}`);
    if (p.fluidId) assert.ok(FLUIDS.some((f) => f.id === p.fluidId), `${e.id}: fluid ${p.fluidId}`);

    // The arrows it asks for must exist, and it must ask for some.
    assert.ok(Array.isArray(e.arrows) && e.arrows.length > 0, `${e.id} turns no arrows on`);
  }
});

test('an example survives the trip through migrate intact', () => {
  for (const e of EXAMPLES) {
    const state = exampleState(e.id);
    assert.equal(state.stage, e.stage, `${e.id} did not land on its own step`);

    // Everything the patch asked for actually arrived.
    for (const [key, value] of Object.entries(e.params || {})) {
      if (Array.isArray(value)) {
        assert.equal(state.bench[key].length, value.length, `${e.id}: ${key} length`);
      } else if (typeof value === 'number') {
        close(state.bench[key], value, Math.max(1e-9, Math.abs(value) * 1e-9));
      } else {
        assert.equal(state.bench[key], value, `${e.id}: ${key}`);
      }
    }

    // Exactly the named arrows, and no others.
    for (const [id, on] of Object.entries(state.vectors)) {
      assert.equal(on, e.arrows.includes(id), `${e.id}: arrow ${id}`);
    }
  }
});

test('every example runs without falling over', () => {
  for (const e of EXAMPLES) {
    const { world } = play(e.id, 6);
    for (const b of world.bodies) {
      assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y), `${e.id}: ${b.id} position`);
      assert.ok(Number.isFinite(b.vel.x) && Number.isFinite(b.vel.y), `${e.id}: ${b.id} velocity`);
      assert.ok(Math.abs(b.pos.x) < 1e6 && Math.abs(b.pos.y) < 1e6, `${e.id}: ${b.id} left the universe`);
      /*
       * And nothing may reach a speed that is obviously the solver rather than
       * the physics.
       *
       * "Finite" was not a strong enough bar: a helium ball in water gains
       * 491 m/s in a single step against a terminal velocity of 3 m/s, and the
       * drag correction that follows diverges. It came out at seven million
       * metres a second — perfectly finite, perfectly wrong, and this test said
       * nothing. A prepared example must not be arranged so that the integrator
       * cannot cope.
       */
      assert.ok(Math.hypot(b.vel.x, b.vel.y) < 1e4,
        `${e.id}: ${b.id} reached ${Math.hypot(b.vel.x, b.vel.y).toExponential(2)} m/s — the solver has diverged`);
    }
    // And the books close, which is the app's own standard for "it worked".
    const t = totals(world);
    assert.ok(Number.isFinite(t.balance), `${e.id}: the ledger went non-finite`);
  }
});

test('every arrow an example turns on is one its step can draw', () => {
  // Asking for buoyancy on a step with no fluid is not an error anywhere, it
  // simply draws nothing — which looks like the example is broken.
  for (const e of EXAMPLES) {
    const f = featuresAt(e.stage);
    for (const arrow of e.arrows) {
      if (arrow === 'friction' || arrow === 'rolling') {
        assert.ok(f.has('friction'), `${e.id} wants ${arrow} on a step without friction`);
      }
      if (arrow === 'buoyancy' || arrow === 'drag') {
        assert.ok(f.has('fluid'), `${e.id} wants ${arrow} on a step without a fluid`);
      }
      if (arrow === 'normal') {
        assert.ok(f.has('ground'), `${e.id} wants a normal force on a step with no floor`);
      }
      if (arrow === 'control') {
        assert.ok(f.has('control'), `${e.id} wants the control arrow where nothing can drive`);
      }
    }
  }
});

/* ------------------------------------------------- crate on a slope (1) -- */

/**
 * The one thing this example exists to show: friction takes the value needed
 * and no more, right up to its limit.
 *
 * If the crate slides on load, the demonstration is over before it starts. If
 * it sits at 10° it is held so easily that "up to a limit" is invisible. The
 * numbers below are the demonstration, so they are worth pinning.
 */
test('the crate is held, and only just', () => {
  const { world, state } = play('crate-on-a-slope', 3);
  const crate = findBody(world, 'main');
  const seen = inspect(world, 'main');

  // Three seconds in and it has not moved.
  assert.ok(Math.hypot(crate.vel.x, crate.vel.y) < 1e-3, `it slid: ${crate.vel.x} m/s`);
  assert.equal(seen.contact.frictionMode, 'static');

  // Friction is exactly the leftover along the slope, not its limit.
  const rad = (state.bench.slopeDeg * Math.PI) / 180;
  const along = seen.weight * Math.sin(rad);
  const limit = state.bench.muS * seen.weight * Math.cos(rad);
  const held = seen.forces.find((f) => f.id === 'friction').magnitude;
  close(held, along, 1e-6);
  assert.ok(held < limit, 'friction should be under its limit, or it would be sliding');

  // And it is close enough to that limit for the point to be visible: about
  // nine tenths of everything the surface has.
  const usingUp = held / limit;
  assert.ok(usingUp > 0.8 && usingUp < 0.98, `using ${(usingUp * 100).toFixed(0)}% of the grip`);

  // The net force is nothing at all — which is what "held" means.
  close(seen.net.magnitude, 0, 1e-6);
});

test('a few more degrees and the crate lets go', () => {
  const state = exampleState('crate-on-a-slope');
  const slips = slipAngle(state.bench.muS);

  // The example sits below the angle it lets go at, and not far below.
  assert.ok(state.bench.slopeDeg < slips, `${state.bench.slopeDeg}° is past the ${slips.toFixed(1)}° limit`);
  assert.ok(slips - state.bench.slopeDeg < 4, 'too far below the limit to make the point');

  // Tilt it past that and it does go, and keeps going.
  const p = { ...state.bench, slopeDeg: Math.ceil(slips) + 1 };
  const s = build('friction', p);
  let w = applyPush(s.world, p, s.features);
  for (let i = 0; i < 240 * 3; i += 1) { w = applyPush(w, p, s.features); w = advance(w, 1 / 240); }
  assert.ok(Math.hypot(findBody(w, 'main').vel.x, findBody(w, 'main').vel.y) > 1,
    'past the slip angle it should be sliding');

  // And the drop from static to kinetic is what makes it lurch rather than creep.
  assert.ok(state.bench.muK < state.bench.muS * 0.8, 'the stick-slip drop should be worth seeing');
});

/* ------------------------------------------------------- the teaching -- */

/**
 * Every example explains itself.
 *
 * Loading one drops a reader into a scene somebody else arranged. Without a
 * note saying what it is, what to do and what to look for, they are left to
 * reverse-engineer the point from the sliders — which is exactly the work a
 * prepared experiment exists to save them.
 */
test('every example says how it works, what to do, and what it is for', () => {
  for (const e of EXAMPLES) {
    const t = e.teach;
    assert.ok(t, `${e.id} has no teaching notes`);
    assert.ok(t.how && t.how.length > 120, `${e.id}: "how it works" is too thin`);
    assert.ok(Array.isArray(t.tryThis) && t.tryThis.length >= 2, `${e.id}: give the reader things to do`);
    assert.ok(Array.isArray(t.watch) && t.watch.length >= 2, `${e.id}: say what to look at`);
    assert.ok(t.learn && t.learn.length > 80, `${e.id}: say what it is for`);

    // Instructions that name a control the step does not have send a reader
    // hunting for something that is not there.
    const f = featuresAt(e.stage);
    const words = [t.how, ...t.tryThis, ...t.watch, t.learn].join(' ').toLowerCase();
    if (/\btilt\b/.test(words)) assert.ok(f.has('ground'), `${e.id} mentions tilt on a step with no ground`);
    if (/\bfluid\b|\bhoney\b|\bwater\b/.test(words)) assert.ok(f.has('fluid'), `${e.id} mentions a fluid on a step without one`);
    if (/\bcannon\b/.test(words)) assert.ok(f.has('obstacles'), `${e.id} mentions cannons where there are none`);
  }
});

test('the example travels with the state, and is dropped on leaving it', () => {
  for (const e of EXAMPLES) {
    assert.equal(exampleState(e.id).exampleId, e.id, `${e.id} does not record itself`);
  }
  // A state that names an example nobody wrote keeps nothing.
  assert.equal(exampleById('no-such-thing'), null);
  assert.equal(exampleState('no-such-thing'), null);
  // And a plain default is not pretending to be an example.
  assert.equal(defaults().exampleId, null);
});

/* -------------------------------------------- five densities, one fluid -- */

/**
 * The whole demonstration is that the fluid, not the ball, decides.
 *
 * Five spheres the same size, so they displace the same volume and feel the
 * same buoyant force; the only difference between them is their own weight. If
 * the masses drift away from their materials' densities the ladder collapses
 * and the example stops making its point.
 */
test('the five balls really are the materials they claim to be', () => {
  const state = exampleState('five-densities');
  const world = build('fluid', state.bench).world;
  const wanted = { polystyrene: 20, balsa: 160, pine: 500, rubber: 1100, steel: 7850 };

  const movable = world.bodies.filter((b) => !b.fixed);
  assert.equal(movable.length, 5, 'five balls');
  for (const b of movable) {
    const density = b.mass / b.volume;
    assert.ok(Math.abs(density / wanted[b.materialId] - 1) < 0.005,
      `${b.materialId} came out at ${density.toFixed(1)} kg/m³`);
    // Same size, so the same volume, so the same push from the fluid.
    close(b.volume, movable[0].volume, 1e-9);
  }
});

test('switching the fluid re-sorts them, and rubber is the one that changes', () => {
  const state = exampleState('five-densities');
  /*
   * Which way each ball is pushed, read off the forces rather than off the
   * motion a second later.
   *
   * Watching velocities looked simpler and was wrong: in air the heavy balls
   * reach the floor in under a second and *bounce*, so they come back reading
   * as rising. The net force at the start has no such ambiguity, and it is the
   * thing the example is actually about — weight against the weight of the
   * fluid pushed aside.
   */
  const rising = (fluidId) => {
    const p = { ...state.bench, fluidId };
    const w = build('fluid', p).world;
    return w.bodies
      .filter((b) => !b.fixed && inspect(w, b.id).net.vec.y > 0)
      .map((b) => b.materialId)
      .sort();
  };

  // The ladder the example is built on.
  assert.deepEqual(rising('air'), []);
  assert.deepEqual(rising('water'), ['balsa', 'pine', 'polystyrene']);
  assert.deepEqual(rising('honey'), ['balsa', 'pine', 'polystyrene', 'rubber']);

  // Rubber is the one that answers differently between water and honey, which
  // is why it is the ball the readouts follow.
  assert.equal(state.selectedId, 'o4');
  const rubber = build('fluid', state.bench).world.bodies.find((b) => b.id === 'o4');
  assert.equal(rubber.materialId, 'rubber');
});

/* -------------------------------------- a ball and a box on the same slope -- */

/**
 * The two objects must differ in exactly one way, or the demonstration proves
 * nothing. Same mass, same size, same material, same surface, same slope —
 * only the shape, and therefore only the mechanism at the contact.
 */
test('the ball and the box differ only in shape', () => {
  const state = exampleState('rolling-against-sliding');
  const world = build('fluid', state.bench).world;
  const [ball, box] = world.bodies.filter((b) => !b.fixed);

  close(ball.mass, box.mass, 1e-9);
  assert.equal(ball.materialId, box.materialId);
  assert.equal(state.bench.shapeId, 'sphere');
  assert.equal(state.bench.objects[0].shapeId, 'cube');
  // No fluid, so drag and buoyancy cannot be a second difference between them.
  assert.equal(state.bench.fluidId, 'vacuum');

  // And they meet the contact differently, which is the whole point.
  assert.equal(ball.rolls, true);
  assert.equal(box.rolls, false);
});

test('the slope sits between the two thresholds, so it answers both ways', () => {
  const state = exampleState('rolling-against-sliding');
  const tilt = state.bench.slopeDeg;
  const boxLetsGo = slipAngle(state.bench.muS);
  // A ball starts rolling once the slope out-pulls its rolling resistance.
  const ballLetsGo = (Math.atan(ROLLING_DEFAULT) * 180) / Math.PI;

  assert.ok(tilt > ballLetsGo, `${tilt}° should be past the ball's ${ballLetsGo.toFixed(1)}°`);
  assert.ok(tilt < boxLetsGo, `${tilt}° should be short of the box's ${boxLetsGo.toFixed(1)}°`);
  // And comfortably inside the gap at both ends, not scraping past either.
  assert.ok(tilt > ballLetsGo * 4 && tilt < boxLetsGo * 0.6,
    `${tilt}° is too near an edge of the ${ballLetsGo.toFixed(1)}–${boxLetsGo.toFixed(1)}° window`);
});

test('one rolls away and the other does not move at all', () => {
  const { world, state } = play('rolling-against-sliding', 6);
  const ball = findBody(world, 'main');
  const box = findBody(world, 'o2');

  /*
   * Measured from where they were actually placed, not from the numbers in the
   * example.
   *
   * On a slope `startPosition` rotates the placement, so a box asked for at
   * x = 2 is built at 1.96 — and comparing against the 2 made a stationary box
   * look as though it had crept four centimetres.
   */
  const started = build('fluid', state.bench).world;
  const ballWent = Math.abs(ball.pos.x - findBody(started, 'main').pos.x);
  const boxWent = Math.abs(box.pos.x - findBody(started, 'o2').pos.x);
  assert.ok(ballWent > 10, `the ball only went ${ballWent.toFixed(2)} m`);
  assert.ok(boxWent < 1e-3, `the box moved ${boxWent.toFixed(4)} m`);
  assert.ok(Math.hypot(box.vel.x, box.vel.y) < 1e-3, 'the box should be still');

  // The box is held by friction with room to spare; the ball is not held.
  const held = inspect(world, 'o2');
  assert.equal(held.contact.frictionMode, 'static');
  close(held.net.magnitude, 0, 1e-6);
  assert.ok(inspect(world, 'main').net.magnitude > 0.1, 'the ball should still be driven');
});
