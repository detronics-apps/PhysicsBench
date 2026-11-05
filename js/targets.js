/**
 * What is under this point on the drawing, and which controls belong to it.
 *
 * This is the whole input model of Interactive: there is no sidebar, so the
 * only way to reach a control is to touch the thing it belongs to. Getting
 * "which thing" right is therefore not a convenience — it is the interface.
 *
 * ## Everything here is in canvas units
 *
 * Not metres, and not screen pixels. The canvas is what the drawing is drawn
 * in, so a body's size and a tap's position are directly comparable without
 * knowing the zoom. The caller converts a *screen* measurement — how wide a
 * finger is — into canvas units once, and passes it in. That keeps the
 * arithmetic here free of the DOM and testable without a browser, while still
 * being about real targets on a real screen.
 *
 * ## Why targets are generous
 *
 * A 0.25 m ball at a phone zoom is about 23 px across. A fingertip covers 44.
 * Hit-testing against the drawn outline would mean a mode you can only use
 * with a mouse, which is the opposite of the point. Every target therefore has
 * a floor on its radius, and the floor is expressed in screen pixels by the
 * caller rather than guessed at here.
 *
 * ## Precedence
 *
 * Things overlap: a ball rests on the ground, the ground sits on the planet,
 * the planet hangs in the sky. A tap has to resolve to exactly one of them,
 * and the rule is **smallest and most specific first** — the things you place
 * beat the things that are always there. A reader tapping a ball on a floor
 * means the ball every time; if they meant the floor they would tap a part of
 * it with no ball on it.
 */

/**
 * The kinds a hit can resolve to, in precedence order.
 *
 * Listed here rather than implied by the order of the `if`s below, so that the
 * order is a thing that can be read and tested rather than a property of the
 * control flow.
 */
export const KINDS = ['body', 'cannon', 'wall', 'ground', 'planet', 'sky'];

/**
 * Which sidebar sections belong to each kind.
 *
 * Section *ids*, resolved to real panels by the bench. The mapping is data so
 * that a test can assert every kind the hit test can return has somewhere to
 * go — the failure mode otherwise is a tap that selects something and then
 * opens an empty sheet, which reads as the app being broken.
 *
 * `sky` has none: tapping the background deselects, and that is all.
 */
export const SECTIONS_FOR = {
  body: ['object', 'push'],
  cannon: ['cannons'],
  wall: ['walls'],
  // The line you stand on is the surface; the mass under it is the world.
  ground: ['surface'],
  planet: ['world'],
  /*
   * Everything that is not a thing is the stuff the object moves through, and
   * the fluid panel is what changes it — including the water, which is drawn
   * from `env.surfaceFluid` and is the environment rather than the planet.
   * (The planet's own material is reached by tapping the planet.)
   */
  sky: ['fluid'],
};

/**
 * How big a body's target is, in canvas units.
 *
 * Half its longest side, floored at `minRadius`. The longest side rather than
 * the drawn outline because a target is a place to aim, not a hitbox: a flat
 * plate seen edge-on is two pixels tall and still has to be tappable.
 */
export function targetRadius(body, minRadius = 0) {
  const own = Math.max(
    body.radius || 0,
    (body.width || 0) / 2,
    (body.height || 0) / 2,
  );
  return Math.max(own, minRadius);
}

/**
 * What is under `at`.
 *
 * @param {object} scene      `{ bodies: [{ id, x, y, radius, width, height, pickable }] }`,
 *                            every length in canvas units
 * @param {{x:number,y:number}} at  the point, in canvas units
 * @param {object} [options]
 * @param {number} [options.minRadius]  the smallest target, in canvas units —
 *                                      a finger's width, converted by the caller
 * @returns {{kind:string, id?:string}} never null; empty space is the sky
 */
