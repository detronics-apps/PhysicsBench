/**
 * The bench: the object, whatever it is sitting on, and every physical quantity
 * drawn as an arrow. The one place world metres become screen pixels.
 *
 * Four rules run through the whole renderer, and all four come from the
 * teaching rather than from graphics.
 *
 * **One scale per quantity.** Every force arrow is drawn to the same
 * newtons-per-pixel, every velocity arrow to the same metres-per-second-per-
 * pixel. That is what makes the picture carry information: if the friction
 * arrow is half the applied arrow, friction really is half. Normalising each
 * arrow separately to look tidy would make the drawing pretty and useless.
 *
 * **One colour per quantity, everywhere.** The colour beside a number in the
 * inspector is the colour of the arrow on the drawing, because both come from
 * the same token in `js/forces.js`.
 *
 * **Every arrow can be switched off.** Nine arrows on one object is a thicket,
 * and the interesting question is usually about two of them. The picker decides
 * what is drawn; this file only asks whether each one is wanted.
 *
 * **A shape looks like the shape it is.** A streamlined teardrop drawn as a
 * rectangle with C_d = 0.04 written under it teaches nothing, so every shape
 * carries its own outline and the renderer draws that. A car gets two outlines,
 * and which one is right depends on whether the scene has a "down" in it.
 */

import { svg, el } from './dom.js';
import {
  createCamera, toScreen, toPixels, boundsFor, arrowHead, gridLines, clampLabel, visibleWorld,
  placeLabels,
} from '../camera.js';
import { FORCE_STYLE } from '../forces.js';
import { forcesFor } from '../world.js';
import { horizonSag } from '../gravitation.js';
import { outline } from '../shapes.js';
import { wallBounds, alongWall } from '../segments.js';
import { len, scale as vscale, norm, perp } from '../vec.js';
import { alongSurface } from '../orient.js';
import { fmtFixed } from '../format.js';

const VIEW_W = 880;
const VIEW_H = 460;

/**
 * How tall a label actually renders, including the ascender and descender.
 *
 * Measured rather than assumed: an 11px font produces a 15px box and a 10.5px
 * one produces 14px, and telling the placer they were 11 is exactly how two
 * labels ended up touching after the placer had declared them clear.
 */
const LABEL_H = { arrow: 14, body: 15 };

/**
 * Above this many objects, only the selected one gets numbers on its arrows.
 *
 * Nine arrows on one object is a thicket, which the picker exists to thin.
 * Seven objects with six arrows each is a different failure altogether: forty
 * pieces of text competing for one canvas, and no amount of moving them apart
 * makes that readable. The arrows themselves stay — their directions and
 * lengths are still the picture — and the numbers move to the inspector, which
 * is where a value you want to read precisely belongs anyway.
 */
const CROWD_LIMIT = 3;

/** How long the longest arrow of each kind is drawn, in pixels. */
const ARROW_PX = { force: 74, velocity: 64, acceleration: 56, momentum: 56 };

/**
 * Room for an arrow beyond the body it comes from — shaft, head and label.
 *
 * Reserved as padding in pixels, not by widening the world. Widening the world
 * compounds: the margin in metres depends on the scale, which the margin has
 * just changed, and a small scene zooms out chasing its own tail.
 */
const ARROW_MARGIN_PX = Math.max(...Object.values(ARROW_PX)) + 26;
const SCENE_PADDING = 18 + ARROW_MARGIN_PX;

export const VECTOR_STYLE = {
  velocity: { label: 'Velocity', symbol: 'v', token: '--vec-velocity', unit: 'm/s' },
  acceleration: { label: 'Acceleration', symbol: 'a', token: '--vec-acceleration', unit: 'm/s²' },
  momentum: { label: 'Momentum', symbol: 'p', token: '--vec-momentum', unit: 'kg·m/s' },
};

/**
 * Draw the bench.
 *
 * @param {object} world
 * @param {object} options
 *   `{ selectedId, vectors, view, focusId, pointer, drawing, control }` —
 *   `vectors` is the per-arrow map straight from the picker, `drawing` is a wall
 *   being dragged out right now, and `pointer` is where the cursor is in world
 *   metres.
 */
