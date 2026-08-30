import test from 'node:test';
import assert from 'node:assert/strict';

import { reynolds, sphereCd, regime, drag, terminalSpeed, FLUIDS, fluidById } from '../js/drag.js';
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
