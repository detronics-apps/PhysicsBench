/**
 * Graph geometry. Pure — it returns numbers and path strings, never elements.
 *
 * Keeping the arithmetic out of the renderer is what lets the awkward parts be
 * tested: that a trace never leaves its box (pitfalls.md #4 in graph form), that
 * ticks land on round numbers rather than 3.7142857, and that a flat trace is
 * still drawn somewhere sensible rather than collapsing onto a zero-height axis.
 */

/**
 * Ticks a person would have chosen: 1, 2, 2.5, 5 or 10 times a power of ten.
 *
 * An axis reading 0, 3.7142857, 7.4285714 is arithmetically perfect and tells
 * the reader nothing. Round numbers are what make a graph readable at a glance.
 */
export function niceTicks(min, max, target = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const step = Math.abs(min) > 1e-12 ? Math.abs(min) / 2 : 1;
    return [min - step, min, min + step];
  }
  const span = max - min;
  const rough = span / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) * magnitude;

  const first = Math.ceil(min / step - 1e-9) * step;
  const out = [];
  for (let v = first; v <= max + step * 1e-9; v += step) {
    // Re-round each tick: repeated addition of 0.1 drifts to 0.30000000000000004.
    out.push(Number((Math.round(v / step) * step).toPrecision(12)));
  }
  return out;
}

/**
 * The value range a set of series should be drawn against.
 *
 * Zero is included whenever the data comes near it, because on a velocity or
 * force graph the zero line is the most informative thing on the page — it is
 * where the direction reverses.
 */
export function domainFor(seriesList, { includeZero = true, padFraction = 0.08 } = {}) {
  let min = Infinity;
  let max = -Infinity;
  for (const s of seriesList) {
    for (const p of s.points) {
      if (!Number.isFinite(p.y)) continue;
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
    }
  }
  if (min === Infinity) return { min: 0, max: 1, empty: true };

  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }
  if (min === max) {
    // A perfectly flat trace — a constant acceleration, say — still needs a box
    // to be drawn in, and it belongs in the middle of it.
    const pad = Math.max(Math.abs(min) * 0.5, 1);
    return { min: min - pad, max: max + pad, flat: true };
  }
  const pad = (max - min) * padFraction;
  return { min: min - pad, max: max + pad, empty: false };
}

export function timeDomain(seriesList) {
  let min = Infinity;
  let max = -Infinity;
  for (const s of seriesList) {
    for (const p of s.points) {
      if (p.x < min) min = p.x;
      if (p.x > max) max = p.x;
    }
  }
  if (min === Infinity) return { min: 0, max: 1, empty: true };
  return { min, max: max > min ? max : min + 1, empty: false };
}

/** A linear map from a data range onto a pixel range. */
export const scaler = (domainMin, domainMax, rangeMin, rangeMax) => {
  const span = domainMax - domainMin;
  if (Math.abs(span) < 1e-15) return () => (rangeMin + rangeMax) / 2;
  return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
};

/**
 * Lay out a complete graph.
 *
 * Returns everything a renderer needs and nothing it does not: the plot box,
 * the two scales, the ticks, and one SVG path per series. Every point is
 * clamped inside the plot box, so a spike cannot draw over the axis labels.
 */
export function layout(seriesList, {
  width = 640, height = 220,
  padLeft = 52, padRight = 12, padTop = 10, padBottom = 26,
  includeZero = true,
  yDomain = null,
  xDomain = null,
} = {}) {
  const plot = {
    x: padLeft,
    y: padTop,
    width: Math.max(10, width - padLeft - padRight),
    height: Math.max(10, height - padTop - padBottom),
  };
  const x = xDomain || timeDomain(seriesList);
  const y = yDomain || domainFor(seriesList, { includeZero });

  const sx = scaler(x.min, x.max, plot.x, plot.x + plot.width);
  // y is inverted: SVG grows downward, graphs grow upward.
  const sy = scaler(y.min, y.max, plot.y + plot.height, plot.y);

  const clampX = (v) => Math.min(plot.x + plot.width, Math.max(plot.x, v));
  const clampY = (v) => Math.min(plot.y + plot.height, Math.max(plot.y, v));

  const paths = seriesList.map((s) => ({
    id: s.id,
    label: s.label,
    unit: s.unit,
    axis: s.axis,
    d: pathFor(s.points, sx, sy, clampX, clampY),
    last: s.points.length ? s.points[s.points.length - 1] : null,
  }));

  return {
    plot,
    xDomain: x,
    yDomain: y,
    xScale: sx,
    yScale: sy,
    xTicks: niceTicks(x.min, x.max, 6).filter((t) => t >= x.min - 1e-9 && t <= x.max + 1e-9),
    yTicks: niceTicks(y.min, y.max, 5).filter((t) => t >= y.min - 1e-9 && t <= y.max + 1e-9),
    // The zero line, when it is inside the box. On a velocity graph it is the
    // most informative line there is.
    zeroY: y.min < 0 && y.max > 0 ? sy(0) : null,
    paths,
    empty: seriesList.every((s) => s.points.length === 0),
  };
}

function pathFor(points, sx, sy, clampX, clampY) {
  if (!points.length) return '';
  const parts = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const cx = round(clampX(sx(p.x)));
    const cy = round(clampY(sy(p.y)));
    parts.push(`${parts.length === 0 ? 'M' : 'L'} ${cx} ${cy}`);
  }
  return parts.join(' ');
}

const round = (v) => Math.round(v * 100) / 100;

/**
 * Where the playhead sits — the vertical line marking "now" on the graph.
 * The animation and the graph share this, which is what keeps them in step.
 */
export function playhead(layoutResult, t) {
  const { xDomain, xScale, plot } = layoutResult;
  if (t < xDomain.min || t > xDomain.max) return null;
  return { x: xScale(t), y1: plot.y, y2: plot.y + plot.height };
}

/** The time a click at a given x corresponds to — the scrubber, backwards. */
export function timeAt(layoutResult, screenX) {
  const { plot, xDomain } = layoutResult;
  const fraction = (screenX - plot.x) / plot.width;
  return xDomain.min + Math.min(1, Math.max(0, fraction)) * (xDomain.max - xDomain.min);
}