export function renderScene(world, {
  selectedId = null,
  vectors = {},
  view = {},
  focusId = 'main',
  pointer = null,
  drawing = null,
  control = null,
  pressed = false,
} = {}) {
  const root = svg('svg', {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    role: 'img',
    'aria-label': 'The bench',
    class: 'scene',
  });

  /*
   * A planet is excluded from the framing.
   *
   * This is what makes the fourth step work. The camera frames the small object
   * and a window around it; the planet is drawn through that window at whatever
   * size it is. Grow the planet and the small object stays exactly the same on
   * screen while the curvature under it flattens — which is the entire point,
   * and would be impossible if the camera tried to fit both.
   */
  const planets = world.bodies.filter((b) => b.kind === 'planet');
  const ordinary = world.bodies.filter((b) => b.kind !== 'planet');
  const cam = sceneCamera(world, focusId, view);

  /*
   * Whether the scene has a "down" in it.
   *
   * Everything that has an up and a down — a car on its wheels, a balloon with
   * its neck below it — is drawn side-on when there is a field, and from above
   * when there is not. A car in deep space seen from the side, apparently
   * driving along nothing, would be a picture of a situation that does not
   * exist.
   */
  const topDown = !world.ground && Math.abs(world.env?.field?.y ?? 0) < 1e-9;

  for (const planet of planets) root.appendChild(drawPlanet(cam, planet));
  if (view.showGrid !== false) root.appendChild(drawGrid(cam, view.grid));
  if (world.ground) root.appendChild(drawGround(cam, world.ground));
  if (world.walls?.length) root.appendChild(drawWalls(cam, world.walls));
  if (drawing) root.appendChild(drawPending(cam, drawing));
  if (world.cannons?.length) root.appendChild(drawCannons(cam, world.cannons));

  // Trails go under the bodies, so an object is never hidden by its own path.
  if (view.showTrail !== false) {
    for (const b of ordinary) root.appendChild(drawTrail(cam, b));
  }

  const labels = [];

  // Anything non-finite is skipped rather than emitted: `cx="NaN"` empties the
  // whole drawing with no explanation, and the banner is a better explanation.
  for (const b of ordinary) {
    if (Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y)) {
      root.appendChild(drawBody(cam, b, b.id === selectedId, topDown, labels));
    }
  }

  if (control) root.appendChild(drawControl(cam, world, control, pointer, pressed));

  // Arrows go on top of everything: they are the point of the drawing.
  const movable = ordinary.filter((b) => !b.fixed && !b.projectile);
  const crowded = movable.length > CROWD_LIMIT;
  root.appendChild(drawVectors(world, cam, {
    vectors, view, ordinary, labels,
    // On a crowded bench the numbers follow the selection rather than covering
    // everything at once.
    labelIds: crowded ? new Set([selectedId, focusId].filter(Boolean)) : null,
  }));

  if (crowded && view.showValues !== false) {
    root.appendChild(svg('text', {
      x: 8, y: VIEW_H - 22, fill: 'var(--text-faint)', 'font-size': 10,
    }, `${movable.length} objects — values are shown for the selected one; the rest keep their arrows`));
  }

  /*
   * Every label on the drawing is placed last, together.
   *
   * Nine arrows leaving one object put nine pieces of text inside eighty pixels
   * of each other, and several of those arrows are near-parallel by
   * construction — weight and the normal force are exactly opposite on a
   * resting body. Placed one at a time each is correct and the set is
   * unreadable, which is worst in exactly the situations the arrows exist to
   * explain. Collecting them and resolving the collisions once is the only way
   * a label can know what else is already there.
   */
  root.appendChild(drawLabels(labels));

  return root;
}

/**
 * The camera this world is drawn through.
 *
 * Exported because the drawing is also an input surface: a wall dragged out on
 * it, and a pointer the object is being towed towards, both need pixels turned
 * back into metres. Two cameras computed from the same rules would agree until
 * one of them was changed, and a wall landing a little away from where it was
 * drawn is a maddening bug to find. There is one.
 */
/**
 * A box of the panel's own shape, centred where the reader put it.
 *
 * Given the same aspect ratio as the usable canvas, so `createCamera`'s two
 * fitting scales come out equal and the width asked for is the width drawn.
 */
export function manualBox({ cx, cy, span }) {
  const usableW = VIEW_W - SCENE_PADDING * 2;
  const usableH = VIEW_H - SCENE_PADDING * 2;
  const width = Math.max(1e-6, span);
  const height = width * (usableH / usableW);
  return {
    minX: cx - width / 2,
    maxX: cx + width / 2,
    minY: cy - height / 2,
    maxY: cy + height / 2,
  };
}

/** The centre and width of a box, for handing back to a manual view. */
export const boxView = (box) => ({
  cx: (box.minX + box.maxX) / 2,
  cy: (box.minY + box.maxY) / 2,
  span: Math.max(1e-6, box.maxX - box.minX),
});

export function sceneCamera(world, focusId = 'main', view = null) {
  const planets = world.bodies.filter((b) => b.kind === 'planet');
  const ordinary = world.bodies.filter((b) => b.kind !== 'planet');
  const focus = ordinary.find((b) => b.id === focusId) || ordinary[0];

  /*
   * Cannon shots are drawn but do not decide the framing.
   *
   * A shot fired hard is off the side of the bench in half a second, and a
   * camera that kept it in view would zoom out until the experiment was a dot —
   * exactly backwards, since the shot is the least interesting thing on screen
   * once it has left. It is allowed to leave.
   */
  const framing = ordinary.filter((b) => !b.projectile);
  const box = planets.length && focus
    ? windowAround(focus, framing.length ? framing : ordinary, planets)
    : withWalls(
      boundsFor(framing.length ? framing : ordinary, { ground: world.ground }),
      world.walls, world.cannons,
    );

  const framed = view?.camera?.mode === 'manual' ? manualBox(view.camera) : box;
  return createCamera({
    world: framed, viewWidth: VIEW_W, viewHeight: VIEW_H, padding: SCENE_PADDING,
  });
}

/** What the automatic framing would be, for Home and for entering manual mode. */
export function autoView(world, focusId = 'main') {
  return boxView(sceneCamera(world, focusId).world);
}

/**
 * A window around the object, a few object-widths across.
 *
 * Deliberately tied to the object's own size rather than to the scene, so that
 * growing a planet from a boulder to Jupiter changes nothing about how big the
 * object looks. That constancy is what the comparison rests on.
 */
