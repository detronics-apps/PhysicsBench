import test from 'node:test';
import assert from 'node:assert/strict';

import { EXAMPLES, exampleById, exampleState } from '../js/examples.js';
import { STAGE_IDS, defaults } from '../js/state.js';
import { build, applyPush, featuresAt } from '../js/stages.js';
import { advance, inspect, totals, findBody } from '../js/world.js';
import { slipAngle } from '../js/friction.js';
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
