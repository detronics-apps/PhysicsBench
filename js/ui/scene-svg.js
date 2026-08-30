/**
 * The bench: the object, whatever it is sitting on, and every physical quantity
 * drawn as an arrow. The one place world metres become screen pixels.
 *
 * Three rules run through the whole renderer, and all three come from the
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
 */

import { svg, el } from './dom.js';
import {
  createCamera, toScreen, toPixels, boundsFor, arrowHead, gridLines, clampLabel, visibleWorld,
} from '../camera.js';
import { FORCE_STYLE } from '../forces.js';
import { forcesFor } from '../world.js';
import { horizonSag } from '../gravitation.js';
import { len, scale as vscale, norm, perp } from '../vec.js';
import { fmtFixed } from '../format.js';

const VIEW_W = 880;
const VIEW_H = 460;

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
 *   `{ selectedId, vectors, view, focusId }` — `vectors` is the per-arrow map
 *   straight from the picker.
 */
export function renderScene(world, {
  selectedId = null,
  vectors = {},
  view = {},
  focusId = 'main',
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
  const focus = ordinary.find((b) => b.id === focusId) || ordinary[0];

  const box = planets.length && focus
    ? windowAround(focus, ordinary, planets)
    : boundsFor(ordinary, { ground: world.ground });

  const cam = createCamera({
    world: box, viewWidth: VIEW_W, viewHeight: VIEW_H, padding: SCENE_PADDING,
  });

  for (const planet of planets) root.appendChild(drawPlanet(cam, planet));
  if (view.showGrid !== false) root.appendChild(drawGrid(cam));
  if (world.ground) root.appendChild(drawGround(cam, world.ground));

  // Trails go under the bodies, so an object is never hidden by its own path.
  if (view.showTrail !== false) {
    for (const b of ordinary) root.appendChild(drawTrail(cam, b));
  }
  // Anything non-finite is skipped rather than emitted: `cx="NaN"` empties the
  // whole drawing with no explanation, and the banner is a better explanation.
  for (const b of ordinary) {
    if (Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y)) {
      root.appendChild(drawBody(cam, b, b.id === selectedId));
    }
  }

  // Arrows go on top of everything: they are the point of the drawing.
  root.appendChild(drawVectors(world, cam, { vectors, view, ordinary }));

  return root;
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

  if (radiusPx < VIEW_W * 3) {
    group.appendChild(svg('circle', {
      cx: r(centre.x), cy: r(centre.y), r: r(radiusPx),
      fill: 'var(--ground)', 'fill-opacity': 0.28,
      stroke: 'var(--ground)', 'stroke-width': 2.5,
    }));
    if (radiusPx > 26) {
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

function drawGrid(cam) {
  const group = svg('g', { class: 'scene__grid', 'aria-hidden': 'true' });
  const { xs, ys, step, box } = gridLines(cam);
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

function drawBody(cam, body, selected) {
  const group = svg('g', { class: 'scene__body' });
  const centre = toScreen(cam, body.pos);
  const fill = `var(--body-${body.colour % 4})`;
  const stroke = selected ? 'var(--accent-strong)' : 'var(--text-dim)';
  const strokeWidth = selected ? 3 : 1.5;

  if (body.kind === 'ball') {
    const radius = Math.max(4, toPixels(cam, body.radius));
    group.appendChild(svg('circle', {
      cx: r(centre.x), cy: r(centre.y), r: r(radius), fill, stroke, 'stroke-width': strokeWidth,
    }));
    // A spoke, so a rolling object reads as rolling rather than sliding.
    group.appendChild(svg('line', {
      x1: r(centre.x), y1: r(centre.y),
      x2: r(centre.x + radius * 0.85), y2: r(centre.y),
      stroke: 'var(--body-ink)', 'stroke-width': 1.5, 'stroke-opacity': 0.4,
    }));
  } else {
    const w = Math.max(6, toPixels(cam, body.width));
    const h = Math.max(4, toPixels(cam, body.height));
    group.appendChild(svg('rect', {
      x: r(centre.x - w / 2), y: r(centre.y - h / 2), width: r(w), height: r(h), rx: 3,
      fill, stroke, 'stroke-width': strokeWidth,
    }));
  }

  if (body.label) {
    // Centred under the body, where there is room to grow. Text hung off the
    // side of a symbol runs off the canvas — pitfalls.md #4.
    const textWidth = body.label.length * 6.5;
    const below = toPixels(cam, Math.max(body.radius, (body.height || 0) / 2)) + 16;
    const spot = clampLabel(
      { x: centre.x - textWidth / 2, y: centre.y + below, width: textWidth, height: 11 },
      VIEW_W, VIEW_H,
    );
    group.appendChild(svg('text', {
      x: r(spot.x + textWidth / 2), y: r(spot.y), 'text-anchor': 'middle',
      fill: 'var(--text-dim)', 'font-size': 11, 'font-weight': 600,
    }, body.label));
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
function drawVectors(world, cam, { vectors, view, ordinary }) {
  const group = svg('g', { class: 'scene__vectors' });

  const perBody = ordinary
    .filter((b) => !b.fixed && Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y))
    .map((body) => ({ body, result: forcesFor(world, body) }));

  const scales = {
    force: makeScale(perBody.flatMap(({ result }) => [...result.forces.map((f) => f.magnitude), result.net.magnitude]), ARROW_PX.force),
    velocity: makeScale(perBody.map(({ body }) => len(body.vel)), ARROW_PX.velocity),
    acceleration: makeScale(perBody.map(({ result }) => len(result.acceleration)), ARROW_PX.acceleration),
    momentum: makeScale(perBody.map(({ body }) => len(body.vel) * body.mass), ARROW_PX.momentum),
  };
  const labelled = view.showValues !== false;

  for (const { body, result } of perBody) {
    const origin = toScreen(cam, body.pos);

    const wanted = result.forces.filter((f) => vectors[f.id] && scales.force.visible(f.magnitude));
    wanted.forEach((f, i) => {
      group.appendChild(arrow(origin, f.vec, scales.force.lengthFor(f.magnitude), `var(${f.token})`, {
        label: labelled ? `${f.symbol} ${fmtFixed(f.magnitude, f.magnitude < 10 ? 2 : 1)} N` : null,
        // Fanned slightly so two forces along one line stay separable — weight
        // and the normal force are exactly opposite and exactly equal on a
        // resting body, and drawn on one line they look like one arrow.
        offset: fanOffset(i, wanted.length),
      }));
    });

    if (vectors.net && scales.force.visible(result.net.magnitude)) {
      group.appendChild(arrow(origin, result.net.vec, scales.force.lengthFor(result.net.magnitude), `var(${FORCE_STYLE.net.token})`, {
        label: labelled ? `F_net ${fmtFixed(result.net.magnitude, 2)} N` : null,
        dashed: true,
        width: 3.5,
      }));
    }

    if (vectors.velocity) {
      group.appendChild(arrow(origin, body.vel, scales.velocity.lengthFor(len(body.vel)), 'var(--vec-velocity)', {
        label: labelled ? `v ${fmtFixed(len(body.vel), 2)} m/s` : null,
        width: 3,
      }));
    }
    if (vectors.acceleration) {
      group.appendChild(arrow(origin, result.acceleration, scales.acceleration.lengthFor(len(result.acceleration)), 'var(--vec-acceleration)', {
        label: labelled ? `a ${fmtFixed(len(result.acceleration), 2)} m/s²` : null,
        width: 2.5,
        offset: 11,
      }));
    }
    if (vectors.momentum) {
      const p = vscale(body.vel, body.mass);
      group.appendChild(arrow(origin, p, scales.momentum.lengthFor(len(p)), 'var(--vec-momentum)', {
        label: labelled ? `p ${fmtFixed(len(p), 2)} kg·m/s` : null,
        width: 2.5,
        offset: -11,
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

/**
 * One arrow: shaft, head, and an optional label at the tip.
 *
 * The head is barb–apex–barb with the apex exactly on the tip, built by
 * `arrowHead` rather than by hand — drawing it freehand is how arrows end up
 * pointing into the object they are meant to be leaving (pitfalls.md #6).
 */
function arrow(origin, vector, lengthPx, colour, { label = null, width = 3, dashed = false, offset = 0 } = {}) {
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

  if (label) {
    const textWidth = label.length * 6.2;
    const spot = clampLabel(
      { x: tip.x + dir.x * 8 - textWidth / 2, y: tip.y + dir.y * 12 + 4, width: textWidth, height: 11 },
      VIEW_W, VIEW_H,
    );
    group.appendChild(svg('text', {
      x: r(spot.x + textWidth / 2), y: r(spot.y), 'text-anchor': 'middle',
      fill: colour, 'font-size': 10.5, 'font-weight': 600,
    }, label));
  }
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

export { VIEW_W, VIEW_H };
