import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sig, fmtNum, fmtFixed, fmtSigned, fmtVec, fmtMag, fmtDirectionWords, fmtBearing,
  fmtMps, fmtN, fmtKg, quantity,
} from '../js/format.js';

test('sig rounds to significant figures', () => {
  assert.equal(sig(9.80665, 3), 9.81);
  assert.equal(sig(0.00012345, 2), 0.00012);
  assert.equal(sig(0, 4), 0);
  assert.equal(sig(NaN, 4), 0);
});

test('fmtNum never leaks full precision into prose', () => {
  // pitfalls.md #9: the whole reason this module exists.
  assert.equal(fmtNum(19.6078431373, 3), '19.6');
  assert.equal(fmtNum(0, 4), '0');
  assert.equal(fmtNum(1 / 3, 4), '0.3333');
  assert.equal(fmtNum(Infinity), '—');
});

test('fmtFixed holds a stable width for a live readout', () => {
  assert.equal(fmtFixed(12.3456, 2), '12.35');
  assert.equal(fmtFixed(0.0009321, 2), '0.00');
  // A velocity passing through zero must not render as a negative zero.
  assert.equal(fmtFixed(-0, 2), '0.00');
  assert.equal(fmtFixed(-0.0001, 2), '0.00');
});

test('fmtSigned marks direction explicitly', () => {
  assert.equal(fmtSigned(4.2, 1), '+4.2');
  assert.equal(fmtSigned(-4.2, 1), '−4.2');
  assert.equal(fmtSigned(0, 2), '0.00');
});

test('unit helpers always attach the unit', () => {
  assert.equal(fmtMps(3), '3.00 m/s');
  assert.equal(fmtN(19.62), '19.62 N');
  assert.equal(fmtKg(2), '2.00 kg');
  assert.equal(quantity(9.80665, 'm/s²', { direction: 'downward' }), '9.81 m/s² downward');
});

test('vectors render as components and as a magnitude', () => {
  assert.equal(fmtVec({ x: 3, y: -4 }, 'm/s'), '(3.00, −4.00) m/s');
  assert.equal(fmtMag({ x: 3, y: -4 }, 'm/s'), '5.00 m/s');
  assert.equal(fmtVec(null), '—');
});

test('direction is given in words, and the mapping lives in one place', () => {
  assert.equal(fmtDirectionWords({ x: 0, y: -1 }), 'downward');
  assert.equal(fmtDirectionWords({ x: 0, y: 1 }), 'upward');
  assert.equal(fmtDirectionWords({ x: 5, y: 0 }), 'to the right');
  assert.equal(fmtDirectionWords({ x: -5, y: 0 }), 'to the left');
  assert.equal(fmtDirectionWords({ x: 3, y: 4 }), 'up and to the right');
  assert.equal(fmtDirectionWords({ x: -3, y: -4 }), 'down and to the left');
  assert.equal(fmtDirectionWords({ x: 0, y: 0 }), 'no direction (magnitude is zero)');
});

test('bearing is measured anticlockwise from +x', () => {
  assert.equal(fmtBearing({ x: 1, y: 1 }), '45.0°');
  assert.equal(fmtBearing({ x: 0, y: -1 }), '−90.0°');
  assert.equal(fmtBearing({ x: 0, y: 0 }), '—');
});
