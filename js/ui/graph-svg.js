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
import { layout, playhead, timeAt, tickFormat, exponentLabel } from '../graph.js';
import { multiSeries, channelById } from '../recorder.js';

const WIDTH = 880;
const HEIGHT = 226;

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
  // A common power of ten comes out to the axis label rather than being
  // repeated — or, worse, rounded away — on every tick.
  const yFormat = tickFormat(box.yTicks);
  const xFormat = tickFormat(box.xTicks);

  for (const tick of box.yTicks) {
    const y = box.yScale(tick);
    group.appendChild(svg('line', {
      x1: rr(plot.x), y1: rr(y), x2: rr(plot.x + plot.width), y2: rr(y),
      stroke: 'var(--grid)', 'stroke-width': 1,
    }));
    group.appendChild(svg('text', {
      x: rr(box.labels.yTicks.x), y: rr(y + box.labels.yTicks.dy),
      'text-anchor': box.labels.yTicks.anchor,
      fill: 'var(--text-faint)', 'font-size': 10,
    }, yFormat.format(tick)));
  }

  box.xTicks.forEach((tick, i) => {
    const x = box.xScale(tick);
    group.appendChild(svg('line', {
      x1: rr(x), y1: rr(plot.y), x2: rr(x), y2: rr(plot.y + plot.height),
      stroke: 'var(--grid)', 'stroke-width': 1,
    }));
    group.appendChild(svg('text', {
      // The first and last are pinned inward, or the first reaches into the
      // y-tick column and touches the bottom number there, and the last runs
      // off the right edge of the graph.
      x: rr(x), y: rr(box.labels.xTicks.y),
      'text-anchor': box.labels.tickAnchor(i, box.xTicks.length),
      fill: 'var(--text-faint)', 'font-size': 10,
    }, xFormat.format(tick)));
  });

  // Zero is the most informative line on a velocity or force graph: it is where
  // the direction reverses. It gets its own weight.
  if (box.zeroY !== null) {
    group.appendChild(svg('line', {
      x1: rr(plot.x), y1: rr(box.zeroY), x2: rr(plot.x + plot.width), y2: rr(box.zeroY),
      stroke: 'var(--text-faint)', 'stroke-width': 1.5,
    }));
  }

  // Both axis names sit in bands reserved for them by `layout`, on their own
  // rows, so neither can land on a tick number.
  group.appendChild(svg('text', {
    x: rr(box.labels.time.x), y: rr(box.labels.time.y), 'text-anchor': box.labels.time.anchor,
    fill: 'var(--text-faint)', 'font-size': 10,
  }, `time (s)${exponentLabel(xFormat.exponent)}`));

  const unit = `${series[0]?.unit || ''}${exponentLabel(yFormat.exponent)}`.trim();
  if (unit) {
    group.appendChild(svg('text', {
      x: rr(box.labels.unit.x), y: rr(box.labels.unit.y), 'text-anchor': box.labels.unit.anchor,
      fill: 'var(--text-faint)', 'font-size': 10,
    }, unit));
  }

  return group;
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
