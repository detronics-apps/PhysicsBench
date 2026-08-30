import test from 'node:test';
import assert from 'node:assert/strict';

import { vec, len } from '../js/vec.js';
import { G_STANDARD } from '../js/constants.js';
import {
  body, createWorld, groundNormal, groundGap, forcesFor,
  advance, step, findBody, inspect, totals, snapshot, restore,
} from '../js/world.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const g = G_STANDARD;

/** Run a world forward by `seconds` in frame-sized chunks, as the app does. */
const run = (world, seconds, frame = 1 / 60) => {
  let w = world;
  for (let t = 0; t < seconds - 1e-12; t += frame) w = advance(w, Math.min(frame, seconds - t));
  return w;
};

test('a body fills in sensible defaults from very little', () => {
  const b = body({ mass: 4 });
  assert.equal(b.kind, 'ball');
  assert.ok(b.radius > 0);
  assert.ok(b.area > 0);
  assert.ok(b.id.length > 1);
  assert.deepEqual(b.vel, { x: 0, y: 0 });
  // A heavier ball is drawn bigger, but not proportionally bigger.
  assert.ok(body({ mass: 40 }).radius > b.radius);
  assert.ok(body({ mass: 40 }).radius < b.radius * 4);
  // Nonsense is corrected rather than propagated.
  assert.equal(body({ mass: -3 }).mass, 1);
  assert.equal(body({ restitution: 5 }).restitution, 1);
});

test('stepping never mutates the world it was given', () => {
  const w = createWorld({ bodies: [{ id: 'a', pos: vec(0, 10) }], ground: { y: 0 } });
  const before = JSON.stringify(w);
  const after = step(w, 0.01);
  assert.equal(JSON.stringify(w), before);
  assert.notEqual(after, w);
  assert.notEqual(after.bodies[0], w.bodies[0]);
});

test('a dropped ball falls at g, whatever its mass', () => {
  const drop = (mass) => {
    const w = createWorld({
      bodies: [{ id: 'a', mass, pos: vec(0, 100), cd: 0, area: 0 }],
      ground: { y: 0 },
      fluidDensity: 0,
    });
    return run(w, 1);
  };
  const light = findBody(drop(0.5), 'a');
  const heavy = findBody(drop(50), 'a');

  // v = g·t after one second, and the two masses agree exactly.
  close(light.vel.y, -g, 0.02);
  close(heavy.vel.y, light.vel.y, 1e-9);
  close(heavy.pos.y, light.pos.y, 1e-9);
  close(light.pos.y, 100 - 0.5 * g * 1, 0.05);
});

test('with air resistance, the heavier of two identical balls falls faster', () => {
  // The correction to the misconception: not because gravity pulls it harder,
  // but because it takes more drag to balance more weight.
  const drop = (mass) => run(createWorld({
    bodies: [{ id: 'a', mass, radius: 0.1, cd: 0.47, area: Math.PI * 0.01, pos: vec(0, 300) }],
    ground: { y: 0 },
    fluidDensity: 1.225,
  }), 6);

  const light = findBody(drop(0.05), 'a');
  const heavy = findBody(drop(5), 'a');
  assert.ok(heavy.pos.y < light.pos.y, 'the heavy one should be lower after 6 s');
  assert.ok(Math.abs(heavy.vel.y) > Math.abs(light.vel.y));
});