function windowAround(focus, all, planets = []) {
  const size = Math.max(focus.radius * 2, focus.width || 0, 0.05);
  const half = Math.max(size * 5, 1.2);
  let minX = focus.pos.x - half;
  let maxX = focus.pos.x + half;
  let minY = focus.pos.y - half * 0.55;
  let maxY = focus.pos.y + half * 0.7;

  // The surface the object is heading for has to be in shot. Watching something
  // fall towards a ground you cannot see is not watching it fall.
  for (const planet of planets) {
    const surface = planet.pos.y + planet.radius;
    if (Number.isFinite(surface)) minY = Math.min(minY, surface - half * 0.25);
  }

  // Any other ordinary body still has to fit.
  for (const b of all) {
    const rad = Math.max(b.radius || 0, (b.width || 0) / 2);
    minX = Math.min(minX, b.pos.x - rad);
    maxX = Math.max(maxX, b.pos.x + rad);
    minY = Math.min(minY, b.pos.y - rad);
    maxY = Math.max(maxY, b.pos.y + rad);
  }
  return { minX, maxX, minY, maxY };
}

/** Walls and cannons are part of the scene, so the framing has to include them. */
function withWalls(box, walls, cannons) {
  let out = box;
  const wb = wallBounds(walls);
  if (wb) {
    out = {
      minX: Math.min(out.minX, wb.minX - 0.3),
      maxX: Math.max(out.maxX, wb.maxX + 0.3),
      minY: Math.min(out.minY, wb.minY - 0.3),
      maxY: Math.max(out.maxY, wb.maxY + 0.3),
    };
  }
  for (const c of cannons || []) {
    out = {
      minX: Math.min(out.minX, c.x - 0.6),
      maxX: Math.max(out.maxX, c.x + 0.6),
      minY: Math.min(out.minY, c.y - 0.6),
      maxY: Math.max(out.maxY, c.y + 0.6),
    };
  }
  return out;
}

/* --------------------------------------------------------------- ground -- */

/**
 * A world, drawn honestly at whatever size it is.
 *
 * Small enough to fit and it is a circle. Too big and it is the arc of its
 * surface crossing the window — and as it grows, that arc straightens, until at
 * planetary size the sag across a two-metre window is far below a pixel and
 * "the ground" is simply flat. Nothing switches over; the geometry does it.
 */
function drawPlanet(cam, planet) {
  const group = svg('g', { class: 'scene__planet' });
  const box = visibleWorld(cam);
  const centre = toScreen(cam, planet.pos);
  const radiusPx = toPixels(cam, planet.radius);

  /*
   * A circle only while a circle fits.
   *
   * The test used to be a fixed radius, generously large, and a world a few
   * hundred pixels across therefore got a circle that ran a thousand pixels
   * past every edge of the canvas — with its label placed at the centre, which
   * by then was off the bottom of the drawing entirely. Invisible on screen,
   * because SVG clips to its viewBox; very visible in an export, and it breaks
   * any measurement of whether the drawing fits its own frame.
   *
   * The arc branch below is not a fallback for "too big to draw". It is the
   * correct picture of a surface crossing the view at any radius, and the sag
   * it draws is the true sag. So the honest test is simply whether the circle
   * is inside the canvas, and if it is not, the arc is what should have been
   * drawn all along.
   */
  const fitsAsCircle = radiusPx < VIEW_W * 3
    && centre.x - radiusPx >= -2 && centre.x + radiusPx <= VIEW_W + 2
    && centre.y - radiusPx >= -2 && centre.y + radiusPx <= VIEW_H + 2;

  if (fitsAsCircle) {
    group.appendChild(svg('circle', {
      cx: r(centre.x), cy: r(centre.y), r: r(radiusPx),
      fill: 'var(--ground)', 'fill-opacity': 0.28,
      stroke: 'var(--ground)', 'stroke-width': 2.5,
    }));
    // Only where there is a centre on screen to write it at.
    if (radiusPx > 26 && centre.y > 10 && centre.y < VIEW_H - 10) {
      group.appendChild(svg('text', {
        x: r(centre.x), y: r(centre.y + 5), 'text-anchor': 'middle',
        fill: 'var(--text-dim)', 'font-size': 12, 'font-weight': 600,
      }, planet.label || ''));
    }
    return group;
  }

  // Too big to draw as a circle: draw the piece of its surface we can see.
  const span = box.maxX - box.minX;
  const sag = horizonSag(planet.radius, span);
  const surfaceY = planet.pos.y + planet.radius;          // the top of the sphere
  const rawLeft = toScreen(cam, { x: box.minX, y: surfaceY - sag });
  const rawTop = toScreen(cam, { x: (box.minX + box.maxX) / 2, y: surfaceY });
  // Entirely out of shot in either direction: there is nothing to draw, and
  // drawing it anyway puts a line thousands of pixels outside the viewBox.
  if (rawTop.y < -VIEW_H || rawLeft.y > VIEW_H * 2) return group;

  const left = { x: 0, y: clampY(rawLeft.y) };
  const right = { x: VIEW_W, y: clampY(rawLeft.y) };
  const top = { x: VIEW_W / 2, y: clampY(rawTop.y) };
  const sagPx = Math.max(0, left.y - top.y);

  const path = sagPx < 0.4
    // The curvature has fallen below half a pixel. It is still there; it is
    // simply no longer drawable, which is exactly why the ground looks flat.
    ? `M ${r(left.x)} ${r(top.y)} L ${r(right.x)} ${r(top.y)}`
    : `M ${r(left.x)} ${r(left.y)} Q ${r(top.x)} ${r(top.y - sagPx)} ${r(right.x)} ${r(right.y)}`;

  group.appendChild(svg('path', {
    d: `${path} L ${r(right.x)} ${VIEW_H} L ${r(left.x)} ${VIEW_H} Z`,
    fill: 'var(--ground)', 'fill-opacity': 0.22,
  }));
  group.appendChild(svg('path', {
    d: path, fill: 'none', stroke: 'var(--ground)', 'stroke-width': 2.5,
  }));
  group.appendChild(svg('text', {
    x: 14, y: VIEW_H - 26, fill: 'var(--text-faint)', 'font-size': 11,
  }, `${planet.label || 'world'} — radius ${formatBig(planet.radius)}, `
    + `sag across this view ${sag < 1e-9 ? 'immeasurable' : formatBig(sag)}`));

  return group;
}

