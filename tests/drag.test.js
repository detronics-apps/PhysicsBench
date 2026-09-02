import test from 'node:test';
import assert from 'node:assert/strict';

import {
  reynolds, sphereCd, regime, drag, terminalSpeed, FLUIDS, fluidById,
  atmosphereAt, atmosphereColumn, meanFreePath, knudsen, slipCorrection,
} from '../js/drag.js';
import { G_STANDARD as g } from '../js/constants.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const BALL = { diameter: 0.1, area: Math.PI * 0.0025 };
const inFluid = (id, speed) => {
  const f = fluidById(id);
  return drag({ speed, density: f.density, viscosity: f.viscosity, ...BALL });
};

test('an inviscid fluid is the infinite-Reynolds limit, not the zero one', () => {
  // Getting this backwards makes a vacuum behave like treacle, because the
  // viscous term in the drag correlation goes as 24/Re.
  assert.equal(reynolds({ density: 1.2, speed: 5, length: 0.1, viscosity: 0 }), Infinity);
  close(sphereCd(Infinity), 0.4, 1e-12);
  assert.equal(reynolds({ density: 0, speed: 5, length: 0.1, viscosity: 1 }), 0);
  assert.equal(reynolds({ density: 1.2, speed: 0, length: 0.1, viscosity: 1 }), 0);
});

test('at low Reynolds number the correlation collapses to Stokes law', () => {
  // F = 3πμDv, exactly, is what the 24/Re term becomes. Agreement to a few per
  // cent is the whole reason one formula can cover both regimes.
  const slow = inFluid('honey', 0.01);
  assert.ok(slow.re < 1, `Re was ${slow.re}`);
  close(slow.force / slow.stokes, 1, 0.05);
});

test('drag goes as v in honey and as v² in air', () => {
  const factor = (id, v) => inFluid(id, 2 * v).force / inFluid(id, v).force;
  // The single most important consequence of the Reynolds number, and the
  // reason "air resistance goes as v²" cannot be stated without a condition.
  close(factor('honey', 0.005), 2, 0.08);
  close(factor('air', 20), 4, 0.15);
});

test('the regime is named honestly, including in between', () => {
  assert.equal(regime(0.1).id, 'stokes');
  assert.equal(regime(50).id, 'transitional');
  assert.equal(regime(1e5).id, 'turbulent');
  assert.equal(regime(Infinity).id, 'turbulent');
  assert.equal(regime(0).id, 'none');
  assert.equal(regime(50).power, 1.5, 'transitional flow obeys no simple power law');
});

test('the viscous share is the number that separates the fluids', () => {
  assert.ok(inFluid('honey', 0.01).viscousShare > 0.9, 'honey is almost entirely viscous');
  assert.ok(inFluid('air', 20).viscousShare < 0.01, 'air at speed is almost entirely inertial');
});

test('a shape keeps its own coefficient at speed and loses it in treacle', () => {
  const honey = fluidById('honey');
  const air = fluidById('air');
  const withShape = (fluid, speed, cdShape) => drag({
    speed, density: fluid.density, viscosity: fluid.viscosity, ...BALL, cdShape,
  }).force;

  // In air a flat plate really is about 2.7× a sphere of the same frontal area.
  close(withShape(air, 20, 1.28) / withShape(air, 20, 0.47), 1.28 / 0.47, 0.1);
  // In honey the shape barely matters — the viscosity is doing all the work.
  const ratio = withShape(honey, 0.01, 1.28) / withShape(honey, 0.01, 0.47);
  assert.ok(ratio < 1.02, `shape changed honey drag by ${((ratio - 1) * 100).toFixed(1)}%`);
});

test('no fluid, no area or no speed means no drag', () => {
  assert.equal(drag({ speed: 10, density: 0, viscosity: 0, ...BALL }).force, 0);
  assert.equal(drag({ speed: 10, density: 1.2, viscosity: 1e-5, diameter: 0.1, area: 0 }).force, 0);
  assert.equal(drag({ speed: 0, density: 1.2, viscosity: 1e-5, ...BALL }).force, 0);
});

