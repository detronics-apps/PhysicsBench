import test from 'node:test';
import assert from 'node:assert/strict';

import { vec, len, fromPolarDeg, perp, dot, ZERO } from '../js/vec.js';
import {
  FORCE_STYLE, forcesOn, weightForce, dragForce, springForce, buoyancyForce, buoyantMass,
  inEquilibrium, accelerationFrom, forceFor, uniformField,
} from '../js/forces.js';
import { G_STANDARD } from '../js/constants.js';
import { terminalSpeed } from '../js/drag.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const EARTH = { field: uniformField(G_STANDARD) };

test('the visual language is defined once, for every force', () => {
  for (const [id, style] of Object.entries(FORCE_STYLE)) {
    assert.ok(style.label && style.symbol && style.token, `${id} incomplete`);
    assert.match(style.token, /^--force-/);
  }
  // Every force the solver can emit must have a style, or the legend and the
  // arrows drift apart.
  for (const id of ['weight', 'normal', 'friction', 'drag', 'applied', 'net']) {
    assert.ok(FORCE_STYLE[id], `${id} has no style`);
  }
});

test('uniform field points down, and g is a strength', () => {
  assert.deepEqual(uniformField(9.80665), { x: 0, y: -9.80665 });
  assert.deepEqual(uniformField(0), { x: 0, y: -0 });
  // A negative custom field points up. Allowed, and the maths says so.
  assert.equal(uniformField(-5).y, 5);
});

test('weight is mass times the field, and mass alone does not change the field', () => {
  const light = weightForce(1, uniformField(G_STANDARD));
  const heavy = weightForce(10, uniformField(G_STANDARD));
  close(light.magnitude, 9.80665, 1e-9);
  close(heavy.magnitude, 98.0665, 1e-9);
  // Ten times the mass, ten times the weight — but identical acceleration.
  close(heavy.magnitude / light.magnitude, 10, 1e-12);
  close(accelerationFrom(heavy.magnitude, 10), accelerationFrom(light.magnitude, 1), 1e-12);
});

test('a body in free fall has one force and accelerates at g regardless of mass', () => {
  for (const mass of [0.1, 1, 10, 1000]) {
    const r = forcesOn({ mass, pos: vec(0, 10), vel: vec(0, 0) }, EARTH, null);
    assert.equal(r.forces.length, 1);
    assert.equal(r.forces[0].id, 'weight');
    close(r.acceleration.y, -G_STANDARD, 1e-12);
    assert.equal(r.contact.touching, false);
  }
});

test('a resting box: the normal force cancels weight exactly', () => {
  const r = forcesOn(
    { mass: 4, pos: vec(0, 0), vel: vec(0, 0) },
    EARTH,
    { normal: vec(0, 1), muS: 0.5, muK: 0.4 },
  );
  close(r.by('normal').magnitude, 4 * G_STANDARD, 1e-9);
  close(len(r.net.vec), 0, 1e-9);
  assert.ok(inEquilibrium(r));
  assert.equal(r.contact.frictionMode, 'static');
});

test('static friction takes only the value it needs, not its maximum', () => {
  // Push a 10 kg box with 5 N. μs·N is 0.5 × 98.07 = 49 N, so it does not move
  // and friction is exactly 5 N — not 49 N.
  const r = forcesOn(
    { mass: 10, pos: vec(0, 0), vel: vec(0, 0), applied: vec(5, 0) },
    EARTH,
    { normal: vec(0, 1), muS: 0.5, muK: 0.4 },
  );
  close(r.by('friction').magnitude, 5, 1e-9);
  assert.equal(r.contact.frictionMode, 'static');
  close(len(r.net.vec), 0, 1e-9);
  assert.match(r.by('friction').note, /at most|less than its limit/i);
  close(r.contact.staticLimit, 0.5 * 10 * G_STANDARD, 1e-9);
});

test('exceeding the static limit breaks the box away at the kinetic value', () => {
  const r = forcesOn(
    { mass: 10, pos: vec(0, 0), vel: vec(0, 0), applied: vec(60, 0) },
    EARTH,
    { normal: vec(0, 1), muS: 0.5, muK: 0.4 },
  );
  assert.equal(r.contact.frictionMode, 'breaking-away');
  close(r.by('friction').magnitude, 0.4 * 10 * G_STANDARD, 1e-9);
  // Net = 60 − 39.2 = 20.8 N to the right.
  close(r.net.vec.x, 60 - 0.4 * 10 * G_STANDARD, 1e-9);
  close(r.acceleration.x, (60 - 0.4 * 10 * G_STANDARD) / 10, 1e-9);
});

