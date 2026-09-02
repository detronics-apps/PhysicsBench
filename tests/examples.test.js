import test from 'node:test';
import assert from 'node:assert/strict';

import { EXAMPLES, exampleById, exampleState } from '../js/examples.js';
import { STAGE_IDS, defaults } from '../js/state.js';
import { build, applyPush, featuresAt } from '../js/stages.js';
import { MAX_WALLS } from '../js/segments.js';
import { advance, inspect, totals, findBody, forcesFor } from '../js/world.js';
import { slipAngle, ROLLING_DEFAULT } from '../js/friction.js';
import { SHAPES, MATERIALS } from '../js/shapes.js';
import { FLUIDS } from '../js/drag.js';
import { controlForce } from '../js/control.js';
import { fieldAt } from '../js/forces.js';

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
      } else if (value && typeof value === 'object') {
        // A grouped setting such as `control`. Checked field by field rather
        // than as a whole, because migrate is entitled to fill in keys the
        // patch left out and that is not the patch being lost.
        for (const [k, v] of Object.entries(value)) {
          const got = state.bench[key]?.[k];
          if (typeof v === 'number') close(got, v, Math.max(1e-9, Math.abs(v) * 1e-9));
          else assert.equal(got, v, `${e.id}: ${key}.${k}`);
        }
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

/* ----------------------------------------- three targets, one cannon (4) -- */

/**
 * The instructions name three settings, and all three have to work.
 *
 * The first draft of this example told the reader to try 55° and to raise the
 * speed at 35°. Neither reached anything: the high shelf sits under the apex at
 * 55° and the far one is out of range at 35° whatever the speed. Written
 * instructions in a teaching app are a promise, and this is the test that keeps
 * it — change a coefficient, the drag model or the shot's mass and this fails
 * rather than the reader failing.
 */
test('the settings the example tells you to try actually hit', () => {
  const base = exampleState('target-shooting').bench;

  const fire = (angleDeg, speed) => {
    const p = { ...base, cannons: [{ ...base.cannons[0], angleDeg, speed, everySeconds: 0 }] };
    const s = build('collide', p);
    let w = applyPush(s.world, p, s.features);
    const before = ['main', 'o2', 'o3'].map((id) => ({ id, pos: { ...findBody(w, id).pos } }));
    for (let i = 0; i < 240 * 6; i += 1) { w = applyPush(w, p, s.features); w = advance(w, 1 / 240); }
    return before
      .filter(({ id, pos }) => {
        const b = findBody(w, id);
        return Math.hypot(b.pos.x - pos.x, b.pos.y - pos.y) > 0.2;
      })
      .map(({ id }) => id);
  };

  // As it opens: the middle shelf, so something happens on the first shot.
  assert.deepEqual(fire(35, 12), ['main'], 'the default shot should hit the middle shelf');
  // Seven degrees higher, same speed: the high shelf.
  assert.deepEqual(fire(42, 12), ['o2'], '42° should reach the high shelf');
  // Back to the original angle, more speed: the far shelf.
  assert.deepEqual(fire(35, 15), ['o3'], '15 m/s should reach the far shelf');
});

test('the shot arrives and stays arrived', () => {
  // A steel shot turned every trajectory into pinball — six bounces, the path
  // doubling back, targets struck by a ricochet from behind. An arc that ends
  // where it is aimed is the whole readability of this example.
  const base = exampleState('target-shooting').bench;
  assert.equal(base.cannons[0].materialId, 'clay');

  const s = build('collide', base);
  let w = applyPush(s.world, base, s.features);
  let bounces = 0;
  let wasFalling = false;
  for (let i = 0; i < 240 * 3; i += 1) {
    w = applyPush(w, base, s.features);
    w = advance(w, 1 / 240);
    const shot = w.bodies.find((b) => b.projectile);
    if (!shot) continue;
    if (wasFalling && shot.vel.y > 0.5) bounces += 1;
    wasFalling = shot.vel.y < -0.5;
  }
  assert.equal(bounces, 0, 'the default shot should fly a clean arc into its target');
});

/* ------------------------------------------------------- the rover track -- */

/**
 * The rover can be driven a lap without leaving the track.
 *
 * The point of the example is that the walls and the water are the only things
 * acting, so both have to actually work. This drives the real control force —
 * not a velocity written onto the body — through a lap, and asserts the rover
 * stays in the lane the whole way, chicanes included.
 */
test('the rover drives a lap of its track and the walls hold it', () => {
  const state = exampleState('rover-on-a-track');
  const scenario = build(state.stage, state.bench);
  assert.ok(scenario.features.has('control'), 'the step should offer control');

  // No ground and no field is exactly the test the renderer makes for a plan
  // view, so this is also what pins the example to being seen from above.
  assert.ok(!scenario.world.ground, 'deep space should have no ground');
  close(scenario.world.env?.field?.y ?? 0, 0, 1e-9);

  const plan = [['ArrowUp', 1.2], ['ArrowLeft', 3.4], ['ArrowDown', 1.6],
    ['ArrowRight', 3.6], ['ArrowUp', 1.2]];
  let world = scenario.world;
  const seen = new Set();
  for (const [key, secs] of plan) {
    const keys = new Set([key]);
    for (let i = 0; i < Math.round(secs * 240); i++) {
      const b = findBody(world, 'main');
      const f = controlForce({ mode: 'keyboard', body: b, keys,
        strength: state.bench.control.strength });
      world = { ...world,
        bodies: world.bodies.map((x) => (x.id === 'main' ? { ...x, controlForce: f } : x)) };
      world = advance(world, 1 / 240);

      const c = findBody(world, 'main');
      // Outside the outer wall, which reaches x = ±2.4 and y = ±1.65.
      assert.ok(Math.abs(c.pos.x) < 2.5 && Math.abs(c.pos.y) < 1.75,
        `left the track at (${c.pos.x.toFixed(2)}, ${c.pos.y.toFixed(2)})`);
      // A box wholly inside the island: the rover has no business in there.
      assert.ok(!(Math.abs(c.pos.x) < 1.4 && Math.abs(c.pos.y) < 0.45),
        `went through the island at (${c.pos.x.toFixed(2)}, ${c.pos.y.toFixed(2)})`);
      seen.add(`${c.pos.x >= 0 ? 'e' : 'w'}${c.pos.y >= 0 ? 'n' : 's'}`);
    }
  }
  // A lap, not a wiggle: every quarter of the circuit was visited.
  assert.equal(seen.size, 4, `only reached ${[...seen].join(', ')}`);
});

/**
 * The water is what gives the rover a top speed, and it obeys the square root.
 *
 * This is the whole teaching claim of the example and it is stated in the text
 * as a number, so it is worth holding: drag grows with the square of the speed,
 * so the speed where it balances a steady thrust grows with the square root of
 * that thrust. Nine times the engine is three times the speed, not nine.
 */
test('in water the rover settles at a top speed that goes as the root of thrust', () => {
  const state = exampleState('rover-on-a-track');
  const settle = (strength) => {
    // Open water, so the answer is about the fluid and not about a wall.
    const p = { ...state.bench, walls: [], x0: 0, dropHeight: 0 };
    let world = build(state.stage, p).world;
    const keys = new Set(['ArrowRight']);
    for (let i = 0; i < 240 * 6; i++) {
      const b = findBody(world, 'main');
      const f = controlForce({ mode: 'keyboard', body: b, keys, strength });
      world = { ...world,
        bodies: world.bodies.map((x) => (x.id === 'main' ? { ...x, controlForce: f } : x)) };
      world = advance(world, 1 / 240);
    }
    const b = findBody(world, 'main');
    return Math.hypot(b.vel.x, b.vel.y);
  };

  const base = settle(10);
  assert.ok(base > 0.5 && base < 1.2, `unexpected settled speed ${base}`);
  // Within 1%: nine times the thrust is three times the speed.
  for (const factor of [4, 9]) {
    const got = settle(10 * factor) / base;
    close(got, Math.sqrt(factor), 0.01 * Math.sqrt(factor));
  }

  // And the example ships a strength that actually settles somewhere sensible.
  const shipped = settle(state.bench.control.strength);
  assert.ok(shipped > 1 && shipped < 2, `shipped top speed ${shipped} m/s`);
});

/* ---------------------------------------------------------- the rocket -- */

/** Fly the rocket, reporting what it did on the way and how high it got. */
function launch(bench, over = {}) {
  const p = { ...bench, ...over };
  const scenario = build('fluid', p);
  let world = applyPush(scenario.world, p, scenario.features);
  let peak = 0, vBurn = 0, hBurn = 0, t100 = null, t400 = null, dragUp = 0;
  for (let i = 0; i < 240 * 900; i++) {
    world = applyPush(world, p, scenario.features);
    world = advance(world, 1 / 240);
    const b = findBody(world, 'main');
    if (t100 === null && b.pos.y >= 100000) t100 = world.t;
    if (t400 === null && b.pos.y >= 400000) t400 = world.t;
    if (world.t <= p.pushSeconds) {
      vBurn = b.vel.y; hBurn = b.pos.y;
      const F = forcesFor(world, b).forces.find((x) => x.id === 'drag');
      dragUp = Math.max(dragUp, F ? F.magnitude : 0);
    }
    peak = Math.max(peak, b.pos.y);
    if (b.pos.y <= 0 && world.t > p.pushSeconds) break;
  }
  return { peak, vBurn, hBurn, t100, t400, dragUp, world: scenario.world };
}

/**
 * The rocket arrives at the height the ISS flies at, and comes straight back.
 *
 * That is the whole example: the altitude is reachable on real thrust and a
 * real amount of fuel, and reaching it achieves nothing, because an orbit is a
 * sideways speed. Every figure the instructions invite a reader to check is
 * held here, inputs included, since they are meant to be the real ones.
 */
test('the Falcon 9 reaches ISS altitude and falls straight back', () => {
  const { bench } = exampleState('rocket-to-orbit');
  assert.equal(bench.mass, 549054, 'liftoff mass');
  assert.equal(bench.pushForce, 7607000, 'sea-level thrust');
  assert.equal(bench.pushSeconds, 370, 'burn');
  assert.equal(bench.pushAngleDeg, 90, 'straight up, which is the mistake shown');

  const r = launch(bench);
  assert.ok(r.t100 > 200 && r.t100 < 260, `crossed 100 km at ${r.t100} s`);
  assert.ok(r.t400 !== null, 'it never reached ISS altitude');
  assert.ok(r.t400 > 460 && r.t400 < 540, `reached 400 km at ${r.t400} s`);
  // Just past the ISS and no further: the burn is chosen to arrive, not to soar.
  assert.ok(r.peak > 395000 && r.peak < 425000, `apogee was ${r.peak} m`);

  // And nowhere near orbital speed - the ISS needs about 7660 m/s sideways.
  assert.ok(r.vBurn > 1400 && r.vBurn < 1700, `burnout speed ${r.vBurn} m/s`);
  assert.ok(r.vBurn < 7660 / 4, 'the whole lesson is that this is not close');
});

/**
 * At this height the weight really does visibly shrink.
 *
 * Half a percent over 16 km is honest and invisible. An eighth of the weight
 * over 408 km is the same equation finally drawn at a size the arrow shows,
 * and it is what the example claims.
 */
test('an eighth of the rocket weight is gone at the top of the climb', () => {
  const { bench } = exampleState('rocket-to-orbit');
  const r = launch(bench);
  const g0 = Math.abs(fieldAt(r.world.env, 0).y);
  const gTop = Math.abs(fieldAt(r.world.env, r.peak).y);
  const fall = 1 - gTop / g0;
  assert.ok(fall > 0.10 && fall < 0.14,
    `weight fell ${(fall * 100).toFixed(1)}%, not the ~11.7% claimed`);

  // Thrust barely beats weight on the pad, which is why a launch looks slow.
  const ratio = bench.pushForce / (bench.mass * g0);
  assert.ok(ratio > 1.35 && ratio < 1.5, `thrust to weight was ${ratio}`);
});

/**
 * Air is not what makes this hard.
 *
 * The drawn shape is much stubbier than a real rocket, so this drag is roughly
 * fifteen times the true figure - and the claim survives that, which is why it
 * is worth stating: even overstated it is a small fraction of thrust, and it is
 * gone entirely above the atmosphere.
 */
test('drag peaks at a few percent of thrust and then vanishes', () => {
  const { bench } = exampleState('rocket-to-orbit');
  const r = launch(bench);
  const share = r.dragUp / bench.pushForce;
  assert.ok(share > 0.02 && share < 0.12,
    `worst drag was ${(share * 100).toFixed(1)}% of thrust`);
});

/* ----------------------------------------------------------- the orbit -- */

/** Fly the orbit example with one setting changed, reporting what it did. */
function orbit(bench, over = {}) {
  const p = { ...bench, ...over };
  const scenario = build('two-masses', p);
  let world = scenario.world;
  let rMin = Infinity;
  let rMax = 0;
  let wound = 0;
  let last = null;
  for (let i = 0; i < 240 * 90; i += 1) {
    world = advance(world, 1 / 240);
    const m = findBody(world, 'main');
    const o = findBody(world, 'other');
    const dx = m.pos.x - o.pos.x;
    const dy = m.pos.y - o.pos.y;
    const r = Math.hypot(dx, dy);
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
    const a = Math.atan2(dy, dx);
    if (last !== null) {
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      wound += d;
    }
    last = a;
  }
  return { rMin, rMax, orbits: Math.abs(wound) / (2 * Math.PI), world };
}

/**
 * The orbit is a circle, and stays one.
 *
 * This is the example's whole claim - that a body can fall towards something
 * for ever without arriving. If the separation drifts, it is spiralling rather
 * than orbiting and the lesson is wrong.
 */
test('the small mass circles the large one without falling in or leaving', () => {
  const { bench } = exampleState('two-in-orbit');
  const r = orbit(bench);
  assert.ok(r.orbits > 4, `only ${r.orbits.toFixed(2)} orbits in 90 s`);
  // Circular: the separation barely moves across four and a half laps.
  assert.ok(r.rMin > 2.99 && r.rMax < 3.06,
    `separation ranged ${r.rMin.toFixed(3)}-${r.rMax.toFixed(3)} m`);
});

/**
 * The three settings the instructions ask a reader to try do what they say.
 *
 * Too slow falls in, too fast climbs away, and the shipped speed is the one in
 * between. An instruction that does not do what it promises is worse than no
 * instruction.
 */
test('slower falls in, faster climbs away, and the shipped speed is neither', () => {
  const { bench } = exampleState('two-in-orbit');

  // Straight down: with nothing sideways it should arrive.
  const dropped = orbit(bench, { v0: 0 });
  assert.ok(dropped.rMin < 1, `standing still it only closed to ${dropped.rMin.toFixed(2)} m`);

  // Too slow: an ellipse, so the separation must swing rather than hold.
  const slow = orbit(bench, { v0: 0.6 });
  assert.ok(slow.rMax - slow.rMin > 0.5,
    `0.6 m/s held a near-circle: ${slow.rMin.toFixed(2)}-${slow.rMax.toFixed(2)} m`);
  assert.ok(slow.rMin < bench.y0, 'a slow orbit should dive closer than it started');

  // Too fast: it leaves, and does not come back within the run.
  const fast = orbit(bench, { v0: 1.4 });
  assert.ok(fast.rMax > 2 * bench.y0,
    `1.4 m/s only reached ${fast.rMax.toFixed(2)} m`);
});

/**
 * Both masses move, which is the part a diagram never shows.
 *
 * The 81:1 ratio is the Earth against its Moon, and it is chosen so the large
 * mass visibly swings rather than sitting still.
 */
test('the large mass moves too, so the orbit is mutual', () => {
  const { bench } = exampleState('two-in-orbit');
  const scenario = build('two-masses', bench);
  const start = findBody(scenario.world, 'other').pos;
  let world = scenario.world;
  let moved = 0;
  for (let i = 0; i < 240 * 20; i += 1) {
    world = advance(world, 1 / 240);
    const o = findBody(world, 'other');
    moved = Math.max(moved, Math.hypot(o.pos.x - start.x, o.pos.y - start.y));
  }
  assert.ok(moved > 0.02, `the large mass only moved ${moved.toFixed(3)} m`);
  // The ratio is Earth to Moon, near enough.
  const ratio = bench.otherMass / bench.mass;
  assert.ok(ratio > 75 && ratio < 85, `mass ratio was ${ratio.toFixed(1)}:1`);
});

/* ------------------------------------------------------- four dropped -- */

/** Drop all four and report when each one arrives, and how fast. */
function dropAll(bench, fluidId) {
  const p = { ...bench, fluidId };
  const scenario = build('fluid', p);
  let world = applyPush(scenario.world, p, scenario.features);
  const landed = {};
  const speed = {};
  for (let i = 0; i < 240 * 30; i += 1) {
    world = applyPush(world, p, scenario.features);
    world = advance(world, 1 / 240);
    for (const b of world.bodies) {
      if (landed[b.id] === undefined && b.pos.y < p.size + 0.05) {
        landed[b.id] = world.t;
        speed[b.id] = Math.abs(b.vel.y);
      }
    }
    if (Object.keys(landed).length === 4) break;
  }
  return { landed, speed };
}

/**
 * In air the four separate, and each gap is caused by one thing.
 *
 * The example is a pair of controlled comparisons: two objects share a mass and
 * differ in shape, three share a shape and differ in mass. If those pairs stop
 * being controlled - a size drifting, a material changing the mass - the
 * instructions stop being true, so the setup is checked as well as the result.
 */
test('the four fall at different rates in air, and the pairs are controlled', () => {
  const { bench } = exampleState('four-dropped-together');
  const byId = Object.fromEntries(bench.objects.map((o) => [o.id, o]));

  // Same mass, different shape.
  assert.equal(byId.o2.mass, bench.mass, 'the plate must share the sphere mass');
  assert.notEqual(byId.o2.shapeId, bench.shapeId);
  assert.equal(byId.o2.size, bench.size, 'and its size, or shape is not the only change');
  // Same shape, different mass.
  for (const id of ['o3', 'o4']) {
    assert.equal(byId[id].shapeId, bench.shapeId, `${id} must share the sphere shape`);
    assert.equal(byId[id].size, bench.size, `${id} must share the sphere size`);
    assert.notEqual(byId[id].mass, bench.mass);
  }

  const { landed } = dropAll(bench, 'air');
  // Heaviest first, lightest last, plate between its own mass and the light one.
  assert.ok(landed.o3 < landed.main, 'the 5 kg sphere should land before the 1 kg');
  assert.ok(landed.main < landed.o2, 'the sphere should beat the plate of the same mass');
  assert.ok(landed.o2 < landed.o4, 'the plate should beat the 0.15 kg sphere');
  // And the spread is big enough to see.
  assert.ok(landed.o4 - landed.o3 > 3,
    `only ${(landed.o4 - landed.o3).toFixed(2)} s between first and last`);
});

/**
 * In vacuum they land together - not nearly, exactly.
 *
 * This is the claim the example rests on, and the one a reader is told to
 * check by changing a single setting.
 */
test('in a vacuum all four land at the same moment and the same speed', () => {
  const { bench } = exampleState('four-dropped-together');
  const { landed, speed } = dropAll(bench, 'vacuum');
  const times = Object.values(landed);
  const speeds = Object.values(speed);
  assert.equal(times.length, 4, 'all four should land');
  assert.ok(Math.max(...times) - Math.min(...times) < 0.02,
    `landing times spread by ${(Math.max(...times) - Math.min(...times)).toFixed(3)} s`);
  assert.ok(Math.max(...speeds) - Math.min(...speeds) < 0.2,
    `landing speeds spread by ${(Math.max(...speeds) - Math.min(...speeds)).toFixed(2)} m/s`);
});

/* ------------------------------------------------------ the marble run -- */

/**
 * All three marbles run the whole fifty metres, and none of them escapes.
 *
 * This is the test the track was built against, and it caught every version
 * that did not work: ramps that stopped short of a wall and left a V to wedge
 * in, features that turned so far their last section climbed, bowls deep
 * enough to rattle a marble instead of passing it on, and a final curl that
 * jammed one against the wall four metres up. None of that is visible in the
 * geometry - only in whether a marble arrives.
 */
test('three marbles run the whole fifty metres and none escapes', () => {
  const { bench } = exampleState('marble-run');
  const scenario = build('collide', bench);
  let world = applyPush(scenario.world, bench, scenario.features);

  const lowest = {};
  const fastest = {};
  const endedAt = {};
  let escaped = null;
  for (let i = 0; i < 240 * 100; i += 1) {
    world = applyPush(world, bench, scenario.features);
    world = advance(world, 1 / 240);
    for (const b of world.bodies) {
      lowest[b.id] = Math.min(lowest[b.id] ?? b.pos.y, b.pos.y);
      fastest[b.id] = Math.max(fastest[b.id] ?? 0, Math.hypot(b.vel.x, b.vel.y));
      endedAt[b.id] = b.pos.x;
      // The walls stand at x = +/-13 and the floor is at 0.
      if (!escaped && (Math.abs(b.pos.x) > 13.6 || b.pos.y < -1)) {
        escaped = `${b.id} at (${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)})`;
      }
    }
  }
  assert.equal(escaped, null, `a marble left the run: ${escaped}`);
  assert.equal(world.bodies.length, 3, 'all three should still be here');

  for (const id of ['main', 'o2', 'o3']) {
    // All the way to the floor, from above fifty metres.
    assert.ok(lowest[id] < 0.6, `${id} only got down to ${lowest[id].toFixed(1)} m`);
    // And it was a run rather than a drop down the side.
    assert.ok(fastest[id] > 10, `${id} never got above ${fastest[id].toFixed(1)} m/s`);
    assert.ok(fastest[id] < 32, `${id} reached ${fastest[id].toFixed(1)} m/s, which is a free fall`);
  }
});

/**
 * The three finish apart, which is the point of the loose plates.
 *
 * They are identical balls released a second apart from almost the same place
 * on a track with nothing random in it. If they arrived together the run would
 * be a chute with extra steps.
 */
test('identical marbles finish in different places', () => {
  const { bench } = exampleState('marble-run');
  const scenario = build('collide', bench);
  let world = applyPush(scenario.world, bench, scenario.features);
  for (let i = 0; i < 240 * 100; i += 1) {
    world = applyPush(world, bench, scenario.features);
    world = advance(world, 1 / 240);
  }
  const xs = world.bodies.map((b) => b.pos.x);
  const spread = Math.max(...xs) - Math.min(...xs);
  assert.ok(spread > 4, `they finished ${spread.toFixed(1)} m apart, which is together`);
});

/**
 * The track is enough pieces to be a track, of both kinds, inside the limit.
 *
 * Where pieces are meant to chain - the ramps and curves - a gap of less than
 * a millimetre would be invisible in the drawing and drop a marble straight
 * through, so a near-miss join is treated as a fault. The plates hung in open
 * air are deliberately not attached to anything.
 */
test('the marble run is built from straight and curved pieces, within the limit', () => {
  const { bench } = exampleState('marble-run');
  const walls = bench.walls;
  assert.ok(walls.length >= 30, `only ${walls.length} pieces`);
  assert.ok(walls.length <= MAX_WALLS, `${walls.length} pieces is over the limit of ${MAX_WALLS}`);
  assert.ok(walls.filter((w) => w.bulge !== 0).length >= 8, 'a marble run wants curves');
  assert.ok(walls.filter((w) => w.bulge === 0).length >= 15, 'and straights');

  for (let i = 1; i < walls.length; i += 1) {
    const gap = Math.hypot(walls[i].x1 - walls[i - 1].x2, walls[i].y1 - walls[i - 1].y2);
    assert.ok(gap < 1e-6 || gap > 0.2,
      `piece ${i} sits ${gap.toFixed(4)} m from the last - joined or clear, not nearly`);
  }

  // It really is fifty metres tall.
  const ys = walls.flatMap((w) => [w.y1, w.y2]);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 48,
    `the run is only ${(Math.max(...ys) - Math.min(...ys)).toFixed(0)} m tall`);
});

