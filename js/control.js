/**
 * Driving an object: the mouse and the keyboard, as forces. Pure.
 *
 * The temptation here is to move the object directly — set its position to the
 * cursor, set its velocity from the arrow keys — and that temptation has to be
 * refused, because it would quietly undo everything the rest of the app is for.
 * An object teleported to the cursor has infinite acceleration, no momentum
 * history and no energy account, and the arrows around it would be describing a
 * motion that F = ma had no part in.
 *
 * So both control models produce a **force**, which joins the same vector sum as
 * weight, friction and drag, shows up as its own arrow, and has its work booked
 * on the same ledger. Driving a car over a drawn ramp is then a physics
 * experiment rather than a puppet show — and the car understeers into a wall
 * because it has momentum, which is the correct reason.
 */

import { vec, sub, scale, len, norm, ZERO } from './vec.js';

export const CONTROL_MODES = [
  {
    id: 'none',
    label: 'Nothing — it is on its own',
    note: 'No control force. The object does whatever the other forces make it do.',
  },
  {
    id: 'mouse',
    label: 'Thrust towards the pointer, while you hold the button',
    note: 'An arrow shows where the pointer is from the object. Press and hold '
      + 'anywhere on the drawing and a steady force is applied along that arrow, '
      + 'for exactly as long as you hold it — a thruster you aim, not a magnet '
      + 'that is always on. Let go and nothing stops: the object keeps whatever '
      + 'velocity it reached, and only friction, drag or a wall will change it.',
  },
  {
    id: 'keyboard',
    label: 'Arrow keys or WASD',
    note: 'A steady force in whichever direction is held, exactly like the push '
      + 'in step two but under your hand. Nothing stops when you let go — the '
      + 'object keeps whatever velocity it had reached, and only friction, drag '
      + 'or a wall will change that.',
  },
];

export const modeById = (id) => CONTROL_MODES.find((m) => m.id === id) || CONTROL_MODES[0];

/**
 * Which way the pointer lies from the object, as a unit vector.
 *
 * Separated from the force because the aim is worth drawing even when nothing
 * is being applied: you point first and press second, and an arrow that only
 * appeared once the force did would give you nothing to aim with.
 */
export function aimAt(pos, target) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  const away = sub(target, pos);
  const distance = len(away);
  if (!(distance > 1e-9)) return null;
  return { direction: scale(away, 1 / distance), distance };
}

/**
 * Thrust towards the pointer, for exactly as long as the button is held.
 *
 * A steady force along the aim, not a spring — so it behaves like the keyboard
 * with a direction you choose freely, and the same setting produces the same
 * acceleration in both modes. A spring would have been quietly teaching that
 * the force depends on how far away you put the cursor, which is a fact about
 * springs and not about thrusters.
 *
 * The force is per-kilogram, so the strength reads as an acceleration and a
 * heavier object needs more force for the same handling. Nothing is applied
 * unless `pressed`: hovering aims, holding pushes.
 */
export function mouseForce({ pos, target, mass = 1, strength = 20, pressed = false }) {
  if (!pressed) return ZERO;
  const aim = aimAt(pos, target);
  if (!aim) return ZERO;
  return scale(aim.direction, Math.max(0, strength) * Math.max(1e-9, mass));
}

/** Which way each key pushes. Arrow keys and WASD, because both are muscle memory. */
export const KEY_DIRECTIONS = {
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: 1 },
  s: { x: 0, y: -1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
  W: { x: 0, y: 1 },
  S: { x: 0, y: -1 },
  A: { x: -1, y: 0 },
  D: { x: 1, y: 0 },
};

/**
 * A steady force in whichever direction is held.
 *
 * Diagonals are normalised. Without that, holding two keys gives √2 times the
 * force of holding one, and the object is measurably faster on the diagonal —
 * a bug so old it has a name in game development, and one that would be a
 * straightforwardly wrong reading on a physics bench.
 *
 * The force is per-kilogram, so the strength slider reads as an acceleration in
 * m/s² and a heavier object needs more force for the same handling. That is the
 * honest way round: the setting names what the engine can do, and F = ma
 * decides what happens.
 */
export function keyboardForce(keys, { mass = 1, strength = 10 } = {}) {
  let x = 0;
  let y = 0;
  for (const key of keys || []) {
    const dir = KEY_DIRECTIONS[key];
    if (!dir) continue;
    x += dir.x;
    y += dir.y;
  }
  if (x === 0 && y === 0) return ZERO;
  const unit = norm(vec(x, y));
  return scale(unit, Math.max(0, strength) * Math.max(1e-9, mass));
}

/**
 * The control force for whatever mode is selected.
 *
 * One entry point so the world stepper does not have to know which mode is on,
 * and so a mode that produces nothing produces exactly zero rather than
 * something small and mysterious.
 */
export function controlForce({ mode, body, pointer, keys, strength = 20, pressed = false }) {
  if (!body || body.fixed) return ZERO;
  if (mode === 'mouse') {
    return mouseForce({ pos: body.pos, target: pointer, mass: body.mass, strength, pressed });
  }
  if (mode === 'keyboard') {
    return keyboardForce(keys, { mass: body.mass, strength });
  }
  return ZERO;
}

/**
 * What the control is doing right now, in words.
 *
 * Worth a sentence on screen because the failure mode of a control model is
 * silence: nothing happens, and it is not clear whether the mode is off, the
 * object is the wrong one, or the force is simply losing to friction.
 */
export function controlStatus({ mode, force, body, pointer, keys, pressed = false, engaged = false }) {
  if (mode === 'none') return null;
  const magnitude = len(force || ZERO);

  if (mode === 'mouse') {
    if (!pointer) {
      return 'Move the pointer over the drawing: an arrow will show which way it '
        + 'lies from the object. Hold the button down to thrust along that arrow.';
    }
    const away = len(sub(pointer, body.pos));
    if (!pressed) {
      return `Aimed at the pointer, ${away.toFixed(2)} m away. Nothing is being applied `
        + 'yet — press and hold to thrust along the arrow, and let go to stop '
        + 'pushing. Letting go is not a brake: whatever velocity it has, it keeps.';
    }
    return `Thrusting at ${magnitude.toFixed(1)} N towards the pointer, which on `
      + `${body.mass.toFixed(2)} kg is ${(magnitude / Math.max(1e-9, body.mass)).toFixed(2)} m/s². `
      + 'The force is the same however far away the pointer is — only its '
      + 'direction comes from where you are pointing.';
  }

  if (!engaged) {
    return 'Click the drawing to take the controls. While it is selected the '
      + 'arrow keys steer instead of scrolling the page, and Escape gives them '
      + 'back.';
  }
  if (!keys || keys.size === 0) {
    return 'Controls engaged — hold the arrow keys or WASD. Nothing will stop '
      + 'when you let go: there is no brake, only friction and drag. Escape '
      + 'releases the keys back to the page.';
  }
  return `Driving with ${magnitude.toFixed(1)} N, which on ${body.mass.toFixed(2)} kg is `
    + `${(magnitude / Math.max(1e-9, body.mass)).toFixed(2)} m/s².`;
}