const formatBig = (metres) => {
  if (metres >= 1e6) return `${(metres / 1e6).toPrecision(3)} thousand km`;
  if (metres >= 1000) return `${(metres / 1000).toPrecision(3)} km`;
  if (metres >= 0.01) return `${metres.toPrecision(3)} m`;
  if (metres >= 1e-6) return `${(metres * 1e6).toPrecision(3)} µm`;
  return `${metres.toExponential(2)} m`;
};

function drawGrid(cam, override = 'auto') {
  const group = svg('g', { class: 'scene__grid', 'aria-hidden': 'true' });
  const { xs, ys, step, box } = gridLines(cam, override === 'auto' ? null : override);
  for (const x of xs) {
    const a = toScreen(cam, { x, y: box.minY });
    const b = toScreen(cam, { x, y: box.maxY });
    group.appendChild(svg('line', { x1: r(a.x), y1: r(a.y), x2: r(b.x), y2: r(b.y), stroke: 'var(--grid)', 'stroke-width': 1 }));
  }
  for (const y of ys) {
    const a = toScreen(cam, { x: box.minX, y });
    const b = toScreen(cam, { x: box.maxX, y });
    group.appendChild(svg('line', { x1: r(a.x), y1: r(a.y), x2: r(b.x), y2: r(b.y), stroke: 'var(--grid)', 'stroke-width': 1 }));
  }
  group.appendChild(svg('text', {
    x: 8, y: VIEW_H - 8, fill: 'var(--text-faint)', 'font-size': 10,
  }, `grid: ${step < 1 ? step.toPrecision(2) : fmtFixed(step, 0)} m`));
  return group;
}

function drawGround(cam, ground) {
  const group = svg('g', { class: 'scene__ground' });
  const rad = (ground.slopeDeg * Math.PI) / 180;
  const tan = Math.tan(rad);
  const box = visibleWorld(cam);
  const a = { x: 0, y: clampY(toScreen(cam, { x: box.minX, y: ground.y + box.minX * tan }).y) };
  const b = { x: VIEW_W, y: clampY(toScreen(cam, { x: box.maxX, y: ground.y + box.maxX * tan }).y) };

  group.appendChild(svg('path', {
    d: `M ${r(a.x)} ${r(a.y)} L ${r(b.x)} ${r(b.y)} L ${r(b.x)} ${VIEW_H} L ${r(a.x)} ${VIEW_H} Z`,
    fill: 'var(--ground)', 'fill-opacity': 0.18,
  }));
  group.appendChild(svg('line', {
    x1: r(a.x), y1: r(a.y), x2: r(b.x), y2: r(b.y),
    stroke: 'var(--ground)', 'stroke-width': 2.5,
  }));

  if (Math.abs(ground.slopeDeg) > 0.5) {
    group.appendChild(svg('text', {
      x: r(VIEW_W / 2), y: r(Math.min(VIEW_H - 6, Math.max(14, (a.y + b.y) / 2 + 22))),
      fill: 'var(--text-faint)', 'font-size': 11, 'text-anchor': 'middle',
    }, `${fmtFixed(Math.abs(ground.slopeDeg), 0)}° slope`));
  }
  return group;
}

/* ---------------------------------------------------------------- walls -- */

/**
 * Drawn obstacles.
 *
 * Ends are marked, because a segment having ends is the whole difference
 * between a wall and a floor: a body rolls off the end of one and not the
 * other, and a learner watching it happen should be able to see where the end
 * was.
 */
function drawWalls(cam, walls) {
  const group = svg('g', { class: 'scene__walls' });
  for (const w of walls) {
    const a = toScreen(cam, { x: w.x1, y: w.y1 });
    const b = toScreen(cam, { x: w.x2, y: w.y2 });
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
    group.appendChild(svg('line', {
      x1: r(a.x), y1: r(a.y), x2: r(b.x), y2: r(b.y),
      stroke: 'var(--wall)', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-opacity': 0.85,
    }));
    for (const end of [a, b]) {
      group.appendChild(svg('circle', {
        cx: r(end.x), cy: r(end.y), r: 3.2, fill: 'var(--wall)', 'fill-opacity': 0.9,
      }));
    }
  }
  return group;
}

/** The wall currently being dragged out, before the mouse has been let go. */
function drawPending(cam, drawing) {
  const group = svg('g', { class: 'scene__pending' });
  const a = toScreen(cam, drawing.from);
  const b = toScreen(cam, drawing.to);
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return group;
  group.appendChild(svg('line', {
    x1: r(a.x), y1: r(a.y), x2: r(b.x), y2: r(b.y),
    stroke: 'var(--accent-strong)', 'stroke-width': 4,
    'stroke-linecap': 'round', 'stroke-dasharray': '8 5',
  }));
  const metres = Math.hypot(drawing.to.x - drawing.from.x, drawing.to.y - drawing.from.y);
  const angle = (Math.atan2(drawing.to.y - drawing.from.y, drawing.to.x - drawing.from.x) * 180) / Math.PI;
  group.appendChild(svg('text', {
    x: r((a.x + b.x) / 2), y: r((a.y + b.y) / 2 - 10), 'text-anchor': 'middle',
    fill: 'var(--accent-strong)', 'font-size': 11, 'font-weight': 600,
  }, `${fmtFixed(metres, 2)} m at ${fmtFixed(angle, 0)}°`));
  return group;
}

