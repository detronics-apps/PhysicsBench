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
    label: 'Follows the pointer',
    note: 'A spring between the object and the cursor, with damping so it settles '
      + 'instead of orbiting for ever. Both are real forces: the spring pulls '
      + 'harder the further away the cursor is, and the damping opposes motion '
      + 'like a very thick fluid. Drag the cursor and the object is towed after '
      + 'it — it does not jump there, because a force cannot do that.',
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
 * The pointer spring.
 *
 * F = k·(target − position) − c·velocity
 *
 * The stiffness is derived from the strength setting and the object's mass, so
 * that turning the strength up feels the same on a 1 kg ball and a 500 kg car
 * rather than being unusable on one of them. The damping is then set near
 * critical for that stiffness — c = 2·√(k·m) — which is the value that brings
 * it to rest in the shortest time without overshooting, and is a genuine result
 * about springs rather than a number tuned until it felt right.
 *
 * `maxForce` caps it, because a cursor flicked to the far side of the screen
 * would otherwise ask for a force that flings the object past the speed limit
 * and into the divergence guard.
 */
export function mouseForce({ pos, vel, target, mass = 1, strength = 20, maxForce = null }) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return ZERO;
  const m = Math.max(1e-9, mass);
  const k = Math.max(0, strength) * m;
  const c = 2 * Math.sqrt(k * m);

  const pull = scale(sub(target, pos), k);
  const damp = scale(vel || ZERO, -c);
  const total = { x: pull.x + damp.x, y: pull.y + damp.y };

  const cap = maxForce ?? Math.max(0, strength) * m * 12;
  const magnitude = len(total);
  return magnitude > cap && magnitude > 0 ? scale(norm(total), cap) : total;
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
export function controlForce({ mode, body, pointer, keys, strength = 20 }) {
  if (!body || body.fixed) return ZERO;
  if (mode === 'mouse') {
    return mouseForce({ pos: body.pos, vel: body.vel, target: pointer, mass: body.mass, strength });
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
export function controlStatus({ mode, force, body, pointer, keys }) {
  if (mode === 'none') return null;
  const magnitude = len(force || ZERO);
  if (mode === 'mouse') {
    if (!pointer) return 'Move the pointer over the drawing and the object will be towed after it.';
    const away = len(sub(pointer, body.pos));
    return `Spring to the pointer: ${away.toFixed(2)} m away, pulling with `
      + `${magnitude.toFixed(1)} N. Let it get close and the force falls to nothing, `
      + 'which is why it stops rather than shooting past.';
  }
  if (!keys || keys.size === 0) {
    return 'Click the drawing, then hold the arrow keys or WASD. Nothing will '
      + 'stop when you let go — there is no brake, only friction and drag.';
  }
  return `Driving with ${magnitude.toFixed(1)} N, which on ${body.mass.toFixed(2)} kg is `
    + `${(magnitude / Math.max(1e-9, body.mass)).toFixed(2)} m/s².`;
}
