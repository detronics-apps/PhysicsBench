/**
 * The app shell: chrome, the step stepper, the simulation clock, and rendering.
 *
 * There are two render paths, and the split is what makes a live simulation
 * usable rather than infuriating.
 *
 *   `render()`  runs when the *experiment* changes — a slider moved, a step
 *               taken. It rebuilds the world, the sidebar and the teaching
 *               panels from scratch.
 *
 *   `paint()`   runs every animation frame. It redraws only what is moving: the
 *               drawing, the readouts, the graphs and the inspector. It never
 *               touches the controls, because rebuilding a slider sixty times a
 *               second means it cannot be dragged.
 *
 * The transport bar sits between the two: rebuilt on a state change, with its
 * clock and timeline nudged in place every frame — except while the timeline
 * itself has focus, because replacing the element being dragged is the same bug
 * in a different costume.
 */

import { load, save, saveSoon, state, reset } from './state.js';
import { el, clear, toast, hideTooltip } from './ui/dom.js';
import { capDiagramScale, dualLabel } from './ui/patterns.js';
import { configureSections, button } from './ui/widgets.js';
import { copyLink, saveProject, openProject, printSheet, downloadSvg, downloadPng, downloadCsv } from './ui/export.js';

import { STAGES, stageById, stageIndex, featuresAt, build, applyPush, channelsFor, vectorsFor } from './stages.js';
import { advance, inspect, totals, snapshot as snapWorld } from './world.js';
import { createRecorder, record, frameAt, endTime } from './recorder.js';
import { renderScene, sceneLegend } from './ui/scene-svg.js';
import { renderGraph } from './ui/graph-svg.js';
import { renderInspector, renderTotals, renderBodyPicker } from './ui/inspector.js';
import { renderTransport, transportNote } from './ui/transport.js';
import { disclosurePanel } from './ui/explain.js';
import { vectorPicker, suggestionFor } from './ui/vectors.js';
import * as bench from './ui/bench.js';

/** Bumped on every release. Read it before debugging anything: a stale cache
 *  serving yesterday's build has cost more time here than any actual bug. */
export const APP_VERSION = '2.0.0';

const dom = {};
let sim = { scenario: null, world: null, recorder: createRecorder() };
const clock = { last: 0, raf: 0, frame: 0 };

/* ---------------------------------------------------------------- theme -- */

function applyTheme() {
  if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
}

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };
const THEME_GLYPH = { system: '◐', light: '○', dark: '●' };

/* --------------------------------------------------------------- chrome -- */

function buildHeader() {
  const themeButton = el('button', {
    class: 'btn', type: 'button', id: 'theme-toggle',
    title: 'System, light or dark. Set it explicitly before screen-recording.',
    on: {
      click: () => update((draft) => {
        draft.theme = THEME_ORDER[(THEME_ORDER.indexOf(draft.theme) + 1) % THEME_ORDER.length];
      }, { rebuildSim: false }),
    },
  }, dualLabel(THEME_LABEL[state.theme], THEME_GLYPH[state.theme]));
  dom.themeButton = themeButton;

  return el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('img', { class: 'brand__logo', src: 'assets/logo.png', alt: 'Detronics' }),
      el('span', { class: 'brand__sep', 'aria-hidden': 'true' }),
      el('span', { class: 'brand__tool', text: 'PhysicsBench' }),
    ]),
    // Only the three things you reach for while working: keep this experiment,
    // fetch one, change the theme. Sharing and printing are things you do when
    // you have finished, so they live at the bottom with Reset, where they
    // cannot crowd the wordmark on a phone.
    el('div', { class: 'header-actions' }, [
      el('button', {
        class: 'btn', type: 'button', title: 'Save this experiment as a file on your own machine',
        on: { click: () => saveProject('physics-bench') },
      }, dualLabel('Save project', 'Save')),
      el('button', {
        class: 'btn', type: 'button', title: 'Load a saved experiment',
        on: { click: () => openProject(() => { rebuild(); render(); }) },
      }, dualLabel('Load project', 'Load')),
      themeButton,
    ]),
  ]);
}

