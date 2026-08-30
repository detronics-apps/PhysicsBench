import test from 'node:test';
import assert from 'node:assert/strict';

import { defaults, migrate, STAGE_IDS, VECTOR_IDS, STATE_VERSION } from '../js/state.js';
import { build, STAGES } from '../js/stages.js';
import { findBody } from '../js/world.js';
import { shapeById } from '../js/shapes.js';
import { fluidById } from '../js/drag.js';
import { worldById } from '../js/gravitation.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('the defaults build a working bench at every step', () => {
  const d = defaults();
  assert.equal(d.version, STATE_VERSION);
  assert.deepEqual(STAGE_IDS, STAGES.map((s) => s.id));
  for (const stage of STAGES) {
    const s = build(stage.id, d.bench);
    assert.ok(findBody(s.world, 'main'), `${stage.id} lost the object`);
  }
});

test('the defaults point only at things that exist', () => {
  const b = defaults().bench;
  assert.equal(shapeById(b.shapeId).id, b.shapeId);
  assert.equal(shapeById(b.shape2Id).id, b.shape2Id);
  assert.equal(fluidById(b.fluidId).id, b.fluidId);
  assert.equal(worldById(b.planetId).id, b.planetId);
  // The default world's mass and radius are the real ones for that world.
  close(b.planetMass, worldById('earth').mass, 1e18);
  close(b.planetRadius, worldById('earth').radius, 1);
  for (const id of VECTOR_IDS) assert.equal(typeof defaults().vectors[id], 'boolean');
});

test('migrate returns the defaults for anything unusable', () => {
  for (const junk of [null, undefined, 42, 'nonsense', [], true]) {
    const m = migrate(junk);
    assert.equal(m.stage, defaults().stage);
    assert.equal(m.version, STATE_VERSION);
    assert.ok(m.bench.mass > 0);
  }
});

test('a partial state keeps what it has and defaults the rest', () => {
  const m = migrate({ stage: 'friction', bench: { mass: 7 } });
  assert.equal(m.stage, 'friction');
  assert.equal(m.bench.mass, 7);
  assert.equal(m.bench.pushForce, defaults().bench.pushForce);
  assert.equal(m.bench.fluidId, defaults().bench.fluidId);
});

test('a key present but undefined does not overwrite a good default', () => {
  // pitfalls.md #8: the exact trap a bare spread falls into.
  const m = migrate({ stage: undefined, theme: undefined, bench: { mass: undefined, pushForce: 33 } });
  assert.equal(m.stage, defaults().stage);
  assert.equal(m.theme, 'system');
  assert.equal(m.bench.mass, defaults().bench.mass);
  assert.equal(m.bench.pushForce, 33);
});

test('a hostile share link cannot reach the physics with a NaN', () => {
  // A fragment is a string a stranger can edit, and a NaN mass propagates
  // silently through every calculation rather than failing anywhere useful.
  const m = migrate({
    stage: '<script>', theme: 'neon',
    vectors: { velocity: 'yes', net: 1 },
    bench: {
      mass: NaN, size: -3, pushForce: 'hard', pushSeconds: Infinity,
      planetMass: 0, planetRadius: -1, muS: 9, muK: 99, restitution: 42,
      fluidId: 'lava', shapeId: 'blob', planetId: 'mordor',
    },
  });

  assert.ok(STAGE_IDS.includes(m.stage));
  assert.equal(m.theme, 'system');
  for (const [k, v] of Object.entries(m.bench)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} reached the physics as ${v}`);
  }
  assert.ok(m.bench.mass > 0 && m.bench.size > 0);
  assert.ok(m.bench.planetMass > 0 && m.bench.planetRadius > 0);
  assert.ok(m.bench.restitution >= 0 && m.bench.restitution <= 1);
  assert.equal(m.bench.fluidId, defaults().bench.fluidId);
  assert.equal(m.bench.shapeId, defaults().bench.shapeId);
  // Booleans must be booleans, or the arrow picker renders a string.
  for (const id of VECTOR_IDS) assert.equal(typeof m.vectors[id], 'boolean');
});

test('kinetic friction can never exceed static, whatever arrives', () => {
  // Not a preference — it is what the two words mean.
  assert.ok(migrate({ bench: { muS: 0.2, muK: 1.5 } }).bench.muK <= 0.2);
  assert.ok(migrate({ bench: { muS: 1.0, muK: 0.3 } }).bench.muK === 0.3);
});

test('a migrated hostile state still builds every step', () => {
  const m = migrate({ bench: { mass: 'x', size: NaN, planetRadius: 'huge', pushForce: -Infinity } });
  for (const stage of STAGES) {
    const s = build(stage.id, m.bench);
    for (const b of s.world.bodies) {
      assert.ok(Number.isFinite(b.mass) && b.mass > 0, `${stage.id}: ${b.id} mass`);
      assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y), `${stage.id}: ${b.id} position`);
      assert.ok(Number.isFinite(b.vel.x) && Number.isFinite(b.vel.y), `${stage.id}: ${b.id} velocity`);
      assert.ok(Number.isFinite(b.radius) && b.radius > 0, `${stage.id}: ${b.id} radius`);
    }
  }
});

test('migration is idempotent — twice through changes nothing', () => {
  const once = migrate({ stage: 'fluid', bench: { mass: 2.5, fluidId: 'honey', slopeDeg: 12 } });
  assert.deepEqual(migrate(once), once);
  assert.deepEqual(migrate(defaults()), defaults());
});

test('a real old blob survives, rather than a freshly generated one', () => {
  // Pasted as a literal, as pitfalls.md #8 insists: a state saved before the
  // vector picker and the fluid step existed.
  const old = {
    version: 2,
    stage: 'surface',
    theme: 'dark',
    bench: { mass: 12, slopeDeg: 30, shapeId: 'cube' },
  };
  const m = migrate(old);
  assert.equal(m.stage, 'surface');
  assert.equal(m.theme, 'dark');
  assert.equal(m.bench.mass, 12);
  assert.equal(m.bench.slopeDeg, 30);
  assert.equal(m.bench.shapeId, 'cube');
  // The slices it had never heard of arrive complete.
  assert.equal(typeof m.vectors.drag, 'boolean');
  assert.equal(m.bench.fluidId, defaults().bench.fluidId);
  assert.equal(m.transport.speed, defaults().transport.speed);
});

test('transport is clamped to something playable', () => {
  const m = migrate({ transport: { speed: 1000, stepSeconds: -5, scrubT: 'now', playing: 'yes' } });
  assert.ok(m.transport.speed <= 8 && m.transport.speed >= 0.05);
  assert.ok(m.transport.stepSeconds > 0);
  assert.equal(m.transport.playing, false);
  // `null` means "follow the live simulation", and `Number(null)` is 0 — which
  // would turn every reload into a timeline scrubbed back to the start.
  assert.equal(m.transport.scrubT, null);
  assert.equal(migrate({ transport: { scrubT: null } }).transport.scrubT, null);
  assert.equal(migrate({ transport: { scrubT: 2.5 } }).transport.scrubT, 2.5);
});

test('only stage:section booleans survive in the section flags', () => {
  const m = migrate({ ui: { sections: { 'push:object': true, x: 'yes', ['y'.repeat(200)]: false } } });
  assert.deepEqual(m.ui.sections, { 'push:object': true });
  assert.deepEqual(migrate({ ui: { sections: 'nope' } }).ui.sections, {});
});
