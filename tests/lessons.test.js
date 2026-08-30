import test from 'node:test';
import assert from 'node:assert/strict';

import { CONCEPTS, conceptById, order, prerequisites, unlocks, conceptForTool, progress, suggestNext } from '../js/lessons.js';
import { EQUATIONS } from '../js/models.js';
import { TOOLS } from '../js/state.js';

test('every concept is complete — no stubs reach a learner', () => {
  assert.ok(CONCEPTS.length >= 10);
  for (const c of CONCEPTS) {
    assert.ok(c.id && c.label && c.tool, `${c.id} incomplete`);
    assert.ok(Array.isArray(c.needs));
    assert.ok(c.ask.includes('?'), `${c.id}: the lead-in must be a question`);
    assert.ok(c.discover.length > 60, `${c.id}: discover too thin`);
  }
});

test('every concept names the misconception, why it is reasonable, and what is true', () => {
  // "You are wrong" teaches nothing. The three-part form is the design.
  for (const c of CONCEPTS) {
    assert.ok(c.misconception, `${c.id} has no misconception`);
    assert.ok(c.misconception.belief.length > 15, `${c.id}: belief`);
    assert.ok(c.misconception.why.length > 30, `${c.id}: why it seems reasonable`);
    assert.ok(c.misconception.actually.length > 50, `${c.id}: what actually happens`);
  }
});

test('the gravity concept corrects the falling misconception without creating a new one', () => {
  const g = conceptById('gravity');
  assert.match(g.misconception.belief, /Heavier things fall faster/);
  // It must not simply say "that is wrong" — in air, heavier things really do
  // fall faster, and saying otherwise is a second misconception.
  assert.match(g.misconception.why, /really does/);
  assert.match(g.misconception.actually, /air/);
  assert.match(g.misconception.actually, /Moon|Apollo/);
});

test('every concept points at equations that exist', () => {
  for (const c of CONCEPTS) {
    assert.ok(c.equations.length > 0, `${c.id} names no equations`);
    for (const id of c.equations) {
      assert.ok(EQUATIONS[id], `${c.id} points at an unknown equation "${id}"`);
    }
  }
});

test('every concept points at a tool that exists', () => {
  for (const c of CONCEPTS) {
    assert.ok(TOOLS.includes(c.tool), `${c.id} points at unknown tool "${c.tool}"`);
  }
});

test('every prerequisite exists', () => {
  const ids = new Set(CONCEPTS.map((c) => c.id));
  for (const c of CONCEPTS) {
    for (const need of c.needs) {
      assert.ok(ids.has(need), `${c.id} needs "${need}", which does not exist`);
    }
  }
});

test('the progression is a valid topological order', () => {
  const sorted = order();
  assert.equal(sorted.length, CONCEPTS.length);
  const seen = new Set();
  for (const c of sorted) {
    for (const need of c.needs) {
      assert.ok(seen.has(need), `${c.id} appears before its prerequisite "${need}"`);
    }
    seen.add(c.id);
  }
});

test('a cycle is caught rather than silently reordered', () => {
  assert.throws(() => order([
    { id: 'a', needs: ['b'], tool: 'mass' },
    { id: 'b', needs: ['a'], tool: 'mass' },
  ]), /Cycle or missing prerequisite/);
});

test('the progression starts with something that needs nothing', () => {
  const first = order()[0];
  assert.deepEqual(first.needs, []);
  // And mass really is where it begins, as the spec asks.
  assert.equal(first.id, 'mass');
});

test('prerequisites walk the whole chain, not just one step', () => {
  // Collisions need momentum, which needs mass and velocity, which needs position.
  const chain = prerequisites('collision');
  for (const id of ['momentum', 'mass', 'velocity', 'position']) {
    assert.ok(chain.includes(id), `collision should transitively need ${id}`);
  }
  assert.deepEqual(prerequisites('mass'), []);
  assert.deepEqual(prerequisites('nonsense'), []);
});

test('unlocks is the inverse of needs', () => {
  for (const c of CONCEPTS) {
    for (const id of unlocks(c.id)) {
      assert.ok(conceptById(id).needs.includes(c.id));
    }
  }
  assert.ok(unlocks('momentum').includes('collision'));
});

test('a tool maps back to its concept, with a place in the sequence', () => {
  assert.equal(conceptForTool('collision').id, 'collision');
  assert.equal(conceptForTool('nonsense'), null);

  const p = progress('collision');
  assert.ok(p.index > 1 && p.index <= p.total);
  assert.equal(p.total, CONCEPTS.length);
  assert.equal(progress('challenge'), null, 'challenge mode is not a step in the sequence');
});

test('the next suggestion is always something whose prerequisites are met', () => {
  assert.equal(suggestNext([]).id, 'mass');

  let seen = [];
  for (let i = 0; i < CONCEPTS.length; i += 1) {
    const next = suggestNext(seen);
    assert.ok(next, 'there should always be a next until everything is seen');
    for (const need of next.needs) {
      assert.ok(seen.includes(need), `${next.id} suggested before its prerequisite ${need}`);
    }
    seen = [...seen, next.id];
  }
  assert.equal(suggestNext(seen), null, 'nothing left once everything is seen');
});

test('it still suggests something when the learner has skipped ahead', () => {
  // Someone who opened Collisions first has an unmet prerequisite. The app
  // should still offer a next step rather than nothing at all.
  const next = suggestNext(['collision']);
  assert.ok(next);
  assert.notEqual(next.id, 'collision');
});
