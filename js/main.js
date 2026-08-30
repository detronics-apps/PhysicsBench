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
import { configureSections, button, drag } from './ui/widgets.js';
import { copyLink, saveProject, openProject, printSheet, downloadSvg, downloadPng, downloadCsv } from './ui/export.js';

import {
  STAGES, stageById, stageIndex, featuresAt, build, applyPush, applyLive, structuralKey,
  channelsFor, vectorsFor, MAX_OBJECTS,
} from './stages.js';
import { controlForce } from './control.js';
import { boxWalls } from './segments.js';
import { toWorld } from './camera.js';
import { ZERO } from './vec.js';
import { advance, inspect, totals, snapshot as snapWorld } from './world.js';
import { createRecorder, record, frameAt, endTime } from './recorder.js';
import { renderScene, sceneLegend, sceneCamera } from './ui/scene-svg.js';
import { renderGraph } from './ui/graph-svg.js';
import { renderInspector, renderTotals, renderBodyPicker } from './ui/inspector.js';
import { renderTransport, transportNote } from './ui/transport.js';
import { disclosurePanel } from './ui/explain.js';
import { vectorPicker, suggestionFor } from './ui/vectors.js';
import * as bench from './ui/bench.js';

/** Bumped on every release. Read it before debugging anything: a stale cache
 *  serving yesterday's build has cost more time here than any actual bug. */
export const APP_VERSION = '2.1.0';

const dom = {};
let sim = { scenario: null, world: null, recorder: createRecorder(), key: '' };
const clock = { last: 0, raf: 0, frame: 0 };

/**
 * Live input: where the pointer is, which keys are down, and any wall being
 * dragged out right now.
 *
 * Deliberately outside `state`. None of it is part of the experiment — it is
 * not worth saving, not worth sharing, and putting it in state would mean every
 * mouse move wrote to localStorage and rebuilt the sidebar.
 */
const input = { pointer: null, keys: new Set(), drawing: null };

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
      }, { sim: 'none' }),
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
  }, { sim: 'full' });
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
      button('CSV', () => downloadCsv(sim.recorder, channelsFor(state.stage, state.bench).flatMap((g) => g.ids), `physics-${state.stage}`), { small: true, title: 'Download the measurements as a spreadsheet' }),
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
  sim.key = structuralKey(state.stage, state.bench);
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

/**
 * Change something, and decide how much of the simulation that costs.
 *
 *   'live'  the default. Push the new numbers into the world that is already
 *           running, leaving every position and velocity exactly where the
 *           simulation put them.
 *   'none'  nothing physical changed — a theme, an arrow being hidden.
 *   'full'  start again from scratch.
 *
 * 'live' is the one that matters. Rebuilding on every slider move is what makes
 * an app feel like a slideshow: you set something moving, reach for the angle,
 * and it snaps back to the start. Being able to turn the push while watching
 * the path bend is the difference between a bench and a diagram.
 *
 * It does not have to be asked for carefully, either — `structuralKey` notices
 * when a change genuinely alters what bodies exist and rebuilds anyway, so a
 * caller can always say 'live' and be right.
 */
export function update(mutate, { sim: how = 'live' } = {}) {
  mutate(state);
  saveSoon();
  if (how === 'full') rebuild();
  else if (how !== 'none') applyParams();
  // Mid-drag the sidebar is left alone: rebuilding it would replace the slider
  // under the thumb and end the drag on its first movement. Everything that is
  // watched while dragging — the drawing, the readouts, the banners — is in
  // `paint`, which runs either way.
  render({ controls: !drag.active });
}

/**
 * Push the current parameters into the running world.
 *
 * The scenario is rebuilt because the teaching panels are derived from it —
 * the disclosure, the equations, what the object is. The *world* is not: it
 * keeps running, and only its properties are updated.
 */