test('a light ball in air reaches its terminal speed and stops accelerating', () => {
  const w = run(createWorld({
    bodies: [{ id: 'a', mass: 0.02, radius: 0.1, cd: 0.47, area: Math.PI * 0.01, pos: vec(0, 500) }],
    ground: { y: 0 },
    fluidDensity: 1.225,
  }), 12);
  const b = findBody(w, 'a');
  /*
   * The weight that drag has to balance is the *buoyant* weight, not mg.
   *
   * This ball is 20 cm across and weighs 20 grams, which makes it about four
   * times the density of air — so the air is holding up a quarter of it before
   * it has moved at all, and its terminal speed is measurably lower than the
   * mg version of the formula predicts. Using mg here would be the same mistake
   * as quoting a helium balloon's terminal speed downwards.
   */
  const volume = (4 / 3) * Math.PI * 0.1 ** 3;
  const buoyantWeight = (0.02 - 1.225 * volume) * g;
  const expected = Math.sqrt(buoyantWeight / (0.5 * 1.225 * 0.47 * Math.PI * 0.01));
  close(Math.abs(b.vel.y), expected, 0.05);
  // And it really is different from the naive answer, or this test proves nothing.
  const ignoringBuoyancy = Math.sqrt((0.02 * g) / (0.5 * 1.225 * 0.47 * Math.PI * 0.01));
  assert.ok(ignoringBuoyancy - expected > 0.3);
  // Net force has fallen to nothing: that is what terminal speed means.
  assert.ok(len(forcesFor(w, b).net.vec) < 1e-3);
});

test('a ball settles on the ground instead of sinking or jittering', () => {
  const w = run(createWorld({
    bodies: [{ id: 'a', mass: 1, radius: 0.2, pos: vec(0, 3), restitution: 0, cd: 0, area: 0 }],
    ground: { y: 0, restitution: 0 },
  }), 4);
  const b = findBody(w, 'a');
  close(b.pos.y, 0.2, 1e-3);
  close(b.vel.y, 0, 1e-3);
  // And it is genuinely at rest, not being held up by a fight between forces.
  assert.ok(len(forcesFor(w, b).net.vec) < 1e-6);
});

test('a perfectly elastic bounce returns almost all of the drop height', () => {
  const w = createWorld({
    bodies: [{ id: 'a', mass: 1, radius: 0.1, pos: vec(0, 2), restitution: 1, cd: 0, area: 0 }],
    ground: { y: 0, restitution: 1 },
  });
  let highest = 0;
  let current = w;
  for (let i = 0; i < 400; i += 1) {
    current = advance(current, 1 / 120, 0.0005);
    if (current.t > 0.8) highest = Math.max(highest, findBody(current, 'a').pos.y);
  }
  // Back to within a few percent of where it started.
  assert.ok(highest > 1.85, `only reached ${highest}`);
  assert.ok(highest <= 2.001);
});

test('a dead bounce keeps the energy on the books rather than deleting it', () => {
  const w = run(createWorld({
    bodies: [{ id: 'a', mass: 2, radius: 0.1, pos: vec(0, 5), restitution: 0, cd: 0, area: 0 }],
    ground: { y: 0, restitution: 0 },
  }), 3);
  const sums = totals(w);
  close(sums.kinetic, 0, 1e-3);
  // The 2 × g × 4.9 J it started with has become impact energy, not nothing.
  assert.ok(sums.elsewhere.impact > 90, `impact ledger was ${sums.elsewhere.impact}`);
  close(sums.total, 2 * g * 5, 1);
});

test('a sliding box decelerates at μk·g and stops without reversing', () => {
  const w = createWorld({
    bodies: [{ id: 'a', kind: 'box', mass: 3, width: 0.4, height: 0.4, pos: vec(0, 0.2), vel: vec(6, 0), cd: 0, area: 0, muS: 0.5, muK: 0.3 }],
    ground: { y: 0, muS: 0.5, muK: 0.3, restitution: 0 },
  });

  // After 1 s: v = 6 − μk·g·1.
  const after1 = findBody(run(w, 1), 'a');
  close(after1.vel.x, 6 - 0.3 * g, 0.05);

  // It stops, and stays stopped — friction must not push it backwards.
  const settled = findBody(run(w, 6), 'a');
  close(settled.vel.x, 0, 1e-3);
  const later = findBody(run(w, 10), 'a');
  close(later.pos.x, settled.pos.x, 1e-3);
  assert.ok(settled.pos.x > 5 && settled.pos.x < 7, `stopped at ${settled.pos.x}`);
});

