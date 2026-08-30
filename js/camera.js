/**
 * The map between metres and pixels, and the rules for drawing vectors. Pure.
 *
 * This module exists because two separate bugs live at this boundary, and both
 * of them are invisible until they are not.
 *
 * The first is the y flip. The simulation uses maths coordinates — y upward —
 * and SVG uses screen coordinates — y downward. Converting in one place means
 * a falling ball and its acceleration arrow cannot end up pointing opposite
 * ways, which is what happens the moment two renderers each do their own flip.
 *
 * The second is that a drawing sized to its contents and then stretched to fill
 * the panel is magnified (pitfalls.md #3), and text hung off the edge of a
 * symbol runs outside the viewBox and simply vanishes from an export
 * (pitfalls.md #4). Both are geometry problems, so both are solved here with
 * numbers that can be asserted, rather than in CSS where they can only be
 * looked at.
 */

/**
 * A camera mapping a rectangle of world space onto a viewBox.
 *
 * The scale is the same on both axes — always. A physics drawing with different
 * horizontal and vertical scales is a lie: a 45° launch would not look like 45°,
 * and a circle would be an ellipse.
 */
export function createCamera({
  world,                       // { minX, maxX, minY, maxY } in metres
  viewWidth = 760,
  viewHeight = 380,
  padding = 24,
  maxScale = 400,              // px per metre — stops a tiny scene being absurd
  // Low enough that any scene fits. A 2 km drop is a legitimate experiment, and
  // a floor that stopped it fitting would push the balls off the canvas rather
  // than protect anything.
  minScale = 1e-9,
} = {}) {
  const spanX = Math.max(1e-6, world.maxX - world.minX);
  const spanY = Math.max(1e-6, world.maxY - world.minY);
  const usableW = Math.max(1, viewWidth - padding * 2);
  const usableH = Math.max(1, viewHeight - padding * 2);

  // The fitting scale always wins over the floor. A floor that stops a scene
  // fitting does not protect anything — it pushes the contents off the canvas,
  // which is the failure it was meant to prevent, arriving from the other side.
  const fits = Math.min(usableW / spanX, usableH / spanY);
  const scale = Math.min(maxScale, fits) || Math.max(minScale, fits);

  // Centre whatever is left over, so a scene narrower than the panel sits in
  // the middle rather than jammed against the left edge.
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = padding + (usableW - drawnW) / 2;
  const offsetY = padding + (usableH - drawnH) / 2;

  return { world, viewWidth, viewHeight, padding, scale, offsetX, offsetY, spanX, spanY };
}

/** World metres → viewBox pixels. This is the only place y is flipped. */
export const toScreen = (cam, p) => ({
  x: cam.offsetX + (p.x - cam.world.minX) * cam.scale,
  y: cam.offsetY + (cam.world.maxY - p.y) * cam.scale,
});

/** viewBox pixels → world metres, for click-and-drag. */
export const toWorld = (cam, p) => ({
  x: cam.world.minX + (p.x - cam.offsetX) / cam.scale,
  y: cam.world.maxY - (p.y - cam.offsetY) / cam.scale,
});

/** A length in metres as a length in pixels. */
export const toPixels = (cam, metres) => metres * cam.scale;
export const toMetres = (cam, pixels) => pixels / cam.scale;

/**
 * The rectangle of world space the canvas actually shows.
 *
 * Background furniture — the metre grid, the ground, the walls — must be drawn
 * across *this*, not across the world bounds. The two differ whenever the scale
 * has been clamped or the scene is a different shape from the canvas, and
 * drawing to the world bounds then paints lines outside the viewBox: invisible
 * in an export, and quietly overflowing the panel on screen.
 */
export const visibleWorld = (cam) => {
  const topLeft = toWorld(cam, { x: 0, y: 0 });
  const bottomRight = toWorld(cam, { x: cam.viewWidth, y: cam.viewHeight });
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
};

/** Is a point inside the drawable area? Used to decide whether to label it. */
export const onScreen = (cam, p, margin = 0) => {
  const s = toScreen(cam, p);
  return s.x >= -margin && s.x <= cam.viewWidth + margin && s.y >= -margin && s.y <= cam.viewHeight + margin;
};

/**
 * A bounding box wide enough to hold everything in a world, plus headroom.
 *
 * Recomputed as the scene changes, but only widened — a camera that retunes
 * itself every frame makes a thrown ball appear to hang still while the world
 * shrinks around it, which is disorienting and hides the motion being taught.
 */
export function boundsFor(bodies, { ground = null, minWidth = 6, minHeight = 3, margin = 0.5 } = {}) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const b of bodies) {
    if (!Number.isFinite(b.pos?.x) || !Number.isFinite(b.pos?.y)) continue;
    const r = Math.max(b.radius || 0, (b.width || 0) / 2, (b.height || 0) / 2);
    minX = Math.min(minX, b.pos.x - r);
    maxX = Math.max(maxX, b.pos.x + r);
    minY = Math.min(minY, b.pos.y - r);
    maxY = Math.max(maxY, b.pos.y + r);
    for (const p of b.trail || []) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (minX === Infinity) {
    minX = 0; maxX = minWidth; minY = 0; maxY = minHeight;
  }
  if (ground) minY = Math.min(minY, ground.y);

  minX -= margin; maxX += margin; minY -= margin; maxY += margin;

  // Grow about the centre until the minimum size is met, so nothing shifts.
  if (maxX - minX < minWidth) {
    const extra = (minWidth - (maxX - minX)) / 2;
    minX -= extra; maxX += extra;
  }
  if (maxY - minY < minHeight) {
    const extra = (minHeight - (maxY - minY)) / 2;
    minY -= extra; maxY += extra;
  }
  return { minX, maxX, minY, maxY };
}