/* ---------------------------------------------------- the arcade level -- */

/** Drive the rover right for `seconds`, reporting how far it got. */
function driveLevel(bench, seconds = 30) {
  const scenario = build('collide', bench);
  let world = applyPush(scenario.world, bench, scenario.features);
  const keys = new Set(['ArrowRight']);
  let furthest = -Infinity;
  let fellAt = null;
  for (let i = 0; i < 240 * seconds; i += 1) {
    const b = findBody(world, 'main');
    const f = controlForce({
      mode: 'keyboard', body: b, keys, strength: bench.control.strength,
    });
    world = { ...world,
      bodies: world.bodies.map((x) => (x.id === 'main' ? { ...x, controlForce: f } : x)) };
    world = applyPush(world, bench, scenario.features);
    world = advance(world, 1 / 240);
    const c = findBody(world, 'main');
    furthest = Math.max(furthest, c.pos.x);
    if (fellAt === null && c.pos.y < 0.6) fellAt = c.pos.x;
  }
  return { furthest, fellAt };
}

/**
 * The level can actually be completed.
 *
 * Every version that could not was broken in a way the geometry did not show:
 * a section whose last piece pointed downhill dropped the rover into the gap
 * instead of launching it, and a landing shelf placed higher than the ledge
 * before it simply could not be reached. Only driving it finds those.
 */
