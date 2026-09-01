import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sig, fmtNum, fmtFixed, fmtSigned, fmtVec, fmtMag, fmtDirectionWords, fmtBearing,
  fmtMps, fmtN, fmtKg, fmtLength, quantity,
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

test('a live readout stays readable when the numbers stop being ordinary', () => {
  /*
   * A fixed number of decimals is there for legibility, and past a certain size
   * it stops delivering any: 2.5×10¹⁷ m/s² written out is twenty-three digits
   * that nobody can read and that break every layout they land in. Reachable in
   * ordinary use — a light object in a dense fluid — so it has to be handled
   * rather than assumed away.
   */
  assert.equal(fmtFixed(12.3456, 2), '12.35');
  assert.equal(fmtFixed(9999999, 2), '9999999.00');

  const huge = fmtFixed(2.53355e17, 2);
  assert.ok(huge.length < 12, `still ${huge.length} characters: ${huge}`);
  assert.match(huge, /×10/);
  // The sign survives, in the character that actually looks like a minus.
  assert.ok(fmtFixed(-2.5e17, 2).startsWith('−'));
  // And it reads back as the number it stands for.
  const [mantissa, power] = fmtFixed(2.53355e17, 2).split('×10');
  const digits = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const exponent = Number([...power].map((c) => digits[c] ?? c).join(''));
  const read = Number(mantissa.replace('−', '-')) * 10 ** exponent;
  assert.ok(Math.abs(read - 2.53355e17) / 2.53355e17 < 0.01);
});

/**
 * A length in the unit a person would use for it.
 *
 * Everything a metre and up stays in metres, which is where this app spends
 * almost all of its time — so nothing about the ordinary case changed when this
 * arrived. It exists for the other end: a grid label reading "0.0050 m" on a
 * bench holding a 12 cm robot is correct and useless.
 */
test('lengths come out in a unit worth reading', () => {
  assert.equal(fmtLength(12000), '12 km');
  assert.equal(fmtLength(1500), '1.5 km');
  assert.equal(fmtLength(5), '5 m');
  assert.equal(fmtLength(0.5), '0.5 m');
  assert.equal(fmtLength(0.2), '0.2 m');
  assert.equal(fmtLength(0.1), '0.1 m');
  // Below a tenth of a metre it stops being a sensible number of metres.
  assert.equal(fmtLength(0.05), '5 cm');
  assert.equal(fmtLength(0.025), '2.5 cm');
  assert.equal(fmtLength(0.01), '1 cm');
  assert.equal(fmtLength(0.005), '5 mm');
  assert.equal(fmtLength(0.001), '1 mm');
  assert.equal(fmtLength(0.00025), '0.25 mm');
  assert.equal(fmtLength(0.000005), '5 µm');
  assert.equal(fmtLength(0), '0 m');
});

test('a length that is not a number says so rather than printing NaN', () => {
  for (const bad of [NaN, Infinity, undefined, null, 'x']) {
    assert.equal(fmtLength(bad), '—', `fmtLength(${String(bad)})`);
  }
});
