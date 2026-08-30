/**
 * The 2D scene: bodies, ground, trails, and every physical quantity drawn as an
 * arrow. The one place world metres become screen pixels.
 *
 * Two rules run through the whole renderer, and both come from the teaching
 * rather than from graphics.
 *
 * **One scale per quantity.** Every force arrow in the scene is drawn to the
 * same newtons-per-pixel, every velocity arrow to the same metres-per-second-
 * per-pixel. That is what makes the picture carry information: if the friction
 * arrow is half the applied arrow, friction really is half. Normalising each
 * arrow separately to look tidy would make the drawing pretty and useless.
 *
 * **One colour per quantity, everywhere.** The colour beside a number in the
 * inspector is the colour of the arrow on the drawing, because they come from
 * the same token in `js/forces.js`. When those were chosen separately the
 * legend and the arrows disagreed, which is worse than having no legend.
 */

import { svg, el } from './dom.js';
import {
  createCamera, toScreen, toPixels, boundsFor, arrowHead, gridLines, clampLabel, visibleWorld,
} from '../camera.js';
import { FORCE_STYLE } from '../forces.js';
import { groundNormal, forcesFor } from '../world.js';
import { len, scale as vscale, norm, perp } from '../vec.js';
import { fmtFixed } from '../format.js';

const VIEW_W = 880;
const VIEW_H = 500;

/** How long the longest arrow of each kind is drawn, in pixels. */
const ARROW_PX = { force: 70, velocity: 62, acceleration: 54, momentum: 54 };

/**
 * How much room an arrow needs beyond the body it comes from: the longest
 * shaft, its head, and the label under the tip.
 *
 * Arrows radiate in any direction, so this is reserved on all four sides — as
 * *padding in pixels*, not by widening the world. Widening the world compounds:
 * the margin in metres depends on the scale, which the margin has just changed,
 * and a small scene ends up zoomed out to nothing chasing its own tail.
 */
const ARROW_MARGIN_PX = Math.max(...Object.values(ARROW_PX)) + 26;
const SCENE_PADDING = 18 + ARROW_MARGIN_PX;

export const VECTOR_STYLE = {
  velocity: { label: 'Velocity', symbol: 'v', token: '--vec-velocity', unit: 'm/s' },
  acceleration: { label: 'Acceleration', symbol: 'a', token: '--vec-acceleration', unit: 'm/s²' },
  momentum: { label: 'Momentum', symbol: 'p', token: '--vec-momentum', unit: 'kg·m/s' },
};

/**
 * Draw a world.
 *
 * @param {object} world
 * @param {object} options
 *   `{ selectedId, show: {...}, camera, lanes, target }`
 */
export function renderScene(world, {
  selectedId = null,
  show = {},
  bounds = null,
  lanes = null,
  target = null,
} = {}) {
  const root = svg('svg', {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    role: 'img',
    'aria-label': 'The experiment',
    class: 'scene',
  });

  const box = bounds || boundsFor(world.bodies, { ground: world.ground });
  const cam = createCamera({
    world: box, viewWidth: VIEW_W, viewHeight: VIEW_H, padding: SCENE_PADDING,
  });

  if (show.grid !== false) root.appendChild(drawGrid(cam));
  if (world.ground) root.appendChild(drawGround(cam, world.ground));
  if (lanes) root.appendChild(drawLanes(cam, lanes));
  if (world.bounds) root.appendChild(drawWalls(cam, world.bounds));
  if (target) root.appendChild(drawTarget(cam, target, world.ground));

  // Trails go under the bodies, so a ball is never hidden by its own path.
  if (show.trail !== false) {
    for (const body of world.bodies) root.appendChild(drawTrail(cam, body));
  }

  for (const body of world.bodies) {
    root.appendChild(drawBody(cam, body, body.id === selectedId));
  }

  // Arrows go on top of everything: they are the point of the drawing.
  root.appendChild(drawVectors(world, cam, { show, selectedId }));

  return root;
}

/* --------------------------------------------------------------- ground -- */

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
  // One label, so the grid is a measurement rather than decoration.
  group.appendChild(svg('text', {
    x: 8, y: VIEW_H - 8, fill: 'var(--text-faint)', 'font-size': 10,
  }, `grid: ${fmtFixed(step, step < 1 ? 2 : 0)} m`));
  return group;
}