/** Union of two bounds — used to widen a camera rather than retune it. */
export const union = (a, b) => ({
  minX: Math.min(a.minX, b.minX),
  maxX: Math.max(a.maxX, b.maxX),
  minY: Math.min(a.minY, b.minY),
  maxY: Math.max(a.maxY, b.maxY),
});

/* ------------------------------------------------------------- vectors -- */

/**
 * How long to draw an arrow of a given magnitude.
 *
 * The rule is one scale per *quantity*, shared by every arrow of that quantity
 * on screen. That is what makes the picture readable: if the 10 N arrow is
 * twice the 5 N arrow, the drawing is carrying information. If each arrow is
 * separately normalised to look nice, it is carrying none, and a learner
 * comparing two forces by eye is being misled.
 *
 * A minimum length keeps a small-but-non-zero force visible; below the dead
 * zone nothing is drawn at all, because a 2-pixel stub reads as an arrow
 * pointing nowhere.
 */
export function vectorScale(magnitudes, { maxPixels = 90, minPixels = 14, deadZone = 1e-9 } = {}) {
  const largest = magnitudes.reduce((m, v) => Math.max(m, Math.abs(Number(v) || 0)), 0);
  if (largest <= deadZone) {
    return { pixelsPer: 0, largest: 0, lengthFor: () => 0, visible: () => false };
  }
  const pixelsPer = maxPixels / largest;
  return {
    pixelsPer,
    largest,
    lengthFor(magnitude) {
      const m = Math.abs(Number(magnitude) || 0);
      if (m <= deadZone) return 0;
      // Small arrows are lengthened to stay visible, never past the biggest one.
      return Math.min(maxPixels, Math.max(minPixels, m * pixelsPer));
    },
    visible(magnitude) { return Math.abs(Number(magnitude) || 0) > deadZone; },
  };
}

/**
 * An arrowhead as three points: barb, apex, barb.
 *
 * The apex sits exactly on the tip and the barbs trail back at ±150° from the
 * direction of travel. Built as a function rather than written out at each call
 * site, because doing it by hand is how arrows end up pointing into the object
 * they are meant to be leaving (pitfalls.md #6).
 */
export function arrowHead(tipX, tipY, dirX, dirY, size = 9) {
  const m = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / m;
  const uy = dirY / m;
  const spread = (30 * Math.PI) / 180;
  const back = (dx, dy, angle) => ({
    x: tipX - size * (dx * Math.cos(angle) - dy * Math.sin(angle)),
    y: tipY - size * (dx * Math.sin(angle) + dy * Math.cos(angle)),
  });
  const a = back(ux, uy, spread);
  const b = back(ux, uy, -spread);
  return `M ${round(a.x)} ${round(a.y)} L ${round(tipX)} ${round(tipY)} L ${round(b.x)} ${round(b.y)}`;
}

const round = (v) => Math.round(v * 100) / 100;

/**
 * Keep a label inside the canvas.
 *
 * Text hung off the side of a symbol grows outward without limit; once its x
 * goes negative it is outside the viewBox and vanishes from an export, even
 * though the browser may still paint it on screen. The export is the honest
 * test, so labels are clamped in geometry rather than trusted to fit.
 */
export function clampLabel({ x, y, width, height }, viewWidth, viewHeight, margin = 4) {
  return {
    x: Math.min(viewWidth - width - margin, Math.max(margin, x)),
    y: Math.min(viewHeight - margin, Math.max(margin + height, y)),
  };
}

/** Does a box fit inside the viewBox? The assertion the renderer tests run. */
export const insideView = (box, viewWidth, viewHeight, tolerance = 0.5) =>
  box.x >= -tolerance
  && box.y >= -tolerance
  && box.x + box.width <= viewWidth + tolerance
  && box.y + box.height <= viewHeight + tolerance;

/**
 * A tick spacing for the metre grid: 0.1, 0.2, 0.5, 1, 2, 5, 10… metres,
 * chosen so the lines land 40–120 px apart whatever the zoom.
 */
export function gridStep(cam, targetPixels = 70) {
  const wanted = targetPixels / cam.scale;
  const magnitude = 10 ** Math.floor(Math.log10(wanted));
  const n = wanted / magnitude;
  // Nearest rung of the ladder, not the next one up. Always rounding up sends
  // a wanted spacing of 2.06 to 5, which more than doubles the gap and leaves
  // a 20 m scene with four grid lines on it.
  const rungs = [1, 2, 2.5, 5, 10];
  const best = rungs.reduce((a, b) => (Math.abs(Math.log(b / n)) < Math.abs(Math.log(a / n)) ? b : a));
  return best * magnitude;
}

/** The grid lines actually visible, so the renderer never loops off-screen. */
export function gridLines(cam) {
  const step = gridStep(cam);
  const box = visibleWorld(cam);
  const xs = [];
  const ys = [];
  // Capped, because a scene 2 km tall at a 1 m grid would be two thousand lines
  // of DOM that render as a solid grey block.
  const limit = 200;
  const firstX = Math.ceil(box.minX / step) * step;
  const firstY = Math.ceil(box.minY / step) * step;
  for (let x = firstX; x <= box.maxX + 1e-9 && xs.length < limit; x += step) xs.push(Number(x.toPrecision(12)));
  for (let y = firstY; y <= box.maxY + 1e-9 && ys.length < limit; y += step) ys.push(Number(y.toPrecision(12)));
  return { step, xs, ys, box };
}
