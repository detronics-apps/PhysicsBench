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
import { configureSections, button, drag, banner } from './ui/widgets.js';
import { copyLink, saveProject, openProject, printSheet, downloadSvg, downloadPng, downloadCsv } from './ui/export.js';

import {
  STAGES, stageById, stageIndex, featuresAt, build, applyPush, applyLive, structuralKey,
  channelsFor, vectorsFor, inputSummary, MAX_OBJECTS,
} from './stages.js';
import { controlForce } from './control.js';
import { describe as describeObject } from './shapes.js';
import { surfaceGravity } from './gravitation.js';
import { fmtFixed } from './format.js';
import { boxWalls } from './segments.js';
import { toWorld } from './camera.js';
import { vec, ZERO } from './vec.js';
import { angleDelta } from './orient.js';
import { advance, inspect, totals, createWorld, snapshot as snapWorld } from './world.js';
import { createRecorder, record, frameAt, endTime } from './recorder.js';
import { renderScene, sceneLegend, sceneCamera, autoView } from './ui/scene-svg.js';
import { renderGraph } from './ui/graph-svg.js';
import { renderInspector, renderTotals, renderBodyPicker } from './ui/inspector.js';
import { renderTransport, transportNote } from './ui/transport.js';
import { disclosurePanel } from './ui/explain.js';
import { vectorPicker, suggestionFor } from './ui/vectors.js';
import * as bench from './ui/bench.js';

/** Bumped on every release. Read it before debugging anything: a stale cache
 *  serving yesterday's build has cost more time here than any actual bug. */
export const APP_VERSION = '1.1.0';

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
const input = {
  pointer: null,
  keys: new Set(),
  drawing: null,
  // A pan in progress: where in the world the drag started.
  panning: null,
  // Whether the pointer button is being held down over the drawing. The
  // pointer control aims while you hover and pushes only while you hold.
  pressed: false,
  // Whether the drawing has been selected to receive the arrow keys. Until it
  // has, they belong to the page and scroll it, which is what they should do.
  engaged: false,
};

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
  /*
   * A disc, not a button with a word in it.
   *
   * It is the one control in the header that is not about the work — three
   * states, cycled, and the glyph says which one you are in. Its meaning lives
   * in the title and the accessible name, where it costs no width at all and is
   * still there for anyone who needs it.
   */
  const themeButton = el('button', {
    class: 'btn btn--icon', type: 'button', id: 'theme-toggle',
    title: `${THEME_LABEL[state.theme]}. Click to change — system, light or dark. `
      + 'Set it explicitly before screen-recording.',
    'aria-label': THEME_LABEL[state.theme],
    on: {
      click: () => update((draft) => {
        draft.theme = THEME_ORDER[(THEME_ORDER.indexOf(draft.theme) + 1) % THEME_ORDER.length];
      }, { sim: 'none' }),
    },
  }, el('span', { class: 'btn__glyph', 'aria-hidden': 'true', text: THEME_GLYPH[state.theme] }));
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

/**
 * Which steps have been opened before, so the sidebar is only rearranged once.
 *
 * Session-scoped on purpose. Coming back to a step should show it the way you
 * left it, not the way it was introduced to you.
 */
const visited = new Set();

/** The keys of the panels currently in the sidebar. */
const sectionKeys = () =>
  new Set([...document.querySelectorAll('#controls [data-section]')].map((n) => n.dataset.section));

/**
 * Open what this step adds, and close what it inherited.
 *
 * By the last step the sidebar is eleven panels long, and every one of them was
 * introduced by an earlier step and left open. Arriving somewhere new and
 * having to hunt down the one panel that is new is the opposite of what the
 * stepper is for — so the new ones are opened and the rest are folded away,
 * once, on the first visit. Everything is still there, and anything reopened
 * stays open.
 */
