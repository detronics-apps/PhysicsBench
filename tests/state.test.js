import test from 'node:test';
import assert from 'node:assert/strict';

import { defaults, migrate, TOOLS, MODES, STATE_VERSION, currentParams } from '../js/state.js';
import { build, hasWorld } from '../js/scenarios.js';
import { challengeById } from '../js/challenges.js';
import { environmentById, surfaceById, materialById, dragShapeById, fluidById } from '../js/constants.js';
import { channelById } from '../js/recorder.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('the defaults are complete and self-consistent', () => {
  const d = defaults();
  assert.equal(d.version, STATE_VERSION);
  assert.ok(TOOLS.includes(d.tool));
  assert.ok(MODES.includes(d.mode));
  // Every tool has a parameter slice, and nothing has one it does not use.
  for (const tool of TOOLS) assert.ok(d.tools[tool], `${tool} has no defaults`);
  assert.deepEqual(Object.keys(d.tools).sort(), [...TOOLS].sort());
});

test('every default builds a working scenario', () => {
  const d = defaults();
  for (const tool of TOOLS) {
    if (!hasWorld(tool)) continue;
    const s = build(tool, d.tools[tool]);
    assert.ok(s.world.bodies.length > 0, `${tool} built an empty world`);
  }
});

test('the defaults point only at things that exist', () => {
  const t = defaults().tools;
  assert.equal(environmentById(t.projectile.envId).id, t.projectile.envId);
  assert.equal(surfaceById(t.force.surfaceId).id, t.force.surfaceId);
  assert.equal(materialById(t.weight.material1).id, t.weight.material1);
  assert.equal(dragShapeById(t.projectile.shapeId).id, t.projectile.shapeId);
  assert.equal(fluidById(t.projectile.fluidId).id, t.projectile.fluidId);
  assert.ok(challengeById(t.challenge.id), 'the default challenge must exist');
  for (const id of defaults().view.graphChannels) {
    assert.ok(channelById(id), `default graph channel "${id}" does not exist`);
  }
});

test('migrate returns the defaults for anything unusable', () => {
  for (const junk of [null, undefined, 42, 'nonsense', [], true]) {
    const m = migrate(junk);
    assert.equal(m.tool, defaults().tool);
    assert.equal(m.version, STATE_VERSION);
    assert.ok(m.tools.projectile);
  }
});

test('a partial state keeps what it has and defaults the rest', () => {
  const m = migrate({ tool: 'collision', tools: { collision: { m1: 4 } } });
  assert.equal(m.tool, 'collision');
  assert.equal(m.tools.collision.m1, 4);
  // The keys it did not carry come back from the defaults, not as undefined.
  assert.equal(m.tools.collision.m2, defaults().tools.collision.m2);
  assert.equal(m.tools.projectile.speed, defaults().tools.projectile.speed);
});

test('a key present but undefined does not overwrite a good default', () => {
  // pitfalls.md #8: the exact trap a bare spread falls into.
  const m = migrate({ tool: undefined, theme: undefined, tools: { projectile: { speed: undefined, angleDeg: 60 } } });
  assert.equal(m.tool, defaults().tool);
  assert.equal(m.theme, 'system');
  assert.equal(m.tools.projectile.speed, defaults().tools.projectile.speed);
  assert.equal(m.tools.projectile.angleDeg, 60);
});

test('a hostile share link cannot reach the physics with a NaN', () => {
  // A fragment is just a string a stranger can edit, and a NaN mass propagates
  // silently through every calculation rather than failing anywhere useful.
  const m = migrate({
    tool: '<script>', mode: 'god', theme: 'neon',
    tools: {
      projectile: { speed: 'fast', mass: NaN, angleDeg: Infinity, radius: -5 },
      collision: { m1: 0, m2: -3, e: 99 },
      engineer: { gearRatio: 'lots', motors: 999 },
    },
  });

  assert.ok(TOOLS.includes(m.tool));
  assert.ok(MODES.includes(m.mode));
  assert.equal(m.theme, 'system');
  for (const value of [m.tools.projectile.speed, m.tools.projectile.mass, m.tools.projectile.angleDeg,
    m.tools.collision.m1, m.tools.engineer.gearRatio]) {
    assert.ok(Number.isFinite(value), `${value} reached the physics`);
  }
  // Masses are positive: a zero mass divides by zero in F = ma.
  assert.ok(m.tools.collision.m1 > 0);
  assert.ok(m.tools.collision.m2 > 0);
  assert.ok(m.tools.projectile.radius > 0);
  // And clamped ranges hold.
  assert.ok(m.tools.collision.e >= 0 && m.tools.collision.e <= 1);
  assert.ok(m.tools.engineer.motors <= 12);
});

