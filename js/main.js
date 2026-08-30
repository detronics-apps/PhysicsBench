/**
 * The app shell: chrome, tool routing, the simulation clock, and rendering.
 *
 * There are two render paths, and the split is what makes a live simulation
 * usable rather than infuriating.
 *
 *   `render()`     runs when the *experiment* changes — a slider moved, a tool
 *                  switched. It rebuilds the world, the sidebar and the
 *                  teaching panels from scratch.
 *
 *   `paint()`      runs every animation frame. It redraws only what is moving:
 *                  the scene, the readouts, the graphs and the inspector. It
 *                  never touches the controls, because rebuilding a slider
 *                  sixty times a second means it cannot be dragged.
 *
 * The transport bar sits between the two: it is rebuilt on a state change, and
 * its clock and timeline are nudged in place on every frame — except while the
 * timeline itself has focus, because replacing the element being dragged is
 * the same bug in a different costume.
 */

import { load, save, saveSoon, state, reset, currentParams, markSeen } from './state.js';
import { el, clear, toast, hideTooltip } from './ui/dom.js';
import { capDiagramScale, dualLabel } from './ui/patterns.js';
import { configureSections, button } from './ui/widgets.js';
import { copyLink, saveProject, openProject, printSheet, downloadSvg, downloadPng, downloadCsv } from './ui/export.js';

import { build, hasWorld } from './scenarios.js';
import { advance, inspect, totals, snapshot as snapWorld } from './world.js';
import { createRecorder, record, frameAt, endTime } from './recorder.js';
import { conceptForTool, progress } from './lessons.js';
import { renderScene, sceneLegend } from './ui/scene-svg.js';
import { renderGraph } from './ui/graph-svg.js';
import { renderInspector, renderTotals, renderBodyPicker } from './ui/inspector.js';
import { renderTransport, transportNote } from './ui/transport.js';
import { promptPanel, disclosurePanel } from './ui/explain.js';
import { renderCompare } from './ui/compare-view.js';

import * as massTool from './ui/tools/mass.js';
import * as motionTool from './ui/tools/motion.js';
import * as accelTool from './ui/tools/accel.js';
import * as forceTool from './ui/tools/force.js';
import * as projectileTool from './ui/tools/projectile.js';
import * as weightTool from './ui/tools/weight.js';
import * as momentumTool from './ui/tools/momentum.js';
import * as collisionTool from './ui/tools/collision.js';
import * as energyTool from './ui/tools/energy.js';
import * as pendulumTool from './ui/tools/pendulum.js';
import * as rotationTool from './ui/tools/rotation.js';
import * as engineerTool from './ui/tools/engineer.js';
import * as challengeTool from './ui/tools/challenge.js';

/** Bumped on every release. Read it before debugging anything: a stale cache
 *  serving yesterday's build has cost more time here than any actual bug. */
export const APP_VERSION = '1.0.0';

const TOOLS = [
  massTool, motionTool, accelTool, forceTool, projectileTool, weightTool,
  momentumTool, collisionTool, energyTool, pendulumTool, rotationTool,
  engineerTool, challengeTool,
];
const byId = Object.fromEntries(TOOLS.map((tool) => [tool.meta.id, tool]));

const dom = {};
let current = null;

/** The live simulation. Rebuilt whenever the experiment changes. */
let sim = { scenario: null, world: null, recorder: createRecorder(), custom: null };

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
      }),
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

const MODES = [
  { id: 'play', label: 'Play', title: 'Big objects, few words. Change something and watch.' },
  { id: 'learn', label: 'Learn', title: 'Equations, units, graphs and the working behind every number.' },
  { id: 'engineer', label: 'Engineer', title: 'Build a machine and find out whether it works.' },
];

function renderTabs() {
  clear(dom.tabs);
  for (const tool of TOOLS) {
    dom.tabs.appendChild(el('button', {
      class: 'segmented__btn',
      type: 'button',
      role: 'tab',
      'aria-selected': String(tool.meta.id === state.tool),
      title: tool.meta.title || tool.meta.label,
      on: { click: () => update((draft) => { draft.tool = tool.meta.id; draft.transport.scrubT = null; }) },
    }, [
      el('span', { class: 'tab-label tab-label--long', text: tool.meta.label }),
      el('span', { class: 'tab-label tab-label--short', text: tool.meta.short }),
    ]));
  }

  clear(dom.modes);
  for (const mode of MODES) {
    dom.modes.appendChild(el('button', {
      class: 'segmented__btn',
      type: 'button',
      role: 'tab',
      title: mode.title,
      'aria-selected': String(mode.id === state.mode),
      on: {
        click: () => update((draft) => {
          draft.mode = mode.id;
          // Engineer mode has one place to be, and it is not the Mass lab.
          if (mode.id === 'engineer' && draft.tool !== 'engineer') draft.tool = 'engineer';
        }),
      },
    }, mode.label));
  }
}

