import test from 'node:test';
import assert from 'node:assert/strict';

import {
  facing, normalise, angleDelta, easeAngle, settleAngle, rollAngle, alongSurface,
  MOVING, ALIGNMENTS,
} from '../js/orient.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const deg = (d) => (d * Math.PI) / 180;

test('a body resting on a surface lies along it', () => {
  // Level ground: the normal points up, and level is level.
  close(facing({ align: 'surface', surfaceNormal: { x: 0, y: 1 } }).angle, 0);

  // A twenty-degree ramp rising to the right. Its normal is tilted the same
  // twenty degrees, and the box on it tilts with it.
  const n = { x: -Math.sin(deg(20)), y: Math.cos(deg(20)) };
  close(facing({ align: 'surface', surfaceNormal: n }).angle, deg(20), 1e-9);

  // And the other way, so a box on a downhill slope is not drawn uphill.
  const back = { x: Math.sin(deg(35)), y: Math.cos(deg(35)) };
  close(facing({ align: 'surface', surfaceNormal: back }).angle, -deg(35), 1e-9);
});

test('a shape with a nose points where it is going', () => {
  const up = facing({ align: 'travel', velocity: { x: 0, y: 5 } });
  close(up.angle, Math.PI / 2);
  assert.equal(up.flip, false);

  const right = facing({ align: 'travel', velocity: { x: 4, y: 0 } });
  close(right.angle, 0);
  assert.equal(right.flip, false);
});

test('going left mirrors the outline rather than turning it upside down', () => {
  /*
   * Rotating by 180° also points it left, and also puts it on its roof. The two
   * are not the same picture, and only one of them is of a car driving.
   */
  const left = facing({ align: 'travel', velocity: { x: -4, y: 0 } });
  assert.equal(left.flip, true);
  close(Math.abs(left.angle), 0, 1e-9);

  // Down and to the left: mirrored, and still tilted the right way for the
  // descent rather than being tipped over.
  const diving = facing({ align: 'travel', velocity: { x: -4, y: -4 } });
  assert.equal(diving.flip, true);
  assert.ok(Math.abs(diving.angle) < Math.PI / 2);
});

test('a car on a ramp lies on the ramp, and faces the way it drives', () => {
  const n = { x: -Math.sin(deg(20)), y: Math.cos(deg(20)) };
  const uphill = facing({ align: 'travel', surfaceNormal: n, velocity: { x: 3, y: 1 } });
  const downhill = facing({ align: 'travel', surfaceNormal: n, velocity: { x: -3, y: -1 } });

  // Both lie along the ramp — a car does not point along its velocity while its
  // wheels are on the ground.
  close(uphill.angle, deg(20), 1e-9);
  close(downhill.angle, deg(20), 1e-9);
  assert.equal(uphill.flip, false);
  assert.equal(downhill.flip, true);
});

test('a round thing has no facing, and says so rather than guessing', () => {
  const ball = facing({ align: 'none', velocity: { x: 5, y: 5 }, surfaceNormal: { x: 0, y: 1 } });
  assert.equal(ball.angle, 0);
  assert.equal(ball.flip, false);
});

test('barely moving is not a direction of travel', () => {
  // Otherwise a resting object jitters between headings as the last of its
  // velocity decays through zero.
  const crawling = facing({ align: 'travel', velocity: { x: MOVING / 2, y: 0 } });
  assert.equal(crawling.angle, 0);
  const still = facing({ align: 'travel', velocity: { x: 0, y: 0 } });
  assert.equal(still.angle, 0);
  assert.equal(ALIGNMENTS.includes('travel'), true);
});

test('angles are wrapped, so easing never takes the long way round', () => {
  close(normalise(3 * Math.PI), Math.PI);
  close(normalise(-3 * Math.PI), Math.PI);
  close(normalise(0), 0);

  // 170° to −170° is twenty degrees, not three hundred and forty.
  close(angleDelta(deg(170), deg(-170)), deg(20), 1e-9);
  close(angleDelta(deg(-170), deg(170)), deg(-20), 1e-9);
});

