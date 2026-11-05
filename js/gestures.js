/**
 * What a finger meant.
 *
 * A pointer stream is a few numbers arriving over time, and every interesting
 * question about it — was that a tap or a drag? how fast is this throw? how far
 * has the pinch spread? — is arithmetic that can be checked without a browser.
 * Only the listening belongs in the UI; the deciding belongs here.
 *
 * ## Why a slop radius exists at all
 *
 * Nobody taps without moving. A finger on glass travels three or four pixels
 * between touching and lifting, and a mouse click moves one or two. Without a
 * tolerance every tap is a drag of a few pixels, which means every attempt to
 * select something throws it instead — gently, and bafflingly.
 */

/**
 * How far a pointer may travel and still have been a tap, in screen pixels.
 *
 * Ten is above the three or four a steady finger wanders and below the twenty
 * or so of a deliberate flick. It is in *screen* pixels because it is about
 * hands rather than about the scene: the same wobble is the same wobble at
 * every zoom.
 */
export const TAP_SLOP_PX = 10;

/** Was that a tap, or did it travel far enough to mean something? */
export function isDrag(dx, dy, slop = TAP_SLOP_PX) {
  return Math.hypot(dx, dy) > slop;
}

/**
 * Metres per second per metre pulled.
 *
 * Two, so a pull the width of a small object — half a metre — is a gentle
 * metre a second, and a pull across a six-metre bench is a brisk twelve. The
 * factor is in the *world*, not on the screen, which is what makes the gesture
 * mean the same thing at every zoom: the arrow you drew is the arrow the
 * object leaves along, at the length you drew it, per half second.
 */
export const PULL_FACTOR = 2;

/** Nothing on this bench is thrown faster than this by hand. */
export const MAX_PULL_SPEED = 200;

/**
 * A pull, as a velocity.
 *
 * The direction of the drag is the direction of travel — drag it the way you
 * want it to go. The slingshot reading, where you pull back and it flies the
 * other way, is the one games use; it is also the one that needs explaining,
 * and a bench should not need explaining.
 *
 * @param {{x:number,y:number}} from  where the drag started, in metres
 * @param {{x:number,y:number}} to    where it is now, in metres
 */
export function pullVelocity(from, to, { factor = PULL_FACTOR, max = MAX_PULL_SPEED } = {}) {
  const dx = (to.x - from.x) * factor;
  const dy = (to.y - from.y) * factor;
  const speed = Math.hypot(dx, dy);
  if (speed <= max || speed === 0) return { vx: dx, vy: dy, speed };
  // Clamped along its own direction, so a huge pull is fast rather than
  // sideways — scaling the components separately would bend the throw.
  const k = max / speed;
  return { vx: dx * k, vy: dy * k, speed: max };
}

/** A velocity as a speed and a bearing, for the controls that hold it that way. */
export function velocityToPolar({ vx, vy }) {
  return {
    speed: Math.hypot(vx, vy),
    // Anticlockwise from the right, as every angle in this app is measured.
    angleDeg: (Math.atan2(vy, vx) * 180) / Math.PI,
  };
}

/** How far apart two fingers are. */
export const pinchSpan = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** The point between them, which is what a pinch zooms about. */
export const pinchCentre = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * What a pinch has done to the zoom.
 *
 * A ratio rather than a difference, because zoom is multiplicative: spreading
 * from 100 px to 200 doubles it, and so does spreading from 300 to 600. A
 * difference would make the same gesture mean different things depending on
 * where the fingers started.
 *
 * Clamped per gesture rather than per frame, so a pinch that briefly loses a
 * finger — which touch screens do — cannot leave the scene at a thousand
 * times its size.
 */
export function pinchFactor(startSpan, nowSpan, { min = 0.1, max = 10 } = {}) {
  if (!(startSpan > 0) || !(nowSpan > 0)) return 1;
  return Math.min(max, Math.max(min, nowSpan / startSpan));
}

/**
 * A view window zoomed about a fixed point.
 *
 * The point under the fingers stays under the fingers. Zooming about the
 * middle of the screen instead is the version that feels broken: the thing
 * being looked at slides away while the empty space either side of it grows.
 *
 * @param {{cx:number,cy:number,span:number}} view  the window, in metres
 * @param {{x:number,y:number}} about               the fixed point, in metres
 * @param {number} factor                           >1 spreads, <1 pinches
 */
export function zoomAbout(view, about, factor, { minSpan = 1e-6, maxSpan = 1e12 } = {}) {
  const span = Math.min(maxSpan, Math.max(minSpan, view.span / factor));
  const k = span / view.span;
  return {
    // The fixed point keeps its fractional position in the window, which is
    // the whole of "it stays under your fingers" written as arithmetic.
    cx: about.x + (view.cx - about.x) * k,
    cy: about.y + (view.cy - about.y) * k,
    span,
  };
}