function drawGround(cam, ground) {
  const group = svg('g', { class: 'scene__ground' });
  const rad = (ground.slopeDeg * Math.PI) / 180;
  const tan = Math.tan(rad);
  const box = visibleWorld(cam);
  const left = { x: box.minX, y: ground.y + box.minX * tan };
  const right = { x: box.maxX, y: ground.y + box.maxX * tan };
  // The surface can leave the canvas on a steep slope, so the ends are pinned
  // to the edges rather than trusted to land inside.
  const a = { x: 0, y: clamp(toScreen(cam, left).y) };
  const b = { x: VIEW_W, y: clamp(toScreen(cam, right).y) };

  // A filled wedge below the line, so "solid" reads without a texture.
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
      x: r(VIEW_W / 2), y: r(clamp((a.y + b.y) / 2 + 22, 14, VIEW_H - 6)),
      fill: 'var(--text-faint)', 'font-size': 11, 'text-anchor': 'middle',
    }, `${fmtFixed(Math.abs(ground.slopeDeg), 0)}° slope`));
  }
  return group;
}

/** The Mass lab's two separate tracks. */
function drawLanes(cam, lanes) {
  const group = svg('g', { class: 'scene__lanes', 'aria-hidden': 'true' });
  const box = visibleWorld(cam);
  for (const y of lanes) {
    const a = toScreen(cam, { x: box.minX, y: y - 0.22 });
    const b = toScreen(cam, { x: box.maxX, y: y - 0.22 });
    group.appendChild(svg('line', {
      x1: r(a.x), y1: r(a.y), x2: r(b.x), y2: r(b.y),
      stroke: 'var(--ground)', 'stroke-width': 2, 'stroke-dasharray': '1 5', 'stroke-linecap': 'round',
    }));
  }
  return group;
}

function drawWalls(cam, bounds) {
  const group = svg('g', { class: 'scene__walls' });
  const box = visibleWorld(cam);
  for (const x of [bounds.left, bounds.right]) {
    if (!Number.isFinite(x) || Math.abs(x) > 1e5) continue;
    // A wall the camera is not showing is not drawn. Drawing it anyway puts a
    // line outside the viewBox, which the export loses and the panel crops.
    if (x < box.minX || x > box.maxX) continue;
    const a = toScreen(cam, { x, y: box.minY });
    const b = toScreen(cam, { x, y: box.maxY });
    group.appendChild(svg('line', {
      x1: r(a.x), y1: r(a.y), x2: r(b.x), y2: r(b.y),
      stroke: 'var(--ground)', 'stroke-width': 3,
    }));
  }
  return group;
}

/** A challenge target sitting on the ground. */
function drawTarget(cam, target, ground) {
  const y = (ground?.y ?? 0);
  const centre = toScreen(cam, { x: target.x, y });
  const halfWidth = Math.max(6, toPixels(cam, target.tolerance ?? 1));
  const group = svg('g', { class: 'scene__target' });
  group.appendChild(svg('rect', {
    x: r(centre.x - halfWidth), y: r(centre.y - 4), width: r(halfWidth * 2), height: 8,
    rx: 3, fill: 'var(--ok)', 'fill-opacity': 0.35, stroke: 'var(--ok)', 'stroke-width': 1.5,
  }));
  group.appendChild(svg('text', {
    x: r(centre.x), y: r(centre.y - 12), fill: 'var(--ok)', 'font-size': 11,
    'text-anchor': 'middle', 'font-weight': 600,
  }, `target ${fmtFixed(target.x, 0)} m`));
  return group;
}

/* --------------------------------------------------------------- bodies -- */

function drawTrail(cam, body) {
  const group = svg('g', { class: 'scene__trail', 'aria-hidden': 'true' });
  if (!body.trail || body.trail.length < 2) return group;
  const points = body.trail.map((p) => {
    const s = toScreen(cam, p);
    return `${r(s.x)},${r(s.y)}`;
  }).join(' ');
  group.appendChild(svg('polyline', {
    points, fill: 'none', stroke: `var(--body-${body.colour % 4})`,
    'stroke-width': 1.5, 'stroke-opacity': 0.55, 'stroke-linecap': 'round',
  }));
  return group;
}