test('terminal speed falls sharply as the fluid thickens', () => {
  const speeds = ['air', 'water', 'honey'].map((id) => {
    const f = fluidById(id);
    return terminalSpeed({ mass: 1, g, density: f.density, viscosity: f.viscosity, ...BALL });
  });
  const [air, water, honey] = speeds;
  assert.ok(air > water && water > honey, speeds.join(' / '));
  assert.ok(air > 40 && air < 100, `${air} m/s in air`);
  assert.ok(honey < 1, `${honey} m/s in honey — it should barely creep`);
  assert.equal(terminalSpeed({ mass: 1, g, density: 0, viscosity: 0, ...BALL }), Infinity);
});

test('at terminal speed the drag really does equal the weight', () => {
  const f = fluidById('water');
  const vt = terminalSpeed({ mass: 2, g, density: f.density, viscosity: f.viscosity, ...BALL });
  const atTerminal = drag({ speed: vt, density: f.density, viscosity: f.viscosity, ...BALL });
  close(atTerminal.force, 2 * g, 0.01);
});

test('every fluid carries the two properties that decide its behaviour', () => {
  for (const f of FLUIDS) {
    assert.ok(f.density >= 0 && f.viscosity >= 0, `${f.id}`);
    // Vacuum aside, both must be non-zero or the model cannot describe it.
    if (f.id !== 'vacuum') assert.ok(f.density > 0 && f.viscosity > 0, `${f.id}`);
  }
  // Honey is only slightly denser than water and vastly more viscous — the
  // fact the whole fluid step turns on.
  const water = fluidById('water');
  const honey = fluidById('honey');
  assert.ok(honey.density / water.density < 2);
  assert.ok(honey.viscosity / water.viscosity > 1000);
  assert.equal(fluidById('nonsense').id, 'vacuum');
});

/* ----------------------------------------------------- the atmosphere -- */

/**
 * Against the published International Standard Atmosphere.
 *
 * These are the numbers the standard defines, not ones this app invented, so
 * they are worth pinning to the table rather than to whatever the code happens
 * to produce. The small deviations are the standard's use of geopotential
 * rather than geometric altitude, which is well under a tenth of a percent
 * anywhere this app can reach.
 */
test('the atmosphere matches the standard table', () => {
  const table = [
    [0, 1.2250, 288.15, 101325],
    [1000, 1.1117, 281.65, 89876],
    [5000, 0.73643, 255.65, 54048],
    [11000, 0.36392, 216.65, 22632],
    [20000, 0.088035, 216.65, 5474.9],
  ];
  for (const [h, density, temperature, pressure] of table) {
    const a = atmosphereAt(h);
    assert.ok(Math.abs(a.density / density - 1) < 0.002, `${h} m: ${a.density} vs ${density}`);
    close(a.temperature, temperature, 0.05);
    assert.ok(Math.abs(a.pressure / pressure - 1) < 0.003, `${h} m: ${a.pressure} vs ${pressure}`);
  }

  // Sea level is exactly the figure the Air fluid quotes, or the two disagree
  // in the same app.
  close(atmosphereAt(0).density, 1.225, 1e-12);
  // Viscosity depends on temperature, so it falls with height and then holds.
  assert.ok(atmosphereAt(5000).viscosity < atmosphereAt(0).viscosity);
  close(atmosphereAt(15000).viscosity, atmosphereAt(20000).viscosity, 1e-12);
});

test('below sea level the air is thicker, not undefined', () => {
  assert.ok(atmosphereAt(-400).density > atmosphereAt(0).density);
  assert.ok(Number.isFinite(atmosphereAt(-400).pressure));
  // And nonsense in gives sea level rather than NaN out.
  close(atmosphereAt(NaN).density, 1.225, 1e-12);
  close(atmosphereAt(undefined).density, 1.225, 1e-12);
});

/**
 * The column integral is what keeps the energy ledger honest.
 *
 * Buoyancy in a fluid that thins with height is still conservative, but the
 * potential is the integral of ρ(y)·V·g rather than the local value times the
 * rise. If this drifts from the true integral, the books drift with it.
 */
