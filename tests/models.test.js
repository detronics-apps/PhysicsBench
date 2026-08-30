import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KINDS, KIND_LABEL, KIND_MEANING,
  MODELS, ASSUMPTIONS, APPROXIMATIONS, ALL, lookup,
  disclosure, EQUATIONS, equation, equations,
} from '../js/models.js';

test('the four kinds are named and explained', () => {
  assert.deepEqual(KINDS, ['reality', 'model', 'assumption', 'approximation']);
  for (const kind of KINDS) {
    assert.ok(KIND_LABEL[kind], `${kind} needs a label`);
    assert.ok(KIND_MEANING[kind].length > 40, `${kind} needs a real explanation`);
  }
});

test('every registry entry is complete — no stubs reach the learner', () => {
  const registries = [
    ['model', MODELS], ['assumption', ASSUMPTIONS], ['approximation', APPROXIMATIONS],
  ];
  for (const [kind, registry] of registries) {
    const ids = Object.keys(registry);
    assert.ok(ids.length >= 4, `${kind}: expected several entries`);
    for (const [id, e] of Object.entries(registry)) {
      assert.equal(e.id, id, 'key must match the entry id');
      assert.equal(e.kind, kind);
      assert.ok(e.label, `${id}: label`);
      // The four sentences are the whole point. A missing one means a learner
      // sees "assumption: no drag" with no way to know what that costs them.
      assert.ok(e.statement.length > 30, `${id}: statement too thin`);
      assert.ok(e.why.length > 30, `${id}: why too thin`);
      assert.ok(e.ifRemoved.length > 40, `${id}: ifRemoved is the promise that the next lesson widens this one`);
      assert.ok(e.reality.length > 20, `${id}: reality too thin`);
    }
  }
});

test('ALL merges the registries without collisions', () => {
  const total = Object.keys(MODELS).length
    + Object.keys(ASSUMPTIONS).length
    + Object.keys(APPROXIMATIONS).length;
  assert.equal(Object.keys(ALL).length, total, 'an id is used in two registries');
  assert.equal(lookup('no-drag').kind, 'assumption');
  assert.equal(lookup('not-a-thing'), null);
});

test('disclosure groups a declaration by kind', () => {
  const d = disclosure({
    reality: 'Gravity is an interaction between masses.',
    models: ['uniform-field', 'point-mass'],
    assumptions: ['no-drag'],
    approximations: [],
    numbers: [{ label: 'g', value: '9.80665 m/s²', note: 'standard gravity' }],
  });

  assert.equal(d.models.length, 2);
  assert.equal(d.assumptions[0].id, 'no-drag');
  assert.equal(d.approximations.length, 0);
  assert.equal(d.hasApproximations, false);
  assert.equal(d.numbers[0].value, '9.80665 m/s²');
  assert.equal(d.summary, '2 models · 1 assumption');
});

test('disclosure flags when an approximation is switched on', () => {
  const d = disclosure({
    reality: 'x',
    models: ['uniform-field'],
    approximations: ['g-rounded'],
  });
  assert.equal(d.hasApproximations, true);
  assert.match(d.approximations[0].ifRemoved, /2%/);
  assert.equal(d.summary, '1 model · 1 approximation');
});

test('disclosure refuses an incomplete or wrong declaration', () => {
  // A scenario with no stated reality is exactly the failure this prevents.
  assert.throws(() => disclosure({ models: ['uniform-field'] }), /physical reality/);
  assert.throws(() => disclosure({ reality: 'x' }), /at least one model/);
  assert.throws(
    () => disclosure({ reality: 'x', models: ['uniform-field'], assumptions: ['no-such-thing'] }),
    /unknown assumption "no-such-thing"/,
  );
  // Listing a model as an assumption is a category error, and is caught.
  assert.throws(
    () => disclosure({ reality: 'x', models: ['uniform-field'], assumptions: ['rigid-body'] }),
    /is a model, listed as a assumption/,
  );
});

test('the rounded-g approximation names itself as a choice, not a value', () => {
  const g10 = APPROXIMATIONS['g-rounded'];
  assert.match(g10.statement, /10 m\/s²/);
  assert.match(g10.ifRemoved, /not the standard value/);
  // It must not claim 10 is what gravity is.
  assert.doesNotMatch(g10.statement, /gravity is 10/i);
});

test('the free-fall assumption explains the misconception it prevents', () => {
  const drag = ASSUMPTIONS['no-drag'];
  assert.match(drag.ifRemoved, /terminal speed/);
  assert.match(drag.why, /same place/);
});

test('every equation states its domain of validity and what it becomes', () => {
  const ids = Object.keys(EQUATIONS);
  assert.ok(ids.length >= 15);
  for (const [id, eq] of Object.entries(EQUATIONS)) {
    assert.equal(eq.id, id);
    assert.ok(eq.name && eq.formula, `${id}: needs a name and a formula`);
    assert.ok(eq.plain.length > 30, `${id}: needs plain language`);
    assert.ok(eq.validWhen.length > 15, `${id}: an equation without its domain is a magic rule`);
    assert.ok(typeof eq.becomes === 'string' && eq.becomes.length > 20, `${id}: needs the wider picture`);
    assert.ok(typeof eq.misreads === 'string', `${id}: misreads may be empty but must exist`);
  }
});

test('F = ma is presented as the constant-mass case of F = dp/dt', () => {
  const eq = equation('newton-2');
  assert.equal(eq.general, 'F_net = dp/dt');
  assert.match(eq.validWhen, /mass is constant/);
  assert.match(eq.misreads, /net/);
});

test('p = mv is presented as the classical case', () => {
  const eq = equation('momentum');
  assert.match(eq.general, /γ/);
  assert.match(eq.validWhen, /classical/);
});

test('the gravity equation makes the mass cancellation explicit', () => {
  const eq = equation('gravity-field');
  assert.match(eq.plain, /own mass is nowhere in it/);
  assert.match(eq.misreads, /cancel/);
});

test('the pendulum period is flagged small-angle, with the exact form given', () => {
  const eq = equation('pendulum-period');
  assert.match(eq.validWhen, /Small swings/);
  assert.match(eq.general, /elliptic/);
  assert.match(eq.misreads, /Mass really is absent/);
});

test('equations() resolves a list and rejects an unknown id', () => {
  assert.deepEqual(equations(['newton-2', 'momentum']).map((e) => e.id), ['newton-2', 'momentum']);
  assert.throws(() => equations(['nope']), /Unknown equation "nope"/);
  assert.equal(equation('nope'), null);
});