test('the rover can drive the whole arcade level without falling in', () => {
  const { bench } = exampleState('rover-arcade');
  const { furthest, fellAt } = driveLevel(bench);
  assert.equal(fellAt, null, `the rover fell into the canyon at x = ${fellAt}`);
  // The finish post stands at x = 45.8.
  assert.ok(furthest > 44, `it only reached x = ${furthest.toFixed(1)}`);
});

/**
 * A weak engine cannot finish the level.
 *
 * Not because it falls in - a rover that creeps up to a gap stops at the edge,
 * which is what the geometry does rather than what I first assumed. It simply
 * never gets across, so the jump really is bought with speed.
 */
test('a rover without the engine for it never reaches the finish', () => {
  const { bench } = exampleState('rover-arcade');
  const weak = { ...bench, control: { ...bench.control, strength: 3 } };
  const { furthest } = driveLevel(weak, 30);
  assert.ok(furthest < 0, `a weak rover still reached x = ${furthest.toFixed(1)}`);
  // And it did get moving - this is about the jump, not about being stuck.
  assert.ok(furthest > -14, `it barely moved, reaching only x = ${furthest.toFixed(1)}`);
});

/**
 * The gaps are sized against what the rover can actually jump.
 *
 * About 2.9 m off a twenty-degree kicker at six metres a second, so a gap much
 * past three is not a challenge but a wall. This holds the geometry to that
 * without needing to drive it.
 */