function focusNewSections(previous) {
  for (const node of document.querySelectorAll('#controls [data-section]')) {
    const key = node.dataset.section;
    // The drawing options are housekeeping rather than part of any step, and
    // they were closed to begin with.
    if (key === 'view') continue;
    const isNew = !previous.has(key);
    node.open = isNew;
    state.ui.sections[`${state.stage}:${key}`] = isNew;
  }
  saveSoon();
}

function goToStage(id) {
  const previous = sectionKeys();
  const firstVisit = !visited.has(id);
  visited.add(id);

  update((draft) => {
    draft.stage = id;
    draft.transport.scrubT = null;
    draft.transport.playing = false;
  }, { sim: 'full' });

  if (firstVisit) focusNewSections(previous);
}

/**
 * The viewport, in the order the work actually happens in.
 *
 * The split that matters is that the sidebar holds *only* things you change and
 * the viewport holds everything the experiment tells you back. Numbers about
 * the object — how fast it is going, what is pushing it, where it is — used to
 * sit at the top of the sidebar, which put a readout in the column you go to
 * for a control and a control below the readout you were reading. Here they
 * come after the graphs, which is where you are already looking once something
 * has happened.
 *
 * The drawing is focusable, because at the last step the arrow keys have to be
 * able to belong either to the page or to the object, and the only honest way
 * to decide which is for you to say.
 */
function buildViewport() {
  dom.stages = el('div', { class: 'stepper', role: 'tablist', 'aria-label': 'Steps' });
  dom.ask = el('div', { id: 'ask' });
  dom.vectors = el('div', { id: 'vectors' });
  dom.stage = el('div', {
    class: 'viewport__stage', id: 'stage',
    tabindex: '-1',
    'aria-label': 'The bench. Click to take the controls.',
  });
  dom.legend = el('div', { id: 'legend' });
  dom.transportHost = el('div', { id: 'transport' });
  dom.readout = el('div', { class: 'readout', id: 'readout' });
  dom.graphs = el('div', { id: 'graphs' });
  dom.banners = el('div', { class: 'banners', id: 'banners' });
  dom.explain = el('div', { class: 'explain-host', id: 'explain' });

  /*
   * The inputs, written out as values rather than as controls.
   *
   * Hidden on screen — the sidebar is already there and is better at it — and
   * printed, because a sheet showing a result without the settings that
   * produced it is a sheet nobody can check or repeat.
   */
  dom.summary = el('section', { class: 'print-only print-summary', id: 'print-summary' });
  dom.inspector = el('div', { class: 'measurements__detail', id: 'inspector-body' });
  dom.measurements = el('section', { class: 'measurements', id: 'measurements' }, [
    el('div', { class: 'measurements__head' }, [
      el('h2', { class: 'measurements__title', text: 'What it is doing' }),
      el('span', {
        class: 'measurements__note',
        text: 'Everything measured, in one place: how it is moving, the forces on '
          + 'it, and where it is. Nothing here is a control.',
      }),
    ]),
    dom.readout,
    dom.inspector,
  ]);

  /*
   * Two sections, not one, so the sidebar can sit between them.
   *
   * On a wide screen `.workspace` is the single scrolling column it always was
   * and the split is invisible. On a phone, where everything stacks, the
   * workspace becomes `display: contents` and its two halves become siblings of
   * the sidebar — which lets the inputs sit directly under the drawing and the
   * transport, instead of below every graph and panel on the page. Reaching a
   * control should not mean scrolling past all the output first.
   */
  dom.viewport = el('section', { class: 'viewport' }, [
    dom.stages,
    dom.ask,
    dom.vectors,
    dom.stage,
    dom.legend,
    dom.transportHost,
    // Live commentary belongs beside the live picture, not three sections down.
    dom.banners,
  ]);

  dom.viewportMore = el('section', { class: 'viewport viewport--more' }, [
    dom.graphs,
    dom.measurements,
    dom.summary,
    dom.explain,
  ]);

  dom.workspace = el('div', { class: 'workspace' }, [dom.viewport, dom.viewportMore]);
  return dom.workspace;
}

