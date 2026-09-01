import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHAPES, shapeById, describe, sizeFor, dragComparison, MATERIALS, materialById,
  floats, outline, detail, TYPICAL, contactKind,
} from '../js/shapes.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('every shape gives a volume, an area and a support height from one size', () => {
  for (const s of SHAPES) {
    const v = s.volume(1);
    assert.ok(v > 0 && Number.isFinite(v), `${s.id} volume`);
    assert.ok(s.area(1) > 0, `${s.id} area`);
    assert.ok(s.support(1) > 0, `${s.id} support`);
    assert.ok(s.cd > 0 && s.cd < 2, `${s.id} cd`);
    // Every volume is a constant times s³, which is what lets `sizeFor` invert
    // it with a single sample.
    close(s.volume(2) / v, 8, 1e-9);
    close(s.area(2) / s.area(1), 4, 1e-9);
  }
  assert.equal(shapeById('nonsense').id, 'sphere');
});

test('a sphere and a cube of the same width differ in the right direction', () => {
  const sphere = describe({ shapeId: 'sphere', size: 1, mass: 1 });
  const cube = describe({ shapeId: 'cube', size: 1, mass: 1 });
  // π/6 of the cube's volume, π/4 of its frontal area, and about half its drag.
  close(sphere.volume / cube.volume, Math.PI / 6, 1e-9);
  close(sphere.area / cube.area, Math.PI / 4, 1e-9);
  assert.ok(sphere.cd < cube.cd);
});

test('mass either comes from the density or sets it', () => {
  const fromDensity = describe({ shapeId: 'cube', size: 0.5, density: 7850 });
  close(fromDensity.mass, 0.125 * 7850, 1e-9);
  close(fromDensity.density, 7850, 1e-9);

  const fromMass = describe({ shapeId: 'cube', size: 0.5, mass: 10 });
  close(fromMass.mass, 10, 1e-12);
  close(fromMass.density, 10 / 0.125, 1e-9);
});

test('sizeFor inverts describe, for every shape', () => {
  for (const s of SHAPES) {
    const size = sizeFor(s.id, 12, 2700);
    const back = describe({ shapeId: s.id, size, density: 2700 });
    close(back.mass, 12, 1e-6);
  }
  assert.equal(sizeFor('sphere', 0, 1000), 0);
  assert.equal(sizeFor('sphere', 5, 0), 0);
});

test('drag comparison is stated against a sphere, because 1.28 means nothing alone', () => {
  close(dragComparison('sphere', 1).ratio, 1, 1e-9);
  // A flat plate: 1.28 × s² against a sphere's 0.47 × πs²/4.
  close(dragComparison('plate', 1).ratio, (1.28 * 1) / (0.47 * Math.PI / 4), 1e-9);
  assert.ok(dragComparison('streamlined', 1).ratio < 0.1);
  assert.match(dragComparison('cube', 1).text, /× a sphere of the same width/);
});

test('a rolling shape is marked as one, and a flat plate sits low', () => {
  assert.equal(shapeById('sphere').rolls, true);
  assert.equal(shapeById('cylinder').rolls, true);
  assert.equal(shapeById('cube').rolls, false);
  // A plate is a tenth as thick as it is wide, so its centre sits a twentieth up.
  close(shapeById('plate').support(1), 0.05, 1e-9);
  close(shapeById('cube').support(1), 0.5, 1e-9);
});

test('materials span the range that makes same-size-different-mass possible', () => {
  assert.ok(MATERIALS.length >= 8);
  const heaviest = MATERIALS.reduce((a, b) => (a.density > b.density ? a : b));
  const lightest = MATERIALS.reduce((a, b) => (a.density < b.density ? a : b));
  // Helium to osmium is a factor of over a hundred thousand, which is what
  // makes "same size, wildly different mass" — and floating — set up at all.
  assert.ok(heaviest.density / lightest.density > 100000);
  assert.equal(materialById('nonsense').id, 'aluminium');
});

