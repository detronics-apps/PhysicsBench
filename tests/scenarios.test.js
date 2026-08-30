import test from 'node:test';
import assert from 'node:assert/strict';

import { G_STANDARD, G_ROUNDED } from '../js/constants.js';
import { advance, findBody, totals, forcesFor } from '../js/world.js';
import { len } from '../js/vec.js';
import { build, hasWorld, standaloneDisclosure, gravityFor, fluidFor, surfaceFor } from '../js/scenarios.js';
import { defaults } from '../js/state.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const params = defaults().tools;
const run = (w, s, frame = 1 / 120) => {
  let c = w;
  for (let t = 0; t < s - 1e-12; t += frame) c = advance(c, Math.min(frame, s - t));
  return c;
};

const WORLD_LABS = ['mass', 'motion', 'accel', 'force', 'projectile', 'weight', 'momentum', 'collision', 'energy'];
const STANDALONE_LABS = ['pendulum', 'rotation', 'engineer'];

test('every lab builds, and every lab declares what it is assuming', () => {
  for (const id of WORLD_LABS) {
    assert.ok(hasWorld(id), `${id} should have a world`);
    const s = build(id, params[id]);
    assert.ok(s.world.bodies.length > 0, `${id} has no bodies`);
    assert.ok(s.focusId && findBody(s.world, s.focusId), `${id} focuses a body that is not there`);

    // The non-negotiable: a lab that has not said what it stands for cannot run.
    assert.ok(s.disclosure.reality.length > 40, `${id}: reality too thin`);
    assert.ok(s.disclosure.models.length > 0, `${id}: no model declared`);
    assert.ok(s.disclosure.numbers.length > 0, `${id}: no numbers declared`);
    assert.ok(s.equations.length > 0, `${id}: no equations`);
    for (const e of s.equations) assert.ok(e.validWhen, `${id}: ${e.id} has no domain of validity`);
  }
});

test('the standalone labs declare themselves too', () => {
  for (const id of STANDALONE_LABS) {
    const s = standaloneDisclosure(id, params[id]);
    assert.ok(s.disclosure.models.length > 0, `${id}: no model`);
    assert.ok(s.disclosure.numbers.length > 0, `${id}: no numbers`);
    assert.ok(s.equations.length > 0);
  }
  assert.throws(() => standaloneDisclosure('nope'), /No standalone disclosure/);
  assert.throws(() => build('nope'), /No scenario named/);
});

test('an airless lab declares no-drag; an airy one declares the wind and the density', () => {
  const vacuum = build('projectile', { ...params.projectile, dragOn: false });
  assert.ok(vacuum.disclosure.assumptions.some((a) => a.id === 'no-drag'));
  assert.ok(vacuum.disclosure.numbers.some((n) => /vacuum/i.test(n.note)));

  const air = build('projectile', { ...params.projectile, dragOn: true });
  assert.ok(!air.disclosure.assumptions.some((a) => a.id === 'no-drag'));
  assert.ok(air.disclosure.assumptions.some((a) => a.id === 'no-wind'));
  assert.ok(air.disclosure.models.some((m) => m.id === 'quadratic-drag'));
  assert.ok(air.disclosure.approximations.some((a) => a.id === 'fixed-cd'));
});

test('switching on the classroom g records it as an approximation, not a value', () => {
  const honest = gravityFor({ envId: 'earth', roundG: false });
  close(honest.g, G_STANDARD);
  assert.equal(honest.rounded, false);
  assert.match(honest.source, /exact/);

  const easy = gravityFor({ envId: 'earth', roundG: true });
  assert.equal(easy.g, G_ROUNDED);
  close(easy.exact, G_STANDARD);
  assert.match(easy.source, /not the standard value/);

  const lab = build('projectile', { ...params.projectile, roundG: true });
  assert.ok(lab.disclosure.approximations.some((a) => a.id === 'g-rounded'));
  assert.equal(lab.disclosure.hasApproximations, true);
  close(lab.world.env.g, 10);
});

test('a custom gravity is used verbatim, including zero', () => {
  close(gravityFor({ envId: 'custom', customG: 3.3 }).g, 3.3);
  close(gravityFor({ envId: 'orbit' }).g, 0);
  // A nonsense custom value falls back to the environment's own.
  close(gravityFor({ envId: 'custom', customG: NaN }).g, G_STANDARD);
});