test('a sliding box is decelerated by kinetic friction alone', () => {
  const r = forcesOn(
    { mass: 2, pos: vec(0, 0), vel: vec(3, 0) },
    EARTH,
    { normal: vec(0, 1), muS: 0.5, muK: 0.3 },
  );
  assert.equal(r.contact.frictionMode, 'kinetic');
  // Friction opposes the motion: negative x.
  assert.ok(r.by('friction').vec.x < 0);
  // a = −μk·g, independent of mass.
  close(r.acceleration.x, -0.3 * G_STANDARD, 1e-9);
  const heavier = forcesOn(
    { mass: 200, pos: vec(0, 0), vel: vec(3, 0) },
    EARTH,
    { normal: vec(0, 1), muS: 0.5, muK: 0.3 },
  );
  close(heavier.acceleration.x, r.acceleration.x, 1e-9);
});

test('a body at constant velocity with balanced forces has zero net force', () => {
  // A car at a steady speed: applied force exactly equals friction. This is the
  // distinction between "not accelerating" and "no forces acting".
  const drive = 0.3 * 2 * G_STANDARD;
  const r = forcesOn(
    { mass: 2, pos: vec(0, 0), vel: vec(12, 0), applied: vec(drive, 0) },
    EARTH,
    { normal: vec(0, 1), muS: 0.5, muK: 0.3 },
  );
  close(len(r.net.vec), 0, 1e-9);
  assert.ok(inEquilibrium(r));
  assert.equal(r.forces.length, 4, 'four forces act, and they sum to zero');
});

test('on a ramp the normal force is mg·cosθ and gravity pulls mg·sinθ down-slope', () => {
  const theta = 30;
  const mass = 5;
  const normal = fromPolarDeg(1, 90 + theta);          // perpendicular to a 30° slope
  const r = forcesOn({ mass, pos: vec(0, 0), vel: vec(0, 0) }, EARTH, { normal, muS: 0, muK: 0 });

  close(r.by('normal').magnitude, mass * G_STANDARD * Math.cos((theta * Math.PI) / 180), 1e-9);
  // With no friction the net force is mg·sinθ, directed down the slope.
  close(len(r.net.vec), mass * G_STANDARD * Math.sin((theta * Math.PI) / 180), 1e-9);
  close(len(r.acceleration), G_STANDARD * Math.sin((theta * Math.PI) / 180), 1e-9);
  // And it lies along the slope, not through it.
  close(dot(r.net.vec, normal), 0, 1e-9);
});

test('a ramp shallow enough for friction to hold produces no net force', () => {
  // tan(20°) = 0.364, below μs = 0.5, so the block stays put.
  const normal = fromPolarDeg(1, 110);
  const r = forcesOn({ mass: 5, pos: vec(0, 0), vel: vec(0, 0) }, EARTH, { normal, muS: 0.5, muK: 0.4 });
  assert.equal(r.contact.frictionMode, 'static');
  close(len(r.net.vec), 0, 1e-9);
});

test('drag opposes motion and grows with the square of speed', () => {
  const opts = { density: 1.225, cd: 0.47, area: 0.01 };
  const slow = dragForce(vec(10, 0), opts);
  const fast = dragForce(vec(20, 0), opts);
  assert.ok(slow.vec.x < 0, 'drag opposes travel');
  close(fast.magnitude / slow.magnitude, 4, 1e-9);
  // Stationary, or in a vacuum, there is no drag at all.
  close(dragForce(vec(0, 0), opts).magnitude, 0);
  close(dragForce(vec(10, 0), { density: 0, cd: 0.47, area: 0.01 }).magnitude, 0);
});

test('drag depends on velocity relative to the air', () => {
  const opts = { density: 1.225, cd: 1, area: 1, wind: vec(10, 0) };
  // Moving with the wind at the same speed: no relative flow, no drag.
  close(dragForce(vec(10, 0), opts).magnitude, 0);
  // Moving into it: drag from a relative speed of 20 m/s.
  const into = dragForce(vec(-10, 0), opts);
  close(into.magnitude, 0.5 * 1.225 * 1 * 1 * 400, 1e-9);
  assert.ok(into.vec.x > 0, 'a headwind pushes backwards along the travel direction');
});