test('friction turns the kinetic energy into heat, and the books balance', () => {
  const start = createWorld({
    bodies: [{ id: 'a', kind: 'box', mass: 3, width: 0.4, height: 0.4, pos: vec(0, 0.2), vel: vec(6, 0), cd: 0, area: 0, muS: 0.5, muK: 0.3 }],
    ground: { y: 0, muS: 0.5, muK: 0.3, restitution: 0 },
  });
  const before = totals(start);
  const after = totals(run(start, 6));
  close(after.kinetic, 0, 1e-2);
  close(after.elsewhere.heat, before.kinetic, 0.5);
  close(after.total, before.total, 0.5);
});

test('a box on a ramp too shallow for it to slide does not move', () => {
  // tan(15°) = 0.27, below μs = 0.6.
  const w = createWorld({
    bodies: [{ id: 'a', kind: 'box', mass: 2, width: 0.3, height: 0.3, pos: vec(0, 0.16), cd: 0, area: 0, muS: 0.6, muK: 0.5 }],
    ground: { y: 0, slopeDeg: 15, muS: 0.6, muK: 0.5, restitution: 0 },
  });
  const after = findBody(run(w, 3), 'a');
  assert.ok(len(after.vel) < 1e-2, `it crept at ${len(after.vel)} m/s`);
});

test('a box on a steep enough ramp accelerates at g(sinθ − μk cosθ)', () => {
  const slopeDeg = 40;
  const rad = (slopeDeg * Math.PI) / 180;
  const w = createWorld({
    bodies: [{ id: 'a', kind: 'box', mass: 2, width: 0.3, height: 0.3, pos: vec(0, 0.16), cd: 0, area: 0, muS: 0.2, muK: 0.2 }],
    ground: { y: 0, slopeDeg, muS: 0.2, muK: 0.2, restitution: 0 },
  });
  const after = findBody(run(w, 1), 'a');
  const expected = g * (Math.sin(rad) - 0.2 * Math.cos(rad));
  close(len(after.vel), expected, 0.15);
  // And it slides down the slope, not through it. A positive slope angle rises
  // to the right, so downhill is to the left.
  assert.ok(after.vel.x < 0 && after.vel.y < 0);
});

test('the ground normal follows the slope', () => {
  assert.deepEqual(groundNormal(null), { x: 0, y: 1 });
  const flat = groundNormal({ slopeDeg: 0 });
  close(flat.x, 0, 1e-12);
  close(flat.y, 1, 1e-12);
  const ramp = groundNormal({ slopeDeg: 30 });
  close(ramp.y, Math.cos(Math.PI / 6), 1e-12);
  assert.ok(ramp.x < 0, 'the normal leans back up the slope');

  const b = body({ radius: 0.5, pos: vec(0, 0.5) });
  close(groundGap({ y: 0, slopeDeg: 0 }, b), 0, 1e-12);
  assert.equal(groundGap(null, b), Infinity);
});

test('two carts colliding conserve momentum exactly', () => {
  const w = createWorld({
    bodies: [
      { id: 'a', kind: 'cart', mass: 1, width: 0.3, radius: 0.15, pos: vec(-2, 0.15), vel: vec(4, 0), cd: 0, area: 0, muS: 0, muK: 0 },
      { id: 'b', kind: 'cart', mass: 3, width: 0.3, radius: 0.15, pos: vec(2, 0.15), vel: vec(-1, 0), cd: 0, area: 0, muS: 0, muK: 0 },
    ],
    ground: { y: 0, muS: 0, muK: 0, restitution: 0 },
    bodyCollisions: true,
    collisionRestitution: 1,
  });

  const before = totals(w);
  const after = totals(run(w, 3));
  close(after.momentumX, before.momentumX, 1e-6);
  // Elastic, so kinetic energy is conserved too.
  close(after.kinetic, before.kinetic, 1e-3);
});