function applyParams() {
  const key = structuralKey(state.stage, state.bench);
  if (key !== sim.key) {
    rebuild();
    return;
  }
  sim.scenario = build(state.stage, state.bench);
  sim.world = applyLive(sim.world, state.bench, sim.scenario.features, { stageId: state.stage });
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

export function render({ controls = true } = {}) {
  if (!controls) {
    // The cheap path: nothing that could contain the caret is touched.
    paint(true);
    return;
  }
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
  const available = vectorsFor(state.stage, state.bench);
  dom.vectors.appendChild(vectorPicker(
    available,
    state.vectors,
    (id, on) => update((draft) => { draft.vectors[id] = on; }, { sim: 'none' }),
    (patch) => update((draft) => { Object.assign(draft.vectors, patch); }, { sim: 'none' }),
  ));
  dom.vectors.appendChild(el('div', { class: 'vectors__foot' }, [
    button('Just what matters here', () => update((draft) => {
      Object.assign(draft.vectors, suggestionFor(state.stage, available));
    }, { sim: 'none' }), { small: true, title: 'Show only the arrows this step is about' }),
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
  const armed = state.ui.tool === 'wall';
  const driving = sim.scenario?.features?.has('control') && state.bench.control?.mode !== 'none';
  dom.stage.classList.toggle('is-drawing', armed);
  dom.stage.classList.toggle('is-driving', !armed && !!driving);
  dom.stage.appendChild(renderScene(ctx.world, {
    selectedId: state.selectedId,
    vectors: state.vectors,
    view: state.view,
    focusId: 'main',
    pointer: input.pointer,
    drawing: input.drawing,
    control: driving ? state.bench.control : null,
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
      for (const group of channelsFor(state.stage, state.bench)) {
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

/** Renumber the extra objects so their ids always match their position. */
const renumber = (list) => list.map((o, i) => ({ ...o, id: `o${i + 2}` }));

function context() {
  return {
    state,
    params: state.bench,
    space: !!sim.scenario?.space,
    pointer: input.pointer,
    keys: input.keys,
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
    setView: (key, value) => update((draft) => { draft.view[key] = value; }, { sim: 'none' }),

    selectBody: (id) => update((draft) => { draft.selectedId = id; }, { sim: 'none' }),

    /* ------------------------------------------------------- objects -- */
    addObject: () => update((draft) => {
      if (draft.bench.objects.length >= MAX_OBJECTS - 1) return;
      const last = draft.bench.objects[draft.bench.objects.length - 1];
      draft.bench.objects = renumber([...draft.bench.objects, {
        id: 'new',
        mass: 1,
        size: 0.4,
        shapeId: 'sphere',
        // Placed beside the last one rather than on top of it, because two
        // objects starting inside each other resolve by flinging apart.
        x: last ? last.x + 1.5 : 3,
        y: 0,
        vx: 0,
        vy: 0,
      }]);
      draft.selectedId = draft.bench.objects[draft.bench.objects.length - 1].id;
    }),
    removeObject: (id) => update((draft) => {
      draft.bench.objects = renumber(draft.bench.objects.filter((o) => o.id !== id));
      if (!draft.bench.objects.some((o) => o.id === draft.selectedId)) draft.selectedId = 'main';
    }),
    clearObjects: () => update((draft) => {
      draft.bench.objects = [];
      draft.selectedId = 'main';
    }),
    setObject: (id, patch) => update((draft) => {
      draft.bench.objects = draft.bench.objects.map((o) => (o.id === id ? { ...o, ...patch } : o));
    }),

    /* --------------------------------------------------------- walls -- */
    setTool: (tool) => update((draft) => {
      draft.ui.tool = tool;
      input.drawing = null;
    }, { sim: 'none' }),
    removeWall: (index) => update((draft) => {
      draft.bench.walls = draft.bench.walls.filter((_, i) => i !== index);
    }),
    clearWalls: () => update((draft) => { draft.bench.walls = []; }),
    addBox: () => update((draft) => {
      // Sized to what is actually on the bench, so the box contains the
      // experiment rather than an arbitrary rectangle near it.
      const xs = sim.world.bodies.filter((b) => b.kind !== 'planet').map((b) => b.pos.x);
      const ys = sim.world.bodies.filter((b) => b.kind !== 'planet').map((b) => b.pos.y);
      const minX = Math.min(-2, ...xs) - 1;
      const maxX = Math.max(2, ...xs) + 1;
      const minY = sim.world.ground ? 0 : Math.min(-2, ...ys) - 1;
      const maxY = Math.max(2, ...ys) + 2;
      draft.bench.walls = [...draft.bench.walls, ...boxWalls({ minX, maxX, minY, maxY })]
        .slice(0, 40);
    }),

    /* ------------------------------------------------------- cannons -- */
    addCannon: () => update((draft) => {
      if (draft.bench.cannons.length >= 6) return;
      draft.bench.cannons = [...draft.bench.cannons, {
        id: `cannon${draft.bench.cannons.length + 1}`,
        x: -3, y: 1, angleDeg: 35, speed: 9, mass: 0.5, size: 0.2,
        shapeId: 'sphere', everySeconds: 1,
      }];
    }),
    removeCannon: (index) => update((draft) => {
      draft.bench.cannons = draft.bench.cannons
        .filter((_, i) => i !== index)
        .map((c, i) => ({ ...c, id: `cannon${i + 1}` }));
    }),
    clearCannons: () => update((draft) => { draft.bench.cannons = []; }),
    setCannon: (index, patch) => update((draft) => {
      draft.bench.cannons = draft.bench.cannons.map((c, i) => (i === index ? { ...c, ...patch } : c));
    }),

    /* ------------------------------------------------------- driving -- */
    setControl: (patch) => update((draft) => {
      draft.bench.control = { ...draft.bench.control, ...patch };
    }),

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

/**
 * Whatever the pointer or the keyboard is currently asking of the driven body.
 *
 * Written onto the body as a force rather than applied to its velocity, so it
 * joins the same vector sum as weight and friction, gets its own arrow, and has
 * its work booked on the same ledger. Steering an object here is a physics
 * experiment; it is not a puppet on a string.
 */
function applyControl(world) {
  const wanted = sim.scenario?.features?.has('control') ? state.bench.control : null;
  const off = !wanted || wanted.mode === 'none';
  const target = off ? null : world.bodies.find((b) => b.id === wanted.targetId && !b.fixed);

  const force = target
    ? controlForce({
      mode: wanted.mode,
      body: target,
      pointer: input.pointer,
      keys: input.keys,
      strength: wanted.strength,
    })
    : ZERO;

  // Every other body has its control force cleared, or switching which object
  // you are driving would leave the old one under permanent thrust.
  const stale = world.bodies.some((b) => {
    const mine = b.id === target?.id;
    const has = b.controlForce && (b.controlForce.x !== 0 || b.controlForce.y !== 0);
    return mine ? (b.controlForce?.x !== force.x || b.controlForce?.y !== force.y) : has;
  });
  if (!stale) return world;

  return {
    ...world,
    bodies: world.bodies.map((b) => (b.id === target?.id ? { ...b, controlForce: force } : { ...b, controlForce: ZERO })),
  };
}

function stepSimulation(seconds) {
  // The push is re-applied before every step, because it stops after its
  // duration — and what happens after it stops is the whole point of step two.
  // It also re-reads the parameters, which is what lets the angle be turned
  // while the object is moving and the path bend from where it is.
  sim.world = applyPush(sim.world, state.bench, sim.scenario.features);
  sim.world = applyControl(sim.world);
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

/* --------------------------------------------------------------- input -- */

/**
 * Where the pointer is, in metres.
 *
 * `getScreenCTM` is used rather than the bounding rectangle because the drawing
 * is letterboxed inside whatever space the panel gives it, and the offset that
 * introduces is invisible until a wall lands somewhere other than where it was
 * drawn. The matrix knows; arithmetic on the rectangle only nearly does.
 */
function pointerToWorld(event) {
  const svg = dom.stage.querySelector('svg');
  if (!svg || !svg.getScreenCTM) return null;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const inView = point.matrixTransform(ctm.inverse());
  const cam = sceneCamera(shownWorld());
  const world = toWorld(cam, { x: inView.x, y: inView.y });
  return Number.isFinite(world.x) && Number.isFinite(world.y) ? world : null;
}

function wireInput() {
  dom.stage.addEventListener('pointermove', (event) => {
    input.pointer = pointerToWorld(event);
    if (input.drawing && input.pointer) {
      input.drawing = { ...input.drawing, to: input.pointer };
      paint(true);
    }
  });

  dom.stage.addEventListener('pointerleave', () => {
    // A pointer that has left the drawing is not somewhere the object should
    // still be being towed towards.
    input.pointer = null;
    if (!input.drawing) paint(true);
  });

  dom.stage.addEventListener('pointerdown', (event) => {
    if (state.ui.tool !== 'wall') return;
    const at = pointerToWorld(event);
    if (!at) return;
    event.preventDefault();
    dom.stage.setPointerCapture?.(event.pointerId);
    input.drawing = { from: at, to: at };
    paint(true);
  });

  const finishWall = () => {
    const pending = input.drawing;
    input.drawing = null;
    if (!pending) return;
    const length = Math.hypot(pending.to.x - pending.from.x, pending.to.y - pending.from.y);
    // A click that never moved is a click, not a wall.
    if (length < 0.05) {
      paint(true);
      return;
    }
    update((draft) => {
      draft.bench.walls = [...draft.bench.walls, {
        x1: pending.from.x, y1: pending.from.y, x2: pending.to.x, y2: pending.to.y,
        restitution: 0.3, mu: 0.6,
      }].slice(0, 40);
    });
  };

  dom.stage.addEventListener('pointerup', finishWall);
  dom.stage.addEventListener('pointercancel', () => { input.drawing = null; paint(true); });

  /*
   * The keyboard, and the one rule that keeps it usable: it is ignored while a
   * control has focus. Otherwise typing a mass into a number field drives the
   * car, and pressing the left arrow to move the caret sends it into a wall.
   */
  const typing = () => {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable;
  };

  const driving = () => sim.scenario?.features?.has('control') && state.bench.control?.mode === 'keyboard';

  window.addEventListener('keydown', (event) => {
    if (!driving() || typing() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!(event.key in KEYS_WATCHED)) return;
    input.keys.add(event.key);
    // Arrow keys scroll the page, which is exactly the wrong thing while
    // steering. Only swallowed while a mode that uses them is actually on.
    event.preventDefault();
  });

  window.addEventListener('keyup', (event) => { input.keys.delete(event.key); });
  // A key held down when the window loses focus never sends its keyup, and the
  // object drives off the bench while nobody is looking at it.
  window.addEventListener('blur', () => input.keys.clear());
}

const KEYS_WATCHED = {
  ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
  w: 1, a: 1, s: 1, d: 1, W: 1, A: 1, S: 1, D: 1,
};

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

  wireInput();
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
  // The verification pass drives these directly rather than synthesising
  // pointer events, which tests the model rather than the event plumbing.
  input,
  setPointer: (x, y) => { input.pointer = x === null ? null : { x, y }; },
  press: (key) => input.keys.add(key),
  release: (key) => input.keys.delete(key),
  camera: () => sceneCamera(shownWorld()),
};