test('terminal speed is where drag balances weight', () => {
  const mass = 80;
  const shape = { density: 1.225, viscosity: 1.81e-5, cdShape: 1.0, area: 0.7, diameter: 0.9 };
  const vt = terminalSpeed({ mass, g: G_STANDARD, ...shape });
  // A belly-down skydiver: roughly 43 m/s, about 155 km/h.
  assert.ok(vt > 38 && vt < 48, `${vt} m/s is not a plausible terminal speed`);

  // At exactly that speed the net force really is zero.
  const r = forcesOn(
    { mass, pos: vec(0, 100), vel: vec(0, -vt), cd: shape.cdShape, area: shape.area, diameter: shape.diameter },
    { field: uniformField(G_STANDARD), fluidDensity: shape.density, viscosity: shape.viscosity },
    null,
  );
  close(len(r.net.vec), 0, 1e-3);

  // In a vacuum there is no terminal speed at all.
  assert.equal(terminalSpeed({ mass, g: G_STANDARD, density: 0, area: 1 }), Infinity);
});

test('a heavier object of the same shape has a higher terminal speed', () => {
  // Which is the honest reason a heavy object outfalls a light one in air —
  // not because gravity pulls it harder, but because it takes more drag to
  // balance more weight.
  const shape = { density: 1.225, viscosity: 1.81e-5, cdShape: 0.47, area: 0.01, diameter: 0.113 };
  const light = terminalSpeed({ mass: 1, g: G_STANDARD, ...shape });
  const heavy = terminalSpeed({ mass: 10, g: G_STANDARD, ...shape });
  assert.ok(heavy > light);
  // Close to √10 — not exactly, because C_d is not constant across the range.
  close(heavy / light, Math.sqrt(10), 0.2);
});

test('terminal speed falls sharply as the fluid thickens', () => {
  const shape = { area: Math.PI * 0.0025, diameter: 0.1 };
  const inFluid = (density, viscosity) =>
    terminalSpeed({ mass: 1, g: G_STANDARD, density, viscosity, ...shape });

  const air = inFluid(1.225, 1.81e-5);
  const water = inFluid(997, 1.0e-3);
  const honey = inFluid(1420, 10);
  assert.ok(air > water && water > honey, `${air} / ${water} / ${honey}`);
  assert.ok(honey < 1, 'a 1 kg ball should barely creep through honey');
});

test('a spring pulls back towards its natural length', () => {
  const f = springForce(vec(0.1, 0), 200);
  close(f.vec.x, -20, 1e-9);
  close(springForce(vec(0, 0), 200).magnitude, 0);
});

test('the net force is exactly the sum of the listed forces', () => {
  const r = forcesOn(
    { mass: 3, pos: vec(0, 0), vel: vec(2, 0), applied: vec(15, 0), cd: 0.47, area: 0.02 },
    { field: uniformField(G_STANDARD), fluidDensity: 1.225 },
    { normal: vec(0, 1), muS: 0.4, muK: 0.3 },
  );
  const listed = r.forces.reduce((acc, f) => ({ x: acc.x + f.vec.x, y: acc.y + f.vec.y }), { x: 0, y: 0 });
  close(listed.x, r.net.vec.x, 1e-12);
  close(listed.y, r.net.vec.y, 1e-12);
  // Every arrow on screen is accounted for; nothing is applied invisibly.
  assert.deepEqual(r.forces.map((f) => f.id).sort(), ['applied', 'drag', 'friction', 'normal', 'weight']);
});

test('a body lifted off the surface loses its normal force', () => {
  // Pull up harder than the weight: the normal force goes to zero, not negative.
  const r = forcesOn(
    { mass: 2, pos: vec(0, 0), vel: vec(0, 0), applied: vec(0, 50) },
    EARTH,
    { normal: vec(0, 1), muS: 0.9, muK: 0.8 },
  );
  close(r.by('normal').magnitude, 0);
  close(r.by('friction').magnitude, 0, 1e-12);
  assert.ok(r.net.vec.y > 0);
});

test('forceFor and accelerationFrom are inverses', () => {
  close(forceFor(7, 3), 21, 1e-12);
  close(accelerationFrom(21, 7), 3, 1e-12);
  assert.equal(accelerationFrom(10, 0), Infinity);
});

