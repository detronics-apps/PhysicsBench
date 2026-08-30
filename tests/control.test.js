import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTROL_MODES, modeById, mouseForce, keyboardForce, controlForce, controlStatus, KEY_DIRECTIONS,
} from '../js/control.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);
const mag = (v) => Math.hypot(v.x, v.y);

test('every control mode says what it is, and an unknown one is off', () => {
  for (const m of CONTROL_MODES) {
    assert.ok(m.id && m.label && m.note);
  }
  assert.equal(modeById('nonsense').id, 'none');
});

test('the pointer spring pulls towards the pointer and harder when further away', () => {
  const near = mouseForce({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, target: { x: 1, y: 0 }, mass: 1, strength: 10 });
  const far = mouseForce({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, target: { x: 3, y: 0 }, mass: 1, strength: 10 });
  assert.ok(near.x > 0);
  close(far.x / near.x, 3, 1e-9);
  // Sitting on the pointer means no force at all, which is why it stops there
  // rather than shooting past.
  close(mag(mouseForce({ pos: { x: 2, y: 2 }, vel: { x: 0, y: 0 }, target: { x: 2, y: 2 }, mass: 1, strength: 10 })), 0);
});

test('the damping opposes the velocity, so it settles instead of orbiting', () => {
  const moving = mouseForce({
    pos: { x: 0, y: 0 }, vel: { x: 5, y: 0 }, target: { x: 0, y: 0 }, mass: 1, strength: 10,
  });
  // Nothing pulling it, so what is left is pure damping, and it points backwards.
  assert.ok(moving.x < 0);
});

test('a heavier object needs more force for the same handling', () => {
  const light = mouseForce({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, target: { x: 1, y: 0 }, mass: 1, strength: 10 });
  const heavy = mouseForce({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, target: { x: 1, y: 0 }, mass: 500, strength: 10 });
  close(heavy.x / light.x, 500, 1e-6);
  // Which means the *acceleration* is the same — the strength setting reads as
  // handling rather than as newtons, and a car is not unusable next to a ball.
  close(heavy.x / 500, light.x / 1, 1e-9);
});

test('no cap is exceeded, however far the pointer is flung', () => {
  const wild = mouseForce({
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, target: { x: 1e6, y: 0 }, mass: 2, strength: 10,
  });
  assert.ok(Number.isFinite(mag(wild)));
  assert.ok(mag(wild) <= 10 * 2 * 12 + 1e-6);
});

test('a missing pointer asks for nothing rather than for NaN', () => {
  for (const target of [null, undefined, { x: NaN, y: 0 }]) {
    const f = mouseForce({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, target, mass: 1, strength: 10 });
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
  close(mag(controlForce({ mode: 'mouse', body: { ...body, fixed: true }, pointer: { x: 5, y: 5 }, strength: 10 })), 0);
  assert.ok(mag(controlForce({ mode: 'mouse', body, pointer: { x: 5, y: 0 }, strength: 10 })) > 0);
});

test('the status line says what is happening, including when nothing is', () => {
  const body = { id: 'main', mass: 2, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } };
  assert.equal(controlStatus({ mode: 'none', force: { x: 0, y: 0 }, body }), null);
  assert.match(controlStatus({ mode: 'mouse', force: { x: 0, y: 0 }, body, pointer: null }), /pointer/);
  // The failure mode of a control model is silence, so an idle keyboard has to
  // say it is waiting rather than look broken.
  assert.match(controlStatus({ mode: 'keyboard', force: { x: 0, y: 0 }, body, keys: new Set() }), /arrow keys|WASD/);
  assert.match(controlStatus({ mode: 'keyboard', force: { x: 20, y: 0 }, body, keys: new Set(['d']) }), /10\.00 m\/s²/);
});