test('an inelastic collision conserves momentum but not kinetic energy', () => {
  const make = (e) => createWorld({
    bodies: [
      { id: 'a', kind: 'cart', mass: 1, width: 0.3, radius: 0.15, pos: vec(-1, 0.15), vel: vec(5, 0), cd: 0, area: 0, muS: 0, muK: 0 },
      { id: 'b', kind: 'cart', mass: 2, width: 0.3, radius: 0.15, pos: vec(1, 0.15), vel: vec(0, 0), cd: 0, area: 0, muS: 0, muK: 0 },
    ],
    ground: { y: 0, muS: 0, muK: 0, restitution: 0 },
    bodyCollisions: true,
    collisionRestitution: e,
  });

  const w = make(0);
  const before = totals(w);
  const done = run(w, 2);
  const after = totals(done);
  close(after.momentumX, before.momentumX, 1e-6);
  assert.ok(after.kinetic < before.kinetic * 0.9);
  // And the missing energy is on the ledger, not missing.
  close(after.total, before.total, 1e-3);
  // Both carts end up moving together at the centre-of-mass speed.
  const [a, b] = done.bodies;
  close(a.vel.x, b.vel.x, 1e-6);
  close(a.vel.x, 5 / 3, 1e-6);
});

test('a collision is reported as an event with its before and after', () => {
  let w = createWorld({
    bodies: [
      { id: 'a', kind: 'cart', mass: 1, width: 0.2, radius: 0.1, pos: vec(-0.5, 0.1), vel: vec(3, 0), cd: 0, area: 0, muS: 0, muK: 0 },
      { id: 'b', kind: 'cart', mass: 1, width: 0.2, radius: 0.1, pos: vec(0.5, 0.1), vel: vec(-3, 0), cd: 0, area: 0, muS: 0, muK: 0 },
    ],
    ground: { y: 0, muS: 0, muK: 0, restitution: 0 },
    bodyCollisions: true,
    collisionRestitution: 1,
  });

  let event = null;
  for (let i = 0; i < 400 && !event; i += 1) {
    w = advance(w, 1 / 120, 0.0005);
    event = w.events.find((e) => e.type === 'collision');
  }
  assert.ok(event, 'the collision should be reported');
  close(event.before.momentum, event.after.momentum, 1e-9);
  close(event.energyTransferred, 0, 1e-9);
  assert.deepEqual(event.between, ['a', 'b']);
});

test('a fixed body is immovable and does not fall', () => {
  const w = run(createWorld({
    bodies: [{ id: 'wall', fixed: true, pos: vec(3, 1), mass: 1000 }],
    ground: { y: 0 },
  }), 2);
  assert.deepEqual(findBody(w, 'wall').pos, { x: 3, y: 1 });
});

test('walls turn a body around', () => {
  const w = run(createWorld({
    bodies: [{ id: 'a', radius: 0.1, pos: vec(0, 0.1), vel: vec(5, 0), cd: 0, area: 0, muS: 0, muK: 0 }],
    ground: { y: 0, muS: 0, muK: 0, restitution: 0 },
    bounds: { left: -2, right: 2, restitution: 1 },
  }), 0.6);
  // It reaches the right wall at x = 1.9 after 0.38 s and comes back.
  const b = findBody(w, 'a');
  assert.ok(b.pos.x <= 1.9 + 1e-9 && b.pos.x >= -1.9 - 1e-9, `escaped to ${b.pos.x}`);
  assert.ok(b.vel.x < 0, 'it should have turned round');
  close(Math.abs(b.vel.x), 5, 1e-6);
});

test('inspect returns exactly what the panel and the arrows both draw from', () => {
  const w = createWorld({
    bodies: [{ id: 'a', mass: 2, radius: 0.2, pos: vec(1, 5), vel: vec(3, -4), cd: 0, area: 0 }],
    ground: { y: 0 },
  });
  const i = inspect(w, 'a');
  close(i.speed, 5);
  close(i.kinetic, 25);
  close(i.weight, 2 * g);
  close(i.momentum.x, 6);
  close(i.momentum.y, -8);
  close(i.acceleration.y, -g, 1e-9);
  close(i.heightAboveGround, 5);
  assert.equal(i.forces.length, 1);
  assert.equal(inspect(w, 'nope'), null);
});

