/**
 * "What if?" — the same experiment run twice, one variable apart.
 *
 * The panel leads with what was changed and whether the change was clean. A
 * comparison where two things moved at once cannot attribute the difference to
 * either, and the app says so plainly rather than letting a learner draw a
 * conclusion from it. That warning is the most valuable thing on the panel.
 */

import { el } from './dom.js';
import { compare, summarise, relationshipHint, differences } from '../compare.js';
import { renderComparisonGraph } from './graph-svg.js';
import { fmtFixed } from '../format.js';
import { button } from './widgets.js';

/** The quantities worth comparing, per tool. */
const CHANNELS = {
  mass: ['vx', 'x', 'ax', 'ke', 'px'],
  motion: ['x', 'vx'],
  accel: ['x', 'vx', 'ax'],
  force: ['x', 'vx', 'ax', 'fnet'],
  projectile: ['x', 'y', 'vx', 'vy', 'speed'],
  weight: ['y', 'vy', 'speed', 'ke'],
  momentum: ['sys-p', 'sys-ke', 'vx'],
  collision: ['sys-p', 'sys-ke', 'vx', 'sys-heat'],
  energy: ['speed', 'ke', 'pe', 'sys-heat'],
};

export function renderCompare(toolId, paramsA, paramsB, update) {
  const host = el('div', { class: 'compare' });

  if (!paramsB) {
    host.appendChild(el('div', { class: 'banner banner-info' }, [
      el('span', { class: 'banner__mark', text: 'i' }),
      el('span', { text: 'Set the experiment up how you want it, press "Keep this as run A", then change one thing.' }),
    ]));
    return host;
  }

  const channels = CHANNELS[toolId];
  if (!channels) {
    host.appendChild(el('div', { class: 'banner banner-info' }, [
      el('span', { class: 'banner__mark', text: 'i' }),
      el('span', { text: 'This lab does not support side-by-side comparison yet.' }),
    ]));
    return host;
  }

  // Run A is the kept one, run B is what is on screen now.
  const result = compare(toolId, paramsB, paramsA, { seconds: 5, step: 1 / 120, interval: 1 / 60 });
  const summary = summarise(result, channels);
  const diffs = differences(paramsB, paramsA);

  host.appendChild(el('div', { class: 'compare__head' }, [
    el('span', { class: 'compare__change', text: summary.change }),
    el('span', { class: 'stage-tools__spacer' }),
    button('Clear comparison', () => update((draft) => { draft.compare = { on: false, params: null }; }), { small: true }),
  ]));

  if (!summary.controlled && diffs.length > 1) {
    host.appendChild(el('div', { class: 'banner banner-warn' }, [
      el('span', { class: 'banner__mark', text: '!' }),
      el('span', {
        text: 'More than one thing changed between the two runs, so whatever is '
          + 'different in the result cannot be pinned on any single one of them. '
          + 'Changing one variable at a time is not fussiness — it is the only '
          + 'way the answer means anything.',
      }),
    ]));
  }

  host.appendChild(el('div', { class: 'compare-grid' }, summary.rows.map((row, i) => {
    const hint = i === 0 && diffs.length === 1 && diffs[0].kind === 'number'
      ? relationshipHint(diffs[0].ratio, row.ratio)
      : null;

    return el('div', { class: `compare-row${i === 0 ? ' compare-row--headline' : ''}` }, [
      el('div', { class: 'compare-row__label', text: `${row.label} (${row.unit})` }),
      el('div', { class: 'compare-row__pair' }, [
        el('span', { class: 'compare-row__a', text: fmtFixed(row.finalA, 2) }),
        el('span', { class: 'compare-row__arrow', text: '→' }),
        el('span', { class: 'compare-row__b', text: fmtFixed(row.finalB, 2) }),
      ]),
      row.ratio !== null && Number.isFinite(row.ratio)
        ? el('div', { class: 'compare-row__ratio', text: `${fmtFixed(row.ratio, 3)}× — measured at the same moment in both runs` })
        : null,
      hint ? el('div', { class: 'compare-row__ratio', text: hint }) : null,
    ]);
  })));

  if (summary.headline) {
    host.appendChild(renderComparisonGraph(summary.headline));
  }

  if (summary.unchanged.length) {
    host.appendChild(el('div', { class: 'banner banner-ok' }, [
      el('span', { class: 'banner__mark', text: '✓' }),
      el('span', {
        text: `Unchanged: ${summary.unchanged.map((r) => r.label).join(', ')}. `
          + 'A quantity that does not move is as informative as one that does — it '
          + 'means what you changed has nothing to do with it.',
      }),
    ]));
  }

  return host;
}

/** The two buttons that drive the comparison, for a tool's sidebar. */
export function compareControls(ctx) {
  const { state, params, update } = ctx;
  return el('div', { class: 'btn-row' }, [
    button(state.compare.params ? 'Replace run A' : 'Keep this as run A', () => update((draft) => {
      draft.compare = { on: true, params: { ...params } };
    }), { small: true, title: 'Freeze the current settings, then change one thing and compare' }),
    state.compare.params
      ? button(state.compare.on ? 'Hide comparison' : 'Show comparison', () => update((draft) => {
        draft.compare.on = !draft.compare.on;
      }), { small: true })
      : null,
    state.compare.params
      ? button('Back to run A', () => update((draft) => {
        Object.assign(draft.tools[draft.tool], draft.compare.params);
      }), { small: true, title: 'Restore the settings you kept' })
      : null,
  ].filter(Boolean));
}