/**
 * A cannon: a base and a barrel pointing the way it will fire.
 *
 * Drawn at a fixed pixel size rather than in metres. A cannon is a piece of
 * apparatus, not an object in the experiment — it has no mass, takes part in
 * nothing, and scaling it with the scene would make it either invisible or the
 * biggest thing on the bench.
 */
function drawCannons(cam, cannons) {
  const group = svg('g', { class: 'scene__cannons' });
  for (const c of cannons) {
    const at = toScreen(cam, { x: c.x, y: c.y });
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) continue;
    // World y is up, screen y is down: the flip, applied once, here.
    const rad = (-c.angleDeg * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    group.appendChild(svg('line', {
      x1: r(at.x), y1: r(at.y), x2: r(at.x + dx * 26), y2: r(at.y + dy * 26),
      stroke: 'var(--cannon)', 'stroke-width': 8, 'stroke-linecap': 'round',
    }));
    group.appendChild(svg('circle', {
      cx: r(at.x), cy: r(at.y), r: 7,
      fill: 'var(--cannon)', stroke: 'var(--panel)', 'stroke-width': 2,
    }));
    group.appendChild(svg('path', {
      d: arrowHead(at.x + dx * 30, at.y + dy * 30, dx, dy, 7),
      fill: 'var(--cannon)', stroke: 'var(--cannon)', 'stroke-width': 1,
    }));
  }
  return group;
}

/**
 * The aim: where the pointer is from the object, and whether it is firing.
 *
 * Drawn whether or not the button is held, because you aim first and press
 * second — an arrow that only appeared once the force did would leave nothing
 * to aim with. Faint and dashed while it is only an aim; solid, and joined by
 * the ordinary control-force arrow, once it is doing something. The difference
 * between the two states is the whole point of a control you hold down.
 */
function drawControl(cam, world, control, pointer, pressed) {
  const group = svg('g', { class: 'scene__control' });
  if (control.mode !== 'mouse' || !pointer) return group;
  const body = world.bodies.find((b) => b.id === control.targetId);
  if (!body || !Number.isFinite(body.pos.x)) return group;

  const a = toScreen(cam, body.pos);
  const b = toScreen(cam, pointer);
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return group;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1)) return group;
  const ux = dx / length;
  const uy = dy / length;

  // The shaft stops short of the ring, so the arrowhead sits in the gap rather
  // than through the target.
  const tipX = b.x - ux * 9;
  const tipY = b.y - uy * 9;

  group.appendChild(svg('line', {
    x1: r(a.x), y1: r(a.y), x2: r(tipX), y2: r(tipY),
    stroke: 'var(--force-control)',
    'stroke-width': pressed ? 2.5 : 1.5,
    'stroke-dasharray': pressed ? null : '4 5',
    'stroke-opacity': pressed ? 0.95 : 0.55,
  }));
  group.appendChild(svg('path', {
    d: arrowHead(tipX, tipY, ux, uy, pressed ? 10 : 7),
    fill: 'var(--force-control)', stroke: 'var(--force-control)',
    'stroke-width': 1, 'stroke-linejoin': 'round',
    'fill-opacity': pressed ? 0.95 : 0.55,
    'stroke-opacity': pressed ? 0.95 : 0.55,
  }));
  group.appendChild(svg('circle', {
    cx: r(b.x), cy: r(b.y), r: pressed ? 8 : 6,
    fill: pressed ? 'var(--force-control)' : 'none',
    'fill-opacity': pressed ? 0.2 : 0,
    stroke: 'var(--force-control)', 'stroke-width': 2,
    'stroke-opacity': pressed ? 1 : 0.6,
  }));
  return group;
}

/* --------------------------------------------------------------- bodies -- */

/**
 * The path an object has taken, clipped to what the canvas is showing.
 *
 * The clipping is not tidiness. When the camera follows the object — which it
 * does the moment there is a planet to stay in scale against — the older part
 * of the trail is left far behind, tens of thousands of pixels off the side of
 * the viewBox. On screen the browser mostly hides it; in an export it is a
 * stray line across the page, and it wrecks any measurement of whether the
 * drawing fits its own canvas.
 *
 * Points outside are dropped rather than clamped, and the line is broken where
 * it leaves — a trail bent along the edge of the frame would be a path the
 * object never took.
 */