test('a migrated hostile state still builds every scenario', () => {
  const m = migrate({ tools: Object.fromEntries(TOOLS.map((t) => [t, { mass: 'x', m1: NaN, speed: -Infinity }])) });
  for (const tool of TOOLS) {
    if (!hasWorld(tool)) continue;
    const s = build(tool, m.tools[tool]);
    for (const b of s.world.bodies) {
      assert.ok(Number.isFinite(b.mass) && b.mass > 0, `${tool}: bad mass`);
      assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y), `${tool}: bad position`);
      assert.ok(Number.isFinite(b.vel.x) && Number.isFinite(b.vel.y), `${tool}: bad velocity`);
    }
  }
});

test('migration is idempotent — twice through changes nothing', () => {
  const once = migrate({ tool: 'pendulum', tools: { pendulum: { length: 2.5, angleDeg: 75 } } });
  const twice = migrate(once);
  assert.deepEqual(twice, once);
  // And a default round-trips unchanged, which is the invariant worth having.
  assert.deepEqual(migrate(defaults()), defaults());
});

test('a real old blob survives, rather than a freshly generated one', () => {
  // Pasted as a literal, as pitfalls.md #8 insists: a state from before the
  // view flags and the transport existed.
  const old = {
    version: 1,
    tool: 'projectile',
    theme: 'dark',
    tools: { projectile: { speed: 35, angleDeg: 22, dragOn: true } },
  };
  const m = migrate(old);
  assert.equal(m.tool, 'projectile');
  assert.equal(m.theme, 'dark');
  assert.equal(m.tools.projectile.speed, 35);
  assert.equal(m.tools.projectile.dragOn, true);
  // The slices it had never heard of arrive complete.
  assert.equal(m.transport.speed, defaults().transport.speed);
  assert.equal(m.view.showForces, true);
  assert.deepEqual(m.compare, { on: false, params: null });
  assert.deepEqual(m.seen, []);
});

test('graph channel and shape lists reject junk and fall back to the defaults', () => {
  assert.deepEqual(migrate({ view: { graphChannels: 'not a list' } }).view.graphChannels,
    defaults().view.graphChannels);
  assert.deepEqual(migrate({ view: { graphChannels: [] } }).view.graphChannels,
    defaults().view.graphChannels);
  assert.deepEqual(migrate({ view: { graphChannels: ['y', 'vy'] } }).view.graphChannels, ['y', 'vy']);
  // A list too long is trimmed, not rejected wholesale.
  assert.equal(migrate({ view: { graphChannels: Array(50).fill('y') } }).view.graphChannels.length, 6);
  assert.deepEqual(migrate({ tools: { rotation: { shapes: [] } } }).tools.rotation.shapes,
    defaults().tools.rotation.shapes);
});

test('only tool:section booleans survive in the section flags', () => {
  const m = migrate({ ui: { sections: { 'mass:setup': true, 'x': 'yes', ['y'.repeat(200)]: false } } });
  assert.deepEqual(m.ui.sections, { 'mass:setup': true });
  assert.deepEqual(migrate({ ui: { sections: 'nope' } }).ui.sections, {});
});

test('the seen list is capped and filtered', () => {
  const m = migrate({ seen: ['mass', 42, null, 'x'.repeat(100), 'velocity'] });
  assert.deepEqual(m.seen, ['mass', 'velocity']);
  assert.equal(migrate({ seen: Array(200).fill('mass') }).seen.length, 60);
  assert.deepEqual(migrate({ seen: 'nope' }).seen, []);
});

test('the prediction box is a short string, whatever arrives', () => {
  assert.equal(migrate({ tools: { challenge: { prediction: 42 } } }).tools.challenge.prediction, '');
  assert.equal(migrate({ tools: { challenge: { prediction: 'x'.repeat(200) } } }).tools.challenge.prediction.length, 32);
  assert.equal(migrate({ tools: { challenge: { prediction: '45' } } }).tools.challenge.prediction, '45');
});

test('transport is clamped to something playable', () => {
  const m = migrate({ transport: { speed: 1000, stepSeconds: -5, scrubT: 'now', playing: 'yes' } });
  assert.ok(m.transport.speed <= 8 && m.transport.speed >= 0.05);
  assert.ok(m.transport.stepSeconds > 0);
  assert.equal(m.transport.scrubT, null);
  assert.equal(m.transport.playing, false);
});

test('currentParams reads the slice for the tool on screen', () => {
  const s = migrate({ tool: 'pendulum' });
  assert.equal(currentParams(s), s.tools.pendulum);
  close(currentParams(s).length, defaults().tools.pendulum.length);
  assert.deepEqual(currentParams({ tool: 'nope', tools: {} }), {});
});
