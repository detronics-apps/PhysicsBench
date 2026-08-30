/**
 * The graphs, drawn from the same recording the animation is drawn from.
 *
 * That shared source is the whole point. A learner watching a ball fall while
 * the velocity trace grows underneath it is connecting two representations of
 * one thing; if the two were fed separately one would run a frame behind and
 * the connection would quietly be a lie. The playhead is the visible proof:
 * pause, and the line stops exactly where the ball stops.
 *
 * All the arithmetic lives in `js/graph.js`, which is pure and tested. This file
 * turns numbers into elements and nothing else.
 */

import { svg, el } from './dom.js';
import { layout, playhead, timeAt } from '../graph.js';
import { multiSeries, channelById } from '../recorder.js';
import { fmtFixed } from '../format.js';

const WIDTH = 880;
const HEIGHT = 210;

/**
 * One graph carrying one or more traces.
 *
 * Channels that share an `axis` share a scale; mixing axes on one graph would
 * put metres and metres-per-second on the same ruler, so the caller is expected
 * to group them. `axisLabel` names the unit once, on the axis, rather than
 * repeating it on every tick.
 */
export function renderGraph(recorder, channelIds, options = {}) {
  return renderSeriesGraph(multiSeries(recorder, channelIds).filter((s) => s.channel), options);
}

/**
 * The same graph from series built by hand.
 *
 * The labs that run their own simulation — the pendulum, the rolling race —
 * have quantities the world recorder knows nothing about, and they get exactly
 * the same axes, playhead and scrubbing as everything else rather than a second
 * graph implementation that drifts away from this one.
 */
export function renderSeriesGraph(series, {
  t = null,
  onScrub = null,
  height = HEIGHT,
  title = null,
} = {}) {
  const box = layout(series, { width: WIDTH, height });

  const host = el('div', { class: 'graph' });
  if (title) host.appendChild(el('div', { class: 'graph__head' }, el('span', { class: 'muted', text: title })));

  if (box.empty) {
    host.appendChild(el('div', { class: 'graph__canvas' },
      el('div', { class: 'graph__empty', text: 'Press Play to start recording.' })));
    return host;
  }

  const root = svg('svg', {
    viewBox: `0 0 ${WIDTH} ${height}`,
    role: 'img',
    'aria-label': `${series.map((s) => s.label).join(', ')} against time`,
  });

  root.appendChild(gridAndAxes(box, series));

  for (const path of box.paths) {
    if (!path.d) continue;
    root.appendChild(svg('path', {
      d: path.d,
      fill: 'none',
      stroke: `var(${tokenFor(series, path.id)})`,
      'stroke-width': 2,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }));
  }

  // The playhead: the one line that ties the graph to the animation.
  const head = t === null ? null : playhead(box, t);
  if (head) {
    root.appendChild(svg('line', {
      x1: rr(head.x), y1: rr(head.y1), x2: rr(head.x), y2: rr(head.y2),
      stroke: 'var(--text-faint)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
    }));
    for (const path of box.paths) {
      const point = valueAtTime(series.find((s) => s.id === path.id), t);
      if (point === null) continue;
      root.appendChild(svg('circle', {
        cx: rr(head.x), cy: rr(box.yScale(point)), r: 3.5,
        fill: `var(${tokenFor(series, path.id)})`,
        stroke: 'var(--panel)', 'stroke-width': 1.5,
      }));
    }
  }

  if (onScrub) {
    // A transparent hit area over the plot, so dragging anywhere on the graph
    // scrubs the animation — the graph is a control, not just a picture.
    const hit = svg('rect', {
      x: rr(box.plot.x), y: rr(box.plot.y), width: rr(box.plot.width), height: rr(box.plot.height),
      fill: 'transparent', style: { cursor: 'ew-resize' },
    });
    const scrubTo = (event) => {
      const rect = root.getBoundingClientRect();
      if (!rect.width) return;
      const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
      onScrub(timeAt(box, x));
    };
    hit.addEventListener('pointerdown', (event) => {
      hit.setPointerCapture(event.pointerId);
      scrubTo(event);
    });
    hit.addEventListener('pointermove', (event) => {
      if (event.buttons) scrubTo(event);
    });
    root.appendChild(hit);
  }

  host.appendChild(el('div', { class: 'graph__canvas' }, root));
  host.appendChild(el('div', { class: 'graph__legend' }, series.map((s) => el('span', { class: 'legend__item' }, [
    el('span', { class: 'graph__key', style: { background: `var(${s.token})` } }),
    el('span', { text: `${s.label} (${s.unit})` }),
  ]))));

  return host;
}

