/**
 * Play, pause, step, speed and the timeline. Identical in every lab.
 *
 * The two controls that matter most for learning are the ones a video player
 * would not bother with:
 *
 *   **Step** advances by a fixed small amount and pauses. It is how a learner
 *   watches the exact moment of an impact, or checks that the vertical velocity
 *   really is zero at the top of a throw rather than taking the app's word for
 *   it.
 *
 *   **Scrub** moves through what has already happened. It reads recorded
 *   frames rather than re-simulating, so going back and forward over the same
 *   moment shows the same thing every time.
 *
 * Slow motion is a speed multiplier on simulated time, not a frame-rate
 * change: at 0.1× the physics is identical and the clock runs a tenth as fast,
 * so the numbers on screen stay true.
 */

import { el } from './dom.js';
import { duration, startTime, endTime } from '../recorder.js';
import { fmtFixed } from '../format.js';

export const SPEEDS = [
  { value: 0.1, label: '0.1×', title: 'Slow motion — the physics is unchanged, the clock runs at a tenth' },
  { value: 0.25, label: '0.25×', title: 'Quarter speed' },
  { value: 1, label: '1×', title: 'Real time' },
  { value: 2, label: '2×', title: 'Double speed' },
  { value: 4, label: '4×', title: 'Fast forward' },
];

/**
 * @param {object} spec
 * @param {object} spec.state      the transport slice
 * @param {object} spec.recorder
 * @param {number} spec.t          the simulated time currently on screen
 * @param {object} spec.actions    `{ play, pause, step, reset, setSpeed, scrub, live }`
 */
export function renderTransport({ state, recorder, t, actions }) {
  const playing = state.playing;
  const scrubbing = state.scrubT !== null;
  const total = duration(recorder);
  const from = startTime(recorder);
  const to = endTime(recorder);

  const bar = el('div', { class: 'transport', role: 'group', 'aria-label': 'Playback' });

  bar.appendChild(el('button', {
    class: 'btn btn-primary transport__btn',
    type: 'button',
    'data-field': 'transport:play',
    title: playing ? 'Pause' : 'Play',
    'aria-label': playing ? 'Pause' : 'Play',
    text: playing ? '❙❙' : '▶',
    on: { click: () => (playing ? actions.pause() : actions.play()) },
  }));

  bar.appendChild(el('button', {
    class: 'btn transport__btn',
    type: 'button',
    'data-field': 'transport:step',
    title: `Advance ${fmtFixed(state.stepSeconds * 1000, 0)} ms and pause — the way to watch one moment at a time`,
    'aria-label': 'Step forward',
    text: '⏭',
    on: { click: () => actions.step() },
  }));

  bar.appendChild(el('button', {
    class: 'btn',
    type: 'button',
    'data-field': 'transport:reset',
    title: 'Back to the start, with the same settings',
    text: 'Reset',
    on: { click: () => actions.reset() },
  }));

  bar.appendChild(el('div', { class: 'transport__speed', role: 'group', 'aria-label': 'Speed' },
    SPEEDS.map((speed) => el('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': String(Math.abs(state.speed - speed.value) < 1e-9),
      title: speed.title,
      text: speed.label,
      'data-field': `transport:speed:${speed.value}`,
      on: { click: () => actions.setSpeed(speed.value) },
    }))));

  bar.appendChild(el('span', {
    class: 'transport__clock',
    text: `t = ${fmtFixed(t, 2)} s`,
    title: 'Simulated time since the start of the experiment',
  }));

  // The timeline only appears once there is something recorded to scrub through.
  if (total > 0.05) {
    bar.appendChild(el('input', {
      class: 'transport__scrub',
      type: 'range',
      min: from,
      max: to,
      step: Math.max(0.001, total / 500),
      value: scrubbing ? state.scrubT : to,
      'aria-label': 'Timeline',
      title: 'Move back and forward through what has already happened',
      'data-field': 'transport:scrub',
      on: {
        input: (event) => actions.scrub(Number(event.target.value)),
      },
    }));
  }

  /*
   * Rendered always, hidden until it is needed.
   *
   * Adding it the moment scrubbing starts would mean rebuilding this bar
   * mid-drag — and the thing being dragged is the timeline that sits inside it.
   * Toggling `hidden` from `updateTransport` costs nothing and leaves the
   * slider alone.
   */
  bar.appendChild(el('button', {
    class: 'btn btn-sm',
    type: 'button',
    text: 'Live',
    hidden: scrubbing ? null : true,
    title: 'Stop scrubbing and follow the simulation again',
    'data-field': 'transport:live',
    on: { click: () => actions.live() },
  }));

  return bar;
}

/**
 * The one-line note about what the transport is doing to the physics.
 *
 * Worth saying out loud once: slow motion does not change the experiment. A
 * learner who thinks the app is simulating something different at 0.1× has a
 * reason to distrust everything they measured there.
 */
export function transportNote(state) {
  if (state.scrubT !== null) {
    return 'Scrubbing through what has already happened. These are recorded '
      + 'frames, not a re-run — the same moment always shows the same thing.';
  }
  if (state.speed === 1) return null;
  return `Running at ${state.speed}× — only the clock is different. The forces, `
    + 'the masses and the equations are identical, and every number on screen is '
    + 'still the real value at that moment of simulated time.';
}