test('a zero weight always carries its reason', () => {
  /*
   * Weight comes out zero wherever there is no field: the first two steps,
   * where nothing has been put in the scene to do the pulling, and deep space.
   * Printed as a bare "0.00 N" it reads as "this object is weightless", which is
   * the opposite of what the model says — the mass is unchanged, and it is the
   * field that is absent.
   */
  const level = weightForce(2, vec(0, 0));
  close(level.magnitude, 0);
  assert.match(level.note, /not become weightless/);
  assert.match(level.note, /no gravitational field/);
  // And it must not explain itself with a surface, since there may not be one.
  assert.ok(!/level surface|the track|the carts/i.test(level.note));

  // A real weight needs no apology.
  assert.equal(weightForce(2, uniformField(G_STANDARD)).note, '');

  // And the reason survives the trip through the solver, which is where it is
  // actually read from.
  const r = forcesOn({ mass: 2, pos: vec(0, 0), vel: vec(3, 0) }, { field: vec(0, 0) }, null);
  assert.match(r.by('weight').note, /no gravitational field/);
});


/* -------------------------------------------------------------- buoyancy -- */

test('buoyancy is the weight of the fluid displaced, and nothing about the object', () => {
  const field = vec(0, -9.81);
  const lead = buoyancyForce(0.001, 997, field);
  const foam = buoyancyForce(0.001, 997, field);
  // Same volume, same fluid: identical. What the object is made of does not
  // enter Archimedes' principle at all.
  close(lead.magnitude, foam.magnitude, 1e-12);
  close(lead.magnitude, 0.001 * 997 * 9.81, 1e-9);
  // And it points up, against the field.
  assert.ok(lead.vec.y > 0);
});

test('no fluid, no buoyancy — a vacuum has nothing to displace', () => {
  close(buoyancyForce(1, 0, vec(0, -9.81)).magnitude, 0, 1e-12);
  close(buoyancyForce(0, 997, vec(0, -9.81)).magnitude, 0, 1e-12);
});

test('the effective mass is what is left after the fluid has pushed back', () => {
  const body = { mass: 2, volume: 0.001 };
  close(buoyantMass(body, { fluidDensity: 0 }), 2, 1e-12);
  close(buoyantMass(body, { fluidDensity: 997 }), 2 - 0.997, 1e-12);
  // Negative for anything that floats, which is what floating means: the
  // effective weight points upward.
  assert.ok(buoyantMass({ mass: 0.5, volume: 0.001 }, { fluidDensity: 997 }) < 0);
});

test('a balloon in water feels a net upward force, from the ordinary sum', () => {
  const result = forcesOn(
    { mass: 2, vel: ZERO, pos: vec(0, 0), volume: 0.027, area: 0.13, cd: 0.5, diameter: 0.4 },
    { field: vec(0, -9.81), fluidDensity: 997, viscosity: 1e-3 },
    null,
  );
  assert.ok(result.by('buoyancy'));
  assert.ok(result.by('buoyancy').magnitude > result.by('weight').magnitude);
  // Nothing was switched on to make it float. The comparison simply came out
  // the other way, and the net force is the same sum it always was.
  assert.ok(result.net.vec.y > 0);
});

test('the control force joins the sum like any other force', () => {
  const result = forcesOn(
    { mass: 1, vel: ZERO, pos: vec(0, 0), controlForce: vec(5, 0) },
    { field: vec(0, 0) },
    null,
  );
  assert.equal(result.by('control').magnitude, 5);
  close(result.acceleration.x, 5, 1e-12);
});

test('a contact reports which way its surface faces, whatever surface it is', () => {
  const onSlope = forcesOn(
    { mass: 1, vel: ZERO, pos: vec(0, 0) },
    { field: vec(0, -9.81) },
    { normal: vec(0, 1), muS: 0.5, muK: 0.4, surface: 'wall' },
  );
  assert.equal(onSlope.contact.surface, 'wall');
  close(onSlope.contact.normal.y, 1, 1e-12);
  // No contact means no normal at all, rather than a plausible-looking default
  // the stepper could pick up and use.
  assert.equal(forcesOn({ mass: 1, vel: ZERO, pos: vec(0, 0) }, {}, null).contact.normal, null);
});