test('the mass lab: same force, different mass, different acceleration', () => {
  const s = build('mass', { m1: 1, m2: 10, force: 10 });
  const after = run(s.world, 1);
  const light = findBody(after, 'light');
  const heavy = findBody(after, 'heavy');

  // a = F/m, so ten times the mass is a tenth of the acceleration.
  close(light.vel.x, 10, 1e-6);
  close(heavy.vel.x, 1, 1e-6);
  close(light.vel.x / heavy.vel.x, 10, 1e-6);
  // Nothing else acts: the track is level and frictionless, as declared.
  close(len(forcesFor(after, heavy).net.vec), 10, 1e-9);
});

test('the motion lab: no net force, so the velocity never changes', () => {
  const s = build('motion', { ...params.motion, v0: 4, v0b: -4 });
  const after = run(s.world, 3);
  const a = findBody(after, 'a');
  const b = findBody(after, 'b');
  close(a.vel.x, 4, 1e-9);
  close(b.vel.x, -4, 1e-9);
  // Same speed, opposite velocities — the whole point of the lab.
  close(Math.abs(a.vel.x), Math.abs(b.vel.x), 1e-9);
  assert.ok(a.pos.x > b.pos.x);
});

test('the acceleration lab produces exactly the acceleration asked for', () => {
  const s = build('accel', { u: 5, a: -3, mass: 2, x0: 0 });
  const after = run(s.world, 2);
  const cart = findBody(after, 'a');
  // v = u + at, and at t = 2 with a = −3 the cart is going backwards.
  close(cart.vel.x, 5 - 3 * 2, 1e-6);
  close(cart.pos.x, 5 * 2 - 0.5 * 3 * 4, 1e-6);
  close(forcesFor(after, cart).acceleration.x, -3, 1e-9);
});

test('the force lab draws every force, and they sum to the net', () => {
  const s = build('force', { ...params.force, mass: 10, appliedX: 30, surfaceId: 'wood' });
  const r = forcesFor(s.world, findBody(s.world, 'box'));
  assert.deepEqual(r.forces.map((f) => f.id).sort(), ['applied', 'friction', 'normal', 'weight']);
  const sum = r.forces.reduce((acc, f) => ({ x: acc.x + f.vec.x, y: acc.y + f.vec.y }), { x: 0, y: 0 });
  close(sum.x, r.net.vec.x, 1e-12);
  close(sum.y, r.net.vec.y, 1e-12);
});

test('the force lab holds a box still when the push is under the static limit', () => {
  // μs = 0.5 on wood, so 10 kg needs more than 49 N to move.
  const held = build('force', { ...params.force, mass: 10, appliedX: 20, surfaceId: 'wood', dragOn: false });
  const stillThere = findBody(run(held.world, 2), 'box');
  close(stillThere.vel.x, 0, 1e-6);

  const pushed = build('force', { ...params.force, mass: 10, appliedX: 80, surfaceId: 'wood', dragOn: false });
  assert.ok(findBody(run(pushed.world, 2), 'box').vel.x > 1);
});

test('the projectile lab launches at the speed and angle asked for', () => {
  const s = build('projectile', { ...params.projectile, speed: 20, angleDeg: 30, height: 5 });
  const ball = findBody(s.world, 'ball');
  close(len(ball.vel), 20, 1e-9);
  close(ball.vel.x, 20 * Math.cos(Math.PI / 6), 1e-9);
  close(ball.vel.y, 20 * Math.sin(Math.PI / 6), 1e-9);
  close(ball.pos.y - ball.radius, 5, 1e-9);
  assert.ok(s.world.trailLimit > 0, 'a projectile needs a trail to show its path');
});

test('the projectile lab matches the closed-form range in a vacuum', () => {
  const s = build('projectile', { ...params.projectile, speed: 20, angleDeg: 45, height: 0, dragOn: false });
  let w = s.world;
  let landed = null;
  for (let i = 0; i < 2000 && !landed; i += 1) {
    w = advance(w, 1 / 240);
    const ball = findBody(w, 'ball');
    if (w.t > 0.2 && ball.pos.y <= ball.radius + 1e-3) landed = ball;
  }
  assert.ok(landed, 'the ball should land');
  const expected = (400 * Math.sin(Math.PI / 2)) / G_STANDARD;
  close(landed.pos.x, expected, 0.1);
});