test('every gap in the level is inside the rover jumping range', () => {
  const { bench } = exampleState('rover-arcade');
  const walls = bench.walls;
  assert.ok(walls.length >= 20, `only ${walls.length} pieces`);
  assert.ok(walls.length <= MAX_WALLS, `${walls.length} pieces is over the limit`);

  // Consecutive pieces either join, or are a gap the rover has to jump.
  let biggest = 0;
  for (let i = 1; i < walls.length; i += 1) {
    const gap = Math.hypot(walls[i].x1 - walls[i - 1].x2, walls[i].y1 - walls[i - 1].y2);
    if (gap > 1e-6 && gap < 6) biggest = Math.max(biggest, gap);
  }
  assert.ok(biggest > 1, `the widest gap is ${biggest.toFixed(1)} m, which is a seam not a jump`);
  assert.ok(biggest < 3, `the widest gap is ${biggest.toFixed(1)} m, past what the rover can carry`);
});

/* ----------------------------------------------------- the space slalom -- */

/** Fly the slalom with a fixed key held, reporting where it ends up. */
function flySlalom(bench, key = null, seconds = 30) {
  const scenario = build('collide', bench);
  let world = applyPush(scenario.world, bench, scenario.features);
  const keys = key ? new Set([key]) : new Set();
  let stopped = null;
  for (let i = 0; i < 240 * seconds; i += 1) {
    const b = findBody(world, 'main');
    const f = controlForce({
      mode: 'keyboard', body: b, keys, strength: bench.control.strength,
    });
    world = { ...world,
      bodies: world.bodies.map((x) => (x.id === 'main' ? { ...x, controlForce: f } : x)) };
    world = applyPush(world, bench, scenario.features);
    world = advance(world, 1 / 240);
  }
  const end = findBody(world, 'main');
  return { x: end.pos.x, y: end.pos.y, v: Math.hypot(end.vel.x, end.vel.y), stopped };
}