function buildViewport() {
  dom.tabs = el('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Experiments' });
  dom.modes = el('div', { class: 'segmented segmented--modes', role: 'tablist', 'aria-label': 'Mode' });
  dom.prompt = el('div', { id: 'prompt' });
  dom.stage = el('div', { class: 'viewport__stage', id: 'stage' });
  dom.legend = el('div', { id: 'legend' });
  dom.transportHost = el('div', { id: 'transport' });
  dom.readout = el('div', { class: 'readout', id: 'readout' });
  dom.graphs = el('div', { id: 'graphs' });
  dom.banners = el('div', { class: 'banners', id: 'banners' });
  dom.compare = el('div', { id: 'compare' });
  dom.explain = el('div', { class: 'explain-host', id: 'explain' });

  dom.viewport = el('section', { class: 'viewport' }, [
    el('div', { class: 'stage-tools' }, [dom.modes, el('span', { class: 'stage-tools__spacer' })]),
    dom.tabs,
    dom.prompt,
    dom.stage,
    dom.legend,
    dom.transportHost,
    dom.readout,
    dom.graphs,
    dom.banners,
    dom.compare,
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
      button('SVG', () => downloadSvg(dom.stage.querySelector('svg'), `physics-${state.tool}`), { small: true, title: 'Download the drawing as a vector file' }),
      button('PNG', () => downloadPng(dom.stage.querySelector('svg'), `physics-${state.tool}`), { small: true, title: 'Download the drawing as an image' }),
      button('CSV', () => downloadCsv(sim.recorder, graphChannels(), `physics-${state.tool}`), { small: true, title: 'Download the measurements as a spreadsheet' }),
      button('Reset', () => {
        reset();
        rebuild();
        render();
        toast('Reset to the default experiment');
      }, { small: true, title: 'Back to the default settings' }),
      el('span', { class: 'muted', text: `v${APP_VERSION}` }),
    ]),
  ]);
}

/* -------------------------------------------------------------- the sim -- */

const tool = () => byId[state.tool] || TOOLS[0];

/** Build the world (or the tool's own simulation) from the current parameters. */
function rebuild() {
  const t = tool();
  const params = currentParams();
  sim.recorder = createRecorder({ interval: 1 / 60, capacity: 4000 });
  state.transport.scrubT = null;

  if (t.meta.world && hasWorld(t.meta.id)) {
    sim.scenario = build(t.meta.id, params);
    sim.world = sim.scenario.world;
    sim.custom = null;
    if (!state.selectedId || !sim.world.bodies.some((b) => b.id === state.selectedId)) {
      state.selectedId = sim.scenario.focusId;
    }
    sim.recorder = record(sim.recorder, sim.world, { bodyId: state.selectedId, force: true });
  } else {
    sim.scenario = null;
    sim.world = null;
    sim.custom = t.createSim ? t.createSim(params) : null;
  }
}

/** The time currently on screen — live, or wherever the scrubber is. */
const shownTime = () => {
  if (state.transport.scrubT !== null) return state.transport.scrubT;
  if (sim.world) return sim.world.t;
  return sim.custom?.t ?? 0;
};

/** The bodies to draw: live, or the recorded frame being scrubbed to. */
function shownWorld() {
  if (!sim.world) return null;
  if (state.transport.scrubT === null) return sim.world;
  const frame = frameAt(sim.recorder, state.transport.scrubT);
  return frame ? { ...sim.world, t: frame.t, bodies: frame.bodies, ledger: frame.ledger } : sim.world;
}

const graphChannels = () => {
  const groups = tool().channels || [];
  return groups.flatMap((g) => g.ids);
};

/* -------------------------------------------------------- state changes -- */

/**
 * Mutate the state and redraw. Everything the user does comes through here, so
 * there is exactly one place where the state and the screen are reconciled.
 */
