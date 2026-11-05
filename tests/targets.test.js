import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  KINDS, SECTIONS_FOR, hitTest, targetRadius, sectionsFor, groundAt, distanceToSegment,
} from '../js/targets.js';

const ball = (id, x, y, radius = 1) => ({ id, x, y, radius });

test('a tap on a body selects it', () => {
  const scene = { bodies: [ball('main', 100, 100, 20)] };
  assert.deepEqual(hitTest(scene, { x: 100, y: 100 }), { kind: 'body', id: 'main' });
  assert.deepEqual(hitTest(scene, { x: 115, y: 100 }), { kind: 'body', id: 'main' });
});

test('a tap on nothing is the sky, never null', () => {
  // Null would have to be checked at every call site, and the one that forgets
  // throws on a tap in open space - the most common tap there is.
  const scene = { bodies: [ball('main', 100, 100, 20)] };
  assert.deepEqual(hitTest(scene, { x: 400, y: 400 }), { kind: 'sky' });
  assert.deepEqual(hitTest({ bodies: [] }, { x: 0, y: 0 }), { kind: 'sky' });
  assert.deepEqual(hitTest(null, { x: 0, y: 0 }), { kind: 'sky' });
  assert.deepEqual(hitTest({ bodies: [ball('a', 0, 0)] }, null), { kind: 'sky' });
});

test('a small object is still a finger-sized target', () => {
  /*
   * The whole reason the minimum exists. A 2-unit ball drawn on a phone is a
   * few pixels across; without a floor the mode is usable with a mouse and
   * with nothing else.
   */
  const scene = { bodies: [ball('pea', 0, 0, 2)] };
  assert.deepEqual(hitTest(scene, { x: 18, y: 0 }), { kind: 'sky' }, 'no floor, no hit');
  assert.deepEqual(
    hitTest(scene, { x: 18, y: 0 }, { minRadius: 25 }),
    { kind: 'body', id: 'pea' },
    'a finger-width floor catches it',
  );
});

test('a target is half the longest side, so an edge-on plate is still tappable', () => {
  // A flat sheet is two units tall and three hundred wide. Hit-testing its
  // outline would make it unselectable; it is a place to aim, not a hitbox.
  const plate = { id: 'plate', x: 0, y: 0, radius: 0, width: 300, height: 2 };
  assert.equal(targetRadius(plate), 150);
  assert.equal(targetRadius({ id: 'x', radius: 4 }, 25), 25, 'the floor wins when it is bigger');
  assert.equal(targetRadius({ id: 'x', radius: 40 }, 25), 40, 'and loses when it is not');
});

test('the nearest body wins, not the first in the list', () => {
  /*
   * With generous targets, neighbours overlap. Taking the first would make the
   * answer depend on the order the world happens to hold its bodies in - so
   * the same tap would pick different objects on different steps.
   */
  const scene = { bodies: [ball('left', 0, 0, 30), ball('right', 40, 0, 30)] };
  assert.equal(hitTest(scene, { x: 35, y: 0 }).id, 'right');
  assert.equal(hitTest(scene, { x: 5, y: 0 }).id, 'left');

  // And reversing the list changes nothing.
  const flipped = { bodies: [...scene.bodies].reverse() };
  assert.equal(hitTest(flipped, { x: 35, y: 0 }).id, 'right');
});

test('a small object on top of a huge one is still reachable', () => {
  /*
   * Scored as a fraction of each target's own radius rather than in raw
   * distance. In raw distance a planet-sized target centred further away still
   * beats a ball you are tapping dead centre, and nothing drawn on top of
   * anything large could ever be selected.
   */
  const scene = { bodies: [ball('planet', 0, 0, 500), ball('ball', 300, 0, 10)] };
  assert.equal(hitTest(scene, { x: 300, y: 0 }).id, 'ball', 'dead centre of the small one');
  assert.equal(hitTest(scene, { x: 0, y: 0 }).id, 'planet', 'dead centre of the large one');
});

test('a body marked unpickable is not a target', () => {
  // Cannon shots are drawn and are allowed to leave the bench; they are not
  // things to open a settings panel for.
  const scene = { bodies: [{ ...ball('shot', 0, 0, 20), pickable: false }] };
  assert.deepEqual(hitTest(scene, { x: 0, y: 0 }), { kind: 'sky' });
});

test('every kind the hit test can return has somewhere to go', () => {
  /*
   * The guard that matters as kinds are added. A tap that selects something
   * and then opens an empty sheet reads as the app being broken, and it is the
   * exact failure of forgetting one line in a map.
   */
  for (const kind of KINDS) {
    assert.ok(kind in SECTIONS_FOR, `${kind} has no sections entry`);
  }
  assert.deepEqual(sectionsFor({ kind: 'body' }), ['object', 'push']);
  assert.deepEqual(sectionsFor({ kind: 'sky' }), ['fluid'], 'the background is the fluid');
  for (const kind of KINDS) {
    assert.ok(SECTIONS_FOR[kind].length > 0, `${kind} opens nothing`);
  }
  assert.deepEqual(sectionsFor(null), []);
  assert.deepEqual(sectionsFor({ kind: 'nonsense' }), []);
});