test('floating is decided by density, and by nothing else', () => {
  const wood = floats(500, 997);
  assert.equal(wood.floats, true);
  assert.match(wood.text, /rises/);

  const steel = floats(7850, 997);
  assert.equal(steel.floats, false);
  close(steel.ratio, 7850 / 997, 1e-9);
  // Even a sinking object is partly held up, which is the half of Archimedes
  // that people forget: the stone really is lighter underwater.
  assert.match(steel.text, /easier to lift underwater/);

  // Nothing floats in a vacuum, because there is nothing to displace.
  assert.equal(floats(1000, 0).floats, false);
  assert.match(floats(1000, 0).text, /vacuum/);
});

test('a car and a balloon are mostly not there, and buoyancy knows it', () => {
  const cube = describe({ shapeId: 'cube', size: 2, mass: 100 });
  const car = describe({ shapeId: 'car', size: 2, mass: 100 });
  // A car's bounding box is nothing like its volume, and using the box would
  // overstate the fluid it displaces by more than ten times.
  assert.ok(car.volume < cube.volume / 10);
  assert.ok(car.density > cube.density * 10);

  // The two car outlines are different drawings of the same object.
  assert.ok(outline('car', { topDown: false }));
  assert.notEqual(outline('car', { topDown: true }), outline('car', { topDown: false }));
  // A sphere has no outline to draw, because a circle is a better primitive.
  assert.equal(outline('sphere'), null);
  // Every other shape has one, or it would be drawn as a rectangle.
  for (const s of SHAPES) {
    assert.ok(s.circle || typeof outline(s.id) === 'string', s.id + ' has no outline');
  }
});


test('every outline fills its own box, so the aspect is only applied once', () => {
  /*
   * An outline that only spans part of −0.5..0.5 gets squashed twice: once by
   * its own coordinates and again by the shape's aspect ratio. That drew the
   * car at a sixth of its height — a skirting board with wheels — and it is
   * invisible in the code, because both halves look correct on their own.
   */
  const extent = (d) => {
    const numbers = d.trim().split(/[\s,]+/).filter((tok) => !/^[A-Za-z]$/.test(tok)).map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };

  for (const shape of SHAPES) {
    for (const topDown of [false, true]) {
      const d = outline(shape.id, { topDown });
      if (!d) continue;
      const box = extent(d);
      assert.ok(Math.abs(box.minX + 0.5) < 1e-9, `${shape.id} left edge at ${box.minX}`);
      assert.ok(Math.abs(box.maxX - 0.5) < 1e-9, `${shape.id} right edge at ${box.maxX}`);
      assert.ok(Math.abs(box.minY + 0.5) < 1e-9, `${shape.id} top edge at ${box.minY}`);
      assert.ok(Math.abs(box.maxY - 0.5) < 1e-9, `${shape.id} bottom edge at ${box.maxY}`);
    }
  }
});

test('a shape rests on the ground rather than sinking into it', () => {
  // The support height is how far the centre sits above the surface, and the
  // drawn height is size × aspect. If they disagree, the object visibly floats
  // above the floor or has its bottom through it.
  for (const shape of SHAPES) {
    const drawnHalfHeight = (1 * shape.aspect) / 2;
    close(shape.support(1), drawnHalfHeight, 1e-9);
  }
});

test('a teardrop leads with its blunt end, which is the whole of its claim', () => {
  /*
   * It was drawn mirrored — the point leading and the round end trailing —
   * which is a picture of a shape with roughly the drag of a flat plate rather
   * than one with a thirtieth of it. Local +x is the direction of travel for
   * every outline here, so the round end belongs there.
   *
   * Almost all of a streamlined body's advantage is in the long tail rather
   * than the blunt nose: it is the wake behind a bluff body that costs, not the
   * air in front of it. Turned around, most of the saving goes with it.
   */
  const points = (d) => {
    const tokens = d.trim().split(/[\s,]+/).filter((t) => !/^[A-Za-z]$/.test(t)).map(Number);
    const out = [];
    for (let i = 0; i < tokens.length; i += 2) out.push({ x: tokens[i], y: tokens[i + 1] });
    return out;
  };
  const thickest = (pts, where) => {
    const kept = pts.filter(where);
    return kept.length ? Math.max(...kept.map((p) => Math.abs(p.y))) : 0;
  };

  const teardrop = points(shapeById('streamlined').path);
  const leading = thickest(teardrop, (p) => p.x > 0.15);
  const trailing = thickest(teardrop, (p) => p.x < -0.15);
  assert.ok(leading > trailing, `the point is leading: ${leading} at the front, ${trailing} behind`);
  // And it really does come to a point behind, rather than being blunt at both ends.
  assert.ok(trailing < 0.1, `the tail is ${trailing} thick, which is not a tail`);

  // The note has to say the same thing the drawing does.
  assert.match(shapeById('streamlined').note, /round end is the one that goes first/);
});

