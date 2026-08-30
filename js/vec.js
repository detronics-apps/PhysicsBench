/**
 * 2D vectors. Pure, immutable, plain objects — `{ x, y }` and nothing else.
 *
 * Convention, stated once and obeyed everywhere in the simulation:
 *
 *   **x increases to the right, y increases UPWARD, angles are measured
 *   anticlockwise from +x.**
 *
 * That is the convention physics is written in, so the equations in the app can
 * be the equations in a textbook without a sign apology. SVG's y axis points
 * the other way; the *renderer* flips it, at one place, and nothing else in the
 * codebase ever thinks about screen coordinates. When these two got mixed
 * previously the acceleration arrow pointed up while the ball fell down, which
 * is precisely the kind of thing a teaching app must never do.
 */

export const vec = (x = 0, y = 0) => ({ x, y });
export const ZERO = Object.freeze({ x: 0, y: 0 });

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
export const neg = (a) => ({ x: -a.x, y: -a.y });

export const dot = (a, b) => a.x * b.x + a.y * b.y;

/** The z component of the 3D cross product — the only part a 2D plane has. */
export const cross = (a, b) => a.x * b.y - a.y * b.x;

export const len = (a) => Math.hypot(a.x, a.y);
export const len2 = (a) => a.x * a.x + a.y * a.y;

/** Unit vector, or the zero vector if there is no direction to preserve. */
export function norm(a) {
  const m = len(a);
  return m < 1e-12 ? { x: 0, y: 0 } : { x: a.x / m, y: a.y / m };
}

/** Sum any number of vectors. The net force is exactly this and nothing more. */
export function sum(list) {
  let x = 0;
  let y = 0;
  for (const v of list) { x += v.x; y += v.y; }
  return { x, y };
}

export const fromPolar = (magnitude, radians) => ({
  x: magnitude * Math.cos(radians),
  y: magnitude * Math.sin(radians),
});

export const fromPolarDeg = (magnitude, degrees) => fromPolar(magnitude, (degrees * Math.PI) / 180);

/** Angle anticlockwise from +x, in radians, in (−π, π]. */
export const angle = (a) => Math.atan2(a.y, a.x);
export const angleDeg = (a) => (angle(a) * 180) / Math.PI;

/** Rotated 90° anticlockwise. */
export const perp = (a) => ({ x: -a.y, y: a.x });

export function rotate(a, radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** The component of `a` along the direction of `b`, as a signed scalar. */
export function along(a, b) {
  const u = norm(b);
  return dot(a, u);
}

/** The part of `a` that lies along `b`, as a vector. */
export function project(a, b) {
  const u = norm(b);
  return scale(u, dot(a, u));
}

export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Cap a vector's magnitude without changing its direction. */
export function clampLen(a, maxLen) {
  const m = len(a);
  return m <= maxLen || m < 1e-12 ? { x: a.x, y: a.y } : scale(a, maxLen / m);
}

export const isFinite2 = (a) => !!a && Number.isFinite(a.x) && Number.isFinite(a.y);

export const eq = (a, b, tol = 1e-9) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

export const clone = (a) => ({ x: a.x, y: a.y });
