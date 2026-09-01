import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KINDS, KIND_LABEL, KIND_MEANING,
  MODELS, ASSUMPTIONS, APPROXIMATIONS, ALL, lookup,
  disclosure, EQUATIONS, equation, equations, TRIANGLES, triangleFor} from '../js/models.js';

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

/* ------------------------------------------------------------ triangles -- */

/**
 * Every triangle is a real rearrangement of a real equation.
 *
 * A triangle is only honest for A = B × C. Drawing one for an equation with a
 * square in it teaches a rearrangement that does not work, which is worse than
 * drawing nothing — so the map is deliberately partial and this checks that
 * what is in it belongs.
 */
test('every triangle names an equation, and matches its formula', () => {
  for (const [id, tri] of Object.entries(TRIANGLES)) {
    const eq = EQUATIONS[id];
    assert.ok(eq, `${id} has a triangle but no equation`);

    for (const corner of ['top', 'left', 'right']) {
      const part = tri[corner];
      assert.ok(part && part.symbol, `${id}.${corner} has no symbol`);
      assert.ok(part.name && part.name.length < 20, `${id}.${corner} needs a short name`);
      assert.ok(part.unit, `${id}.${corner} has no unit`);
    }

    // All three symbols appear in the formula, or the picture and the algebra
    // are telling a reader different things.
    for (const corner of ['top', 'left', 'right']) {
      const sym = tri[corner].symbol;
      assert.ok(eq.formula.includes(sym),
        `${id}: ${sym} is in the triangle but not in "${eq.formula}"`);
    }

    // And the readings are the part worth having.
    assert.ok(Array.isArray(tri.means) && tri.means.length >= 2,
      `${id} needs at least two readings — a triangle without them is a shape`);
    for (const line of tri.means) {
      assert.ok(line.length > 30, `${id} has a reading too short to say anything`);
    }
  }
});

test('nothing with a square in it gets a triangle', () => {
  // The ones a triangle would lie about.
  for (const id of ['kinetic-energy', 'drag', 'gravity-field', 'terminal-velocity', 'suvat-v2']) {
    assert.equal(triangleFor(id), null, `${id} must not have a triangle`);
  }
  assert.equal(triangleFor('nonsense'), null);
});

test('the panels render plain text, so nothing may pretend to be markdown', () => {
  // Asterisks meant as emphasis come out as asterisks, because `explain` sets
  // textContent. Caught in the browser on a triangle that read "*not*".
  const fields = ['plain', 'validWhen', 'general', 'becomes', 'misreads'];
  for (const [id, eq] of Object.entries(EQUATIONS)) {
    for (const field of fields) {
      if (!eq[field]) continue;
      assert.ok(!eq[field].includes('*'), `${id}.${field} has a literal asterisk in it`);
      assert.ok(!/_[a-z]+_/.test(eq[field]), `${id}.${field} has literal underscores in it`);
    }
  }
  for (const [id, tri] of Object.entries(TRIANGLES)) {
    for (const line of tri.means) {
      assert.ok(!line.includes('*'), `${id} has a literal asterisk in a reading`);
    }
  }
});