export function hitTest(scene, at, { minRadius = 0 } = {}) {
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return { kind: 'sky' };

  const bodies = (scene?.bodies || []).filter((b) => b && b.pickable !== false);

  /*
   * Nearest wins, not first.
   *
   * With generous targets two bodies standing side by side have overlapping
   * ones, and taking the first in the list would mean the answer depended on
   * the order the world happens to hold them in — so the same tap would pick
   * different objects on different steps. Distance is the only tie-break that
   * matches what the reader was aiming at.
   *
   * Measured as a *fraction* of each target's radius rather than in raw
   * distance, so a tap just inside a small object beats one at the far edge of
   * a large one behind it. Otherwise a planet-sized target swallows every
   * small thing drawn on top of it.
   */
  let best = null;
  for (const body of bodies) {
    const r = targetRadius(body, minRadius);
    const d = Math.hypot(at.x - body.x, at.y - body.y);
    if (d > r) continue;
    const score = d / r;
    if (!best || score < best.score) best = { id: body.id, score };
  }

  if (best) return { kind: 'body', id: best.id };

  /*
   * Then the things placed on the bench, smallest first.
   *
   * A cannon is a fixed object a few units across; a wall is a line. Both are
   * things somebody put there deliberately, so they beat the ground they are
   * standing on — a wall drawn along the floor must be reachable without
   * hunting for a gap in it.
   */
  for (const cannon of scene?.cannons || []) {
    const r = Math.max((cannon.size || 0) / 2, minRadius);
    if (Math.hypot(at.x - cannon.x, at.y - cannon.y) <= r) {
      return { kind: 'cannon', id: cannon.id };
    }
  }

  const walls = scene?.walls || [];
  for (let i = 0; i < walls.length; i += 1) {
    if (distanceToSegment(at, walls[i]) <= minRadius) return { kind: 'wall', id: String(i) };
  }

  /*
   * Then the ground line, which is a line and not the half-plane below it.
   *
   * Treating everything under it as "the ground" would make the planet
   * unreachable at every step that has both, and the two are different
   * questions: the surface is what you slide on, the world is what pulls.
   */
  const ground = scene?.ground;
  if (ground && Math.abs(at.y - groundAt(ground, at.x)) <= minRadius) return { kind: 'ground' };

  const planet = scene?.planet;
  if (planet && Math.hypot(at.x - planet.x, at.y - planet.y) <= planet.radius) {
    return { kind: 'planet' };
  }

  return { kind: 'sky' };
}

/**
 * Where the ground is at this x, following its slope.
 *
 * `x0` is the point the line is pinned at: the ground is infinite, so it is
 * given as one known point and a gradient rather than as two ends. Pinning it
 * at zero instead would be right only when the caller happened to measure the
 * line at x = 0, and wrong by the whole slope everywhere else.
 *
 * Screen y grows downward while a positive slope rises to the right, so the
 * sign is flipped here rather than at each call site — the kind of thing that
 * is decided in exactly one place or is wrong in half of them.
 */
export function groundAt(ground, x) {
  const tan = Math.tan(((ground.slopeDeg || 0) * Math.PI) / 180);
  return ground.y - (x - (ground.x0 || 0)) * tan;
}

/**
 * How far a point is from a wall.
 *
 * The straight chord, even for a bowed wall. A curve's chord is never more
 * than its bulge away from the curve itself, and a bulge is small next to a
 * finger — so the error is smaller than the target, which is the only
 * precision that matters for something you aim at with a thumb.
 */
export function distanceToSegment(at, w) {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return Math.hypot(at.x - w.x1, at.y - w.y1);
  const t = Math.min(1, Math.max(0, ((at.x - w.x1) * dx + (at.y - w.y1) * dy) / lengthSq));
  return Math.hypot(at.x - (w.x1 + t * dx), at.y - (w.y1 + t * dy));
}

/** The sections a hit opens, or an empty list. */
export const sectionsFor = (target) => SECTIONS_FOR[target?.kind] || [];