test('easing is rate-limited, so landing on a slope is something you watch', () => {
  // Six radians a second, an eighth of a second: three quarters of a radian.
  close(easeAngle(0, 2, 1 / 8, 6), 0.75, 1e-9);
  // It never overshoots the target.
  close(easeAngle(0, 0.1, 1, 6), 0.1, 1e-9);
  close(easeAngle(1, 1, 1, 6), 1, 1e-9);
  // And it goes the short way across the wrap.
  assert.ok(easeAngle(deg(170), deg(-170), 1 / 60, 6) > deg(170));

  // A first frame with no angle yet starts where it should be, rather than
  // swinging in from zero.
  close(easeAngle(undefined, 1.2, 1 / 60, 6), 1.2, 1e-9);
  close(easeAngle(NaN, -0.4, 1 / 60, 6), -0.4, 1e-9);
});

test('a rolling ball turns by exactly the distance it has covered', () => {
  // s = Rθ, and the sign is such that rolling to the right turns it clockwise.
  // Half a turn is tested away from the wrap: angles come back in (−π, π], so
  // −π and +π are the same angle and comparing them by value proves nothing.
  close(rollAngle(0, Math.PI / 2, 1), -Math.PI / 2, 1e-9);
  close(rollAngle(0, 1, 2), -0.5, 1e-9);
  // Rolling backwards unwinds it.
  close(rollAngle(0, -1, 2), 0.5, 1e-9);
  // A radius of zero cannot roll, and must not divide by it.
  assert.equal(rollAngle(0.3, 5, 0), 0.3);
});

test('the direction along a surface is perpendicular to its normal', () => {
  const along = alongSurface({ x: 0, y: 1 });
  close(along.x, 1);
  close(along.y, 0);
  const n = { x: -Math.sin(deg(30)), y: Math.cos(deg(30)) };
  const t = alongSurface(n);
  close(t.x * n.x + t.y * n.y, 0, 1e-12);
});

test('the mirror flip is a jump, not something to ease through', () => {
  /*
   * A shape pointing just left of straight up and one pointing just right of it
   * are drawn a couple of degrees apart, but the target angles that describe
   * them sit on opposite sides of zero — the mirror accounts for the other
   * 180°. Easing between those two descriptions sends the shape the long way
   * round through every angle in between while the mirror has already switched:
   * a slow barrel-roll that arrives correct and looks broken the whole way.
   */
  const before = facing({ align: 'travel', velocity: { x: 0.02, y: 1 } });   // 89°
  const after = facing({ align: 'travel', velocity: { x: -0.02, y: 1 } });   // 91°
  assert.equal(before.flip, false);
  assert.equal(after.flip, true);

  // Eased, it would crawl. Settled, it arrives at once.
  const eased = easeAngle(before.angle, after.angle, 1 / 60);
  assert.ok(Math.abs(angleDelta(eased, after.angle)) > 1);
  close(settleAngle(before.angle, after, before.flip, 1 / 60), after.angle, 1e-12);

  // Which is only safe because what is drawn is continuous across it: the
  // rendered nose is the angle plus 180° when mirrored, and those match.
  const renderedBefore = before.angle;
  const renderedAfter = normalise(after.angle + Math.PI);
  assert.ok(Math.abs(angleDelta(renderedBefore, renderedAfter)) < 0.05,
    `the drawing jumps by ${angleDelta(renderedBefore, renderedAfter)} rad`);
});

test('with the mirror unchanged it still eases', () => {
  const wanted = { angle: 2, flip: false };
  const stepped = settleAngle(0, wanted, false, 1 / 8, 6);
  close(stepped, 0.75, 1e-9);
  // And a held attitude is held.
  close(settleAngle(0.4, { angle: 0, flip: false, hold: true }, false, 1), 0.4, 1e-12);
});