test('every shape that points somewhere still fills its box after being turned', () => {
  for (const shape of SHAPES) {
    for (const topDown of [false, true]) {
      const d = outline(shape.id, { topDown });
      if (!d) continue;
      const tokens = d.trim().split(/[\s,]+/).filter((t) => !/^[A-Za-z]$/.test(t)).map(Number);
      const xs = tokens.filter((_, i) => i % 2 === 0);
      const ys = tokens.filter((_, i) => i % 2 === 1);
      close(Math.min(...xs), -0.5, 1e-9);
      close(Math.max(...xs), 0.5, 1e-9);
      close(Math.min(...ys), -0.5, 1e-9);
      close(Math.max(...ys), 0.5, 1e-9);
    }
  }
});

/* ------------------------------------------------- people, and a rover -- */

/**
 * The two people are the same stuff at different scales.
 *
 * The number worth pinning is the density: about 985 kg/m³, a whisker under
 * water. It is why a person floats with their lungs full and sinks with them
 * empty, and if the volume coefficients ever drift it is the first thing that
 * would quietly stop being true.
 */
test('a person comes out the density of a person', () => {
  for (const [id, height, mass] of [['human-m', 1.76, 73], ['human-f', 1.63, 60]]) {
    const t = TYPICAL[id];
    const d = describe({ shapeId: id, size: t.size, mass: t.mass });
    assert.equal(t.mass, mass);
    close(d.height, height, 0.01);
    // Just under water, so a person floats — barely.
    close(d.density, 985, 6);
    assert.ok(d.density < 1000, 'a person who sinks in fresh water is wrong');
    // A bluff body, nothing like a teardrop.
    assert.ok(d.cd > 1, `${id} is not a streamlined shape`);
    assert.equal(d.rolls, false, 'people do not roll');
  }
  // Frontal areas: a standing adult is around half to three quarters of a m².
  close(describe({ shapeId: 'human-m', size: TYPICAL['human-m'].size, mass: 73 }).area, 0.68, 0.02);
  close(describe({ shapeId: 'human-f', size: TYPICAL['human-f'].size, mass: 60 }).area, 0.55, 0.02);
});

test('people are taller than they are wide, which is what aspect is for', () => {
  for (const id of ['human-m', 'human-f']) {
    const d = describe({ shapeId: id, size: TYPICAL[id].size, mass: TYPICAL[id].mass });
    assert.ok(d.height > TYPICAL[id].size * 3, `${id} is drawn too squat`);
    // The centre sits at half the drawn height, so a standing figure rests with
    // its feet on the floor rather than sunk into it or hovering above it.
    close(d.support, d.height / 2, 1e-9);
  }
});

/**
 * The Magbot Rover, to the figures on the product.
 *
 * 12 cm, 600 g, 0.00173 m³ — and the volume is the one that has to be exact,
 * because it is what buoyancy reads and it was given rather than derived.
 */
test('the Magbot Rover matches the robot it is a model of', () => {
  const d = describe({ shapeId: 'magbot', size: 0.12, mass: 0.6 });
  close(d.height, 0.12, 1e-9);
  close(d.volume, 0.00173, 1e-5);
  close(d.density, 347, 2);
  // A bluff box meets the air like a flat plate.
  close(d.cd, shapeById('plate').cd, 1e-9);
  close(d.area, 0.0144, 1e-6);
  close(d.support, 0.06, 1e-9);
});

/**
 * It has wheels and it still does not roll.
 *
 * The N20 gearmotors driving them are heavily reduced and will not back-drive,
 * so an unpowered Magbot does not coast — it grips and stops. Marking it as
 * wheeled would have handed it rolling resistance, one to three orders of
 * magnitude weaker, and sent it gliding across the bench like a trolley.
 */
