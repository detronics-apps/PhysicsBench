/**
 * Drawn walls, as line segments a body can rest on, bounce off or drive over.
 * Pure.
 *
 * A wall is two points. That is enough to be a floor, a ramp, a ceiling, a
 * barrier or the side of a box, and keeping it to one primitive means there is
 * one contact routine rather than five — which matters, because contact is
 * where sign errors hide.
 *
 * The body is treated as a circle of its support radius. That is already the
 * assumption everywhere else in the app (rotation is not modelled, so a box is
 * supported at a point), and being consistent about it is worth more than being
 * clever in one place: a box that rested correctly on a drawn ramp but not on
 * the ground would be a worse lie than one that is round everywhere.
 */

import { vec, sub, add, scale, dot, len, norm } from './vec.js';

/** The most walls a scene may hold. Past this the drawing stops being readable. */
export const MAX_WALLS = 40;

/** A wall, defaulted and sanitised. Zero-length walls are not walls. */
export function wall(spec = {}) {
  const x1 = num(spec.x1, 0);
  const y1 = num(spec.y1, 0);
  const x2 = num(spec.x2, 1);
  const y2 = num(spec.y2, 0);
  return {
    x1, y1, x2, y2,
    // Whether things bounce off it or grip it. One number per wall, so a scene
    // can mix a rubber bumper and a wooden ramp.
    restitution: clamp(spec.restitution ?? 0.3, 0, 1),
    mu: Math.max(0, num(spec.mu, 0.6)),
  };
}

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const wallLength = (w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);

/** A wall too short to touch reliably is a rounding error with a UI. */
export const isRealWall = (w) => wallLength(w) > 1e-6;

/**
 * The point on a segment closest to `p`, and how far along it that is.
 *
 * `t` is clamped to [0, 1], which is what turns an infinite line into a segment
 * with ends — and the ends are where a body rolls off, which is half the point
 * of drawing walls at all.
 */
export function closestPoint(w, p) {
  const ax = w.x1;
  const ay = w.y1;
  const dx = w.x2 - ax;
  const dy = w.y2 - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-18) return { x: ax, y: ay, t: 0 };
  const t = clamp(((p.x - ax) * dx + (p.y - ay) * dy) / lengthSq, 0, 1);
  return { x: ax + t * dx, y: ay + t * dy, t };
}

/**
 * Is a body of radius `radius` at `pos` touching this wall, and if so how?
 *
 * Returns `null` when it is clear. Otherwise the outward normal (pointing from
 * the wall towards the body, so a body resting on top of a wall gets an upward
 * normal whichever way round the wall was drawn), how deep it is in, and where
 * the contact is.
 *
 * The normal is derived from the body's actual position rather than from the
 * wall's winding, which is what lets a wall be drawn left-to-right or
 * right-to-left and behave identically. Drawing direction is not physics.
 */
export function contact(w, pos, radius, tolerance = 0) {
  if (!isRealWall(w)) return null;
  const near = closestPoint(w, pos);
  const away = sub(pos, vec(near.x, near.y));
  const distance = len(away);
  const reach = radius + tolerance;
  if (distance > reach) return null;

  // Dead centre on the wall: fall back to the wall's own perpendicular, since
  // there is no "away from it" to measure. Rare, and a coin toss either way.
  const normal = distance > 1e-9
    ? scale(away, 1 / distance)
    : norm(vec(-(w.y2 - w.y1), w.x2 - w.x1));

  return {
    normal,
    depth: radius - distance,
    point: vec(near.x, near.y),
    // How far along the wall, so a renderer can mark the contact and a caller
    // can tell "on the ramp" from "hooked on its end".
    along: near.t,
    onEnd: near.t <= 1e-9 || near.t >= 1 - 1e-9,
    mu: w.mu,
    restitution: w.restitution,
  };
}

/**
 * The wall a body is most in contact with, of all of them.
 *
 * Deepest wins. A body wedged into a corner is being held by both, but it can
 * only have one surface normal in a model without rotation, and the deeper
 * penetration is the one that most needs undoing.
 */
export function nearestContact(walls, pos, radius, tolerance = 0) {
  let best = null;
  for (const w of walls || []) {
    const hit = contact(w, pos, radius, tolerance);
    if (hit && (!best || hit.depth > best.depth)) best = hit;
  }
  return best;
}

/** Bounds wide enough to hold every wall, for framing the camera. */
export function wallBounds(walls) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const w of walls || []) {
    if (!isRealWall(w)) continue;
    minX = Math.min(minX, w.x1, w.x2);
    maxX = Math.max(maxX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }
  return minX === Infinity ? null : { minX, maxX, minY, maxY };
}

/**
 * A rectangular box of four walls — the usual thing anyone wants first.
 *
 * Offered because drawing four walls by hand to stop everything flying off the
 * canvas is the first thing a sandbox makes you do, and making someone do it by
 * hand teaches nothing.
 */
export function boxWalls({ minX, maxX, minY, maxY, restitution = 0.6, mu = 0.3 }) {
  const corners = [
    [minX, minY, maxX, minY],
    [maxX, minY, maxX, maxY],
    [maxX, maxY, minX, maxY],
    [minX, maxY, minX, minY],
  ];
  return corners.map(([x1, y1, x2, y2]) => wall({ x1, y1, x2, y2, restitution, mu }));
}

/** The direction along a wall, as a unit vector. Used to draw and to slide. */
export const alongWall = (w) => norm(vec(w.x2 - w.x1, w.y2 - w.y1));

/** The angle of a wall from horizontal, in degrees — how a ramp is described. */
export const wallAngle = (w) => (Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180) / Math.PI;

export { add, dot, scale };
