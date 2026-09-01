/**
 * Drawn walls — straight or curved — that a body can rest on, bounce off or
 * drive over. Pure.
 *
 * A wall is two points and a bulge. The bulge is the sagitta: how far the
 * middle of the wall is pushed off the straight line joining its ends, in
 * metres, signed so that positive bows one way and negative the other.
 *
 * That parameterisation is the whole trick. A bulge of zero *is* a straight
 * segment — not a circle of enormous radius approximating one — so every wall
 * ever drawn stays exactly what it was, no call site has to branch on a `kind`
 * field, and a ramp can be curved by dragging one slider away from zero rather
 * than being deleted and redrawn as a different sort of object.
 *
 * Two points and a bulge is enough to be a floor, a ramp, a ceiling, a barrier,
 * the side of a box, a bowl, a dome or a loop, and keeping it to one primitive
 * means there is one contact routine rather than five — which matters, because
 * contact is where sign errors hide.
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
    /*
     * How far the middle of the wall bows off the straight line between its
     * ends. Zero is a straight wall, and is the default, so nothing that does
     * not ask for a curve ever gets one.
     */
    bulge: num(spec.bulge, 0),
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
 * A bulge smaller than this is a straight wall with rounding error in it.
 *
 * Below it the circle's radius runs away towards infinity and its centre
 * towards the horizon, so the arc arithmetic loses all its precision at exactly
 * the point where the answer stops differing from the straight one anyway.
 */
const FLAT = 1e-6;

/** Is this wall curved, or is it the straight segment it started as? */
export const isCurved = (w) => Math.abs(w.bulge || 0) > FLAT && wallLength(w) > 1e-9;

/**
 * The circle a curved wall is cut from: centre, radius, and how far round it goes.
 *
 * Returns `null` for a straight wall, and every caller reads that as "use the
 * segment maths" rather than as a failure.
 *
 * The sweep is derived rather than assumed. `4·atan2(|s|, h)` gives π for a
 * semicircle and tends to zero with the bulge, so a wall can be bowed past a
 * half-circle into a bowl or a loop with nothing changing behaviour at the
 * boundary. The direction round the circle is *measured* — by asking which way
 * from the first end the apex actually lies — rather than reasoned out from the
 * sign of the bulge, because that is exactly the kind of sign convention that
 * is easy to get backwards and hard to see afterwards.
 */
export function arcOf(w) {
  if (!isCurved(w)) return null;
  const sagitta = w.bulge;
  const ax = w.x1;
  const ay = w.y1;
  const chord = wallLength(w);
  const half = chord / 2;

  // Along the chord, and its left normal.
  const ux = (w.x2 - ax) / chord;
  const uy = (w.y2 - ay) / chord;
  const nx = -uy;
  const ny = ux;

  const midX = (ax + w.x2) / 2;
  const midY = (ay + w.y2) / 2;
  const apexX = midX + nx * sagitta;
  const apexY = midY + ny * sagitta;

  const radius = (half * half + sagitta * sagitta) / (2 * Math.abs(sagitta));
  const offset = (sagitta * sagitta - half * half) / (2 * sagitta);
  const cx = midX + nx * offset;
  const cy = midY + ny * offset;

  const sweep = 4 * Math.atan2(Math.abs(sagitta), half);
  const startAngle = Math.atan2(ay - cy, ax - cx);
  const apexAngle = Math.atan2(apexY - cy, apexX - cx);
  // The apex is halfway along, so whichever way round reaches it first is the
  // way the arc goes.
  const dir = wrap(apexAngle - startAngle) <= sweep / 2 + 1e-9 ? 1 : -1;

  return { cx, cy, radius, sweep, startAngle, dir, apexX, apexY };
}

/** An angle brought into [0, 2π), which is where the arithmetic below lives. */
function wrap(angle) {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

/** How far along the arc an angle lies, as a fraction — or null if it is past an end. */
function alongArc(arc, angle) {
  const travelled = arc.dir > 0
    ? wrap(angle - arc.startAngle)
    : wrap(arc.startAngle - angle);
  return travelled <= arc.sweep ? travelled / arc.sweep : null;
}

/** Where a fraction along a wall actually is, straight or curved. */
export function pointAt(w, t) {
  const arc = arcOf(w);
  if (!arc) return { x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t };
  const angle = arc.startAngle + arc.dir * arc.sweep * t;
  return { x: arc.cx + arc.radius * Math.cos(angle), y: arc.cy + arc.radius * Math.sin(angle) };
}

/**
 * The point on a wall closest to `p`, and how far along it that is.
 *
 * `t` is clamped to [0, 1], which is what turns an infinite line into a segment
 * with ends — and the ends are where a body rolls off, which is half the point
 * of drawing walls at all. A curved wall has ends in the same sense: past them
 * the nearest point is the end itself, not somewhere else round the circle the
 * arc was cut from.
 */
export function closestPoint(w, p) {
  const arc = arcOf(w);
  if (arc) return closestOnArc(arc, p);
  const ax = w.x1;
  const ay = w.y1;
  const dx = w.x2 - ax;
  const dy = w.y2 - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-18) return { x: ax, y: ay, t: 0 };
  const t = clamp(((p.x - ax) * dx + (p.y - ay) * dy) / lengthSq, 0, 1);
  return { x: ax + t * dx, y: ay + t * dy, t };
}