function drawBody(cam, body, selected) {
  const group = svg('g', { class: 'scene__body' });
  const centre = toScreen(cam, body.pos);
  const fill = `var(--body-${body.colour % 4})`;

  if (body.kind === 'ball') {
    const radius = Math.max(4, toPixels(cam, body.radius));
    group.appendChild(svg('circle', {
      cx: r(centre.x), cy: r(centre.y), r: r(radius),
      fill, stroke: selected ? 'var(--accent-strong)' : 'var(--text-dim)',
      'stroke-width': selected ? 3 : 1.5,
    }));
  } else {
    const w = Math.max(8, toPixels(cam, body.width));
    const h = Math.max(6, toPixels(cam, body.height));
    group.appendChild(svg('rect', {
      x: r(centre.x - w / 2), y: r(centre.y - h / 2), width: r(w), height: r(h), rx: 3,
      fill, stroke: selected ? 'var(--accent-strong)' : 'var(--text-dim)',
      'stroke-width': selected ? 3 : 1.5,
    }));
    if (body.kind === 'cart') {
      // Two wheels, so a cart reads as a cart rather than a crate.
      const wheel = Math.max(3, h * 0.18);
      for (const dx of [-w * 0.28, w * 0.28]) {
        group.appendChild(svg('circle', {
          cx: r(centre.x + dx), cy: r(centre.y + h / 2), r: r(wheel),
          fill: 'var(--body-ink)', 'fill-opacity': 0.5,
        }));
      }
    }
  }

  if (body.label) {
    // Centred under the body, where there is room to grow. Text hung off the
    // side of a symbol runs off the canvas — pitfalls.md #4.
    const width = body.label.length * 6.5;
    const spot = clampLabel(
      { x: centre.x - width / 2, y: centre.y + toPixels(cam, Math.max(body.radius, body.height / 2)) + 15, width, height: 11 },
      VIEW_W, VIEW_H,
    );
    group.appendChild(svg('text', {
      x: r(spot.x + width / 2), y: r(spot.y), 'text-anchor': 'middle',
      fill: 'var(--text-dim)', 'font-size': 11, 'font-weight': 600,
    }, body.label));
  }

  return group;
}

/* -------------------------------------------------------------- vectors -- */

/**
 * Every arrow in the scene, scaled together.
 *
 * The scales are computed across all bodies first, then every arrow is drawn
 * against them. Doing it per body would make a 1 N force on one cart the same
 * length as a 100 N force on another, which is exactly the comparison the Mass
 * lab asks the learner to make by eye.
 */