function drawTrail(cam, body) {
  const group = svg('g', { class: 'scene__trail', 'aria-hidden': 'true' });
  if (!body.trail || body.trail.length < 2) return group;

  // Exactly the canvas, with no margin. `visibleWorld` already covers the whole
  // viewBox including its padding, so any slack here is slack *outside* the
  // drawing — which is the thing being clipped away in the first place.
  const box = visibleWorld(cam);
  const inside = (p) => Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= box.minX && p.x <= box.maxX
    && p.y >= box.minY && p.y <= box.maxY;

  const runs = [];
  let run = [];
  for (const p of body.trail) {
    if (inside(p)) {
      run.push(p);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);

  for (const segment of runs) {
    if (segment.length < 2) continue;
    group.appendChild(svg('polyline', {
      points: segment.map((p) => {
        const point = toScreen(cam, p);
        return `${r(point.x)},${r(point.y)}`;
      }).join(' '),
      fill: 'none', stroke: `var(--body-${body.colour % 4})`,
      'stroke-width': 1.5, 'stroke-opacity': 0.55, 'stroke-linecap': 'round',
    }));
  }
  return group;
}

/**
 * Map a shape's outline from its unit box onto the canvas.
 *
 * Done arithmetically rather than with an SVG `transform`, for two reasons.
 * A non-uniform transform scales the stroke with it, so a flat plate would have
 * a hairline top edge and a fat left one; and a transform is one more thing an
 * export has to survive. Numbers in the `d` attribute survive everything.
 *
 * The outlines use only absolute M, L and Q, so every pair of numbers after a
 * command is a coordinate — which makes the transformation a substitution
 * rather than a parser.
 */
function scalePath(d, cx, cy, width, height) {
  const tokens = d.trim().split(/[\s,]+/);
  const out = [];
  let pending = [];
  for (const token of tokens) {
    if (/^[A-Za-z]$/.test(token)) {
      out.push(token);
      pending = [];
      continue;
    }
    pending.push(Number(token));
    if (pending.length === 2) {
      out.push(r(cx + pending[0] * width), r(cy + pending[1] * height));
      pending = [];
    }
  }
  return out.join(' ');
}

function drawBody(cam, body, selected, topDown, labels) {
  const group = svg('g', {
    // Marked, because a shot is the one thing allowed to be drawn outside the
    // canvas and anything checking that needs to be able to tell.
    class: body.projectile ? 'scene__body scene__body--shot' : 'scene__body',
    // A spent shot fades out over three seconds before it is removed. Drawn
    // here rather than animated in CSS, so an export of a paused frame shows
    // exactly what was on screen.
    opacity: body.fade < 1 ? r(Math.max(0, body.fade)) : null,
  });
  const centre = toScreen(cam, body.pos);
  const fill = `var(--body-${body.colour % 4})`;
  const stroke = selected ? 'var(--accent-strong)' : 'var(--text-dim)';
  const strokeWidth = selected ? 3 : 1.5;

  const path = body.shapeId ? outline(body.shapeId, { topDown }) : null;

  if (path) {
    const w = Math.max(8, toPixels(cam, body.width || body.radius * 2));
    const h = Math.max(5, toPixels(cam, body.height || body.radius * 2));
    /*
     * Turned to lie along whatever it is on, and mirrored when it is going
     * left. World angles are anticlockwise with y upward and SVG's are
     * clockwise with y downward, so the sign flips here — the one place it
     * does, as with everything else in this renderer.
     *
     * A transform rather than rotated coordinates: rotation and a ±1 mirror are
     * both length-preserving, so the stroke stays the width it was asked for.
     */
    const spin = -((body.angle || 0) * 180) / Math.PI;
    const mirror = body.flip ? -1 : 1;
    group.appendChild(svg('g', {
      transform: `translate(${r(centre.x)} ${r(centre.y)}) rotate(${r(spin)}) `
        + `scale(${mirror} 1) translate(${r(-centre.x)} ${r(-centre.y)})`,
    }, svg('path', {
      d: `${scalePath(path, centre.x, centre.y, w, h)} Z`,
      fill, stroke, 'stroke-width': strokeWidth, 'stroke-linejoin': 'round',
    })));
  } else if (body.kind === 'ball' || !body.shapeId) {
    const radius = Math.max(4, toPixels(cam, body.radius));
    group.appendChild(svg('circle', {
      cx: r(centre.x), cy: r(centre.y), r: r(radius), fill, stroke, 'stroke-width': strokeWidth,
    }));
    // A spoke, so a rolling object reads as rolling rather than sliding — and
    // it turns by exactly s/R, which is the only rotation in the app that
    // corresponds to anything.
    const turned = -(body.spin || 0);
    group.appendChild(svg('line', {
      x1: r(centre.x), y1: r(centre.y),
      x2: r(centre.x + radius * 0.85 * Math.cos(turned)),
      y2: r(centre.y + radius * 0.85 * Math.sin(turned)),
      stroke: 'var(--body-ink)', 'stroke-width': 1.5, 'stroke-opacity': 0.4,
    }));
  } else {
    const w = Math.max(6, toPixels(cam, body.width));
    const h = Math.max(4, toPixels(cam, body.height));
    const spin = -((body.angle || 0) * 180) / Math.PI;
    group.appendChild(svg('rect', {
      x: r(centre.x - w / 2), y: r(centre.y - h / 2), width: r(w), height: r(h), rx: 3,
      fill, stroke, 'stroke-width': strokeWidth,
      transform: spin ? `rotate(${r(spin)} ${r(centre.x)} ${r(centre.y)})` : null,
    }));
  }

  if (body.label && !body.projectile) {
    // Centred under the body, where there is room to grow — and handed to the
    // collective placer rather than positioned here, so an arrow's label cannot
    // land on top of it. A shot gets none: twenty of them would be the clutter
    // all of this is trying to avoid.
    const width = body.label.length * 6.5;
    const below = toPixels(cam, Math.max(body.radius, (body.height || 0) / 2)) + 16;
    labels.push({
      x: centre.x - width / 2, y: centre.y + below, width, height: LABEL_H.body,
      text: body.label, colour: 'var(--text-dim)', weight: 600, size: 11,
    });
  }
  return group;
}

/* -------------------------------------------------------------- vectors -- */

/**
 * Every arrow the picker has asked for, scaled together.
 *
 * The scales are computed across *all* the forces, including the ones currently
 * switched off, so that hiding an arrow does not silently rescale the ones
 * still showing. Turning the weight arrow off must not make the friction arrow
 * longer, or the comparison the picker exists to enable is broken by using it.
 */
function drawVectors(world, cam, { vectors, view, ordinary, labels, labelIds = null }) {
  const group = svg('g', { class: 'scene__vectors' });

  /*
   * Cannon shots carry no arrows, for the same reason they carry no label and
   * no trail: they are what is being fired at the experiment, not the
   * experiment. Twenty of them with six arrows each is a hundred and twenty
   * arrows over a drawing that is trying to show four.
   *
   * It also keeps one invariant clean. A shot is allowed to leave the canvas —
   * that is the point of not framing on it — and an arrow attached to one would
   * leave with it, so "nothing is drawn outside the drawing" would stop being
   * checkable for everything else.
   */
  const perBody = ordinary
    .filter((b) => !b.fixed && !b.projectile && Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y))
    .map((body) => ({ body, result: forcesFor(world, body) }));

  const scales = {
    force: makeScale(perBody.flatMap(({ result }) => [...result.forces.map((f) => f.magnitude), result.net.magnitude]), ARROW_PX.force),
    velocity: makeScale(perBody.map(({ body }) => len(body.vel)), ARROW_PX.velocity),
    acceleration: makeScale(perBody.map(({ result }) => len(result.acceleration)), ARROW_PX.acceleration),
    momentum: makeScale(perBody.map(({ body }) => len(body.vel) * body.mass), ARROW_PX.momentum),
  };
  const showValues = view.showValues !== false;

  for (const { body, result } of perBody) {
    const origin = toScreen(cam, body.pos);
    const labelled = showValues && (!labelIds || labelIds.has(body.id));

    /*
     * Contact forces are drawn from the contact, not from the centre of mass.
     *
     * Friction and the normal force do not act at the middle of an object; they
     * act where it touches something, and drawing them from the centre quietly
     * says otherwise. It is the same picture a textbook draws — the normal
     * force rising out of the surface and friction lying along it, both rooted
     * at the point of contact — and it is also the only way the two stop
     * overlapping the weight arrow that genuinely does act at the centre.
     *
     * Where the object slides, friction is drawn from the trailing edge of the
     * contact rather than its middle, which is where a reader looks for it.
     */
    const contactAt = result.contact.touching && result.contact.normal
      ? contactPoint(cam, body, result.contact.normal, body.vel)
      : null;
    const rootFor = (id) => (contactAt && CONTACT_FORCES.has(id) ? contactAt : origin);

    const wanted = result.forces.filter((f) => vectors[f.id] && scales.force.visible(f.magnitude));
    wanted.forEach((f, i) => {
      const rooted = rootFor(f.id);
      group.appendChild(arrow(rooted, f.vec, scales.force.lengthFor(f.magnitude), `var(${f.token})`, {
        label: labelled ? `${f.symbol} ${fmtFixed(f.magnitude, f.magnitude < 10 ? 2 : 1)} N` : null,
        // Fanned slightly so two forces along one line stay separable — weight
        // and the normal force are exactly opposite and exactly equal on a
        // resting body, and drawn on one line they look like one arrow. Not
        // needed for the ones rooted at the contact: they are already apart.
        offset: rooted === origin ? fanOffset(i, wanted.length) : 0,
        labels,
      }));
    });

    if (vectors.net && scales.force.visible(result.net.magnitude)) {
      group.appendChild(arrow(origin, result.net.vec, scales.force.lengthFor(result.net.magnitude), `var(${FORCE_STYLE.net.token})`, {
        label: labelled ? `F_net ${fmtFixed(result.net.magnitude, 2)} N` : null,
        dashed: true,
        width: 3.5,
        labels,
      }));
    }

    if (vectors.velocity) {
      group.appendChild(arrow(origin, body.vel, scales.velocity.lengthFor(len(body.vel)), 'var(--vec-velocity)', {
        label: labelled ? `v ${fmtFixed(len(body.vel), 2)} m/s` : null,
        width: 3,
        labels,
      }));
    }
    if (vectors.acceleration) {
      group.appendChild(arrow(origin, result.acceleration, scales.acceleration.lengthFor(len(result.acceleration)), 'var(--vec-acceleration)', {
        label: labelled ? `a ${fmtFixed(len(result.acceleration), 2)} m/s²` : null,
        width: 2.5,
        offset: 11,
        labels,
      }));
    }
    if (vectors.momentum) {
      const p = vscale(body.vel, body.mass);
      group.appendChild(arrow(origin, p, scales.momentum.lengthFor(len(p)), 'var(--vec-momentum)', {
        label: labelled ? `p ${fmtFixed(len(p), 2)} kg·m/s` : null,
        width: 2.5,
        offset: -11,
        labels,
      }));
    }
  }
  return group;
}