test('a snapshot can be restored exactly — the timeline scrubber depends on it', () => {
  const w = createWorld({
    bodies: [{ id: 'a', mass: 1, pos: vec(0, 10), cd: 0, area: 0 }],
    ground: { y: 0 },
    trailLimit: 50,
  });
  const mark = snapshot(run(w, 0.5));
  const later = run(restore(w, mark), 0.5);
  const again = run(restore(w, mark), 0.5);

  // Deterministic: the same start gives the same finish, every time.
  close(findBody(later, 'a').pos.y, findBody(again, 'a').pos.y, 1e-12);
  // And the snapshot is a copy, not a view: stepping on does not rewrite it.
  close(mark.bodies[0].pos.y, 10 - 0.5 * g * 0.25, 0.02);
});

test('trails are recorded only when asked for, and are capped', () => {
  const without = run(createWorld({ bodies: [{ id: 'a', pos: vec(0, 5) }], ground: { y: 0 } }), 1);
  assert.equal(findBody(without, 'a').trail.length, 0);

  const with_ = run(createWorld({
    bodies: [{ id: 'a', pos: vec(0, 50), cd: 0, area: 0 }], ground: { y: 0 }, trailLimit: 20,
  }), 2);
  assert.equal(findBody(with_, 'a').trail.length, 20);
});


/* ----------------------------------------------------------------- walls -- */

test('a drawn wall holds a body up exactly as the ground does', () => {
  const drop = (spec) => {
    let w = createWorld(spec);
    for (let i = 0; i < 1500; i += 1) w = step(w, 1 / 500);
    return findBody(w, 'a');
  };
  const body = { id: 'a', mass: 1, radius: 0.2, pos: vec(0, 2), restitution: 0.5, cd: 0, area: 0 };

  const onGround = drop({ bodies: [body], ground: { y: 0, restitution: 0.5 }, walls: [] });
  const onWall = drop({
    bodies: [body], ground: null,
    walls: [{ x1: -5, y1: 0, x2: 5, y2: 0, restitution: 0.5, mu: 0.5 }],
  });

  // Two contact routines would eventually disagree. There is one.
  close(onWall.pos.y, onGround.pos.y, 1e-6);
  close(onWall.vel.y, onGround.vel.y, 1e-6);
  close(onWall.pos.y, 0.2, 1e-6);
});

test('a body rolls off the end of a wall rather than off an infinite line', () => {
  let w = createWorld({
    bodies: [{ id: 'a', mass: 1, radius: 0.2, pos: vec(0, 0.2), vel: vec(4, 0), cd: 0, area: 0, muS: 0, muK: 0 }],
    ground: null,
    walls: [{ x1: -1, y1: 0, x2: 1, y2: 0, restitution: 0, mu: 0 }],
  });
  for (let i = 0; i < 600; i += 1) w = step(w, 1 / 500);
  const b = findBody(w, 'a');
  // Past the end of the wall and falling. A segment has ends; that is the point.
  assert.ok(b.pos.x > 1);
  assert.ok(b.pos.y < 0);
});

test('a body settles in a corner instead of being squeezed out of it', () => {
  let w = createWorld({
    bodies: [{ id: 'a', mass: 1, radius: 0.2, pos: vec(0.5, 1), vel: vec(-3, 0), restitution: 0, cd: 0, area: 0 }],
    ground: null,
    walls: [
      { x1: -2, y1: 0, x2: 2, y2: 0, restitution: 0, mu: 0.6 },
      { x1: 0, y1: 0, x2: 0, y2: 3, restitution: 0, mu: 0.6 },
    ],
  });
  for (let i = 0; i < 2000; i += 1) w = step(w, 1 / 500);
  const b = findBody(w, 'a');
  assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y));
  // Resting on the floor, clear of the upright, and not vibrating.
  close(b.pos.y, 0.2, 0.02);
  assert.ok(b.pos.x >= 0.2 - 0.02);
  assert.ok(Math.hypot(b.vel.x, b.vel.y) < 0.05);
});