test('the precedence order is data, not control flow', () => {
  // So it can be read and tested rather than inferred from the order of a
  // chain of ifs, which is where the next kind gets inserted in the wrong place.
  assert.equal(KINDS[KINDS.length - 1], 'sky', 'the sky is always last');
  assert.equal(KINDS[0], 'body', 'and a thing you placed is always first');
});

// --- the rest of the bench --------------------------------------------------

const bench = () => ({
  bodies: [ball('main', 0, -40, 10)],
  cannons: [{ id: 'cannon1', x: -200, y: -10, size: 20 }],
  walls: [{ x1: 100, y1: 0, x2: 300, y2: 0 }],
  ground: { y: 0, slopeDeg: 0 },
  planet: { x: 0, y: 9000, radius: 9000 },
});

test('everything on the bench is reachable, in precedence order', () => {
  const s = bench();
  const o = { minRadius: 12 };
  assert.deepEqual(hitTest(s, { x: 0, y: -40 }, o), { kind: 'body', id: 'main' });
  assert.deepEqual(hitTest(s, { x: -200, y: -10 }, o), { kind: 'cannon', id: 'cannon1' });
  assert.deepEqual(hitTest(s, { x: 200, y: 4 }, o), { kind: 'wall', id: '0' });
  assert.deepEqual(hitTest(s, { x: -50, y: 2 }, o), { kind: 'ground' }, 'the line, away from the wall');
  assert.deepEqual(hitTest(s, { x: -50, y: 400 }, o), { kind: 'planet' }, 'the mass beneath it');
  assert.deepEqual(hitTest(s, { x: -50, y: -400 }, o), { kind: 'sky' }, 'and the air above');
});

test('a thing you placed beats the ground it stands on', () => {
  /*
   * A wall drawn along the floor, and a cannon standing on it, both sit within
   * a finger's width of the ground line. If the ground won, neither could be
   * reached without hunting for a gap.
   */
  const s = bench();
  assert.equal(hitTest(s, { x: 200, y: 0 }, { minRadius: 12 }).kind, 'wall');
  assert.equal(hitTest(s, { x: -200, y: 0 }, { minRadius: 12 }).kind, 'cannon');
});

test('the ground is a line, not everything below it', () => {
  // Otherwise the planet is unreachable at every step that has both - and the
  // two answer different questions: what you slide on, and what pulls you.
  const s = bench();
  assert.equal(hitTest(s, { x: -50, y: 11 }, { minRadius: 12 }).kind, 'ground');
  assert.equal(hitTest(s, { x: -50, y: 40 }, { minRadius: 12 }).kind, 'planet');
});

test('the ground follows its slope, pinned where it was measured', () => {
  // Screen y grows downward while a positive slope rises to the right, and the
  // sign is decided in one place rather than at each call site.
  const ground = { y: 0, slopeDeg: 45 };
  assert.ok(Math.abs(groundAt(ground, 100) + 100) < 1e-6, 'rises to the right');
  assert.ok(Math.abs(groundAt(ground, -100) - 100) < 1e-6);

  /*
   * The ground is infinite, so it arrives as one known point and a gradient.
   * Pinning the line at zero is right only when the caller happened to measure
   * it there, and wrong by the whole slope everywhere else - which is every
   * time the view has been panned.
   */
  const shifted = { x0: 400, y: 0, slopeDeg: 45 };
  assert.ok(Math.abs(groundAt(shifted, 400)) < 1e-6, 'passes through its own anchor');
  assert.ok(Math.abs(groundAt(shifted, 500) + 100) < 1e-6);
  assert.ok(Math.abs(groundAt({ y: 7, slopeDeg: 0, x0: 999 }, -50) - 7) < 1e-6, 'flat is flat');

  const s = { ...bench(), ground, walls: [], cannons: [], bodies: [] };
  assert.equal(hitTest(s, { x: 100, y: -100 }, { minRadius: 12 }).kind, 'ground');
  // Well under the sloped line, and comfortably inside the disc rather than
  // half a unit outside its edge, which is what this asserted first.
  assert.equal(hitTest(s, { x: 100, y: 200 }, { minRadius: 12 }).kind, 'planet', 'well under it');
});

test('a wall is measured to the segment, not to its ends', () => {
  const w = { x1: 0, y1: 0, x2: 100, y2: 0 };
  assert.equal(distanceToSegment({ x: 50, y: 7 }, w), 7, 'beside the middle');
  assert.equal(distanceToSegment({ x: -10, y: 0 }, w), 10, 'past one end');
  assert.equal(distanceToSegment({ x: 110, y: 0 }, w), 10, 'past the other');
  // A zero-length wall is a point, not a division by zero.
  assert.equal(distanceToSegment({ x: 3, y: 4 }, { x1: 0, y1: 0, x2: 0, y2: 0 }), 5);
});

test('an empty bench is all sky', () => {
  assert.deepEqual(hitTest({}, { x: 0, y: 0 }, { minRadius: 20 }), { kind: 'sky' });
});