/**
 * The stepper.
 *
 * Every step stays clickable, forwards and back, because nothing here is
 * unlocked and nothing is a reward — going back to look at the push again with
 * the friction still set up is a perfectly reasonable thing to want.
 */
function renderStages() {
  clear(dom.stages);
  const here = stageIndex(state.stage);

  STAGES.forEach((stage, i) => {
    dom.stages.appendChild(el('button', {
      class: `stepper__step${i === here ? ' is-current' : ''}${i < here ? ' is-done' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': String(i === here),
      title: stage.ask,
      'data-field': `stage:${stage.id}`,
      on: { click: () => goToStage(stage.id) },
    }, [
      el('span', { class: 'stepper__n', text: String(i + 1) }),
      el('span', { class: 'stepper__label tab-label--long', text: stage.label }),
      el('span', { class: 'stepper__label tab-label--short', text: stage.short }),
    ]));
  });
}

function goToStage(id) {
  update((draft) => {
    draft.stage = id;
    draft.transport.scrubT = null;
    draft.transport.playing = false;
  });
}

function buildViewport() {
  dom.stages = el('div', { class: 'stepper', role: 'tablist', 'aria-label': 'Steps' });
  dom.ask = el('div', { id: 'ask' });
  dom.vectors = el('div', { id: 'vectors' });
  dom.stage = el('div', { class: 'viewport__stage', id: 'stage' });
  dom.legend = el('div', { id: 'legend' });
  dom.transportHost = el('div', { id: 'transport' });
  dom.readout = el('div', { class: 'readout', id: 'readout' });
  dom.graphs = el('div', { id: 'graphs' });
  dom.banners = el('div', { class: 'banners', id: 'banners' });
  dom.explain = el('div', { class: 'explain-host', id: 'explain' });

  dom.viewport = el('section', { class: 'viewport' }, [
    dom.stages,
    dom.ask,
    dom.vectors,
    dom.stage,
    dom.legend,
    dom.transportHost,
    dom.readout,
    dom.graphs,
    dom.banners,
    dom.explain,
  ]);
  return dom.viewport;
}

function buildFooter() {
  return el('footer', { class: 'app-footer' }, [
    el('span', {
      text: 'Everything runs in your browser. Nothing is uploaded, and the share '
        + 'link keeps its data in the URL fragment, which is never sent to a server.',
    }),
    el('nav', {}, [
      button('Share link', () => copyLink(), { small: true, title: 'Copy a link that reopens this exact experiment' }),
      button('Print', () => printSheet(), { small: true, title: 'Print the drawing, the numbers, the graphs and the working' }),
      button('SVG', () => downloadSvg(dom.stage.querySelector('svg'), `physics-${state.stage}`), { small: true }),
      button('PNG', () => downloadPng(dom.stage.querySelector('svg'), `physics-${state.stage}`), { small: true }),
      button('CSV', () => downloadCsv(sim.recorder, channelsFor(state.stage).flatMap((g) => g.ids), `physics-${state.stage}`), { small: true, title: 'Download the measurements as a spreadsheet' }),
      button('Reset', () => {
        reset();
        rebuild();
        render();
        toast('Back to the start of the bench');
      }, { small: true, title: 'Back to the default settings' }),
      el('span', { class: 'muted', text: `v${APP_VERSION}` }),
    ]),
  ]);
}

/* -------------------------------------------------------------- the sim -- */

function rebuild() {
  sim.recorder = createRecorder({ interval: 1 / 60, capacity: 4000 });
  state.transport.scrubT = null;
  sim.scenario = build(state.stage, state.bench);
  sim.world = applyPush(sim.scenario.world, state.bench, sim.scenario.features);
  if (!sim.world.bodies.some((b) => b.id === state.selectedId)) state.selectedId = 'main';
  sim.recorder = record(sim.recorder, sim.world, { bodyId: state.selectedId, force: true });
}

const shownTime = () => (state.transport.scrubT !== null ? state.transport.scrubT : sim.world.t);

/** The bodies to draw: live, or the recorded frame being scrubbed to. */
function shownWorld() {
  if (state.transport.scrubT === null) return sim.world;
  const frame = frameAt(sim.recorder, state.transport.scrubT);
  return frame ? { ...sim.world, t: frame.t, bodies: frame.bodies, ledger: frame.ledger } : sim.world;
}

/* -------------------------------------------------------- state changes -- */

export function update(mutate, { rebuildSim = true } = {}) {
  mutate(state);
  saveSoon();
  if (rebuildSim) rebuild();
  render();
}

function captureFocus() {
  const active = document.activeElement;
  const key = active?.dataset?.field;
  return {
    sidebar: dom.sidebar?.scrollTop ?? 0,
    viewport: dom.viewport?.scrollTop ?? 0,
    key: key || null,
    start: key && active.selectionStart != null ? active.selectionStart : null,
    end: key && active.selectionEnd != null ? active.selectionEnd : null,
  };
}

function restoreFocus(snap) {
  if (dom.sidebar) dom.sidebar.scrollTop = snap.sidebar;
  if (dom.viewport) dom.viewport.scrollTop = snap.viewport;
  if (!snap.key) return;
  const target = document.querySelector(`[data-field="${CSS.escape(snap.key)}"]`);
  if (!target) return;
  target.focus({ preventScroll: true });
  if (snap.start != null && target.setSelectionRange) {
    try { target.setSelectionRange(snap.start, snap.end); } catch { /* not a text field */ }
  }
  if (dom.sidebar) dom.sidebar.scrollTop = snap.sidebar;
  if (dom.viewport) dom.viewport.scrollTop = snap.viewport;
}

/* -------------------------------------------------------------- render -- */

export function render() {
  const snap = captureFocus();
  hideTooltip();
  applyTheme();
  renderStages();

  if (dom.themeButton) {
    const [long, short] = dom.themeButton.querySelectorAll('.btn-label');
    if (long) long.textContent = THEME_LABEL[state.theme];
    if (short) short.textContent = THEME_GLYPH[state.theme];
  }

  const ctx = context();
  const stage = stageById(state.stage);
  const here = stageIndex(state.stage);

  clear(dom.ask);
  dom.ask.appendChild(el('div', { class: 'prompt' }, [
    el('p', { class: 'prompt__meta', text: `Step ${here + 1} of ${STAGES.length} · ${stage.label}` }),
    el('p', { class: 'prompt__ask', text: stage.ask }),
    el('div', { class: 'prompt__nav' }, [
      here > 0 ? button('← Back', () => goToStage(STAGES[here - 1].id), { small: true }) : null,
      here < STAGES.length - 1
        ? button(`Next: ${STAGES[here + 1].label} →`, () => goToStage(STAGES[here + 1].id), { small: true, primary: true })
        : null,
    ].filter(Boolean)),
  ]));

  clear(dom.vectors);
  const available = vectorsFor(state.stage);
  dom.vectors.appendChild(vectorPicker(
    available,
    state.vectors,
    (id, on) => update((draft) => { draft.vectors[id] = on; }, { rebuildSim: false }),
    (patch) => update((draft) => { Object.assign(draft.vectors, patch); }, { rebuildSim: false }),
  ));
  dom.vectors.appendChild(el('div', { class: 'vectors__foot' }, [
    button('Just what matters here', () => update((draft) => {
      Object.assign(draft.vectors, suggestionFor(state.stage, available));
    }, { rebuildSim: false }), { small: true, title: 'Show only the arrows this step is about' }),
  ]));

  clear(dom.controls);
  for (const node of bench.controls(ctx)) dom.controls.appendChild(node);

  clear(dom.explain);
  for (const node of bench.explains(ctx)) dom.explain.appendChild(node);
  if (sim.scenario?.disclosure) dom.explain.appendChild(disclosurePanel(sim.scenario.disclosure));

  renderTransportBar();
  paint(true);
  restoreFocus(snap);
  startClock();
}

function paint(force = false) {
  const ctx = context();

  clear(dom.stage);
  dom.stage.appendChild(renderScene(ctx.world, {
    selectedId: state.selectedId,
    vectors: state.vectors,
    view: state.view,
    focusId: 'main',
  }));
  // A drawing sized to its contents must never be magnified to fill the panel.
  // Called after the stage has been replaced, on every render — pitfalls.md #3.
  capDiagramScale(dom.stage);

  clear(dom.legend);
  dom.legend.appendChild(sceneLegend(ctx.world, state.vectors));

  clear(dom.readout);
  for (const node of bench.readouts(ctx)) dom.readout.appendChild(node);

  clear(dom.banners);
  for (const node of bench.banners(ctx)) dom.banners.appendChild(node);

  // The graphs and the inspector carry a lot of DOM for numbers a person cannot
  // read sixty times a second, so they are redrawn at about twenty.
  if (force || clock.frame % 3 === 0) {
    clear(dom.graphs);
    if (state.view.graphs) {
      for (const group of channelsFor(state.stage)) {
        dom.graphs.appendChild(renderGraph(sim.recorder, group.ids, {
          t: shownTime(),
          title: group.label,
          onScrub: (time) => {
            state.transport.scrubT = time;
            state.transport.playing = false;
            renderTransportBar();
            paint(true);
          },
        }));
      }
    }

    clear(dom.inspector);
    const picker = renderBodyPicker(ctx.world, state.selectedId, (id) => {
      state.selectedId = id;
      saveSoon();
      render();
    });
    if (picker) dom.inspector.appendChild(picker);
    dom.inspector.appendChild(renderInspector(inspect(ctx.world, state.selectedId)));
    if (ctx.world.bodies.filter((b) => !b.fixed).length > 1) {
      dom.inspector.appendChild(renderTotals(totals(ctx.world)));
    }
  }

  updateTransport();
}

function context() {
  return {
    state,
    params: state.bench,
    features: sim.scenario?.features || featuresAt(state.stage),
    scenario: sim.scenario,
    world: shownWorld(),
    liveWorld: sim.world,
    recorder: sim.recorder,
    t: shownTime(),
    selectedId: state.selectedId,
    update,
    goToStage,
    set: (key, value) => update((draft) => { draft.bench[key] = value; }),
    setMany: (patch) => update((draft) => { Object.assign(draft.bench, patch); }),
    setView: (key, value) => update((draft) => { draft.view[key] = value; }, { rebuildSim: false }),
    actions,
  };
}

/* ----------------------------------------------------------- transport -- */

const actions = {
  play() {
    state.transport.playing = true;
    state.transport.scrubT = null;
    saveSoon();
    renderTransportBar();
    startClock();
  },
  pause() {
    state.transport.playing = false;
    saveSoon();
    renderTransportBar();
    startClock();
  },
  step() {
    state.transport.playing = false;
    state.transport.scrubT = null;
    stepSimulation(state.transport.stepSeconds);
    renderTransportBar();
    paint(true);
    startClock();
  },
  reset() {
    state.transport.playing = false;
    rebuild();
    render();
  },
  setSpeed(value) {
    state.transport.speed = value;
    saveSoon();
    renderTransportBar();
  },
  scrub(time) {
    state.transport.scrubT = time;
    state.transport.playing = false;
    paint(true);
    updateTransport();
  },
  live() {
    state.transport.scrubT = null;
    renderTransportBar();
    paint(true);
  },
};

function renderTransportBar() {
  clear(dom.transportHost);
  dom.transportHost.appendChild(renderTransport({
    state: state.transport,
    recorder: sim.recorder,
    t: shownTime(),
    actions,
  }));
  const note = transportNote(state.transport);
  if (note) dom.transportHost.appendChild(el('div', { class: 'field__hint', text: note }));
}

function updateTransport() {
  const clockNode = dom.transportHost.querySelector('.transport__clock');
  if (clockNode) clockNode.textContent = `t = ${shownTime().toFixed(2)} s`;

  // Shown the moment scrubbing starts, without rebuilding the bar the timeline
  // being dragged lives in.
  const live = dom.transportHost.querySelector('[data-field="transport:live"]');
  if (live) live.hidden = state.transport.scrubT === null;

  const slider = dom.transportHost.querySelector('.transport__scrub');
  if (slider && document.activeElement !== slider) {
    const end = endTime(sim.recorder);
    slider.max = String(end);
    if (state.transport.scrubT === null) slider.value = String(end);
  } else if (!slider && endTime(sim.recorder) > 0.05) {
    renderTransportBar();
  }
}

/* --------------------------------------------------------------- clock -- */

function stepSimulation(seconds) {
  // The push is re-applied before every step, because it stops after its
  // duration — and what happens after it stops is the whole point of step two.
  sim.world = applyPush(sim.world, state.bench, sim.scenario.features);
  sim.world = advance(sim.world, seconds);
  sim.recorder = record(sim.recorder, sim.world, { bodyId: state.selectedId });
}

function startClock() {
  cancelAnimationFrame(clock.raf);
  if (!state.transport.playing) return;

  clock.last = performance.now();
  const tick = (now) => {
    // A tab that has been in the background for a minute must not try to catch
    // up on a minute of simulation in one frame.
    const elapsed = Math.min(0.05, (now - clock.last) / 1000);
    clock.last = now;
    clock.frame += 1;
    stepSimulation(elapsed * state.transport.speed);
    paint();
    clock.raf = requestAnimationFrame(tick);
  };
  clock.raf = requestAnimationFrame(tick);
}

// A background tab should not be burning a core on a simulation nobody is
// watching, and returning to it should not jump the experiment forward.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(clock.raf);
  else startClock();
});

/* ------------------------------------------------------------------ init */

function init() {
  load();
  applyTheme();

  configureSections({
    get: (id) => state.ui.sections[`${state.stage}:${id}`] ?? true,
    set: (id, open) => { state.ui.sections[`${state.stage}:${id}`] = open; saveSoon(); },
  });

  // The inspector is permanent — it never collapses and never scrolls away from
  // the controls, because its whole job is to be readable while something is
  // moving. It gets its own host so `paint` can refresh it without touching the
  // controls below, where the caret might be.
  dom.inspector = el('div', { class: 'section__body', id: 'inspector-body' });
  dom.controls = el('div', { id: 'controls' });

  dom.sidebar = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Controls' }, [
    el('div', { class: 'section' }, [
      el('div', { class: 'section__title', style: { cursor: 'default' } }, 'Physics inspector'),
      dom.inspector,
    ]),
    dom.controls,
  ]);

  document.body.append(
    buildHeader(),
    el('main', { class: 'app-main' }, [buildViewport(), dom.sidebar]),
    buildFooter(),
  );

  rebuild();
  render();
  save();

  // The share link has done its job once it has been read; leaving it in the
  // address bar means a later reload silently overrides the saved experiment.
  if (location.hash.length > 1) history.replaceState(null, '', location.pathname + location.search);
}

init();

// Exposed for the in-browser verification pass: assert on real values rather
// than looking at a screenshot.
window.PhysicsBench = {
  state, render, update, APP_VERSION, goToStage,
  sim: () => sim,
  inspect: () => inspect(sim.world, state.selectedId),
  totals: () => totals(sim.world),
  snapshot: () => snapWorld(sim.world),
  run: (seconds, step = 1 / 120) => {
    for (let t = 0; t < seconds - 1e-12; t += step) stepSimulation(Math.min(step, seconds - t));
    paint(true);
    return sim.world.t;
  },
  reset: () => { rebuild(); render(); },
};
