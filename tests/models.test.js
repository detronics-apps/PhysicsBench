import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KINDS, KIND_LABEL, KIND_MEANING,
  MODELS, ASSUMPTIONS, APPROXIMATIONS, ALL, lookup,
  disclosure, EQUATIONS, equation, equations,
} from '../js/models.js';

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

test('equations() resolves a list and rejects an unknown id', () => {
  assert.deepEqual(equations(['newton-2', 'momentum']).map((e) => e.id), ['newton-2', 'momentum']);
  assert.throws(() => equations(['nope']), /Unknown equation "nope"/);
  assert.equal(equation('nope'), null);
});