function drawVectors(world, cam, { show, selectedId }) {
  const group = svg('g', { class: 'scene__vectors' });

  const perBody = world.bodies
    .filter((b) => !b.fixed)
    .map((body) => ({ body, result: forcesFor(world, body) }));

  const scales = {
    force: makeScale(perBody.flatMap(({ result }) => [...result.forces.map((f) => f.magnitude), result.net.magnitude]), ARROW_PX.force),
    velocity: makeScale(perBody.map(({ body }) => len(body.vel)), ARROW_PX.velocity),
    acceleration: makeScale(perBody.map(({ result }) => len(result.acceleration)), ARROW_PX.acceleration),
    momentum: makeScale(perBody.map(({ body }) => len(body.vel) * body.mass), ARROW_PX.momentum),
  };

  for (const { body, result } of perBody) {
    // Arrows only on the selected body when there is one, or the scene turns
    // into a thicket the moment there are three carts.
    if (selectedId && body.id !== selectedId && world.bodies.length > 1) continue;
    const origin = toScreen(cam, body.pos);

    if (show.forces !== false) {
      // Fanned slightly so two forces along the same line stay separable —
      // weight and the normal force are exactly opposite and exactly equal on
      // a resting body, and drawn on one line they look like one arrow.
      const drawn = result.forces.filter((f) => scales.force.visible(f.magnitude));
      drawn.forEach((f, i) => {
        group.appendChild(arrow(origin, f.vec, scales.force.lengthFor(f.magnitude), `var(${f.token})`, {
          label: show.values === false ? null : `${f.symbol} ${fmtFixed(f.magnitude, 1)} N`,
          offset: fanOffset(i, drawn.length),
        }));
      });

      if (result.net.magnitude > 1e-6 && drawn.length > 1) {
        group.appendChild(arrow(origin, result.net.vec, scales.force.lengthFor(result.net.magnitude), `var(${FORCE_STYLE.net.token})`, {
          label: show.values === false ? null : `F_net ${fmtFixed(result.net.magnitude, 1)} N`,
          dashed: true,
          width: 3.5,
        }));
      }
    }

    if (show.velocity !== false) {
      group.appendChild(arrow(origin, body.vel, scales.velocity.lengthFor(len(body.vel)), 'var(--vec-velocity)', {
        label: show.values === false ? null : `v ${fmtFixed(len(body.vel), 1)} m/s`,
        width: 3,
      }));
    }

    if (show.acceleration) {
      group.appendChild(arrow(origin, result.acceleration, scales.acceleration.lengthFor(len(result.acceleration)), 'var(--vec-acceleration)', {
        label: show.values === false ? null : `a ${fmtFixed(len(result.acceleration), 2)} m/s²`,
        width: 2.5,
        offset: 10,
      }));
    }

    if (show.momentum) {
      const p = vscale(body.vel, body.mass);
      group.appendChild(arrow(origin, p, scales.momentum.lengthFor(len(p)), 'var(--vec-momentum)', {
        label: show.values === false ? null : `p ${fmtFixed(len(p), 1)} kg·m/s`,
        width: 2.5,
        offset: -10,
      }));
    }
  }

  return group;
}

/** Small non-zero arrows stay visible; zero ones are not drawn at all. */
function makeScale(magnitudes, maxPixels) {
  const largest = magnitudes.reduce((m, v) => Math.max(m, Math.abs(Number(v) || 0)), 0);
  if (largest <= 1e-9) return { lengthFor: () => 0, visible: () => false, largest: 0 };
  return {
    largest,
    lengthFor: (m) => (Math.abs(m) <= 1e-9 ? 0 : Math.min(maxPixels, Math.max(16, (Math.abs(m) / largest) * maxPixels))),
    visible: (m) => Math.abs(m) > 1e-9,
  };
}

/** A small perpendicular offset so overlapping arrows stay countable. */
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
    const width_ = label.length * 6.2;
    const spot = clampLabel(
      { x: tip.x + dir.x * 8 - width_ / 2, y: tip.y + dir.y * 12 + 4, width: width_, height: 11 },
      VIEW_W, VIEW_H,
    );
    group.appendChild(svg('text', {
      x: r(spot.x + width_ / 2), y: r(spot.y), 'text-anchor': 'middle',
      fill: colour, 'font-size': 10.5, 'font-weight': 600,
    }, label));
  }

  return group;
}

const r = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo = 0, hi = VIEW_H) => Math.min(hi, Math.max(lo, v));

/* -------------------------------------------------------------- legend --- */

/** What each colour on the drawing means. Built from the same tokens. */
export function sceneLegend(world, show) {
  const items = [];
  if (show.forces !== false) {
    const seen = new Set();
    for (const body of world.bodies) {
      if (body.fixed) continue;
      for (const f of forcesFor(world, body).forces) {
        if (f.magnitude > 1e-9 && !seen.has(f.id)) {
          seen.add(f.id);
          items.push({ token: f.token, label: f.label });
        }
      }
    }
    if (seen.size > 1) items.push({ token: FORCE_STYLE.net.token, label: 'Net force (the sum of them all)' });
  }
  if (show.velocity !== false) items.push({ token: VECTOR_STYLE.velocity.token, label: 'Velocity' });
  if (show.acceleration) items.push({ token: VECTOR_STYLE.acceleration.token, label: 'Acceleration' });
  if (show.momentum) items.push({ token: VECTOR_STYLE.momentum.token, label: 'Momentum' });

  return el('div', { class: 'legend' }, items.map((item) => el('div', { class: 'legend__item' }, [
    el('span', { class: 'legend__key', style: { background: `var(${item.token})` } }),
    el('span', { text: item.label }),
  ])));
}

export { VIEW_W, VIEW_H };