test('the weight lab: two masses fall together in a vacuum and apart in air', () => {
  const vacuum = build('weight', { ...params.weight, m1: 1, m2: 10, dragOn: false, height: 40 });
  const afterV = run(vacuum.world, 2);
  close(findBody(afterV, 'light').pos.y - findBody(afterV, 'light').radius,
    findBody(afterV, 'heavy').pos.y - findBody(afterV, 'heavy').radius, 1e-9);

  const air = build('weight', { ...params.weight, m1: 1, m2: 10, dragOn: true, sameSize: true, height: 200 });
  const afterA = run(air.world, 4);
  assert.ok(findBody(afterA, 'heavy').pos.y < findBody(afterA, 'light').pos.y,
    'in air the heavier ball of the same size should be lower');
});

test('the weight lab spells out why the masses cancel', () => {
  const s = build('weight', params.weight);
  const why = s.disclosure.numbers.find((n) => /cancel/i.test(n.note));
  assert.ok(why, 'the lab must say why mass drops out');
  assert.match(why.value, /a = F\/m/);
});

test('the momentum lab has no collisions; the collision lab does', () => {
  assert.equal(build('momentum', params.momentum).world.bodyCollisions, false);
  assert.equal(build('collision', params.collision).world.bodyCollisions, true);
  // Only the collision lab has to talk about restitution and lost energy.
  const c = build('collision', params.collision);
  assert.ok(c.disclosure.models.some((m) => m.id === 'restitution'));
  assert.ok(c.disclosure.assumptions.some((a) => a.id === 'no-heat'));
});

test('the collision lab conserves momentum at every restitution', () => {
  for (const e of [0, 0.5, 1]) {
    const s = build('collision', { ...params.collision, m1: 1, v1: 5, m2: 10, v2: 0, e });
    const before = totals(s.world);
    const after = totals(run(s.world, 4));
    close(after.momentumX, before.momentumX, 1e-6);
    // And the books balance whatever e is.
    close(after.total, before.total, 1e-3);
  }
});

test('the energy lab trades height for speed, and friction takes its cut', () => {
  const smooth = build('energy', { ...params.energy, surfaceId: 'frictionless', slopeDeg: 25 });
  const before = totals(smooth.world);
  const after = totals(run(smooth.world, 1.5));
  close(after.mechanical, before.mechanical, 0.02);

  const rough = build('energy', { ...params.energy, surfaceId: 'wood', slopeDeg: 25 });
  const roughAfter = totals(run(rough.world, 1.5));
  assert.ok(roughAfter.elsewhere.heat > 0, 'friction must produce heat');
  close(roughAfter.total, totals(rough.world).total, 0.05);
});

test('the fluid and surface helpers fall back rather than returning undefined', () => {
  assert.equal(fluidFor({ dragOn: false }).active, false);
  assert.equal(fluidFor({ dragOn: false }).density, 0);
  assert.equal(fluidFor({ dragOn: true, fluidId: 'nonsense' }).fluid.id, 'air');
  close(fluidFor({ dragOn: true, shapeId: 'custom', customCd: 1.4 }).cd, 1.4);

  const s = surfaceFor({ surfaceId: 'custom', customMuS: 0.8, customMuK: 0.6 });
  close(s.muS, 0.8);
  close(s.muK, 0.6);
  assert.equal(surfaceFor({ surfaceId: 'frictionless' }).muS, 0);
});

test('the pendulum disclosure insists the simulation uses sin θ, not θ', () => {
  const s = standaloneDisclosure('pendulum', params.pendulum);
  const note = s.disclosure.numbers.find((n) => /sin θ/.test(n.value));
  assert.ok(note);
  assert.match(note.note, /never simplified/);
  // The small-angle formula is only ever an approximation, and is labelled one.
  assert.ok(s.disclosure.approximations.some((a) => a.id === 'small-angle'));
});
