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
    /*
     * A perfectly flat trace — a constant acceleration, say — still needs a box
     * to be drawn in, and it belongs in the middle of it.
     *
     * The padding is a fraction of the value, not an absolute metre. Padding a
     * flat 5×10⁻¹⁹ J by ±1 J would put the trace on a ruler a billion billion
     * times too coarse to see it on.
     */
    const pad = Math.abs(min) * 0.5 || 1;
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

/**
 * A linear map from a data range onto a pixel range.
 *
 * The degenerate check is *relative*, and that is the whole of it. An absolute
 * floor — "a span under 10⁻¹⁵ is no span at all" — is a statement about metres,
 * and this function is also asked to scale joules: the kinetic energy of a
 * gram-scale mass drifting at a nanometre per second is around 10⁻¹⁹ J, a
 * perfectly good range that an absolute floor declares to be a single point.
 * The graph then drew every tick on top of every other tick at the middle of
 * the plot, and a trace that was changing as a flat line through them.
 */
export const scaler = (domainMin, domainMax, rangeMin, rangeMax) => {
  const span = domainMax - domainMin;
  const magnitude = Math.max(Math.abs(domainMin), Math.abs(domainMax), Number.MIN_VALUE);
  if (!Number.isFinite(span) || Math.abs(span) <= magnitude * 1e-12) {
    return () => (rangeMin + rangeMax) / 2;
  }
  return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
};

/**
 * How to write a set of tick values so they say something.
 *
 * Two failures this exists to prevent, and both of them are an axis lying
 * quietly rather than looking wrong.
 *
 * At the two-masses step the forces are around 4×10⁻⁹ N, and fixed-point
 * formatting printed every tick as "0.00" — five identical labels stacked on
 * each other, telling the reader the quantity is zero when it is the whole
 * subject of the step. At the other end, a planetary energy would print
 * seventeen digits per tick and run off the side.
 *
 * The fix is what a textbook does: take a common power of ten out to the axis
 * label, so the ticks read 0, 1, 2, 3, 4 and the unit reads "N ×10⁻⁹". Nothing
 * is rounded away — the exponent is right there.
 */
export function tickFormat(ticks) {
  const finite = (ticks || []).filter((t) => Number.isFinite(t));
  if (!finite.length) return { exponent: 0, decimals: 1, format: (v) => String(v) };

  const largest = Math.max(...finite.map(Math.abs));
  const step = finite.length > 1
    ? Math.abs(finite[1] - finite[0])
    : (largest || 1);

  // Only when the numbers are genuinely far from 1. Pulling a factor out of
  // "0, 5, 10" would make it harder to read, not easier.
  const exponent = largest > 0 && (largest >= 1e5 || largest < 1e-2)
    ? Math.floor(Math.log10(largest))
    : 0;
  const scale = 10 ** exponent;
  /*
   * Enough decimals to write the step exactly, and no more.
   *
   * Derived rather than bracketed, because a table of ranges gets one of them
   * wrong: a step of 0.25 falls in the "0.1 or more" bracket and prints 0.3,
   * which is a tick label that is not the value of its tick.
   */
  const scaledStep = step / scale;
  let decimals = Math.max(0, -Math.floor(Math.log10(scaledStep)));
  // niceTicks also produces 2.5-style steps, which need one more.
  if (Math.abs((scaledStep * 10 ** decimals) % 1) > 1e-9) decimals += 1;
  decimals = Math.min(4, decimals);

  return {
    exponent,
    decimals,
    scale,
    format: (v) => {
      const scaled = v / scale;
      // −0.00 is a rounding artefact, never a measurement.
      const text = scaled.toFixed(decimals);
      return text === `-${(0).toFixed(decimals)}` ? (0).toFixed(decimals) : text;
    },
  };
}

/** "×10⁻⁹" for an axis label, or nothing when the exponent is zero. */
export function exponentLabel(exponent) {
  if (!exponent) return '';
  const digits = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return ` ×10${String(exponent).split('').map((c) => digits[c] || c).join('')}`;
}

/**
 * Where an x-tick's number sits relative to its tick.
 *
 * The ends are pinned inward so no label can stray outside the plot's width.
 * See the note in `layout`.
 */
export const tickAnchor = (index, count) => {
  if (count <= 1) return 'middle';
  if (index === 0) return 'start';
  if (index === count - 1) return 'end';
  return 'middle';
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
  /*
   * The top and bottom bands exist to hold the axis names, and they are this
   * size because the names would otherwise be written on top of the tick
   * numbers: the unit shared the right-aligned column the y ticks live in, and
   * "time (s)" was anchored at exactly the x where the last tick is centred.
   * Both looked like a font problem and were a geometry problem.
   */
  padLeft = 52, padRight = 12, padTop = 22, padBottom = 38,
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

    /*
     * Where the two axis names go, and where the tick numbers go, as numbers
     * the renderer copies rather than positions it invents.
     *
     * Kept here because "does this label land on that one?" is a question about
     * geometry, and geometry can be asserted. In the renderer it could only be
     * looked at.
     */
    labels: {
      /*
       * How each x-tick number is anchored.
       *
       * Centring every one of them puts the first half outside the plot on the
       * left — where it reaches into the column the y-tick numbers occupy and
       * collides with the bottom one — and the last half outside on the right,
       * where it runs off the edge of the graph entirely. Pinning the two ends
       * inward keeps every label inside the plot's own width, which removes
       * both failures at once and costs nothing: a tick at the very edge reads
       * the same either way.
       */
      tickAnchor,
      // Above the plot, left-aligned with the plot's own left edge — clear of
      // the tick numbers, which are right-aligned six pixels to its left.
      unit: { x: plot.x, y: plot.y - 8, anchor: 'start', height: 11 },
      // Its own row under the tick numbers, centred, so the last tick has the
      // whole of its own row.
      time: { x: plot.x + plot.width / 2, y: plot.y + plot.height + 32, anchor: 'middle', height: 11 },
      yTicks: { x: plot.x - 6, anchor: 'end', dy: 3.5, height: 11 },
      xTicks: { y: plot.y + plot.height + 15, anchor: 'middle', height: 11 },
    },

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