/**
 * The corridor is a course, not a tube.
 *
 * Flying straight down the centre line has to fail, or there is no game in it.
 * The first version left the middle clear at every gate and could be completed
 * by doing nothing at all.
 */
test('flying straight down the middle does not get through', () => {
  const { bench } = exampleState('space-slalom');
  const straight = flySlalom(bench, null, 30);
  // The finish gate stands at x = 50; it should be stopped well before that.
  assert.ok(straight.x < 0, `coasting straight reached x = ${straight.x.toFixed(1)}`);
});

/**
 * The keys have enough authority to cross a gate, and no more.
 *
 * Every gate leaves six metres, and they are fifteen apart - about three
 * seconds at flying speed. If steering could not cross six metres in that, the
 * course would be impossible; if it crossed it instantly there would be
 * nothing to it.
 */
test('steering can cross a gate in the time between gates', () => {
  const { bench } = exampleState('space-slalom');
  const up = flySlalom(bench, 'ArrowUp', 3);
  const down = flySlalom(bench, 'ArrowDown', 3);
  assert.ok(up.y > 5, `three seconds of up only moved ${up.y.toFixed(1)} m`);
  assert.ok(down.y < -5, `three seconds of down only moved ${down.y.toFixed(1)} m`);
  // Not so much that a tap throws it out of the corridor.
  const tap = flySlalom(bench, 'ArrowUp', 0.5);
  assert.ok(Math.abs(tap.y) < 1, `half a second of up moved it ${tap.y.toFixed(2)} m`);
});