test('the Magbot grips rather than freewheeling, unlike the car', () => {
  assert.equal(describe({ shapeId: 'magbot', size: 0.12, mass: 0.6 }).rolls, false);
  assert.equal(contactKind('magbot').mode, 'sliding');
  // The car, which does coast, is the contrast worth having in the same test.
  assert.equal(contactKind('car').mode, 'rolling');
  assert.equal(contactKind('sphere').mode, 'rolling');
});

test('the rover and the car are each drawn twice, side on and from above', () => {
  for (const id of ['magbot', 'car']) {
    const side = outline(id);
    const top = outline(id, { topDown: true });
    assert.ok(side && top, `${id} is missing an outline`);
    assert.notEqual(side, top, `${id} draws the same picture from both directions`);
  }
  // A person looks the same standing whichever way you walk round them.
  assert.equal(outline('human-m'), outline('human-m', { topDown: true }));
});

test('the rover carries markings, and they are only ever decoration', () => {
  // Side and top get their own, and they differ — the top one has the arrow.
  assert.ok(detail('magbot'), 'the rover lost its markings');
  assert.ok(detail('magbot', { topDown: true }));
  assert.notEqual(detail('magbot'), detail('magbot', { topDown: true }));
  // A shape without any says so plainly rather than returning something empty.
  assert.equal(detail('cube'), null);
  assert.equal(detail('sphere'), null);

  // Markings stay inside the outline's box, or they would be clipped or would
  // stretch the shape's apparent size.
  for (const topDown of [false, true]) {
    const d = detail('magbot', { topDown });
    const numbers = d.trim().split(/[\s,]+/).filter((t) => !/^[A-Za-z]$/.test(t)).map(Number);
    assert.ok(numbers.every((v) => Math.abs(v) <= 0.5 + 1e-9), 'a marking runs outside the box');
  }
});

test('the woman is drawn differently enough to tell apart', () => {
  // Both fill the same box, so the difference has to be in the shape itself —
  // a few centimetres of shoulder width is one pixel at the size these draw at.
  assert.notEqual(outline('human-m'), outline('human-f'));
});

/**
 * The heads come out round on screen, which is not the same as round in the path.
 *
 * A person's box is about four times taller than it is wide, and `aspect`
 * stretches everything in the path by that factor when it is drawn — so a
 * circle in these coordinates renders as a tall oval, and a head that looks
 * right in the source looks wrong in the app. The head has to be drawn as a
 * wide ellipse, squashed by exactly the aspect, to come out circular.
 *
 * This measures the first subpath, which is the head, and asks what shape it
 * will actually be once drawn.
 */
test('a person has a round head where it counts — on the drawing', () => {
  for (const id of ['human-m', 'human-f']) {
    const shape = shapeById(id);
    const head = outline(id).split('Z')[0];
    const numbers = head.trim().split(/[\s,]+/).filter((t) => !/^[A-Za-z]$/.test(t)).map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    const wide = Math.max(...xs) - Math.min(...xs);
    const tall = Math.max(...ys) - Math.min(...ys);

    // Drawn width is size × wide; drawn height is size × aspect × tall.
    const drawnRatio = wide / (tall * shape.aspect);
    assert.ok(Math.abs(drawnRatio - 1) < 0.06,
      `${id} head draws ${drawnRatio.toFixed(2)}:1, not round`);
    // And it really is squashed in the source rather than circular there.
    assert.ok(wide > tall * 2, `${id} head is circular in the path, so oval on screen`);
  }
});

test('a head sits at the top of the figure, with the body below it', () => {
  for (const id of ['human-m', 'human-f']) {
    const [head, body] = outline(id).split('Z').slice(0, 2);
    const ysOf = (d) => d.trim().split(/[\s,]+/).filter((t) => !/^[A-Za-z]$/.test(t))
      .map(Number).filter((_, i) => i % 2 === 1);
    const headBottom = Math.max(...ysOf(head));
    const bodyTop = Math.min(...ysOf(body));
    // Touching, near enough — a gap here is a floating head and an overlap is a
    // figure with no neck.
    assert.ok(Math.abs(headBottom - bodyTop) < 0.02,
      `${id} head bottom ${headBottom} against body top ${bodyTop}`);
    assert.ok(Math.min(...ysOf(head)) <= -0.5 + 1e-9, `${id} head is not at the top`);
  }
});