/** Small non-zero arrows stay visible; zero ones are not drawn at all. */
function makeScale(magnitudes, maxPixels) {
  const largest = magnitudes.reduce((m, v) => Math.max(m, Math.abs(Number(v) || 0)), 0);
  if (largest <= 1e-12) return { lengthFor: () => 0, visible: () => false, largest: 0 };
  return {
    largest,
    lengthFor: (m) => (Math.abs(m) <= 1e-12 ? 0 : Math.min(maxPixels, Math.max(16, (Math.abs(m) / largest) * maxPixels))),
    visible: (m) => Math.abs(m) > 1e-12,
  };
}

const fanOffset = (index, total) => (total <= 1 ? 0 : (index - (total - 1) / 2) * 7);

/** The forces that act where the object touches something, not at its centre. */
const CONTACT_FORCES = new Set(['normal', 'friction', 'rolling']);

/**
 * Where the object meets the surface, in screen pixels.
 *
 * Straight down the normal by the body's support height, then along the surface
 * to the trailing edge of the contact — the back corner of a sliding box, which
 * is where friction is drawn in every textbook and where a reader looks for it.
 * A round body has no trailing edge worth speaking of, so it stays at the point
 * of contact directly beneath the centre.
 */
function contactPoint(cam, body, normal, velocity) {
  const support = body.support ?? body.radius ?? 0;
  const along = alongSurface(normal);
  const speed = velocity ? velocity.x * along.x + velocity.y * along.y : 0;

  // Only a body with a flat face has a back corner to speak of.
  const halfFace = body.kind === 'ball' || !body.width ? 0 : body.width / 2;
  const back = Math.abs(speed) > 1e-3 ? -Math.sign(speed) * halfFace * 0.85 : 0;

  return toScreen(cam, {
    x: body.pos.x - normal.x * support + along.x * back,
    y: body.pos.y - normal.y * support + along.y * back,
  });
}