export function update(mutate, { rebuildSim = true } = {}) {
  const before = state.tool;
  mutate(state);
  saveSoon();
  if (rebuildSim) rebuild();
  if (state.tool !== before) markSeen(conceptForTool(state.tool)?.id);
  render();
}

/**
 * Rebuilding the sidebar on every edit is what keeps the state and the screen
 * honest — and it also throws away where the panel was scrolled to and which
 * field had the caret. Losing those turns the tool into a form you fight, so
 * they are captured before the teardown and put back afterwards. Controls carry
 * a stable `data-field` name for exactly this.
 */
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
  renderTabs();

  if (dom.themeButton) {
    const [long, short] = dom.themeButton.querySelectorAll('.btn-label');
    if (long) long.textContent = THEME_LABEL[state.theme];
    if (short) short.textContent = THEME_GLYPH[state.theme];
  }

  const t = tool();
  current = t;
  const params = currentParams();
  const ctx = context();

  clear(dom.prompt);
  // Shown in every mode. Engineer mode is a design tool rather than a lesson,
  // but "can a gearbox give you something for nothing?" is exactly the question
  // it exists to answer, and dropping it there would lose the best line in it.
  const concept = conceptForTool(state.tool);
  if (concept) {
    const panel = promptPanel(concept, { mode: state.mode });
    const step = progress(state.tool);
    if (step) panel.querySelector('.prompt__meta').textContent = `${concept.label} · step ${step.index} of ${step.total}`;
    dom.prompt.appendChild(panel);
  }

  clear(dom.controls);
  for (const node of t.controls(ctx)) dom.controls.appendChild(node);

  clear(dom.explain);
  if (state.mode !== 'play') {
    for (const node of (t.explains ? t.explains(ctx) : [])) dom.explain.appendChild(node);
    const disclosure = sim.scenario?.disclosure || (t.disclosure ? t.disclosure(ctx) : null);
    if (disclosure) dom.explain.appendChild(disclosurePanel(disclosure));
  }

  clear(dom.compare);
  if (state.compare.on) {
    dom.compare.appendChild(renderCompare(state.tool, params, state.compare.params, update));
  }

  renderTransportBar();
  paint(true);
  restoreFocus(snap);
  startClock();
}

/** Everything that changes as the simulation runs. Cheap, and called often. */
function paint(force = false) {
  const t = current || tool();
  const ctx = context();

  clear(dom.stage);
  const stageNode = t.meta.world ? renderScene(ctx.world, {
    selectedId: state.selectedId,
    show: showFlags(),
    lanes: sim.scenario?.lanes || null,
    target: t.target ? t.target(ctx) : null,
  }) : t.stage(ctx);
  if (stageNode) dom.stage.appendChild(stageNode);
  // A drawing sized to its contents must never be magnified to fill the panel.
  // Called after the stage has been replaced, on every render — pitfalls.md #3.
  capDiagramScale(dom.stage);

  clear(dom.legend);
  if (t.meta.world && state.view.showVectors) {
    dom.legend.appendChild(sceneLegend(ctx.world, showFlags()));
  } else if (t.legend) {
    const node = t.legend(ctx);
    if (node) dom.legend.appendChild(node);
  }

  clear(dom.readout);
  for (const node of (t.readouts ? t.readouts(ctx) : [])) dom.readout.appendChild(node);

  // Banners are painted rather than rendered, because most of them are about
  // what is happening right now — "they have collided", "it has reached its
  // terminal speed". Left on the state-change path they would still be saying
  // "before you press Play" long after the impact. They hold no inputs, so
  // there is nothing to lose focus.
  clear(dom.banners);
  for (const node of (t.banners ? t.banners(ctx) : [])) dom.banners.appendChild(node);

  // The graph and the inspector carry a lot of DOM for numbers that a person
  // cannot read sixty times a second, so they are redrawn at about twenty.
  if (force || clock.frame % 3 === 0) {
    clear(dom.graphs);
    const onScrub = (time) => {
      state.transport.scrubT = time;
      state.transport.playing = false;
      renderTransportBar();
      paint(true);
    };
    if (state.mode !== 'play') {
      // A lab that runs its own simulation builds its own series; everything
      // else names channels and the recorder supplies them. Both end up in the
      // same renderer, so there is only ever one kind of graph on screen.
      if (t.charts) {
        for (const node of t.charts(ctx)) dom.graphs.appendChild(node);
      } else {
        for (const group of (t.channels || [])) {
          dom.graphs.appendChild(renderGraph(sim.recorder, group.ids, {
            t: shownTime(),
            title: group.label,
            onScrub,
          }));
        }
      }
    }

    clear(dom.inspector);
    if (t.meta.world) {
      const picker = renderBodyPicker(ctx.world, state.selectedId, (id) => {
        state.selectedId = id;
        saveSoon();
        render();
      });
      if (picker) dom.inspector.appendChild(picker);
      dom.inspector.appendChild(renderInspector(inspect(ctx.world, state.selectedId), { mode: state.mode }));
      if (ctx.world.bodies.filter((b) => !b.fixed).length > 1 || state.mode !== 'play') {
        dom.inspector.appendChild(renderTotals(totals(ctx.world), { mode: state.mode }));
      }
    } else if (t.inspector) {
      const node = t.inspector(ctx);
      if (node) dom.inspector.appendChild(node);
    }
  }

  updateTransport();
}