function closestOnArc(arc, p) {
  const dx = p.x - arc.cx;
  const dy = p.y - arc.cy;
  const distance = Math.hypot(dx, dy);

  // Dead on the centre every direction is equally close, so take the start.
  if (distance < 1e-12) {
    return { ...endOf(arc, 0), t: 0 };
  }

  const t = alongArc(arc, Math.atan2(dy, dx));
  if (t !== null) {
    const k = arc.radius / distance;
    return { x: arc.cx + dx * k, y: arc.cy + dy * k, t };
  }

  // Past an end: the nearer of the two, exactly as a segment behaves.
  const start = endOf(arc, 0);
  const end = endOf(arc, 1);
  return Math.hypot(p.x - start.x, p.y - start.y) <= Math.hypot(p.x - end.x, p.y - end.y)
    ? { ...start, t: 0 }
    : { ...end, t: 1 };
}

const endOf = (arc, which) => {
  const angle = arc.startAngle + arc.dir * arc.sweep * which;
  return { x: arc.cx + arc.radius * Math.cos(angle), y: arc.cy + arc.radius * Math.sin(angle) };
};

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
  const arc = arcOf(w);
  const normal = distance > 1e-9
    ? scale(away, 1 / distance)
    // Dead centre on the wall there is no "away from it" to measure, so fall
    // back to the surface's own perpendicular: radially outward from the centre
    // of a curved wall, square to the chord of a straight one.
    : (arc
      ? norm(vec(near.x - arc.cx, near.y - arc.cy))
      : norm(vec(-(w.y2 - w.y1), w.x2 - w.x1)));

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
  const swallow = (x, y) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const w of walls || []) {
    if (!isRealWall(w)) continue;
    swallow(w.x1, w.y1);
    swallow(w.x2, w.y2);
    // A curve leaves the box its own ends make. Taken exactly rather than by
    // sampling: the only places a circle can be extreme are its four compass
    // points, so the ones the arc actually reaches are the ones that count —
    // and a dome framed to its chord would have its top cut off.
    for (const p of arcExtremes(w)) swallow(p.x, p.y);
  }
  return minX === Infinity ? null : { minX, maxX, minY, maxY };
}

/** Whichever of the circle's four compass points this arc actually passes through. */
function arcExtremes(w) {
  const arc = arcOf(w);
  if (!arc) return [];
  const out = [];
  for (let q = 0; q < 4; q += 1) {
    const angle = (q * Math.PI) / 2;
    if (alongArc(arc, angle) === null) continue;
    out.push({ x: arc.cx + arc.radius * Math.cos(angle), y: arc.cy + arc.radius * Math.sin(angle) });
  }
  return out;
}

/**
 * How long the wall actually is to travel along.
 *
 * `wallLength` is the straight-line distance between the ends, which is the
 * chord — right for a straight wall and an undercount for a curved one. A bowl
 * described by its chord would claim to be shorter than the path across it.
 */
export const arcLength = (w) => {
  const arc = arcOf(w);
  return arc ? arc.radius * arc.sweep : wallLength(w);
};

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

/**
 * The direction along a wall, as a unit vector. Used to draw and to slide.
 *
 * On a curve there is no single such direction, so this takes the fraction
 * along to ask about and returns the tangent there. Called without one it
 * answers for the middle, which for a straight wall is the only answer there
 * has ever been.
 */
export const alongWall = (w, t = 0.5) => {
  const arc = arcOf(w);
  if (!arc) return norm(vec(w.x2 - w.x1, w.y2 - w.y1));
  const angle = arc.startAngle + arc.dir * arc.sweep * t;
  // The tangent is the radius turned a quarter turn, the way the arc runs.
  return norm(vec(-Math.sin(angle) * arc.dir, Math.cos(angle) * arc.dir));
};

/** The angle of a wall from horizontal, in degrees — how a ramp is described. */
export const wallAngle = (w) => (Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180) / Math.PI;

export { add, dot, scale };