/**
 * One arrow: shaft, head, and a label request at the tip.
 *
 * The head is barb–apex–barb with the apex exactly on the tip, built by
 * `arrowHead` rather than by hand — drawing it freehand is how arrows end up
 * pointing into the object they are meant to be leaving (pitfalls.md #6).
 *
 * The label is *requested* rather than drawn, because whether it fits depends
 * on the other eight arrows and this function can only see one.
 */
function arrow(origin, vector, lengthPx, colour, {
  label = null, width = 3, dashed = false, offset = 0, labels = null,
} = {}) {
  const group = svg('g', {});
  if (!(lengthPx > 0)) return group;

  // World y is up, screen y is down: the single flip, applied here.
  const dir = norm({ x: vector.x, y: -vector.y });
  if (!dir.x && !dir.y) return group;

  const side = perp(dir);
  const start = { x: origin.x + side.x * offset, y: origin.y + side.y * offset };
  const tip = { x: start.x + dir.x * lengthPx, y: start.y + dir.y * lengthPx };

  group.appendChild(svg('line', {
    x1: r(start.x), y1: r(start.y), x2: r(tip.x), y2: r(tip.y),
    stroke: colour, 'stroke-width': width, 'stroke-linecap': 'round',
    'stroke-dasharray': dashed ? '7 4' : null,
  }));
  group.appendChild(svg('path', {
    d: arrowHead(tip.x, tip.y, dir.x, dir.y, Math.max(8, width * 3.2)),
    fill: colour, stroke: colour, 'stroke-width': 1, 'stroke-linejoin': 'round',
  }));

  if (label && labels) {
    const textWidth = label.length * 6.2;
    labels.push({
      x: tip.x + dir.x * 10 - textWidth / 2,
      y: tip.y + dir.y * 14 + 4,
      width: textWidth,
      height: LABEL_H.arrow,
      text: label,
      colour,
      weight: 600,
      size: 10.5,
    });
  }
  return group;
}

/** Every label, moved apart and then drawn. */
function drawLabels(labels) {
  const group = svg('g', { class: 'scene__labels' });
  const placed = placeLabels(labels, VIEW_W, VIEW_H);
  placed.forEach((spot, i) => {
    const source = labels[i];
    group.appendChild(svg('text', {
      x: r(spot.x + spot.width / 2), y: r(spot.y), 'text-anchor': 'middle',
      fill: source.colour, 'font-size': source.size, 'font-weight': source.weight,
      // A light halo of the panel colour, so a label crossing an arrow it did
      // not overlap in geometry is still readable where the two graze.
      stroke: 'var(--panel)', 'stroke-width': 2.6, 'paint-order': 'stroke',
    }, source.text));
  });
  return group;
}

const r = (v) => Math.round(v * 100) / 100;
const clampY = (v) => Math.min(VIEW_H, Math.max(0, v));

/** What each colour on the drawing means, built from the same tokens. */
export function sceneLegend(world, vectors) {
  const items = [];
  const seen = new Set();
  for (const body of world.bodies) {
    if (body.fixed || body.kind === 'planet') continue;
    for (const f of forcesFor(world, body).forces) {
      if (vectors[f.id] && f.magnitude > 1e-12 && !seen.has(f.id)) {
        seen.add(f.id);
        items.push({ token: f.token, label: f.label });
      }
    }
  }
  if (vectors.net && seen.size > 1) items.push({ token: FORCE_STYLE.net.token, label: 'Net force (the sum of them all)' });
  for (const id of ['velocity', 'acceleration', 'momentum']) {
    if (vectors[id]) items.push({ token: VECTOR_STYLE[id].token, label: VECTOR_STYLE[id].label });
  }

  if (!items.length) return el('div', { class: 'legend muted', text: 'Every arrow is hidden.' });
  return el('div', { class: 'legend' }, items.map((item) => el('div', { class: 'legend__item' }, [
    el('span', { class: 'legend__key', style: { background: `var(${item.token})` } }),
    el('span', { text: item.label }),
  ])));
}

export { VIEW_W, VIEW_H, scalePath };