function gridAndAxes(box, series) {
  const group = svg('g', { 'aria-hidden': 'true' });
  const { plot } = box;

  for (const tick of box.yTicks) {
    const y = box.yScale(tick);
    group.appendChild(svg('line', {
      x1: rr(plot.x), y1: rr(y), x2: rr(plot.x + plot.width), y2: rr(y),
      stroke: 'var(--grid)', 'stroke-width': 1,
    }));
    group.appendChild(svg('text', {
      x: rr(plot.x - 6), y: rr(y + 3.5), 'text-anchor': 'end',
      fill: 'var(--text-faint)', 'font-size': 10,
    }, fmtFixed(tick, decimalsFor(box.yTicks))));
  }

  for (const tick of box.xTicks) {
    const x = box.xScale(tick);
    group.appendChild(svg('line', {
      x1: rr(x), y1: rr(plot.y), x2: rr(x), y2: rr(plot.y + plot.height),
      stroke: 'var(--grid)', 'stroke-width': 1,
    }));
    group.appendChild(svg('text', {
      x: rr(x), y: rr(plot.y + plot.height + 15), 'text-anchor': 'middle',
      fill: 'var(--text-faint)', 'font-size': 10,
    }, `${fmtFixed(tick, decimalsFor(box.xTicks))}`));
  }

  // Zero is the most informative line on a velocity or force graph: it is where
  // the direction reverses. It gets its own weight.
  if (box.zeroY !== null) {
    group.appendChild(svg('line', {
      x1: rr(plot.x), y1: rr(box.zeroY), x2: rr(plot.x + plot.width), y2: rr(box.zeroY),
      stroke: 'var(--text-faint)', 'stroke-width': 1.5,
    }));
  }

  group.appendChild(svg('text', {
    x: rr(plot.x + plot.width), y: rr(plot.y + plot.height + 15), 'text-anchor': 'end',
    fill: 'var(--text-faint)', 'font-size': 10,
  }, 'time (s)'));

  const unit = series[0]?.unit || '';
  if (unit) {
    group.appendChild(svg('text', {
      x: rr(plot.x - 6), y: rr(plot.y - 1), 'text-anchor': 'end',
      fill: 'var(--text-faint)', 'font-size': 10,
    }, unit));
  }

  return group;
}

/** Enough decimals for the ticks to be distinguishable, and no more. */
function decimalsFor(ticks) {
  if (ticks.length < 2) return 1;
  const step = Math.abs(ticks[1] - ticks[0]);
  if (step >= 10) return 0;
  if (step >= 1) return step % 1 === 0 ? 0 : 1;
  if (step >= 0.1) return 1;
  return 2;
}

const tokenFor = (series, id) => series.find((s) => s.id === id)?.token
  || channelById(id)?.token
  || '--accent-strong';

function valueAtTime(series, t) {
  if (!series || !series.points.length) return null;
  let best = null;
  let bestGap = Infinity;
  for (const p of series.points) {
    const gap = Math.abs(p.x - t);
    if (gap < bestGap) { bestGap = gap; best = p.y; }
  }
  return best;
}

/**
 * The overlay graph for "What if?": the same channel from two runs, drawn on
 * one set of axes so the difference is a shape rather than two numbers.
 */
export function renderComparisonGraph(comparisonChannel, { height = HEIGHT } = {}) {
  const series = [
    { ...comparisonChannel.a, label: 'Run A' },
    { ...comparisonChannel.b, label: 'Run B' },
  ];
  const box = layout(series, { width: WIDTH, height });

  const host = el('div', { class: 'graph' });
  if (box.empty) {
    host.appendChild(el('div', { class: 'graph__canvas' },
      el('div', { class: 'graph__empty', text: 'No data recorded for this quantity.' })));
    return host;
  }

  const root = svg('svg', {
    viewBox: `0 0 ${WIDTH} ${height}`,
    role: 'img',
    'aria-label': `${comparisonChannel.label} for both runs`,
  });
  root.appendChild(gridAndAxes(box, [{ unit: comparisonChannel.unit }]));

  const colours = ['var(--text-dim)', `var(${comparisonChannel.a.token || '--accent-strong'})`];
  box.paths.forEach((path, i) => {
    if (!path.d) return;
    root.appendChild(svg('path', {
      d: path.d, fill: 'none', stroke: colours[i] || 'var(--accent-strong)',
      'stroke-width': i === 0 ? 2 : 2.5,
      'stroke-dasharray': i === 0 ? '6 4' : null,
      'stroke-linejoin': 'round',
    }));
  });

  host.appendChild(el('div', { class: 'graph__canvas' }, root));
  host.appendChild(el('div', { class: 'graph__legend' }, [
    el('span', { class: 'legend__item' }, [
      el('span', { class: 'graph__key', style: { background: 'var(--text-dim)' } }),
      el('span', { text: `Run A — ${comparisonChannel.label} (${comparisonChannel.unit})` }),
    ]),
    el('span', { class: 'legend__item' }, [
      el('span', { class: 'graph__key', style: { background: `var(${comparisonChannel.a.token || '--accent-strong'})` } }),
      el('span', { text: 'Run B — the "what if?"' }),
    ]),
  ]));
  return host;
}

const rr = (v) => Math.round(v * 100) / 100;

export { WIDTH as GRAPH_WIDTH };