const showFlags = () => ({
  grid: state.view.showGrid,
  trail: state.view.showTrail,
  forces: state.view.showVectors && state.view.showForces,
  velocity: state.view.showVectors && state.view.showVelocity,
  acceleration: state.view.showVectors && state.view.showAcceleration,
  momentum: state.view.showVectors && state.view.showMomentum,
  values: state.view.showValues,
});

/** Everything a tool needs, assembled once per render rather than per call. */
function context() {
  return {
    state,
    params: currentParams(),
    mode: state.mode,
    scenario: sim.scenario,
    world: shownWorld(),
    liveWorld: sim.world,
    custom: sim.custom,
    recorder: sim.recorder,
    t: shownTime(),
    selectedId: state.selectedId,
    show: showFlags(),
    update,
    /** Change one parameter of the current tool. */
    set: (key, value) => update((draft) => { draft.tools[draft.tool][key] = value; }),
    /** Change several at once — used by presets. */
    setMany: (patch) => update((draft) => { Object.assign(draft.tools[draft.tool], patch); }),
    /** Change something that does not need the world rebuilt. */
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

/**
 * Nudge the clock and the timeline without rebuilding them.
 *
 * The timeline is skipped while it has focus: replacing the element being
 * dragged is the same bug as committing a slider on `input`, and it makes the
 * scrubber impossible to use.
 */
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
    // The timeline appears once there is something to scrub through.
    renderTransportBar();
  }
}

/* --------------------------------------------------------------- clock -- */

function stepSimulation(seconds) {
  if (sim.world) {
    sim.world = advance(sim.world, seconds);
    sim.recorder = record(sim.recorder, sim.world, { bodyId: state.selectedId });
  } else if (sim.custom?.advance) {
    sim.custom.advance(seconds);
  }
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    if (current?.onFrame) current.onFrame(context());
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
    get: (id) => state.ui.sections[`${state.tool}:${id}`] ?? true,
    set: (id, open) => { state.ui.sections[`${state.tool}:${id}`] = open; saveSoon(); },
  });

  // The inspector is permanent — it never collapses and never scrolls away
  // from the controls, because its whole job is to be readable while something
  // is moving. It gets its own host so `paint` can refresh it without touching
  // the controls below, where the caret might be.
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

  markSeen(conceptForTool(state.tool)?.id);
  rebuild();
  render();
  save();

  // The share link has done its job once it has been read; leaving it in the
  // address bar means a later reload silently overrides the saved experiment.
  if (location.hash.length > 1) history.replaceState(null, '', location.pathname + location.search);
}

init();

// Exposed for the in-browser verification pass: assert on real values rather
// than looking at a screenshot. `run` advances the simulation by hand, so a
// state at a known time can be checked without waiting for the clock.
window.PhysicsBench = {
  state, render, update, APP_VERSION,
  sim: () => sim,
  inspect: () => (sim.world ? inspect(sim.world, state.selectedId) : null),
  totals: () => (sim.world ? totals(sim.world) : null),
  snapshot: () => (sim.world ? snapWorld(sim.world) : null),
  run: (seconds, step = 1 / 120) => {
    for (let t = 0; t < seconds - 1e-12; t += step) stepSimulation(Math.min(step, seconds - t));
    paint(true);
    return sim.world ? sim.world.t : sim.custom?.t;
  },
  reset: () => { rebuild(); render(); },
};
