/**
 * Which way an object is drawn facing. Pure.
 *
 * **This is a drawing rule, not a physics model, and the difference matters.**
 * Nothing here gives an object a moment of inertia, angular momentum or torque.
 * It cannot tumble, it cannot be spun up by an off-centre impact, and a ball
 * rolling down a ramp still accelerates like a sliding one because none of its
 * kinetic energy is being stored in rotation. Every one of those is declared as
 * an assumption in the step that makes it.
 *
 * What this does is stop the drawing saying something false for a different
 * reason. A car drawn level on a twenty-degree ramp is not "rotation being
 * ignored", it is a picture of a car embedded in a hillside; a spaceship drawn
 * nose-right while travelling left is a picture of a spaceship flying
 * backwards. Neither is a simplification anybody would defend. Orienting the
 * outline to the surface it rests on and to the direction it is going removes
 * a lie without adding a claim.
 */

import { vec, len } from './vec.js';

/** Below this speed there is no direction of travel worth pointing along. */
export const MOVING = 0.05;

/**
 * How an object decides which way to face.
 *
 *   surface   lies flat on whatever it is resting on — a cube, a plate
 *   travel    has a nose, and points it where it is going — a car, a spaceship
 *   none      round, so facing means nothing; it gets a rolling spoke instead
 */
export const ALIGNMENTS = ['surface', 'travel', 'none'];

/**
 * The angle an object should be drawn at, in radians, anticlockwise from
 * horizontal — plus whether the outline should be mirrored left-to-right.
 *
 * The mirror is what keeps a car the right way up when it drives left. Rotating
 * it by 180° would also point it left, and would also put it on its roof; the
 * two are not the same picture, and only one of them is of a car driving.
 */
export function facing({
  align = 'surface',
  surfaceNormal = null,
  velocity = null,
  hasField = true,
} = {}) {
  if (align === 'none') return { angle: 0, flip: false };

  const speed = velocity ? len(velocity) : 0;

  // Resting on something: lie along it, whatever else is happening.
  if (surfaceNormal) {
    const angle = Math.atan2(surfaceNormal.y, surfaceNormal.x) - Math.PI / 2;
    const flip = align === 'travel' && speed > MOVING && velocity.x < 0;
    return { angle: normalise(angle), flip };
  }

  if (align === 'travel' && speed > MOVING) {
    const heading = Math.atan2(velocity.y, velocity.x);
    // Pointing into the left half-plane: mirror rather than roll over.
    if (Math.abs(heading) > Math.PI / 2) {
      return { angle: normalise(heading + Math.PI), flip: true };
    }
    return { angle: normalise(heading), flip: false };
  }

  // Nothing to align to and nowhere to be going. In free fall under a field it
  // keeps the attitude it had; with no field at all — deep space — level is as
  // good an answer as any and it is at least stable.
  return { angle: 0, flip: false, hold: hasField };
}

/** Wrap to (−π, π], so easing never takes the long way round. */
export function normalise(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** The shortest way from one angle to another, signed. */
export const angleDelta = (from, to) => normalise(to - from);

/**
 * Ease an angle towards a target at a limited rate.
 *
 * Rate-limited rather than proportional, so a box dropped onto a ramp swings
 * into line at a visible, constant speed instead of snapping there in one
 * frame. The cap is what stops a body that has just landed appearing to have
 * been aligned all along — landing on a slope and settling onto it are two
 * different things and the drawing should show both.
 */
export function easeAngle(current, target, dt, radiansPerSecond = 6) {
  const from = normalise(Number.isFinite(current) ? current : target);
  const delta = angleDelta(from, target);
  const step = Math.max(0, radiansPerSecond) * Math.max(0, dt);
  if (step >= Math.abs(delta)) return normalise(target);
  return normalise(from + Math.sign(delta) * step);
}

/**
 * How far a rolling body has turned, in radians.
 *
 * s = Rθ, so θ = s/R. Drawn as a spoke on a circle, which is the only way a
 * rolling ball reads as rolling rather than sliding — and the only rotation in
 * the app that corresponds to anything, since it is fixed by the contact
 * condition rather than being a degree of freedom with its own dynamics.
 */
export function rollAngle(previous, travelled, radius) {
  if (!(radius > 0)) return previous || 0;
  return normalise((previous || 0) - travelled / radius);
}

/** The direction a surface's normal implies, as a unit vector along it. */
export const alongSurface = (normal) => vec(normal.y, -normal.x);