/**
 * Nothing takes speed away, which is the lesson.
 *
 * No drag, no gravity, no ground - so the engine's push accumulates and a
 * sideways drift, once started, stays. If any of that stopped being true the
 * example would be teaching the opposite of what it says.
 */
test('nothing in the slalom removes speed', () => {
  const { bench } = exampleState('space-slalom');
  assert.equal(bench.worldMode, 'space');
  assert.equal(bench.fluidId, 'vacuum');

  // A tap of up, then nothing: the sideways drift must still be there.
  const scenario = build('collide', bench);
  let world = applyPush(scenario.world, bench, scenario.features);
  const keys = new Set(['ArrowUp']);
  for (let i = 0; i < 240; i += 1) {
    const b = findBody(world, 'main');
    const f = controlForce({ mode: 'keyboard', body: b, keys, strength: bench.control.strength });
    world = { ...world,
      bodies: world.bodies.map((x) => (x.id === 'main' ? { ...x, controlForce: f } : x)) };
    world = applyPush(world, bench, scenario.features);
    world = advance(world, 1 / 240);
  }
  const after = findBody(world, 'main').vel.y;
  assert.ok(after > 1, `a second of thrust only gave ${after.toFixed(2)} m/s`);

  // Now let go for three seconds. It must still be climbing at the same rate.
  for (let i = 0; i < 240 * 3; i += 1) {
    world = { ...world,
      bodies: world.bodies.map((x) => (x.id === 'main' ? { ...x, controlForce: { x: 0, y: 0 } } : x)) };
    world = applyPush(world, bench, scenario.features);
    world = advance(world, 1 / 240);
  }
  const later = findBody(world, 'main').vel.y;
  close(later, after, 1e-9);
});