test('a cannon fires on a schedule and stops at the body limit', () => {
  let w = createWorld({
    bodies: [{ id: 'a', mass: 1, radius: 0.1, pos: vec(-10, 0), cd: 0, area: 0 }],
    ground: null,
    g: 0,
    field: vec(0, 0),
    maxBodies: 5,
    cannons: [{ id: 'c1', x: 0, y: 0, angleDeg: 0, speed: 3, everySeconds: 0.5, mass: 0.2, size: 0.1 }],
  });
  for (let i = 0; i < 500; i += 1) w = step(w, 1 / 100);   // five seconds
  // Ten shots were due; the limit allows four more bodies and says so.
  assert.equal(w.bodies.length, 5);
  const shot = w.bodies.find((b) => b.id === 'shot-1');
  assert.ok(shot);
  close(shot.vel.x, 3, 1e-9);
  close(shot.vel.y, 0, 1e-9);
});

test('a shot is given a velocity and then left alone', () => {
  let w = createWorld({
    bodies: [], ground: null, g: 0, field: vec(0, 0),
    cannons: [{ id: 'c1', x: 0, y: 0, angleDeg: 90, speed: 5, everySeconds: 0, mass: 1, size: 0.1 }],
  });
  for (let i = 0; i < 200; i += 1) w = step(w, 1 / 100);
  assert.equal(w.bodies.length, 1);
  // Fired inside the first step, so it has had two seconds less one step: at
  // 5 m/s that is 9.95 m, and it is still going at 5 m/s because nothing acted
  // on it after it left.
  close(w.bodies[0].pos.y, 5 * (2 - 0.01), 0.01);
  close(w.bodies[0].vel.y, 5, 1e-9);
});

test('driving books its work, so the totals still balance', () => {
  let w = createWorld({
    bodies: [{ id: 'a', mass: 2, radius: 0.2, pos: vec(0, 0), cd: 0, area: 0, controlForce: vec(6, 0) }],
    ground: null, g: 0, field: vec(0, 0),
  });
  const start = totals(w);
  for (let i = 0; i < 400; i += 1) w = step(w, 1 / 200);
  const end = totals(w);
  // Two seconds of 6 N on 2 kg: 3 m/s², 6 m/s, 36 J of kinetic energy — all of
  // it supplied by whoever is holding the key down.
  close(findBody(w, 'a').vel.x, 6, 1e-6);
  close(end.kinetic, 36, 1e-3);
  close(end.supplied, 36, 1e-3);
  close(end.balance - start.balance, 0, 1e-6);
});

test('a cannon pays for what it fires — the books do not move', () => {
  let w = createWorld({
    bodies: [], ground: null, g: 0, field: vec(0, 0),
    cannons: [{ id: 'c1', x: 0, y: 0, angleDeg: 0, speed: 10, everySeconds: 0.5, mass: 1, size: 0.2 }],
  });
  const start = totals(w).balance;
  const seen = [];
  for (let i = 0; i < 300; i += 1) {
    w = step(w, 1 / 100);
    if (i % 50 === 49) seen.push(totals(w).balance);
  }
  // Six shots at 50 J of muzzle energy each. Without booking them the balance
  // would have climbed to 300 J; the whole point of the number is that it does
  // not move, whatever appears on the bench.
  assert.ok(w.bodies.length >= 6, `only ${w.bodies.length} shots`);
  for (const balance of seen) close(balance, start, 1e-6);
  close(totals(w).supplied, totals(w).kinetic, 1e-6);
});

test('a cannon firing upward pays for the height as well as the speed', () => {
  const g = 9.81;
  let w = createWorld({
    bodies: [], ground: { y: 0 }, g, field: vec(0, -g),
    cannons: [{ id: 'c1', x: 0, y: 4, angleDeg: 90, speed: 6, everySeconds: 0, mass: 2, size: 0.2 }],
  });
  const start = totals(w).balance;
  for (let i = 0; i < 100; i += 1) w = step(w, 1 / 200);
  // ½·2·6² = 36 J of muzzle energy, plus 2·9.81·4 = 78.5 J of potential from
  // appearing four metres up. Both arrived from the cannon, not from nowhere.
  close(totals(w).supplied, 36 + 2 * g * 4, 1e-6);
  close(totals(w).balance, start, 1e-6);
});