function buildFooter() {
  return el('footer', { class: 'app-footer' }, [
    el('span', {
      text: 'Everything runs in your browser. Nothing is uploaded, and the share '
        + 'link keeps its data in the URL fragment, which is never sent to a server.',
    }),
    el('nav', {}, [
      button('Share link', () => copyLink(), { small: true, title: 'Copy a link that reopens this exact experiment' }),
      button('Print / PDF', () => printWhatIsWanted(), {
        small: true,
        title: 'Print, or save as PDF — choose what goes on it under "The drawing"',
      }),
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

/* ------------------------------------------------- growing into a planet -- */

/**
 * The third step ends with a question the fourth step answers, and the answer
 * is easier to believe if you watch it happen.
 *
 * Two masses a few metres apart attract with about four billionths of a newton.
 * Jumping straight from that to "and this is weight" asks the reader to take
 * on trust that the two are the same force. So instead the second mass slides
 * under the first and inflates: same equation, same code path, a mass climbing
 * twenty-four orders of magnitude while the object above it does not move and
 * does not change size on screen. The pull it feels goes from a billionth of a
 * newton to its weight, and nothing was added.
 *
 * Both interpolations are geometric, not linear. From half a metre to six
 * thousand kilometres is seven orders of magnitude; stepped linearly it would
 * appear not to move for nine tenths of the run and then fill the screen in the
 * last frame.
 */
const GROWTH = { seconds: 3.4, slide: 0.28 };
let growth = null;

const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2);
const geometric = (from, to, k) => from * ((to / from) ** k);

/** The scene part-way through the growth, as an ordinary world. */
function growthWorld(u) {
  const p = state.bench;
  const object = describeObject({ shapeId: p.shapeId, size: p.size, mass: p.mass });
  const other = describeObject({ shapeId: 'sphere', size: p.otherSize, mass: p.otherMass });

  /*
   * Laid out where step three already has things: the object at y = 0, exactly
   * where it was a moment ago, and it does not move again for the whole run.
   *
   * Working in step four's coordinates instead meant the object jumped up to
   * its drop height on the first frame, which is a lurch in the one thing the
   * whole demonstration is claiming stays put. What matters at the end is the
   * *gap* between the object and the surface, and that is the same either way —
   * a constant offset is invisible, because the camera frames on the object.
   */
  const mainX = p.x0 ?? 0;
  const r0 = Math.max(0.05, other.size / 2);
  // Where the surface has to end up: the drop height below the object.
  const surfaceY = -(object.support + Math.max(0, p.dropHeight));

  const sliding = u < GROWTH.slide;
  const k = easeInOut(sliding ? u / GROWTH.slide : (u - GROWTH.slide) / (1 - GROWTH.slide));

  const radius = sliding ? r0 : geometric(r0, p.planetRadius, k);
  const mass = sliding ? p.otherMass : geometric(p.otherMass, p.planetMass, k);

  /*
   * The second mass swings round the first rather than sliding at it.
   *
   * A straight line from wherever it happened to be sitting reads as the mass
   * being shoved into position — and when it starts level with the object, the
   * first thing it does is set off sideways, which looks like the wrong
   * direction because it is not obviously going anywhere yet. An arc is
   * unambiguous from the first frame: it is going *round*, and it is going
   * round to underneath.
   *
   * Both the angle and the distance are interpolated, so it spirals in to the
   * separation it needs rather than swinging out to a radius it then has to
   * lose.
   */
  const startRadius = Math.hypot(p.otherX - mainX, 0) || 1;
  // Straight down from the object, far enough that the sphere's top is exactly
  // at the surface it is about to become.
  const endRadius = Math.abs(surfaceY) + r0;
  const startAngle = Math.atan2(0, (p.otherX ?? 0) - mainX);
  const endAngle = -Math.PI / 2;

  const swept = startAngle + angleDelta(startAngle, endAngle) * k;
  const reach = startRadius + (endRadius - startRadius) * k;
  const centre = sliding
    ? vec(mainX + reach * Math.cos(swept), reach * Math.sin(swept))
    : vec(mainX, surfaceY - radius);

  return {
    world: createWorld({
      g: 0,
      field: vec(0, 0),
      // Left on, so the arrow the reader is watching is the same one the last
      // step drew — computed from G·m₁·m₂/r², not swapped for a downward g.
      mutualGravity: true,
      ground: null,
      bounds: null,
      bodyCollisions: false,
      trailLimit: 0,
      bodies: [
        {
          id: 'main',
          kind: object.shape.circle ? 'ball' : 'box',
          shapeId: object.shape.id,
          label: `${fmtFixed(object.mass, object.mass < 10 ? 2 : 0)} kg`,
          mass: object.mass,
          radius: object.support,
          width: object.size,
          height: object.height,
          diameter: object.size,
          volume: object.volume,
          pos: vec(mainX, 0),
          vel: vec(0, 0),
          colour: 0,
        },
        {
          id: 'other',
          // An ordinary body while it is still an ordinary body. It becomes a
          // planet the moment it starts growing, which is what pins the object
          // above it to a constant size on screen — the whole point of watching.
          kind: sliding ? 'ball' : 'planet',
          shapeId: 'sphere',
          label: sliding ? `${fmtFixed(p.otherMass, 0)} kg` : `${mass.toExponential(2)} kg`,
          mass,
          radius,
          diameter: radius * 2,
          volume: (4 / 3) * Math.PI * radius ** 3,
          // Once it starts growing the centre drops in step with the radius, so
          // the top of the sphere stays exactly where it is: the surface never
          // moves, only the far side of the world.
          pos: centre,
          fixed: true,
          colour: 1,
        },
      ],
    }),
    sliding,
    radius,
    mass,
  };
}

/** What to say about it while it happens. */
function growthCaption(frame) {
  if (frame.sliding) {
    return 'The second mass is swinging round to underneath the first. Nothing '
      + 'about the force has changed yet — this is still the same faint '
      + 'attraction, and it is about to be the same faint attraction with a '
      + 'planet on the other end.';
  }
  const g = surfaceGravity(frame.mass, frame.radius);
  // Metres while it is metres. "0.000500 km" is a number that has forgotten
  // what it is describing.
  const across = frame.radius >= 1000
    ? `${(frame.radius / 1000).toPrecision(3)} km`
    : `${frame.radius.toPrecision(3)} m`;
  return `Growing: ${frame.mass.toExponential(2)} kg at a radius of ${across} gives `
    + `${g < 0.01 ? g.toExponential(2) : fmtFixed(g, 4)} m/s² at its surface. The object `
    + 'above it has not moved and has not changed size. Only the mass under it is '
    + 'changing, and the same G·m₁·m₂/r² is doing all of it.';
}

/**
 * Run the growth, then hand over to the fourth step.
 *
 * It drives its own animation frames rather than the simulation clock, because
 * nothing here is being simulated: this is one continuous illustration of a
 * parameter changing, and stepping physics through a body whose mass climbs by
 * 10²⁴ in three seconds would produce nonsense worth no one's time.
 */
function growPlanet() {
  if (growth) return;
  // Nobody is watching a hidden tab, and an animation is only worth the time it
  // takes if someone is there for it.
  if (typeof document !== 'undefined' && document.hidden) {
    goToStage('planet');
    return;
  }

  /*
   * Bring the drawing into view before anything moves.
   *
   * On a phone the button that starts this sits in the sidebar, well below the
   * drawing — so the whole three seconds of it played out off-screen and the
   * reader arrived at step four having seen none of the thing the animation
   * exists to show. Scroll first, let the scroll finish, then start.
   */
  const settle = scrollToDrawing();
  state.transport.playing = false;
  cancelAnimationFrame(clock.raf);
  growth = { started: performance.now() + settle, frame: growthWorld(0) };
  render();

  const finish = () => {
    if (!growth) return;
    stopGrowth();
    goToStage('planet');
  };

  const tick = (now) => {
    if (!growth) return;
    // `started` may be in the future while the page is still scrolling; hold at
    // the first frame until it is not.
    const u = Math.min(1, Math.max(0, (now - growth.started) / (GROWTH.seconds * 1000)));
    growth.frame = growthWorld(u);
    paint(true);
    if (u < 1) {
      growth.raf = requestAnimationFrame(tick);
      return;
    }
    finish();
  };
  growth.raf = requestAnimationFrame(tick);

  /*
   * A timer that finishes the job whatever the frames do.
   *
   * `requestAnimationFrame` stops entirely in a backgrounded tab. Progress is
   * measured from the wall clock rather than counted in frames, so a stall
   * resumes correctly — but without this the growth would sit half-finished for
   * as long as the tab stayed hidden, with the sidebar still showing the step
   * before. Time passing is what ends it; the frames only decide how much of it
   * anyone sees.
   */
  growth.fallback = setTimeout(finish, settle + GROWTH.seconds * 1000 + 300);
}

/**
 * Put the drawing on screen, and say how long that will take.
 *
 * Returns the delay the caller should hold off for. Zero when it is already in
 * view or when the reader has asked for reduced motion, so nothing waits for a
 * scroll that is not happening.
 */
function scrollToDrawing() {
  if (!dom.stage || typeof dom.stage.getBoundingClientRect !== 'function') return 0;
  const box = dom.stage.getBoundingClientRect();
  const fullyVisible = box.top >= 0 && box.bottom <= (window.innerHeight || 0);
  if (fullyVisible) return 0;

  const gentle = !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  dom.stage.scrollIntoView({ behavior: gentle ? 'smooth' : 'auto', block: 'center' });
  return gentle ? 450 : 0;
}

/** Abandon the growth — any other control the reader touches means they are done watching. */
function stopGrowth() {
  if (!growth) return;
  cancelAnimationFrame(growth.raf);
  clearTimeout(growth.fallback);
  growth = null;
}

const shownTime = () => (state.transport.scrubT !== null ? state.transport.scrubT : sim.world.t);

/** The bodies to draw: live, or the recorded frame being scrubbed to. */
function shownWorld() {
  if (growth) return growth.frame.world;
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
  // Touching any control means the reader has stopped watching the growth.
  if (how === 'full') stopGrowth();
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
    viewport: dom.workspace?.scrollTop ?? 0,
    key: key || null,
    start: key && active.selectionStart != null ? active.selectionStart : null,
    end: key && active.selectionEnd != null ? active.selectionEnd : null,
  };
}

function restoreFocus(snap) {
  if (dom.sidebar) dom.sidebar.scrollTop = snap.sidebar;
  if (dom.workspace) dom.workspace.scrollTop = snap.viewport;
  if (!snap.key) return;
  const target = document.querySelector(`[data-field="${CSS.escape(snap.key)}"]`);
  if (!target) return;
  target.focus({ preventScroll: true });
  if (snap.start != null && target.setSelectionRange) {
    try { target.setSelectionRange(snap.start, snap.end); } catch { /* not a text field */ }
  }
  if (dom.sidebar) dom.sidebar.scrollTop = snap.sidebar;
  if (dom.workspace) dom.workspace.scrollTop = snap.viewport;
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
    const glyph = dom.themeButton.querySelector('.btn__glyph');
    if (glyph) glyph.textContent = THEME_GLYPH[state.theme];
    dom.themeButton.setAttribute('aria-label', THEME_LABEL[state.theme]);
    dom.themeButton.title = `${THEME_LABEL[state.theme]}. Click to change — system, light or dark. `
      + 'Set it explicitly before screen-recording.';
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

  clear(dom.summary);
  dom.summary.appendChild(el('h2', {
    class: 'measurements__title',
    // Nothing above the drawing prints, so this is where the sheet says which
    // experiment it is a sheet of.
    text: `What was set — step ${stageIndex(state.stage) + 1}, ${stageById(state.stage).label}`,
  }));
  for (const group of inputSummary(state.stage, state.bench)) {
    dom.summary.appendChild(el('div', { class: 'print-summary__group' }, [
      el('h3', { class: 'print-summary__title', text: group.title }),
      el('dl', { class: 'dims' }, group.rows.flatMap(([label, value]) => [
        el('dt', { text: label }),
        el('dd', { text: value }),
      ])),
    ]));
  }

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
  dom.stage.classList.toggle('is-panning', state.ui.tool === 'pan');
  const canControl = !!sim.scenario?.features?.has('control');
  const driving = canControl && state.bench.control?.mode !== 'none';
  const withKeys = canControl && state.bench.control?.mode === 'keyboard';
  dom.stage.classList.toggle('is-drawing', armed);
  dom.stage.classList.toggle('is-driving', !armed && !!driving);
  // Focusable only where the keys have something to do. A tab stop that leads
  // nowhere is worse than no tab stop.
  dom.stage.tabIndex = withKeys ? 0 : -1;
  input.engaged = withKeys && document.activeElement === dom.stage;
  dom.stage.classList.toggle('is-engaged', input.engaged);
  dom.stage.appendChild(renderScene(ctx.world, {
    selectedId: state.selectedId,
    vectors: state.vectors,
    view: state.view,
    focusId: 'main',
    pointer: input.pointer,
    drawing: input.drawing,
    control: driving ? state.bench.control : null,
    pressed: input.pressed,
  }));
  // A drawing sized to its contents must never be magnified to fill the panel.
  // Called after the stage has been replaced, on every render — pitfalls.md #3.
  capDiagramScale(dom.stage);

  /*
   * Everything that is words and numbers is redrawn far less often than the
   * drawing, and less often again on a small screen.
   *
   * A frame used to rebuild the scene, the legend, the readouts and the banners
   * — around four hundred elements — and the graphs and inspector on top of
   * that every third frame. Measured at over thirty milliseconds a frame on a
   * desktop, which is twice the budget; on a phone it saturates the main thread
   * and input goes with it. That is why Pause appeared not to work: the tap was
   * queued behind a paint that never finished in time.
   *
   * Nobody reads a number sixty times a second. The drawing still moves every
   * frame, because that is the thing being watched.
   */
  const cadence = window.innerWidth <= 640 ? 6 : 3;
  const refreshNumbers = force || clock.frame % cadence === 0;

  if (refreshNumbers) {
    clear(dom.legend);
    dom.legend.appendChild(sceneLegend(ctx.world, state.vectors));

    clear(dom.readout);
    for (const node of bench.readouts(ctx)) dom.readout.appendChild(node);

    clear(dom.banners);
    if (growth) {
      // One caption, and none of the ordinary commentary: every banner the bench
      // would otherwise show is about a simulation that is not running.
      dom.banners.appendChild(banner('info', growthCaption(growth.frame)));
    } else {
      for (const node of bench.banners(ctx)) dom.banners.appendChild(node);
    }
  }

  if (refreshNumbers) {
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

/**
 * Switch to a held view without moving it.
 *
 * Zooming from an automatic view has to start somewhere, and the only sensible
 * somewhere is exactly what is on screen — otherwise the first click on the
 * zoom button jumps somewhere else before it zooms.
 */
function takeManualView(draft) {
  if (draft.view.camera.mode === 'manual') return;
  const now = autoView(shownWorld(), 'main');
  draft.view.camera = { mode: 'manual', ...now };
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
    pressed: input.pressed,
    engaged: input.engaged,
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

    /* ---------------------------------------------------------- the view -- */
    zoomBy: (factor) => update((draft) => {
      takeManualView(draft);
      draft.view.camera.span = Math.min(1e9, Math.max(1e-4, draft.view.camera.span / factor));
    }, { sim: 'none' }),
    panBy: (dx, dy) => update((draft) => {
      takeManualView(draft);
      draft.view.camera.cx += dx * draft.view.camera.span;
      draft.view.camera.cy += dy * draft.view.camera.span;
    }, { sim: 'none' }),
    // Home is not "zoom to fit once" — it hands the framing back to the scene,
    // so it keeps following whatever happens next.
    goHome: () => update((draft) => { draft.view.camera.mode = 'auto'; }, { sim: 'none' }),
    setGrid: (value) => update((draft) => { draft.view.grid = value; }, { sim: 'none' }),
    setPrint: (part, on) => update((draft) => { draft.view.print[part] = on; }, { sim: 'none' }),
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

    growPlanet,
    growing: !!growth,

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

  /*
   * Nudged in place, never rebuilt.
   *
   * Rebuilding the bar from inside the animation loop replaces the very buttons
   * a reader may be part-way through pressing. The timeline is now always
   * present, so there is nothing left that needs the bar recreating mid-run.
   */
  const slider = dom.transportHost.querySelector('.transport__scrub');
  if (slider && document.activeElement !== slider) {
    const end = endTime(sim.recorder);
    if (end > 0.05) {
      slider.disabled = false;
      slider.max = String(end);
      if (state.transport.scrubT === null) slider.value = String(end);
    }
  }
}

/**
 * Print exactly the parts that are switched on.
 *
 * "Save as PDF" is a printer as far as a browser is concerned, so this is the
 * whole of PDF export: mark the body with what to leave out, let the print
 * stylesheet do the rest, and put it back afterwards. A second renderer that
 * drew its own PDF would be a second thing to keep in step with this one, and
 * it would start disagreeing about something within a week.
 */
function printWhatIsWanted() {
  const wanted = state.view.print;
  const off = Object.keys(wanted).filter((k) => !wanted[k]).map((k) => `print-no-${k}`);
  document.body.classList.add(...off, 'is-printing');
  const restore = () => document.body.classList.remove(...off, 'is-printing');
  window.addEventListener('afterprint', restore, { once: true });
  // Belt and braces: some browsers never fire afterprint from a cancelled
  // dialog, and a page stuck with sections hidden would look broken.
  setTimeout(restore, 60000);
  printSheet();
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
      pressed: input.pressed,
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
  const cam = sceneCamera(shownWorld(), 'main', state.view);
  const world = toWorld(cam, { x: inView.x, y: inView.y });
  return Number.isFinite(world.x) && Number.isFinite(world.y) ? world : null;
}

function wireInput() {
  dom.stage.addEventListener('pointermove', (event) => {
    input.pointer = pointerToWorld(event);

    /*
     * Panning moves the view so that the world point under the pointer stays
     * under it — which is the only version of dragging a picture that feels
     * like dragging a picture. Measured against the grab point rather than the
     * previous frame, so it cannot drift.
     */
    if (input.panning && input.pointer) {
      const dx = input.pointer.x - input.panning.from.x;
      const dy = input.pointer.y - input.panning.from.y;
      state.view.camera.cx -= dx;
      state.view.camera.cy -= dy;
      saveSoon();
      paint(true);
      return;
    }

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
    if (state.ui.tool === 'pan') {
      const at = pointerToWorld(event);
      if (!at) return;
      event.preventDefault();
      dom.stage.setPointerCapture?.(event.pointerId);
      update((draft) => { takeManualView(draft); }, { sim: 'none' });
      input.panning = { from: at };
      return;
    }
    if (state.ui.tool === 'wall') {
      const at = pointerToWorld(event);
      if (!at) return;
      event.preventDefault();
      dom.stage.setPointerCapture?.(event.pointerId);
      input.drawing = { from: at, to: at };
      paint(true);
      return;
    }

    /*
     * Clicking the drawing does two things, and both are the user saying which
     * of two claimants owns an input.
     *
     * It takes the arrow keys away from the page, so they steer instead of
     * scrolling — and it does that only because you asked, since a page that
     * silently swallowed the arrow keys would be worse than one that never
     * offered to. And it starts the pointer thrust, which lasts exactly as long
     * as the button is held.
     */
    if (dom.stage.tabIndex === 0) dom.stage.focus({ preventScroll: true });
    if (sim.scenario?.features?.has('control') && state.bench.control?.mode === 'mouse') {
      input.pointer = pointerToWorld(event) || input.pointer;
      input.pressed = true;
      dom.stage.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
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

  const release = () => {
    if (input.panning) { input.panning = null; render(); return; }
    if (!input.pressed) return;
    input.pressed = false;
    paint(true);
  };
  dom.stage.addEventListener('pointerup', (event) => { release(); finishWall(event); });
  dom.stage.addEventListener('pointercancel', () => { input.drawing = null; release(); paint(true); });
  // A button released outside the drawing must still stop the thruster, or it
  // fires for ever with nothing on screen explaining why.
  window.addEventListener('pointerup', release);
  window.addEventListener('blur', release);

  dom.stage.addEventListener('focus', () => { input.engaged = dom.stage.tabIndex === 0; paint(true); });
  dom.stage.addEventListener('blur', () => { input.engaged = false; input.keys.clear(); paint(true); });

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

  /*
   * The keys are taken from the page only while the drawing is selected.
   *
   * This is the whole reason the drawing is focusable. Arrow keys scroll, and
   * an app that stops them scrolling because it happens to have a driving mode
   * switched on somewhere has taken something from the reader without asking.
   * Selecting the drawing is the asking; Escape gives them back.
   */
  const driving = () => input.engaged
    && sim.scenario?.features?.has('control')
    && state.bench.control?.mode === 'keyboard';

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.engaged) {
      dom.stage.blur();
      return;
    }
    if (!driving() || typing() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!(event.key in KEYS_WATCHED)) return;
    input.keys.add(event.key);
    // Swallowed only here: selected drawing, keyboard mode, a key that steers.
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
    // `undefined` means "the reader has not said" — which is different from
    // "the reader wants it open", and `section` needs to be able to tell.
    get: (id) => state.ui.sections[`${state.stage}:${id}`],
    set: (id, open) => { state.ui.sections[`${state.stage}:${id}`] = open; saveSoon(); },
  });

  // The sidebar is inputs and nothing else. Every measurement lives in the
  // viewport under the graphs, where you are already looking once something has
  // happened — and where reading one cannot mean scrolling past a control you
  // were about to change.
  dom.controls = el('div', { id: 'controls' });

  dom.sidebar = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Controls' }, [
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
  visited.add(state.stage);
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
  /*
   * One animation frame, exactly as the clock drives it: step the physics, then
   * paint *unforced* so the throttling that keeps a phone responsive is the
   * thing under test rather than being bypassed.
   */
  frame: (seconds = 1 / 60) => {
    clock.frame += 1;
    stepSimulation(seconds);
    paint();
    return clock.frame;
  },
  run: (seconds, step = 1 / 120) => {
    for (let t = 0; t < seconds - 1e-12; t += step) stepSimulation(Math.min(step, seconds - t));
    paint(true);
    return sim.world.t;
  },
  reset: () => { rebuild(); render(); },
  // The verification pass drives these directly rather than synthesising
  // pointer events, which tests the model rather than the event plumbing.
  input,
  growPlanet,
  growthFrame: (u) => growthWorld(u),
  showGrowth: (u) => {
    growth = growth || { started: performance.now() };
    growth.frame = growthWorld(u);
    paint(true);
    return growth.frame;
  },
  endGrowth: () => { stopGrowth(); },
  growing: () => !!growth,
  setPointer: (x, y) => { input.pointer = x === null ? null : { x, y }; },
  setPressed: (on) => { input.pressed = !!on; },
  setEngaged: (on) => { input.engaged = !!on; },
  press: (key) => input.keys.add(key),
  release: (key) => input.keys.delete(key),
  camera: () => sceneCamera(shownWorld(), 'main', state.view),
};
