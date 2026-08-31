import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTROL_MODES, modeById, mouseForce, keyboardForce, controlForce, controlStatus,
  KEY_DIRECTIONS, aimAt,
} from '../js/control.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const mag = (v) => Math.hypot(v.x, v.y);

test('every control mode says what it is, and an unknown one is off', () => {
  for (const m of CONTROL_MODES) {
    assert.ok(m.id && m.label && m.note);
  }
  assert.equal(modeById('nonsense').id, 'none');
});

test('the pointer does nothing at all until the button is held', () => {
  const at = { pos: { x: 0, y: 0 }, target: { x: 3, y: 0 }, mass: 2, strength: 10 };
  // Hovering aims; it does not push. An arrow that only appeared once the force
  // did would leave nothing to aim with.
  close(mag(mouseForce({ ...at, pressed: false })), 0);
  close(mag(mouseForce({ ...at, pressed: true })), 20);
});

test('the thrust is the same however far away the pointer is', () => {
  const near = mouseForce({ pos: { x: 0, y: 0 }, target: { x: 0.5, y: 0 }, mass: 1, strength: 10, pressed: true });
  const far = mouseForce({ pos: { x: 0, y: 0 }, target: { x: 40, y: 0 }, mass: 1, strength: 10, pressed: true });
  // Only the direction comes from where you point. A spring would have been
  // quietly teaching that the force depends on where you left the cursor, which
  // is a fact about springs rather than about thrusters.
  close(mag(near), mag(far), 1e-12);
  close(near.x, 10, 1e-12);
});

test('the aim is available separately from the force', () => {
  const aim = aimAt({ x: 1, y: 1 }, { x: 4, y: 5 });
  close(aim.distance, 5, 1e-12);
  close(Math.hypot(aim.direction.x, aim.direction.y), 1, 1e-12);
  close(aim.direction.x, 0.6, 1e-12);
  // Nothing to aim at, and nothing to aim from when they coincide.
  assert.equal(aimAt({ x: 0, y: 0 }, null), null);
  assert.equal(aimAt({ x: 2, y: 2 }, { x: 2, y: 2 }), null);
});

test('a heavier object needs more force for the same handling', () => {
  const light = mouseForce({ pos: { x: 0, y: 0 }, target: { x: 1, y: 0 }, mass: 1, strength: 10, pressed: true });
  const heavy = mouseForce({ pos: { x: 0, y: 0 }, target: { x: 1, y: 0 }, mass: 500, strength: 10, pressed: true });
  close(heavy.x / light.x, 500, 1e-6);
  // Which means the *acceleration* is the same — the strength setting reads as
  // handling rather than as newtons, and a car is not unusable next to a ball.
  close(heavy.x / 500, light.x / 1, 1e-9);
});

test('a pointer flung to the far side of the world asks for nothing wild', () => {
  const wild = mouseForce({ pos: { x: 0, y: 0 }, target: { x: 1e6, y: 0 }, mass: 2, strength: 10, pressed: true });
  assert.ok(Number.isFinite(mag(wild)));
  // Exactly the same thrust as a pointer one metre away, because distance is
  // not part of it.
  close(mag(wild), 20, 1e-9);
});

test('a missing pointer asks for nothing rather than for NaN', () => {
  for (const target of [null, undefined, { x: NaN, y: 0 }]) {
    const f = mouseForce({ pos: { x: 0, y: 0 }, target, mass: 1, strength: 10, pressed: true });
    close(mag(f), 0);
  }
});

test('holding two keys is not faster than holding one', () => {
  const one = keyboardForce(new Set(['ArrowRight']), { mass: 1, strength: 10 });
  const two = keyboardForce(new Set(['ArrowRight', 'ArrowUp']), { mass: 1, strength: 10 });
  close(mag(one), 10);
  // The classic diagonal-speed bug, and on a physics bench it would be a
  // straightforwardly wrong reading rather than a game feeling odd.
  close(mag(two), 10, 1e-9);
  close(two.x, two.y, 1e-9);
});

test('opposite keys cancel exactly', () => {
  close(mag(keyboardForce(new Set(['ArrowLeft', 'ArrowRight']), { mass: 1, strength: 10 })), 0);
  close(mag(keyboardForce(new Set(['w', 's']), { mass: 1, strength: 10 })), 0);
});

test('WASD and the arrow keys are the same directions', () => {
  for (const [arrow, letter] of [['ArrowUp', 'w'], ['ArrowDown', 's'], ['ArrowLeft', 'a'], ['ArrowRight', 'd']]) {
    assert.deepEqual(KEY_DIRECTIONS[arrow], KEY_DIRECTIONS[letter]);
    // Capitals too, or holding shift silently kills the controls.
    assert.deepEqual(KEY_DIRECTIONS[letter.toUpperCase()], KEY_DIRECTIONS[letter]);
  }
});

test('unknown keys do nothing at all', () => {
  close(mag(keyboardForce(new Set(['q', 'Escape', ' ']), { mass: 1, strength: 10 })), 0);
  close(mag(keyboardForce(null, { mass: 1, strength: 10 })), 0);
});

test('the control force is zero when off, and never acts on a fixed body', () => {
  const body = { id: 'main', mass: 1, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } };
  close(mag(controlForce({ mode: 'none', body, pointer: { x: 5, y: 5 }, keys: new Set(['w']), strength: 10 })), 0);
  close(mag(controlForce({ mode: 'mouse', body: { ...body, fixed: true }, pointer: { x: 5, y: 5 }, strength: 10, pressed: true })), 0);
  // Aiming is not pushing.
  close(mag(controlForce({ mode: 'mouse', body, pointer: { x: 5, y: 0 }, strength: 10, pressed: false })), 0);
  assert.ok(mag(controlForce({ mode: 'mouse', body, pointer: { x: 5, y: 0 }, strength: 10, pressed: true })) > 0);
});

test('the status line says what is happening, including when nothing is', () => {
  const body = { id: 'main', mass: 2, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } };
  assert.equal(controlStatus({ mode: 'none', force: { x: 0, y: 0 }, body }), null);
  assert.match(controlStatus({ mode: 'mouse', force: { x: 0, y: 0 }, body, pointer: null }), /pointer/);
  // Aimed but not pressed has to say so, or it reads as broken.
  assert.match(
    controlStatus({ mode: 'mouse', force: { x: 0, y: 0 }, body, pointer: { x: 3, y: 4 }, pressed: false }),
    /press and hold/i,
  );
  assert.match(
    controlStatus({ mode: 'mouse', force: { x: 20, y: 0 }, body, pointer: { x: 3, y: 4 }, pressed: true }),
    /Thrusting/,
  );
  // The failure mode of a control model is silence, so an unselected drawing
  // and an idle keyboard each have to say what they are waiting for.
  assert.match(controlStatus({ mode: 'keyboard', force: { x: 0, y: 0 }, body, keys: new Set(), engaged: false }), /Click the drawing/);
  assert.match(controlStatus({ mode: 'keyboard', force: { x: 0, y: 0 }, body, keys: new Set(), engaged: true }), /arrow keys|WASD/);
  assert.match(controlStatus({ mode: 'keyboard', force: { x: 20, y: 0 }, body, keys: new Set(['d']), engaged: true }), /10\.00 m\/s²/);
});