test('the air column agrees with integrating the density by hand', () => {
  const numeric = (h, n = 20000) => {
    let sum = 0;
    const step = h / n;
    for (let i = 0; i < n; i += 1) sum += atmosphereAt((i + 0.5) * step).density * step;
    return sum;
  };
  for (const h of [10, 100, 1000, 8000, 11000, 20000]) {
    assert.ok(Math.abs(atmosphereColumn(h) / numeric(h) - 1) < 1e-6,
      `${h} m: ${atmosphereColumn(h)} vs ${numeric(h)}`);
  }
  assert.equal(atmosphereColumn(0), 0);
  // Continuous across the tropopause, where the two formulas meet.
  close(atmosphereColumn(11000), atmosphereColumn(11000.001), 1e-3);

  // Half the atmosphere is below about 5.5 km, which is the fact everybody
  // quotes and a good check that the whole thing is the right shape.
  const total = atmosphereColumn(80000);
  let lo = 0;
  let hi = 80000;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (atmosphereColumn(mid) < total / 2) lo = mid; else hi = mid;
  }
  assert.ok(lo > 5200 && lo < 5800, `half the air below ${Math.round(lo)} m`);
});

/* -------------------------------------------- where the air stops being air -- */

/**
 * The mean free path is the real quantity, not a stand-in for one.
 *
 * Sea-level air is measured at about 6.8e-8 m between collisions. Getting this
 * roughly right is what makes the Knudsen number below mean anything.
 */
test('the mean free path at sea level matches the measured one', () => {
  const air = atmosphereAt(0);
  const lambda = meanFreePath(air);
  assert.ok(lambda > 5e-8 && lambda < 8e-8, `${lambda} m is not sea-level air`);
});

/**
 * Drag has to vanish with the air, and it did not.
 *
 * Stokes drag genuinely does not depend on density, and gas viscosity genuinely
 * does not either, so the two together said a rocket 4,600 km up still felt
 * 6.23 N - the same figure it felt at 200 km, and at 1,000, and at 4,000. Then
 * 24/Re overflowed and the force became infinite. Both halves were real physics
 * applied where the continuum it assumes had stopped existing.
 */
test('drag falls away with the air instead of holding at a constant', () => {
  const ROCKET = { speed: 8699, diameter: 70, area: 294, cdShape: 0.12 };
  const at = (h) => {
    const air = atmosphereAt(h);
    return drag({ ...ROCKET, density: air.density, viscosity: air.viscosity, temperature: air.temperature });
  };

  const ground = at(0).force;
  const high = at(100e3).force;
  const veryHigh = at(1e6).force;
  const space = at(1e7).force;

  assert.ok(Number.isFinite(ground) && ground > 1e8, `sea level gave ${ground} N`);
  // Each step up thins the air by orders of magnitude; the force must follow.
  assert.ok(high < ground / 1000, `100 km gave ${high} N against ${ground} at sea level`);
  assert.ok(veryHigh < high / 1e10, `1000 km gave ${veryHigh} N against ${high} at 100 km`);
  assert.equal(space, 0, `10,000 km gave ${space} N`);

  // And nothing anywhere on the way up is infinite - the old failure.
  for (let h = 0; h <= 1e7; h += 1e5) {
    const f = at(h).force;
    assert.ok(Number.isFinite(f), `drag was ${f} at ${h / 1000} km`);
  }
});

/**
 * The correction is inert where the continuum holds, which is nearly everywhere.
 *
 * A slip correction that quietly changed the answer in water or at sea level
 * would have fixed one bug by introducing a worse one.
 */
test('the slip correction leaves ordinary air and liquids alone', () => {
  const cases = [
    ['sea-level air', atmosphereAt(0)],
    ['air at 10 km', atmosphereAt(10e3)],
    ['water', { density: 997, viscosity: 1e-3, temperature: 293.15 }],
    ['honey', { density: 1420, viscosity: 10, temperature: 293.15 }],
  ];
  for (const [name, fluid] of cases) {
    const kn = knudsen({ ...fluid, length: 0.4 });
    assert.ok(kn < 0.01, `${name} has Kn = ${kn}, which is not a continuum`);
    const slip = slipCorrection(kn);
    assert.ok(slip < 1.02, `${name} slip correction was ${slip}, not ~1`);
  }
});

test('slip grows in proportion to Knudsen once the gas is thin', () => {
  /*
   * Far into free-molecular flow the exponential has gone to one, so the
   * correction settles at (1.257 + 0.4)*Kn. What matters is that it is
   * proportional to Kn at all: Kn goes as 1/density, so the viscous force ends
   * up proportional to density and vanishes with the air.
   */
  for (const kn of [1e3, 1e6, 1e9]) {
    const ratio = slipCorrection(kn) / kn;
    close(ratio, 1.657, 0.01);
  }
  assert.equal(slipCorrection(Infinity), Infinity);
});
