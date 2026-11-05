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
import { el, svg, clear, toast, hideTooltip } from './ui/dom.js';
import { capDiagramScale, dualLabel } from './ui/patterns.js';
import {
  configureSections, button, drag, banner, clearDismissed, dismissBanner, renderNotices,
} from './ui/widgets.js';
import { copyLink, saveProject, openProject, printSheet, downloadSvg, downloadPng, downloadCsv } from './ui/export.js';

import {
  STAGES, stageById, stageIndex, featuresAt, build, applyPush, applyLive, structuralKey,
  channelsFor, vectorsFor, inputSummary, MAX_OBJECTS,
} from './stages.js';
import { controlForce } from './control.js';
import { describe as describeObject, shapeById } from './shapes.js';
import { surfaceGravity, worldById } from './gravitation.js';
import { fluidById } from './drag.js';
import { fmtFixed } from './format.js';
import { boxWalls, MAX_WALLS } from './segments.js';
import { EXAMPLES, exampleState } from './examples.js';
import { galleryPage } from './ui/gallery.js';
import {
  guidePage, welcomeOverlay, panelOverlay, achievementToast, achievementsPage,
} from './ui/guide.js';
import { WHATS_NEW } from './guide.js';
import { LICENCE, IMPRINT } from './legal.js';
import { toWorld, toScreen } from './camera.js';
import {
  LEVELS, levelById, shownAt, INTERACTIVE, defaultLayout,
} from './levels.js';
import {
  ACHIEVEMENTS, newlyEarned, byId as achievementById, groups as achievementGroups,
} from './achievements.js';
import { vec, len, ZERO } from './vec.js';
import { angleDelta } from './orient.js';
import { advance, inspect, totals, createWorld, snapshot as snapWorld } from './world.js';
import { createRecorder, record, frameAt, endTime, trailAt } from './recorder.js';

import {
  renderScene, sceneLegend, sceneCamera, autoView, boxView, VIEW_W,
} from './ui/scene-svg.js';
import { renderGraph } from './ui/graph-svg.js';
import { renderInspector, renderTotals, renderBodyPicker } from './ui/inspector.js';
import { renderTransport, transportNote } from './ui/transport.js';
import {
  renderStageUI, placeSatellites, sheetOpen, setSheet,
} from './ui/stage-ui.js';
import { hitTest, sectionsFor } from './targets.js';
import {
  isDrag, pullVelocity, velocityToPolar, pinchSpan, pinchCentre, pinchFactor, zoomAbout,
} from './gestures.js';
import { disclosurePanel } from './ui/explain.js';
import { vectorPicker, suggestionFor } from './ui/vectors.js';
import * as bench from './ui/bench.js';

/** Bumped on every release. Read it before debugging anything: a stale cache
 *  serving yesterday's build has cost more time here than any actual bug. */
export const APP_VERSION = '1.14.0';

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
  /*
   * A gesture in progress on the drawing, in Interactive.
   *
   * `{ kind, id, from, to, startPx, moved }` — kind is 'throw', 'move' or
   * 'pinch'. Outside `state` with the rest of the live input: none of it is
   * part of the experiment, and putting it in state would write to storage on
   * every pointer move.
   */
  gesture: null,
  // Which body the next drag moves rather than throws, armed by its own
  // button. One flag rather than a mode, because it lasts exactly one drag.
  moveArmed: null,
  // Live touches, for the pinch.
  touches: new Map(),
};

/* ---------------------------------------------------------------- theme -- */

/**
 * The level, on the root element, so CSS can reach it.
 *
 * Most of what a level hides is decided in JS, where the panel that would
 * have been built simply is not. The explanatory line under a control is the
 * exception: there are thirty of them, some built by `field()` and some
 * written out beside it, and gating each one at its call site is thirty
 * chances to miss one. One attribute and one rule covers every present and
 * future hint — and unlike a JS gate it leaves them in the printed sheet,
 * which is where a reader does want the prose.
 */
/**
 * The layout in force: what the reader chose, or what their screen suggests.
 *
 * Resolved here on every read rather than written once at startup, and that is
 * the difference between a default and a guess that hardens into a choice. A
 * measurement taken while the page is still laying out, or mid-rotation, can be
 * wrong; stored, a wrong one would be indistinguishable from a decision and
 * would survive every reload. Left unstored, it corrects itself the moment the
 * screen is measurable, and `state.ui.layout` means exactly one thing: the
 * reader said so.
 */
function layoutNow() {
  if (state.ui.layout) return state.ui.layout;
  return defaultLayout({
    coarse: window.matchMedia?.('(pointer: coarse)')?.matches ?? false,
    minSide: Math.min(window.innerWidth, window.innerHeight),
  });
}

const interactive = () => layoutNow() === 'interactive';

function applyLevel() {
  document.documentElement.dataset.level = state.ui.level;
  /*
   * The layout, on the same element and for the same reason: one attribute and
   * one block of CSS, rather than a JS gate at every region that has to be
   * hidden.
   */
  document.documentElement.dataset.layout = layoutNow();
}

/**
 * Switch layout, and remember that the reader chose.
 *
 * Writing the field is what makes the choice stick: once it holds a value the
 * screen is never consulted again, so a phone that has been taken out of
 * Interactive stays out of it across reloads.
 *
 * `render`, never `rebuild` — the rule the levels follow. A layout decides
 * where the controls are and nothing else; it must not touch a value or put
 * the clock back to zero.
 */
function setLayout(id) {
  if (state.ui.layout === id) return;
  // Written even when it matches what the screen was already suggesting: the
  // point of the write is that it is now a decision rather than a guess.
  state.ui.layout = id;
  saveSoon();
  render();
  /*
   * The stage is a different size now, and the drawing has to be re-cut to it.
   *
   * Measured after the render rather than before: the CSS that resizes the
   * stage hangs off the `data-layout` attribute, which `render` is what sets.
   * The observer would catch this a frame later; doing it here means the switch
   * never shows a letterboxed frame first.
   */
  if (measureStage()) paint(true);
}

function applyTheme() {
  if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
}

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };
/*
 * The three states, as the brand spec has them.
 *
 * A half-filled disc for "follow the machine", then a sun and a moon. The
 * app drew an empty and a filled circle instead, which is the same shape
 * three times and says nothing about which is light and which is dark — the
 * whole reason a glyph is allowed here rather than a line-drawn icon is that
 * it reports the state on its own.
 */
const THEME_GLYPH = { system: '◐', light: '☀', dark: '☾' };

const SITE_URL = 'https://www.detronics.co.za/';
const COFFEE_URL = 'https://buymeacoffee.com/detronics';

/* --------------------------------------------------------------- chrome -- */

/**
 * The cup, drawn rather than typed.
 *
 * `☕` is an emoji: it arrives with its own browns and reds baked in, which
 * belong to no theme this app has. A line drawing in `currentColor` inherits
 * the button's text colour and follows light and dark exactly like the theme
 * glyph beside it.
 */
function coffeeIcon() {
  return svg('svg', {
    width: '18', height: '18', viewBox: '0 0 24 24', 'aria-hidden': 'true',
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    svg('path', { d: 'M6.5 8 H15.5 V13 A4.5 4.5 0 0 1 6.5 13 Z' }),
    svg('path', { d: 'M15.5 9.5 h1.8 a2.6 2.6 0 0 1 0 5.2 h-1.8' }),
    svg('path', { d: 'M4 19.5 Q 11 21.8 18 19.5' }),
    svg('path', { d: 'M9.3 5.2 q -1.4 -1.1 0 -2.2 q 1.4 -1.1 0 -2.2' }),
    svg('path', { d: 'M13.3 5.2 q -1.4 -1.1 0 -2.2 q 1.4 -1.1 0 -2.2' }),
  ]);
}

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
      // The mark is the way home. An anchor rather than a click handler, so
      // middle-click, copy-link and open-in-a-new-tab all behave.
      el('a', {
        class: 'brand__home', href: SITE_URL, target: '_blank', rel: 'noopener noreferrer',
        title: 'Detronics (opens in a new tab)',
      }, el('img', { class: 'brand__logo', src: 'assets/logo.png', alt: 'Detronics' })),
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
      el('a', {
        class: 'btn btn--icon', href: COFFEE_URL, target: '_blank', rel: 'noopener noreferrer',
        'aria-label': 'Buy me a coffee (opens in a new tab)',
        title: 'Buy me a coffee (opens in a new tab)',
      }, coffeeIcon()),
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
  /*
   * A step is only the current tab while the bench is what is showing.
   *
   * The step a reader will come back to is still marked as done and still
   * highlighted on return — but on the shelf or in the guide, two tabs reading
   * as current at once is the bar saying it does not know where you are.
   */
  const onBench = state.page === 'bench';

  STAGES.forEach((stage, i) => {
    const current = onBench && i === here;
    dom.stages.appendChild(el('button', {
      class: `stepper__step${current ? ' is-current' : ''}${i < here ? ' is-done' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': String(current),
      title: stage.ask,
      'data-field': `stage:${stage.id}`,
      on: { click: () => goToStage(stage.id) },
    }, [
      el('span', { class: 'stepper__n', text: String(i + 1) }),
      el('span', { class: 'stepper__label tab-label--long', text: stage.label }),
      el('span', { class: 'stepper__label tab-label--short', text: stage.short }),
    ]));
  });

  /*
   * The shelf, at the end of the row but not numbered.
   *
   * It is where a reader looks for it, and the missing number is what says it
   * is not another step to walk through.
   */
  dom.stages.appendChild(el('button', {
    class: `stepper__step stepper__step--aside${state.page === 'examples' ? ' is-current' : ''}`,
    type: 'button',
    role: 'tab',
    'aria-selected': String(state.page === 'examples'),
    title: 'Scenes already set up, with a note on what to watch',
    'data-field': 'page:examples',
    on: { click: () => showExamples() },
  }, [
    el('span', { class: 'stepper__label tab-label--long', text: 'Examples' }),
    el('span', { class: 'stepper__label tab-label--short', text: 'Examples' }),
  ]));

  /*
   * The guide, fenced off from everything before it.
   *
   * The rule separates a change of *kind*, not a change of topic: the seven
   * steps and the shelf are the subject, and this is about the app. It is last
   * because that is where anyone who has been let down by an interface looks
   * for help.
   *
   * The rule is drawn once, before the first of the two — `--aside` carries
   * it, and the CSS drops it on a second one running. A bar with a rule
   * between every tab has said nothing.
   */
  dom.stages.appendChild(el('button', {
    class: `stepper__step stepper__step--aside${state.page === 'guide' ? ' is-current' : ''}`,
    type: 'button',
    role: 'tab',
    'aria-selected': String(state.page === 'guide'),
    title: 'How to do anything here — search it in your own words',
    'data-field': 'page:guide',
    on: { click: () => showGuide() },
  }, [
    el('span', { class: 'stepper__label tab-label--long', text: 'How to use' }),
    el('span', { class: 'stepper__label tab-label--short', text: 'Guide' }),
  ]));

  /*
   * And the things there are to find, beside it.
   *
   * Its own tab rather than a section of the guide: somebody who has just
   * found one arrives from the card that told them, and should not land in
   * the middle of the FAQs. The count rides on the label, because the one
   * question anybody has about a list like this is how much of it is left.
   */
  const found = Object.keys(state.ui.found || {}).length;
  dom.stages.appendChild(el('button', {
    class: `stepper__step stepper__step--aside${state.page === 'achievements' ? ' is-current' : ''}`,
    type: 'button',
    role: 'tab',
    'aria-selected': String(state.page === 'achievements'),
    title: 'Everything this bench does that you would never find from a label',
    'data-field': 'page:achievements',
    on: { click: () => showAchievements() },
  }, [
    el('span', {
      class: 'stepper__label tab-label--long',
      text: `Things to find (${found}/${ACHIEVEMENTS.length})`,
    }),
    el('span', { class: 'stepper__label tab-label--short', text: `Find ${found}/${ACHIEVEMENTS.length}` }),
  ]));
}

/**
 * Simple · Advanced · Expert.
 *
 * Each chip carries its reason in the tooltip rather than in a line of prose
 * beside it, because the bar has to stay one row. The sentence under them says
 * the thing a reader would otherwise have to discover by experiment: this hides
 * and shows, it does not change the answer.
 */
function renderLevels() {
  clear(dom.levels);
  dom.levelHint.textContent = interactive()
    ? INTERACTIVE.note
    : levelById(state.ui.level).note;

  const onPage = !interactive();

  for (const level of LEVELS) {
    const current = onPage && level.id === state.ui.level;
    dom.levels.appendChild(el('button', {
      class: 'chip modebar__chip', type: 'button',
      'aria-pressed': String(current),
      title: `${level.note} The physics is the same at every level — this only sets how much is shown.`,
      'data-field': `level:${level.id}`,
      on: {
        click: () => {
          if (current) return;
          state.ui.level = level.id;
          /*
           * Picking a level is also choosing the page layout.
           *
           * Any press in this bar is the reader saying which of the four they
           * want, and storing it is what stops a phone being put back into
           * Interactive by the next reload.
           */
          state.ui.layout = 'page';
          saveSoon();
          /*
           * Re-render, never rebuild.
           *
           * The level is presentation. `rebuild()` builds the world again from
           * the parameters and puts the clock back to zero, so switching from
           * Advanced to Expert two minutes into a run threw the run away — the
           * same class of bug as a slider that resets the simulation, and
           * squarely against the rule that a level only hides.
           */
          render();
        },
      },
    }, level.label));
  }

  /*
   * And Interactive, last, with a rule before it.
   *
   * Last because it is the one that changes the shape of the app rather than
   * the amount of detail in it, and beside the other three because this bar is
   * where a reader looks for "how much of the bench is on screen". The rule is
   * the CSS's job — `--aside`, the same marker the step bar uses for the pages
   * that are not steps.
   */
  const inInteractive = interactive();
  dom.levels.appendChild(el('button', {
    class: 'chip modebar__chip modebar__chip--aside', type: 'button',
    'aria-pressed': String(inInteractive),
    title: `${INTERACTIVE.note} The physics is the same — this only moves the controls.`,
    'data-field': `level:${INTERACTIVE.id}`,
    on: { click: () => setLayout(inInteractive ? 'page' : 'interactive') },
  }, INTERACTIVE.label));
}

/**
 * Which steps have been opened before, so the sidebar is only rearranged once.
 *
 * Session-scoped on purpose. Coming back to a step should show it the way you
 * left it, not the way it was introduced to you.
 */
const visited = new Set();

/**
 * Hold the sidebar to one open panel.
 *
 * The accordion in `widgets.js` keeps the invariant once a reader is clicking,
 * but it cannot establish it: a panel built with its `open` attribute already
 * set fires no `toggle`, so a fresh load, a share link or a restored session
 * would all arrive with everything open at once. This is the same rule applied
 * to the sidebar as rendered — keep the first open panel, fold the rest.
 *
 * Closing a panel fires its own `toggle`, which records it — so the folding
 * survives the next render without this having to know how the store is keyed.
 */
function soloOpenSection() {
  let kept = false;
  for (const node of dom.controls.querySelectorAll('.section[data-group]')) {
    if (!node.open) continue;
    // A pinned panel is exempt, and does not use up the one free slot either:
    // locking one and opening another is the whole reason the lock exists.
    if (node.dataset.locked === 'true') continue;
    if (!kept) { kept = true; continue; }
    node.open = false;
  }
}

/** The keys of the panels currently in the sidebar. */
const sectionKeys = () =>
  new Set([...document.querySelectorAll('#controls [data-section]')].map((n) => n.dataset.section));

/**
 * Open the panel this step adds, and close what it inherited.
 *
 * By the last step the sidebar is twelve panels long, and every one of them was
 * introduced by an earlier step. Arriving somewhere new and having to hunt down
 * the one panel that is new is the opposite of what the stepper is for — so the
 * first new one is opened and everything else is folded away, once, on the
 * first visit. Everything is still there, and anything reopened stays open.
 *
 * One panel, not all of them, because the sidebar is an accordion: opening
 * three would leave the third to close the other two a moment later, which
 * reads as the panel you were just shown collapsing by itself.
 *
 * The *last* new one. Walking a step at a time there is only one, so it makes
 * no difference; jumping from step one to step seven it is the difference
 * between landing on the panel step seven introduced and landing on the one
 * step two did.
 */
function focusNewSections(previous) {
  const nodes = [...document.querySelectorAll('#controls [data-section]')]
    // The drawing options are housekeeping rather than part of any step, and
    // they were closed to begin with. A pinned panel is left exactly alone —
    // that is what pinning it said to do.
    .filter((n) => n.dataset.section !== 'view' && n.dataset.locked !== 'true');
  const newest = nodes.filter((n) => !previous.has(n.dataset.section)).pop();

  for (const node of nodes) {
    const wanted = node === newest;
    node.open = wanted;
    state.ui.sections[`${state.stage}:${node.dataset.section}`] = wanted;
  }
  saveSoon();
}

function goToStage(id) {
  /*
   * Walking to another step leaves the prepared experiment behind.
   *
   * Its explanation describes one arrangement on one step, so carrying the note
   * onto a step the reader navigated to themselves would leave it describing
   * something that is no longer on screen.
   */
  if (id !== state.stage) state.exampleId = null;
  const previous = sectionKeys();
  const firstVisit = !visited.has(id);
  visited.add(id);

  update((draft) => {
    draft.stage = id;
    /*
     * Picking a step is asking for the bench.
     *
     * Without this the step changes underneath a page that is not showing one,
     * so from the shelf or the guide the bar highlighted a step and nothing
     * else happened — which reads as the tab being broken.
     */
    draft.page = 'bench';
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
  dom.levels = el('div', { class: 'modebar', role: 'group', 'aria-label': 'How much detail to show' });
  dom.levelHint = el('span', { class: 'modebar__hint' });
  /*
   * Its own row, above the steps.
   *
   * The level governs the whole screen — the sidebar, the readouts and the
   * teaching panels all read it — and a control that governs the whole screen
   * has to sit above the whole screen. Sharing a row with the steps made it
   * read as a filter on them; on its own line, directly under the wordmark and
   * directly above the bar it governs, it reads as what it is.
   *
   * The sentence beside it is the *current* level's, not a description of the
   * control. A reader wants to know what they are looking at, not what the
   * three words mean in the abstract.
   */
  dom.workspaceBar = el('div', { class: 'modebar-host' }, [dom.levels, dom.levelHint]);
  dom.ask = el('div', { id: 'ask' });
  dom.vectors = el('div', { id: 'vectors' });
  dom.stage = el('div', {
    class: 'viewport__stage', id: 'stage',
    tabindex: '-1',
    'aria-label': 'The bench. Click to take the controls.',
  });
  /*
   * The furniture that floats over the drawing in Interactive.
   *
   * A sibling of the stage, never a child of it: `paint` empties the stage and
   * rebuilds the scene on every animation frame, so anything parented there
   * would be destroyed sixty times a second — along with any menu the reader
   * had open. It is positioned against `.viewport`, which the CSS makes the
   * containing block, and it is `display: none` in the page layout.
   */
  dom.stageUI = el('div', { class: 'stage-ui', id: 'stage-ui' });
  dom.legend = el('div', { id: 'legend' });
  /*
   * One graph, kept on screen in Interactive, directly above the transport.
   *
   * Its own element rather than a reuse of `#graphs`: that one holds every
   * graph the step draws, stacked, and lives below the drawing with the rest
   * of the output. This is a single thin band that costs the bench its height,
   * so it is placed where the reader chose to spend it.
   */
  dom.strip = el('div', { class: 'strip', id: 'strip' });
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
      /*
       * A `field__hint`, so it goes when the rest of the prose goes: at Simple
       * the tiles are four numbers under a heading that already names them.
       */
      el('span', {
        class: 'measurements__note field__hint',
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
    dom.workspaceBar,
    dom.stages,
    dom.ask,
    dom.vectors,
    dom.stage,
    dom.stageUI,
    dom.legend,
    dom.strip,
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
      /*
       * What the footer is for, now that the exports have moved.
       *
       * Everything here is *about the app* rather than about the experiment:
       * what changed, what you may do with it, who made it and what happens to
       * your data, and a way back to the welcome. Sharing, printing and the
       * downloads are things you do to an experiment, so they live beside it
       * in the sidebar.
       */
      button("What's new", () => openPanel(WHATS_NEW), {
        small: true, title: 'What changed in this version',
      }),
      button('Licence & terms', () => openPanel(LICENCE), {
        small: true, title: 'What you may do with this tool, and what it does not promise',
      }),
      button('Imprint & privacy', () => openPanel(IMPRINT), {
        small: true, title: 'Who made it, and what happens to your data',
      }),
      /*
       * A way back to the welcome, for anyone who is not new but wishes they
       * had read it.
       *
       * The overlay shows itself once and then never again, which is right —
       * an app that greets you every visit is an app you learn to dismiss
       * without reading. But "once" only works if there is a door back in, and
       * the guide is not where someone who does not yet know what the app is
       * will think to look. The footer is on every screen.
       */
      button('I am new here', () => openWelcome(), {
        small: true,
        title: 'Show the welcome again — what this is, and three places to start',
      }),
      button('Reset', () => {
        reset();
        clearDismissed();
        rebuild();
        render();
        toast('Back to the start of the bench');
      }, { small: true, title: 'Back to the default settings' }),
      el('a', {
        class: 'linkish', href: COFFEE_URL, target: '_blank', rel: 'noopener noreferrer',
        text: 'Buy me a coffee',
      }),
      el('span', { class: 'muted', text: `v${APP_VERSION}` }),
    ]),
  ]);
}

/* -------------------------------------------------------------- the sim -- */

/** The half-width of the largest thing on the bench, which is what framing follows. */
function biggestExtent(world) {
  let biggest = 0;
  for (const b of world?.bodies || []) {
    if (b.kind === 'planet') continue;
    biggest = Math.max(biggest, b.radius || 0, (b.width || 0) / 2, (b.height || 0) / 2);
  }
  return biggest;
}

/**
 * What to sample at, for the speed the run is being watched at.
 *
 * Slowing down is how you ask to see detail, so it buys a finer record; the
 * physics steps 240 times a second and 0.1x captures every one of them. Going
 * faster is how you ask to skim, and a coarser record is what makes minutes of
 * simulation fit in the same memory. The product of the two barely moves — 1x
 * and 2x both cost 60 frames a wall-clock second — so the recording never gets
 * more expensive just because the clock is turned up.
 *
 * The cost of each rate is measured, not guessed: `RATE_ERROR` in the recorder
 * is how far a peak is understated at each one, and the settings panel shows
 * that ladder rather than asking anyone to take it on trust.
 */
function ratesForSpeed(speed) {
  const setting = state.ui.recording;
  const table = setting.rates;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  // The nearest speed at or below this one, so an unlisted speed still has a rate.
  const key = keys.filter((k) => k <= speed + 1e-9).pop() ?? keys[0];
  const rate = table[String(key)] ?? 60;
  const halved = setting.halveHistory ? Math.max(setting.floor, rate / 2) : rate;
  return { rate, historyRate: Math.min(rate, halved), window: setting.window };
}

/**
 * Point the recorder at the current settings, keeping what it already holds.
 *
 * Frames already taken keep the rate they were taken at. That is deliberate:
 * the record ends up dense where the run was watched slowly and sparse where
 * it was skimmed, which is exactly where the detail is wanted. Only the budget
 * can drop anything, and only from the oldest end.
 */
function reRate() {
  const { rate, historyRate, window } = ratesForSpeed(state.transport.speed);
  const { budget } = state.ui.recording;
  const frames = sim.recorder.frames.length > budget
    ? sim.recorder.frames.slice(sim.recorder.frames.length - budget)
    : sim.recorder.frames;
  sim.recorder = {
    ...sim.recorder, rate, historyRate, window, interval: 1 / rate, capacity: budget, frames,
  };
}

function newRecorder() {
  const { rate, historyRate, window } = ratesForSpeed(state.transport.speed);
  return createRecorder({
    rate, historyRate, window, capacity: state.ui.recording.budget,
  });
}

function rebuild() {
  sim.recorder = newRecorder();
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
 * Walk to the next step, running whatever that arrival is supposed to look like.
 *
 * Arriving at the planet step is the one that has something to show: the
 * second mass swelling and sinking until it *is* the ground. That animation
 * has always existed behind the "Make it a planet" button in the sidebar, and
 * the reader who simply presses "Next" — which is most of them, since it is
 * the primary button right under the question — got the same destination with
 * none of the explanation. Both doors now lead through it.
 *
 * Only from a step that actually has the second mass on screen, though.
 * Jumping there from the push step would animate the growth of something the
 * reader has never seen.
 */
function walkTo(id) {
  if (id === 'planet' && featuresAt(state.stage).has('second-mass')) {
    growPlanet();
    return;
  }
  goToStage(id);
}

/**
 * Run the growth, then hand over to the planet step.
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
  if (!frame) return sim.world;
  /*
   * The trail is read back out of the frames rather than stored in each one.
   * Storing it was 97% of a frame and 720 MB at ten objects, and every
   * position it needs is already here.
   *
   * `trailLimit` still decides whether there is a trail at all, and how long:
   * deriving one on a step that does not draw them put a ribbon behind a
   * scrubbed object that the live view never showed.
   */
  const limit = sim.world.trailLimit || 0;
  const seconds = limit / 240;
  const bodies = frame.bodies.map((b) => ({
    ...b, trail: limit > 0 ? trailAt(sim.recorder, b.id, frame.t, seconds) : [],
  }));
  return { ...sim.world, t: frame.t, bodies, ledger: frame.ledger };
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
  const was = biggestExtent(sim.world);
  mutate(state);
  saveSoon();
  if (how === 'full') rebuild();
  else if (how !== 'none') applyParams();

  /*
   * A different object gets a fresh look at it.
   *
   * Zoom, pan and Home are about watching one experiment closely, and they
   * rightly survive the thing moving about. They should not survive the thing
   * being *replaced*: swapping a 12 cm rover for a 37 m spaceship left the held
   * six-metre window on screen, so the rover was a speck and the spaceship ran
   * off both edges, and the only way back was Fit everything.
   *
   * Here rather than in `rebuild`, because changing the shape does not rebuild
   * — it is a live edit, deliberately, so that swapping a shape mid-flight does
   * not reset the clock. Both paths pass through this function; only one of
   * them passes through that one.
   *
   * A quarter is the threshold, so nudging a size slider does not yank the view
   * out from under a reader who has deliberately zoomed in on something.
   */
  const now = biggestExtent(sim.world);
  if (was > 0 && now > 0 && (now / was > 1.25 || was / now > 1.25)) {
    state.view.camera.mode = 'auto';
  }
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

/**
 * Every container that is currently scrolled, and how far, on both axes.
 *
 * Found rather than listed. Naming the containers is what made this a bug
 * three times over: the sidebar and the workspace were remembered and the step
 * bar was not, so scrolling right to reach "How to use" and clicking it threw
 * the bar back to step one — the render rebuilt its children and nothing put
 * the offset back. A list has to be added to every time a scroller appears,
 * and the one nobody adds is the one that jumps.
 *
 * Captured by node, not by selector, because a render replaces a container's
 * *children* and keeps the container. A node that does get replaced simply
 * falls out of the map.
 */
function captureScroll() {
  const scrolled = [];
  for (const node of document.querySelectorAll('*')) {
    if (node.scrollTop || node.scrollLeft) {
      scrolled.push([node, node.scrollTop, node.scrollLeft]);
    }
  }
  return scrolled;
}

const restoreScroll = (scrolled) => {
  for (const [node, top, left] of scrolled) {
    if (!node.isConnected) continue;
    if (top) node.scrollTop = top;
    if (left) node.scrollLeft = left;
  }
};

function captureFocus() {
  const active = document.activeElement;
  const key = active?.dataset?.field;
  return {
    scrolled: captureScroll(),
    /*
     * The document's own scroll, which on a narrow screen is the only one that
     * matters: the layout stops being two columns and simply stacks, so neither
     * the sidebar nor the workspace scrolls any more — the page does.
     *
     * Not capturing it is what threw the reader back to the top after every
     * edit. Replacing a panel briefly shortens the document, the browser clamps
     * the scroll position to the shorter height, and nothing ever put it back.
     * Committing a value in the fourth object down meant scrolling to it again.
     */
    page: window.scrollY || document.documentElement.scrollTop || 0,
    key: key || null,
    start: key && active.selectionStart != null ? active.selectionStart : null,
    end: key && active.selectionEnd != null ? active.selectionEnd : null,
  };
}

function restoreFocus(snap) {
  restoreScroll(snap.scrolled);
  /*
   * And again after layout, for the same reason the page scroll is set twice:
   * a container whose new contents are momentarily shorter than its old ones
   * clamps the offset it is handed, and the clamped value is what sticks.
   */
  requestAnimationFrame(() => restoreScroll(snap.scrolled));

  if (snap.key) {
    const target = document.querySelector(`[data-field="${CSS.escape(snap.key)}"]`);
    if (target) {
      // `preventScroll`, because focusing a control the browser thinks is out
      // of view is the other way a page jumps on its own.
      target.focus({ preventScroll: true });
      if (snap.start != null && target.setSelectionRange) {
        try { target.setSelectionRange(snap.start, snap.end); } catch { /* not a text field */ }
      }
      // Focusing can still nudge a container, so the offsets go back after it.
      restoreScroll(snap.scrolled);
    }
  }

  restorePageScroll(snap);
}

/**
 * Put the document back where it was, twice.
 *
 * Once now, and once after the browser has finished laying the new panel out —
 * because if the document is still momentarily shorter than it was, the first
 * attempt is clamped to the old height and silently lost.
 */
function restorePageScroll(snap) {
  if (!snap || typeof window.scrollTo !== 'function') return;
  const want = snap.page ?? 0;
  if (Math.abs((window.scrollY || 0) - want) < 1) return;
  window.scrollTo(0, want);
  requestAnimationFrame(() => {
    if (Math.abs((window.scrollY || 0) - want) >= 1) window.scrollTo(0, want);
  });
}

/**
 * Drop a prepared experiment onto the bench.
 *
 * The whole state is replaced rather than patched, because an example is a
 * complete setup and half of one is nobody's experiment: leaving the previous
 * run's walls or cannons in place would make it behave differently from the
 * same example loaded on a fresh page, which is the one thing a prepared scene
 * must not do.
 *
 * It arrives paused. The setup *is* the demonstration — the reader should see
 * what was arranged before it starts moving, and press Play themselves.
 */
/*
 * Set when a loaded example wants the keys, and cleared the moment they are
 * handed over. It cannot be done inside `loadExample` because the drawing is
 * rebuilt by the render that follows it, and focusing an element that is about
 * to be replaced achieves nothing.
 */
let wantsKeys = false;

export function loadExample(id) {
  const next = exampleState(id);
  if (!next) return false;
  stopGrowth();
  Object.assign(state, next);
  // Picking one off the shelf means going to the bench with it.
  state.page = 'bench';
  /*
   * An example that is driven arrives with the keys already live.
   *
   * The drawing has to be selected before the arrow keys steer rather than
   * scroll, which is right when someone is building their own scene - the keys
   * belong to the page until asked for. But loading a level whose first
   * instruction is "hold the right arrow" is the asking, and making a reader
   * click the picture first only teaches them that the instructions were
   * wrong. Escape still gives the keys back.
   */
  wantsKeys = next.bench?.control?.mode === 'keyboard';
  /*
   * Say so before the panels are built, not after.
   *
   * The focus itself has to wait for the drawing to be rebuilt, but the banner
   * explaining the controls is written during that same render - so setting
   * this afterwards left the page insisting "click the drawing to take the
   * controls" while the drawing already had them.
   */
  if (wantsKeys) input.engaged = true;
  state.transport.playing = false;
  state.transport.scrubT = null;
  saveSoon();
  rebuild();
  render();
  return true;
}

/** Show the shelf of prepared experiments. */
export function showExamples() {
  if (state.page === 'examples') return;
  state.transport.playing = false;
  cancelAnimationFrame(clock.raf);
  state.page = 'examples';
  saveSoon();
  render();
}

/* ------------------------------------------------------------ welcome -- */

/**
 * The welcome card, and the one flag that decides whether it ever appears.
 *
 * A timestamp rather than a boolean, because "when did this reader first open
 * it" is the more useful thing to have kept, and it costs the same.
 */
function openWelcome() {
  if (document.querySelector('.welcome')) return;

  const dismiss = () => {
    document.querySelector('.welcome')?.remove();
    if (!state.ui.onboardedAt) {
      state.ui.onboardedAt = new Date().toISOString();
      save();
    }
  };

  const card = welcomeOverlay({
    dismiss,
    /*
     * Unticking it means "show me this again next time", so the timestamp
     * that suppresses it is cleared rather than set.
     */
    setShowAgain: (again) => {
      state.ui.onboardedAt = again ? null : new Date().toISOString();
      save();
    },
    go: (where) => {
      dismiss();
      if (where.stage) goToStage(where.stage);
      if (where.page === 'examples') showExamples();
      else if (where.page === 'guide') showGuide();
      else showBench();
    },
  });

  document.body.appendChild(card);
  // Focus it, so Escape reaches the handler and a keyboard reader is put
  // inside the dialog rather than left behind it.
  card.querySelector('.welcome__card')?.setAttribute('tabindex', '-1');
  card.querySelector('.welcome__card')?.focus();
}

/** One of the three footer panels: what's new, the licence, the imprint. */
function openPanel(panel) {
  if (document.querySelector('.welcome')) return;
  const card = panelOverlay(panel);
  document.body.appendChild(card);
  card.querySelector('.welcome__card')?.focus();
}

/** Show the list of things there are to find. */
export function showAchievements() {
  if (state.page === 'achievements') return;
  state.transport.playing = false;
  cancelAnimationFrame(clock.raf);
  state.page = 'achievements';
  saveSoon();
  render();
}

/** Show the how-to page. */
export function showGuide() {
  if (state.page === 'guide') return;
  state.transport.playing = false;
  cancelAnimationFrame(clock.raf);
  state.page = 'guide';
  saveSoon();
  render();
}

/** Back to the bench, exactly as it was left. */
export function showBench() {
  if (state.page === 'bench') return;
  state.page = 'bench';
  saveSoon();
  render();
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
  applyLevel();
  renderStages();
  renderLevels();

  if (dom.themeButton) {
    const glyph = dom.themeButton.querySelector('.btn__glyph');
    if (glyph) glyph.textContent = THEME_GLYPH[state.theme];
    dom.themeButton.setAttribute('aria-label', THEME_LABEL[state.theme]);
    dom.themeButton.title = `${THEME_LABEL[state.theme]}. Click to change — system, light or dark. `
      + 'Set it explicitly before screen-recording.';
  }

  /*
   * The gallery is a whole page, not a panel, so it replaces the bench rather
   * than sitting alongside it.
   *
   * Everything below this rebuilds a region that assumes there is an experiment
   * on the bench — a drawing, a legend, a transport bar, a sidebar of controls
   * for it. On the shelf none of those mean anything, so they are emptied and
   * the clock is left stopped. The stepper stays, because it is how a reader
   * gets back.
   */
  if (state.page !== 'bench') {
    /*
     * Marked on the root, and the CSS hides the bench from there.
     *
     * Emptying the regions is not enough on its own: the drawing keeps its
     * 300 px and its border whether or not anything is in it, so the shelf sat
     * above a large white rectangle. Hiding by structure rather than reaching
     * in and setting styles keeps the two ways of being visible in one place.
     */
    document.documentElement.dataset.page = state.page;
    clear(dom.ask);
    /*
     * What a page can do, handed over by name.
     *
     * `actions` in this scope is the transport bag — play, pause, scrub — and
     * passing it here compiled fine and failed at the click, which is the worst
     * place to find out. Each page needs a couple of functions and says so.
     */
    const page = state.page === 'guide'
      ? guidePage({ showBench, showWelcome: () => openWelcome() })
      : state.page === 'achievements'
        ? achievementsPage({ showBench, showGuide },
          state.ui.found, achievementGroups, ACHIEVEMENTS)
        : galleryPage({ loadExample, showBench });
    dom.ask.appendChild(page);
    for (const host of [dom.vectors, dom.stage, dom.legend, dom.transportHost,
      dom.banners, dom.graphs, dom.measurements, dom.summary, dom.explain,
      dom.controls]) {
      clear(host);
    }
    restoreFocus(snap);
    return;
  }

  document.documentElement.dataset.page = 'bench';
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
        ? button(`Next: ${STAGES[here + 1].label} →`, () => walkTo(STAGES[here + 1].id), { small: true, primary: true })
        // Past the last step there is nowhere further to walk, so the shelf of
        // prepared experiments is what comes next.
        : button('Examples →', () => showExamples(), { small: true, primary: true }),
    ].filter(Boolean)),
  ]));

  /*
   * The first thing to actually do on this step, under the question it opens
   * with.
   *
   * `ask` and `discover` say what the step is about and what it comes to;
   * neither says which of a dozen panels to touch, and that is the gap a
   * newcomer falls into — they understand the question perfectly and have no
   * idea where to start. It is a banner, so it folds to one line and closes
   * like any other message, and a closed one stays closed for the session.
   */
  if (stage.hint) {
    const hint = banner('info', stage.hint, { key: `hint:${stage.id}`, open: true });
    if (hint) dom.ask.appendChild(hint);
  }

  clear(dom.vectors);
  const available = vectorsFor(state.stage, state.bench);
  dom.vectors.appendChild(arrowPicker());
  /*
   * The arrow filter on the left, the view controls on the right, one row.
   *
   * These were at the bottom of a sidebar panel, which is the wrong place for
   * them: zooming is something you do *while looking at the drawing*, and
   * reaching it meant scrolling away from the thing being zoomed. Directly
   * under the filters and above the drawing, they are next to what they act on.
   */
  dom.vectors.appendChild(el('div', { class: 'vectors__foot' }, [
    button('Just what matters here', () => update((draft) => {
      Object.assign(draft.vectors, suggestionFor(state.stage, available));
    }, { sim: 'none' }), { small: true, title: 'Show only the arrows this step is about' }),
    el('div', { class: 'vectors__view' }, [
      button('Zoom in', () => ctx.zoomBy(1.5), { small: true, title: 'Closer' }),
      button('Zoom out', () => ctx.zoomBy(1 / 1.5), { small: true, title: 'Wider' }),
      el('button', {
        class: `btn btn-sm${state.ui.tool === 'pan' ? ' is-armed' : ''}`,
        type: 'button',
        'data-field': 'tool:pan',
        title: 'Drag the drawing to move the view',
        on: { click: () => ctx.setTool(state.ui.tool === 'pan' ? 'none' : 'pan') },
      }, state.ui.tool === 'pan' ? 'Panning — click to stop' : 'Pan'),
      button('Home', () => ctx.goHome(), {
        small: true,
        primary: state.view.camera.mode === 'manual',
        title: 'Centre on the object being watched, keeping this zoom',
      }),
    ]),
  ]));

  clear(dom.controls);
  /*
   * The sidebar is not built at all in Interactive.
   *
   * Hidden is not absent: four hundred controls still in the document carry
   * `data-field` names, and the sheet's own fields are the same names — so a
   * lookup finds whichever comes first, which is the hidden one. That bug has
   * already been paid for once here, on the corner menus. Not building it also
   * takes the work out of every render in the mode that can least afford it.
   */
  if (!interactive()) {
    for (const node of bench.controls(ctx)) dom.controls.appendChild(node);
    soloOpenSection();
  }

  if (wantsKeys) {
    wantsKeys = false;
    dom.stage.focus();
  }

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
  /*
   * What the simulation is doing — the reality, the model, the assumptions
   * and the approximations, kept apart.
   *
   * It is the app's central promise and it is not optional, but it is a
   * promise about the *model*, and a reader who has not yet accepted that a
   * push makes something go faster is not yet asking which parts of that are
   * approximated. It is the first thing Advanced adds.
   */
  if (sim.scenario?.disclosure && ctx.at('advanced')) {
    dom.explain.appendChild(disclosurePanel(sim.scenario.disclosure));
  }

  /*
   * The sheet's contents are the sidebar's own sections, rebuilt from live
   * state exactly as the sidebar's are — not a copy of them. Which sections
   * belong to what was tapped is decided in `js/targets.js`.
   */
  let open = sheetOpen();
  if (open) {
    /*
     * The tapped arm decides which panel is expanded, by writing the same
     * store the accordion reads. Setting it here rather than passing a flag
     * keeps `section()` unaware that sheets exist.
     *
     * Keyed on the section's own key — `object`, `push`, `surface` — and taken
     * from the same list the sheet is built from, so the two cannot drift.
     * Written against the section *titles* first, which the store does not
     * use, and both panels arrived collapsed: a sheet that opens showing
     * nothing but two closed headings reads as something that failed to load.
     *
     * Before the sheet is built, not after. Built first, the store is written
     * too late to affect anything and the focus silently does nothing.
     */
    for (const id of sectionsFor(open)) {
      state.ui.sections[`${state.stage}:${id}`] = id === open.focus;
    }
  }

  /*
   * The sheet's contents are the sidebar's own sections, rebuilt from live
   * state exactly as the sidebar's are — not a copy of them. Which sections
   * belong to what was tapped is decided in `js/targets.js`.
   *
   * A panel with nothing in it never opens: every section is guarded by the
   * feature that creates it, so walking back from the playground to the fluid
   * step with a wall selected leaves a sheet whose only panel no longer
   * exists. An empty card reads as something that failed to load.
   */
  const sheetNodes = open ? bench.sheet(ctx, open) : [];
  if (open && sheetNodes.length === 0) {
    setSheet(null);
    open = null;
  }

  renderStageUI(dom.stageUI, {
    state,
    /*
     * Named after the thing itself, not after the panel. "What you tapped" is
     * the app describing its own mechanism; "The crate, 1.31 kg" is the app
     * telling the reader which of the objects on the bench they have got hold
     * of, which is the only question a heading here can usefully answer.
     */
    sheet: open ? { title: sheetTitle(open), nodes: sheetNodes } : null,
    actions: {
      setLevel: (id) => { state.ui.level = id; saveSoon(); render(); },
      goToStage,
      showExamples,
      showGuide,
      showAchievements,
      leave: () => setLayout('page'),
      openSheet: openSheetAt,
      closeSheet: () => { setSheet(null); render(); },
      moveArmed: input.moveArmed,
      armMove: () => {
        // One drag, then back to throwing. Pressing it again cancels.
        input.moveArmed = input.moveArmed === state.selectedId ? null : state.selectedId;
        setSheet(null);
        render();
      },
      // What this step has, so the menu can never offer a wall on a step that
      // cannot draw one. The same set the sidebar is built from.
      features: sim.scenario?.features ?? new Set(),
      /*
       * `ctx`, not `actions` — `actions` in this scope is the transport bag,
       * play and pause and scrub. Written against it first, which compiled
       * cleanly and threw at the click: the worst place to find out, and the
       * second time this exact mistake has been made in this file. The
       * comment above `actions` says so, and was not enough on its own.
       */
      addObject: () => { ctx.addObject(); openPanelSheet('objects'); },
      addBox: () => { ctx.addBox(); openPanelSheet('obstacles'); },
      addCannon: () => { ctx.addCannon(); openPanelSheet('obstacles'); },
      /*
       * Arming the wall tool takes the drawing's taps away from selecting, so
       * it is a mode and says so: the menu item reads "Stop drawing walls"
       * while it is on, and the sheet closes because the next thing the reader
       * does is drag, not read.
       */
      toggleWallTool: () => {
        const arming = state.ui.tool !== 'wall';
        // The next thing the reader does is drag across the bench, so anything
        // covering it goes. Said in a comment before it was true, which is
        // exactly how a comment becomes a lie.
        if (arming) setSheet(null);
        update((draft) => {
          draft.ui.tool = arming ? 'wall' : 'none';
          if (arming) draft.selectedId = null;
        }, { sim: 'none' });
      },
      openPanel: openPanelSheet,
      // The step's own graphs, so the drawer can never offer one this step
      // does not record.
      graphs: channelsFor(state.stage, state.bench),
      showGraph: (id) => {
        state.ui.strip = id;
        saveSoon();
        render();
        // The stage is a different height now, so the drawing is re-cut to it
        // before the frame is painted rather than one frame later.
        if (measureStage()) paint(true);
      },
    },
  });

  renderTransportBar();
  paint(true);
  restoreFocus(snap);
  checkAchievements(true);
  startClock();
}

/*
 * The stage, as last measured.
 *
 * Read from a ResizeObserver rather than from `getBoundingClientRect` in
 * `paint`, because paint runs sixty times a second and measuring an element
 * forces the browser to finish laying the page out before it can answer —
 * which is the one thing a frame budget cannot afford.
 */
let stageShape = { w: 0, h: 0, offX: 0, offY: 0, overW: 0, overH: 0 };

/**
 * How tall to draw the canvas, in canvas units, or null for its usual shape.
 *
 * Only Interactive asks for anything but null: there the drawing is the screen,
 * so its canvas has to be the screen's shape or it letterboxes inside the space
 * the mode just gave it.
 */
function stageCanvasHeight() {
  if (!interactive()) return null;
  if (!(stageShape.w > 0 && stageShape.h > 0)) return null;
  return (VIEW_W * stageShape.h) / stageShape.w;
}

/**
 * Measure the stage. True if its shape has changed since the last look.
 *
 * Reading an element's box forces the browser to finish laying the page out,
 * so this is called at the three moments the shape can actually change —
 * startup, a layout switch, and a resize — and never from `paint`, which runs
 * sixty times a second.
 */
function measureStage() {
  if (!dom.stage) return false;
  const box = dom.stage.getBoundingClientRect();
  const w = Math.round(box.width);
  const h = Math.round(box.height);
  /*
   * And where the drawing sits inside the overlay, which is what turns a
   * position in the drawing into a position for a button floating over it.
   * Read here, with the rest, so the paint loop never measures anything.
   */
  const over = dom.stageUI?.getBoundingClientRect();
  const offX = over ? Math.round(box.left - over.left) : 0;
  const offY = over ? Math.round(box.top - over.top) : 0;
  const overW = over ? Math.round(over.width) : 0;
  const overH = over ? Math.round(over.height) : 0;
  if (w === stageShape.w && h === stageShape.h
    && offX === stageShape.offX && offY === stageShape.offY) return false;
  stageShape = { w, h, offX, offY, overW, overH };
  return true;
}

/**
 * A pointer event, in the drawing's own coordinates.
 *
 * The same first half as `pointerToWorld`, stopping one step earlier. Targets
 * are decided in canvas units rather than in metres because a target is a
 * place to aim at on a screen: a 0.25 m ball is a finger-wide target at one
 * zoom and a speck at another, and only the canvas knows which.
 */
function pointerToCanvas(event) {
  const svg = dom.stage.querySelector('svg');
  const ctm = svg?.getScreenCTM?.();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const at = point.matrixTransform(ctm.inverse());
  return Number.isFinite(at.x) && Number.isFinite(at.y) ? { x: at.x, y: at.y } : null;
}

/** The bench as targets: everything on it, in canvas units. */
function targetScene() {
  const world = shownWorld();
  const cam = sceneCamera(world, 'main', state.view);
  const at = (x, y) => toScreen(cam, { x, y });
  const planet = world.bodies.find((b) => b.kind === 'planet');
  const planetAt = planet ? at(planet.pos.x, planet.pos.y) : null;

  return {
    /*
     * Only what is actually drawn is a target.
     *
     * The ground, the planet and the liquid each have a condition in the
     * renderer, and they are repeated here rather than inferred — a target for
     * something invisible is a tap that opens a panel for a thing that is not
     * there, which is worse than a tap that does nothing.
     */
    ground: (() => {
      if (!world.ground) return null;
      // Pinned at the point actually measured - world x = 0 - rather than at
      // canvas x = 0, which is a different place as soon as the view moves.
      const p = at(0, world.ground.y);
      return { x0: p.x, y: p.y, slopeDeg: world.ground.slopeDeg || 0 };
    })(),
    planet: planet
      ? { x: planetAt.x, y: planetAt.y, radius: planet.radius * cam.scale }
      : null,
    cannons: (world.cannons || []).map((c) => {
      const p = at(c.x, c.y);
      return { id: c.id, x: p.x, y: p.y, size: (c.size || 0.4) * cam.scale };
    }),
    walls: (world.walls || []).map((w) => {
      const a = at(w.x1, w.y1);
      const b = at(w.x2, w.y2);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }),
    bodies: world.bodies.map((b) => {
      const at = toScreen(cam, b.pos);
      return {
        id: b.id,
        x: at.x,
        y: at.y,
        radius: (b.radius || 0) * cam.scale,
        width: (b.width || 0) * cam.scale,
        height: (b.height || 0) * cam.scale,
        /*
         * A planet is excluded from the framing and is most of the sky; a
         * cannon shot is allowed to leave the bench and is gone in a second.
         * Neither is a thing to open a settings panel for.
         */
        pickable: b.kind !== 'planet' && !b.projectile,
      };
    }),
  };
}

/**
 * Where the selected body is, as a point on the overlay — or null.
 *
 * Pure arithmetic over what was measured earlier: the canvas is `VIEW_W` wide
 * however big the stage is, so one scale factor converts the whole thing.
 */
function selectionPoint() {
  if (!interactive() || !state.selectedId || !(stageShape.w > 0)) return null;
  const world = shownWorld();
  const body = world.bodies.find((b) => b.id === state.selectedId);
  if (!body) return null;
  const cam = sceneCamera(world, 'main', state.view);
  const at = toScreen(cam, body.pos);
  const k = stageShape.w / VIEW_W;
  return { x: stageShape.offX + at.x * k, y: stageShape.offY + at.y * k };
}

/**
 * Watch the stage, and redraw when its shape changes.
 *
 * This is what makes rotating a phone work: landscape and portrait are the
 * same CSS, but the canvas shape is measured rather than declared, so turning
 * the phone re-frames the drawing without a second code path. It is also what
 * covers the keyboard appearing, the browser bar sliding away, and the window
 * being dragged narrower on a desktop.
 *
 * No feedback loop: the SVG is sized by CSS to fill the stage, so repainting it
 * cannot change the stage, and an unchanged measurement returns early anyway.
 */
function watchStage() {
  /*
   * Measured once, synchronously, and **after the first render** — which is
   * the part that is easy to get wrong.
   *
   * Two reasons it cannot happen earlier. The stage is `display: none` until
   * `data-page` is on the root element, and `render` is what puts it there, so
   * measuring before it reads a box of zero by zero. And the CSS that gives
   * the stage the whole screen hangs off `data-layout`, which `render` also
   * sets — so even a visible stage would be measured at its page-layout size.
   *
   * It has to be synchronous rather than left to the observer, which delivers
   * its first callback at the end of a frame: that is one painted frame of the
   * drawing letterboxed at the wrong shape before it snaps to the screen.
   */
  if (measureStage()) paint(true);
  if (typeof ResizeObserver !== 'function') return;
  new ResizeObserver(() => {
    if (!measureStage()) return;
    /*
     * A reader who has never chosen follows their screen, so crossing the
     * phone threshold — rotating a tablet, dragging a desktop window narrow —
     * has to change the layout, not just the drawing inside it.
     */
    if (!state.ui.layout && document.documentElement.dataset.layout !== layoutNow()) {
      render();
      return;
    }
    if (interactive() && state.page === 'bench') paint(true);
  }).observe(dom.stage);
}

/**
 * A tap has been resolved: it travelled no further than a wobble.
 *
 * Takes what was under it rather than the event, because the hit test ran on
 * the way *down* and the finger has moved since — by a few pixels, but enough
 * to land on something else at the edge of a target.
 */
function resolveTap(hit) {
  if (hit.kind === 'sky') {
    /*
     * The background does two jobs, in this order: it puts away whatever is
     * open, and only then does it mean "the air". Tapping empty space to
     * dismiss is the one gesture everybody already knows, and a background
     * that opened a panel instead would take it away.
     */
    if (state.selectedId || sheetOpen()) {
      state.selectedId = null;
      input.moveArmed = null;
      setSheet(null);
      render();
      return;
    }
  }

  /*
   * Only a body is *selected*. The ground, the planet, a wall, the air — there
   * is nothing else to do with any of them but change them, so they skip the
   * buttons and open their panel on the first tap. A body gets the buttons
   * because there is more than one thing to do with it.
   */
  if (hit.kind !== 'body') {
    state.selectedId = null;
    input.moveArmed = null;
    setSheet({ ...hit, focus: sectionsFor(hit)[0] });
    render();
    return;
  }

  const again = state.selectedId === hit.id;
  state.selectedId = hit.id;
  if (again && !sheetOpen()) setSheet({ ...hit, focus: 'object' });
  render();
}

/**
 * What the sheet is called: the thing that was tapped, named.
 *
 * Named after the thing rather than after the panel. "What you tapped" is the
 * app describing its own mechanism; "Sphere · 1.31 kg" tells the reader which
 * of the objects on the bench they have got hold of, which is the only
 * question a heading here can usefully answer.
 */
function sheetTitle(target) {
  const world = shownWorld();
  if (target.kind === 'body') {
    const body = world.bodies.find((b) => b.id === target.id);
    if (!body) return 'Selected';
    /*
     * The shape, then the mass — not `body.label`, which *is* the mass, and
     * produced "1.31 kg · 1.31 kg" the first time this ran.
     */
    const shape = shapeById(body.shapeId)?.label || 'Object';
    return `${shape} · ${fmtFixed(body.mass, body.mass < 10 ? 2 : 0)} kg`;
  }
  if (target.kind === 'ground') return 'The surface';
  if (target.kind === 'planet') {
    return worldById(state.bench.planetId)?.label || 'The world it is on';
  }
  if (target.kind === 'wall') return `Wall ${Number(target.id) + 1}`;
  if (target.kind === 'cannon') {
    const n = (state.bench.cannons || []).findIndex((c) => c.id === target.id);
    return n >= 0 ? `Cannon ${n + 1}` : 'Cannon';
  }
  if (target.kind === 'sky') return fluidById(state.bench.fluidId)?.label || 'The air';
  /*
   * The sheets the menu opens are named after what they are rather than after
   * a thing on the bench. Falling through to the fluid's name, as this did
   * first, titled the arrow picker "Air".
   */
  return MENU_TITLES[target.kind] || 'Selected';
}

const MENU_TITLES = {
  objects: 'What is on the bench',
  obstacles: 'Walls and cannons',
  arrows: 'Arrows',
  explain: 'How this works',
};

/**
 * Give a body a velocity, whichever way this bench holds one.
 *
 * The main object keeps a speed and a bearing — that is what its controls say
 * — and the others keep components. Two shapes for one quantity is not ideal,
 * and converting here is still better than a gesture that can only throw some
 * of the things on the bench.
 */
function throwBody(id, { vx, vy }) {
  const polar = velocityToPolar({ vx, vy });
  update((draft) => {
    if (id === 'main') {
      draft.bench.v0 = Math.round(polar.speed * 1000) / 1000;
      draft.bench.v0AngleDeg = Math.round(polar.angleDeg);
      return;
    }
    const object = draft.bench.objects.find((o) => o.id === id);
    if (!object) return;
    object.vx = Math.round(vx * 1000) / 1000;
    object.vy = Math.round(vy * 1000) / 1000;
  });
}

/**
 * Put a body somewhere, whichever way this bench holds a position.
 *
 * On a step with a floor the main object's height is a *drop height* rather
 * than a coordinate — that is the control the reader has, and writing `y0`
 * instead would move it on screen and then snap it back on the next rebuild,
 * which reads as the drag having failed.
 */
function placeBody(id, { x, y }) {
  const round = (v) => Math.round(v * 1000) / 1000;
  const onGround = !!sim.scenario?.features?.has('ground') && !sim.scenario?.space;
  update((draft) => {
    if (id === 'main') {
      draft.bench.x0 = round(x);
      if (onGround) draft.bench.dropHeight = round(Math.max(0, y));
      else draft.bench.y0 = round(y);
      return;
    }
    const object = draft.bench.objects.find((o) => o.id === id);
    if (!object) return;
    object.x = round(x);
    object.y = round(y);
  });
}

/**
 * Open a sheet that is not about one thing on the bench.
 *
 * The lists of what has been added, the arrow picker and the teaching panel —
 * everything the page layout has room for and this one does not. They arrive
 * through the menu rather than through a tap, so there is nothing to select.
 */
function openPanelSheet(kind) {
  state.selectedId = null;
  setSheet({ kind, focus: sectionsFor({ kind })[0] });
  render();
}

/**
 * A pointer has gone down on the drawing in Interactive.
 *
 * Nothing is decided yet. A press on a body might become a throw, a move or a
 * tap, and which it was is not known until the finger lifts — so the press
 * only records where it started, and `endGesture` decides.
 *
 * This is why the tap is not handled here any more: resolving it on the way
 * down meant a drag selected something first and then threw it, and the
 * selection flashed through on the way past.
 */
function beginGesture(event) {
  const at = pointerToCanvas(event);
  if (!at) return;
  input.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });

  // Two fingers are a pinch, whatever either of them was doing alone.
  if (input.touches.size === 2) {
    const [a, b] = [...input.touches.values()];
    input.gesture = {
      kind: 'pinch',
      startSpan: pinchSpan(a, b),
      startView: { ...boxView(sceneCamera(shownWorld(), 'main', state.view).world) },
      about: pointerToWorld({ clientX: pinchCentre(a, b).x, clientY: pinchCentre(a, b).y }),
    };
    update((draft) => { takeManualView(draft); }, { sim: 'none' });
    event.preventDefault();
    return;
  }

  const minRadius = stageShape.w > 0 ? 22 * (VIEW_W / stageShape.w) : 22;
  const hit = hitTest(targetScene(), at, { minRadius });
  const world = pointerToWorld(event);

  input.gesture = {
    kind: hit.kind === 'body' && input.moveArmed === hit.id ? 'move' : 'press',
    hit,
    id: hit.id,
    startPx: { x: event.clientX, y: event.clientY },
    from: world,
    to: world,
    moved: false,
  };
  dom.stage.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

/** The pointer has moved while a gesture is running. */
function moveGesture(event) {
  const g = input.gesture;
  if (!g) return false;

  if (g.kind === 'pinch') {
    input.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (input.touches.size < 2) return true;
    const [a, b] = [...input.touches.values()];
    const factor = pinchFactor(g.startSpan, pinchSpan(a, b));
    if (g.about) {
      const next = zoomAbout(g.startView, g.about, factor);
      state.view.camera.cx = next.cx;
      state.view.camera.cy = next.cy;
      state.view.camera.span = next.span;
      saveSoon();
      paint(true);
    }
    return true;
  }

  const world = pointerToWorld(event);
  if (!world) return true;
  g.to = world;
  if (!g.moved) {
    g.moved = isDrag(event.clientX - g.startPx.x, event.clientY - g.startPx.y);
    /*
     * The moment a press becomes a drag it commits to being a throw — unless
     * the Move button armed it, or it started on something that is not a body,
     * in which case dragging is how the view is panned.
     */
    if (g.moved && g.kind === 'press') {
      g.kind = g.hit.kind === 'body' ? 'throw' : 'pan';
      if (g.kind === 'pan') update((draft) => { takeManualView(draft); }, { sim: 'none' });
    }
  }
  if (!g.moved) return true;

  if (g.kind === 'pan') {
    state.view.camera.cx -= g.to.x - g.from.x;
    state.view.camera.cy -= g.to.y - g.from.y;
    saveSoon();
  }
  paint(true);
  return true;
}

/** The pointer has lifted. Now it is known what the gesture was. */
function endGesture(event) {
  const g = input.gesture;
  input.touches.delete(event?.pointerId);
  if (!g) return false;
  input.gesture = null;

  if (g.kind === 'pinch' || g.kind === 'pan') { render(); return true; }

  // Never travelled far enough to be anything else.
  if (!g.moved) { resolveTap(g.hit); return true; }

  if (g.kind === 'throw' && g.id) {
    throwBody(g.id, pullVelocity(g.from, g.to));
    input.moveArmed = null;
    render();
    return true;
  }
  if (g.kind === 'move' && g.id) {
    placeBody(g.id, g.to);
    input.moveArmed = null;
    render();
    return true;
  }
  paint(true);
  return true;
}

/** Open one of the selected thing's panels. */
function openSheetAt(sectionId) {
  if (!state.selectedId) return;
  setSheet({ kind: 'body', id: state.selectedId, focus: sectionId });
  render();
}

/**
 * The throw being aimed, or null.
 *
 * Only while a drag that has committed to being a throw is actually running —
 * and it carries the speed as a label, because the whole point of drawing the
 * arrow is that you can see what you are about to do before you do it.
 */
function pullPreview() {
  const g = input.gesture;
  if (!g || g.kind !== 'throw' || !g.moved || !g.from || !g.to) return null;
  const v = pullVelocity(g.from, g.to);
  return { from: g.from, to: g.to, label: `${fmtFixed(v.speed, v.speed < 10 ? 2 : 1)} m/s` };
}

function paint(force = false) {
  /*
   * Nothing to paint while the shelf is up.
   *
   * `render` empties the bench regions when it switches to the gallery, but the
   * animation loop goes on running and `paint` filled the graphs and readouts
   * straight back in on the next frame — so the shelf appeared above a stack of
   * charts belonging to an experiment nobody was looking at. Stopping the clock
   * is not enough on its own, because paint runs for scrubbing and redraws too.
   */
  if (state.page !== 'bench') return;

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
    // Null in the page layout, which keeps the canvas exactly the shape it has
    // always been. Interactive hands it the stage's own shape so the drawing
    // fills the screen instead of letterboxing inside it.
    viewHeight: stageCanvasHeight(),
    pull: pullPreview(),
    selectedId: state.selectedId,
    vectors: state.vectors,
    view: state.view,
    focusId: 'main',
    pointer: input.pointer,
    drawing: input.drawing,
    control: driving ? state.bench.control : null,
    pressed: input.pressed,
  }));
  /*
   * A drawing sized to its contents must never be magnified to fill the panel.
   * Called after the stage has been replaced, on every render — pitfalls.md #3.
   *
   * Except in Interactive, where the canvas *is* the stage: the cap writes an
   * inline `max-width: 880px`, which on a wide screen would letterbox the one
   * thing the mode exists to make bigger. Nothing is being magnified past its
   * natural size there, because its natural size is whatever the stage is.
   */
  if (!interactive()) capDiagramScale(dom.stage);

  // One style write, no measurement: the stage was measured when it changed.
  placeSatellites(dom.stageUI, selectionPoint(),
    { w: stageShape.overW, h: stageShape.overH });

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
    /*
     * The strip reads the same recording as the full graphs, so the thin one
     * and the tall one can never tell different stories — and scrubbing it
     * scrubs the timeline, exactly as the others do.
     */
    clear(dom.strip);
    if (interactive() && state.ui.strip) {
      const group = channelsFor(state.stage, state.bench)
        .find((g) => g.id === state.ui.strip);
      if (group) {
        dom.strip.appendChild(renderGraph(sim.recorder, group.ids, {
          t: shownTime(),
          /*
           * Shorter on a short screen. A phone in landscape has 375 px in
           * total, and the strip was taking 145 of them — more than a third
           * of the bench for a graph the reader asked to keep *beside* the
           * thing it describes.
           */
          height: window.innerHeight <= 560 ? 54 : 96,
          title: group.label.split('—')[0].trim(),
          onScrub: (time) => {
            state.transport.scrubT = time;
            state.transport.playing = false;
            renderTransportBar();
            paint(true);
          },
        }));
      }
    }

    clear(dom.legend);
    dom.legend.appendChild(sceneLegend(ctx.world, state.vectors));

    clear(dom.readout);
    for (const node of bench.readouts(ctx)) dom.readout.appendChild(node);

    clear(dom.banners);
    if (growth) {
      /*
       * One caption, and none of the ordinary commentary: every banner the
       * bench would otherwise show is about a simulation that is not running.
       *
       * Not dismissible, because it is a running commentary on a few seconds
       * of animation rather than a message — there is nothing to take in and
       * it goes by itself.
       */
      dom.banners.appendChild(banner('info', growthCaption(growth.frame), { dismissible: false }));
    } else {
      // A banner the reader has closed comes back as null, and two or more
      // fold into one line rather than filling the screen above the drawing.
      const notices = renderNotices(bench.banners(ctx));
      if (notices) dom.banners.appendChild(notices);
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

    /*
     * The full readout, every quantity at once, under the headline tiles.
     *
     * Not at Simple. The tiles above it already say what the object is doing
     * in the four or five numbers the step is about; this is the same thing
     * exhaustively, and on the first step it puts a column of velocities and
     * momenta under an object that is not moving. Somebody meeting the
     * subject should see the number the step is about, not every number the
     * simulation happens to know.
     */
    clear(dom.inspector);
    if (ctx.at('advanced')) {
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
  /*
   * Whatever is on screen right now — in whichever mode it got there.
   *
   * This asked `autoView` instead, which ignores the current view entirely and
   * answers with the fit-everything box. From `auto` those are the same thing,
   * so it looked correct. From `follow` they are not: pressing Home and then
   * zooming threw the reader's magnification away and jumped back out to the
   * whole scene before starting to zoom in again, which is a long way from
   * where they were looking.
   */
  const now = boxView(sceneCamera(shownWorld(), 'main', state.view).world);
  draft.view.camera = { mode: 'manual', ...now };
}

/** Renumber the extra objects so their ids always match their position. */
const renumber = (list) => list.map((o, i) => ({ ...o, id: `o${i + 2}` }));

/** The arrow picker, built once and reachable from both the page and the sheet. */
function arrowPicker() {
  return vectorPicker(
    vectorsFor(state.stage, state.bench),
    state.vectors,
    (id, on) => update((draft) => { draft.vectors[id] = on; }, { sim: 'none' }),
    (patch) => update((draft) => { Object.assign(draft.vectors, patch); }, { sim: 'none' }),
  );
}

function context() {
  return {
    state,
    params: state.bench,
    // The arrow picker, so a sheet can hold the one the page layout shows
    // above the drawing. Built by the same function either way.
    arrowPicker,
    space: !!sim.scenario?.space,
    pointer: input.pointer,
    keys: input.keys,
    pressed: input.pressed,
    engaged: input.engaged,
    features: sim.scenario?.features || featuresAt(state.stage),
    // How much of what follows is shown. Never how it is computed.
    level: state.ui.level,
    at: shownAt(state.ui.level),
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

    /*
     * The exports, handed over by name.
     *
     * The panel that offers them sits in the sidebar with everything else you
     * do to an experiment, and it has no business knowing where the SVG lives
     * or which channels the CSV should carry.
     */
    copyLink: () => copyLink(),
    print: () => printWhatIsWanted(),
    downloadSvg: (name) => downloadSvg(dom.stage.querySelector('svg'), name),
    downloadPng: (name) => downloadPng(dom.stage.querySelector('svg'), name),
    downloadCsv: (name) => downloadCsv(
      sim.recorder, channelsFor(state.stage, state.bench).flatMap((g) => g.ids), name,
    ),

    /*
     * Change what is being recorded, without throwing away what already is.
     *
     * Re-rating rather than rebuilding is the whole point: frames already held
     * keep the rate they were taken at, so turning the dial up to look closely
     * at what is happening now does not erase the last two minutes. Only the
     * budget can lose frames, and only the oldest.
     */
    setRecording: (patch) => {
      update((draft) => { Object.assign(draft.ui.recording, patch); }, { sim: 'none' });
      reRate();
      render();
    },

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

    /* ------------------------------------------------------- the shelf -- */
    loadExample,
    showExamples,
    showBench,

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
    /*
     * Home recentres on the object being watched and keeps the zoom.
     *
     * It used to hand the framing back to the scene, which also threw away the
     * zoom — so the only way to recover the centre was to lose the magnification
     * that was the reason for looking closely in the first place, and then zoom
     * back in. Now it centres, holds the span, and goes on following.
     */
    goHome: () => update((draft) => {
      const cam = draft.view.camera;
      const span = cam.mode === 'auto' ? autoView(shownWorld(), 'main').span : cam.span;
      draft.view.camera = { ...cam, mode: 'follow', span };
    }, { sim: 'none' }),
    /** Back to framing everything, which is what Home used to do. */
    fitAll: () => update((draft) => { draft.view.camera.mode = 'auto'; }, { sim: 'none' }),
    setGrid: (value) => update((draft) => { draft.view.grid = value; }, { sim: 'none' }),
    setPrint: (part, on) => update((draft) => { draft.view.print[part] = on; }, { sim: 'none' }),
    removeWall: (index) => update((draft) => {
      draft.bench.walls = draft.bench.walls.filter((_, i) => i !== index);
    }),
    clearWalls: () => update((draft) => { draft.bench.walls = []; }),
    setWall: (index, patch) => update((draft) => {
      draft.bench.walls = draft.bench.walls.map((w, i) => (i === index ? { ...w, ...patch } : w));
    }),
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
    /*
     * Re-rate without clearing. Frames already held keep the rate they were
     * taken at, which is the point: the record is dense where you slowed down
     * to look and sparse where you skimmed. Everything downstream reads
     * `frame.t`, so a buffer holding several rates at once is no harder to
     * plot, scrub or export than one holding a single rate.
     */
    reRate();
    saveSoon();
    /*
     * The sidebar, not just the transport bar: the speed decides what is being
     * recorded, and the settings panel says so out loud. Redrawing only the
     * transport left "recording now at" showing the rate for the speed before
     * last, which is worse than not showing it.
     */
    render();
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

/* -------------------------------------------------------- achievements -- */

/**
 * What has happened that the achievement conditions can see.
 *
 * Two of them are about moments rather than states — an object bursting, a
 * panel being opened — and a moment is gone by the time anything looks. So
 * those are recorded here as they occur and the set is read alongside the
 * live world.
 */
const seen = { events: [], opened: [] };

/** Note a moment an achievement might be watching for. */
export function noteMoment(kind, what) {
  const list = seen[kind];
  if (list && !list.includes(what)) list.push(what);
}

/**
 * Check the conditions, and tell the reader what they just found.
 *
 * Throttled, because this runs off the animation loop and the conditions read
 * the live world: at sixty frames a second it would be sixteen list walks per
 * second to answer a question whose answer changes a handful of times in a
 * session. Quarter-second is far below noticing and far above the cost.
 *
 * One at a time, too. Two badges arriving together means the second one is
 * never read, and the sentence on it is the entire reason it exists.
 */
let lastCheck = 0;
function checkAchievements(force = false) {
  const now = performance.now();
  /*
   * The throttle is for the animation loop. A render happens because
   * something actually changed, and there are never enough of those to be
   * worth rationing — nor may one be dropped, since several conditions are
   * about a setting rather than about motion and a paused bench never ticks.
   */
  if (!force && now - lastCheck < 250) return;
  lastCheck = now;

  const world = shownWorld();
  const main = world ? inspect(world, state.selectedId) : null;
  const snap = {
    main: main ? { ...main, accelerationMagnitude: len(main.acceleration) } : null,
    // The second mass, for the step whose hint is about the two of them.
    other: world ? inspect(world, 'other') : null,
    forces: main?.forces,
    totals: world ? totals(world) : null,
    world,
    params: state.bench,
    state,
    g: sim.scenario?.world?.env?.g ?? 0,
    events: seen.events,
    opened: seen.opened,
  };
  const found = newlyEarned(snap, state.ui.found);

  /*
   * The step's hint, once its action has been done.
   *
   * Checked here because this is where the live snapshot already exists, and
   * because the conditions are the same shape: something the reader did that
   * the app can see.
   */
  const stage = stageById(state.stage);
  if (stage?.done && stage.hint) {
    let started = false;
    try { started = !!stage.done(snap); } catch { started = false; }
    if (started) dismissBanner(`hint:${state.stage}`);
  }

  if (!found.length) return;
  const id = found[0];
  state.ui.found[id] = new Date().toISOString();
  save();
  announceAchievement(id);
}

/**
 * Tell the reader what they just found, once, without interrupting them.
 *
 * Deliberately not a modal. Whatever they were doing when they found it is
 * the thing that found it, and stopping the bench to hand out a badge would
 * take them out of exactly the moment the badge is about.
 */
function announceAchievement(id) {
  const achievement = achievementById(id);
  if (!achievement) return;

  document.querySelector('.unlock')?.remove();
  const card = achievementToast(achievement, { onOpen: () => showAchievements() });
  document.body.appendChild(card);
  // Long enough to read three lines, and it can be dismissed sooner.
  setTimeout(() => card.remove(), 11000);
}

function stepSimulation(seconds) {
  // The push is re-applied before every step, because it stops after its
  // duration — and what happens after it stops is the whole point of step two.
  // It also re-reads the parameters, which is what lets the angle be turned
  // while the object is moving and the path bend from where it is.
  sim.world = applyPush(sim.world, state.bench, sim.scenario.features);
  sim.world = applyControl(sim.world);
  sim.world = advance(sim.world, seconds);
  if (sim.world.events?.some((e) => e.type === 'burst')) noteMoment('events', 'burst');
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
    checkAchievements();
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

    // A gesture in Interactive owns the pointer for as long as it lasts.
    if (moveGesture(event)) return;

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
    /*
     * Only where there is such a thing as a wall.
     *
     * The tool survives a change of step, so walking back from the playground
     * to the fluid step with it still armed would otherwise let a drag lay down
     * a wall that step cannot draw or collide with — an obstacle that exists in
     * the state and nowhere on screen.
     */
    const canDraw = sim.scenario?.features?.has('obstacles');
    if (canDraw && (state.ui.tool === 'wall' || state.ui.tool === 'arc')) {
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
    /*
     * In Interactive the drawing is the only input surface there is, so a tap
     * on it has to mean something. Not while the pointer is the throttle —
     * step six can hand the pointer to the control force, and a tap that both
     * selects and thrusts does neither clearly.
     */
    const thrusting = sim.scenario?.features?.has('control')
      && state.bench.control?.mode === 'mouse';
    if (interactive() && state.ui.tool === 'none' && !thrusting) {
      beginGesture(event);
      return;
    }

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
    /*
     * An arc is drawn end to end like a wall, and arrives already bowed.
     *
     * Asking for a third click to place the curve would make the common case —
     * a gentle ramp — cost more than it does now, and a curve that starts at
     * zero is indistinguishable from the straight wall next to it, so the tool
     * would appear not to have worked. A quarter of the span is a visible bow
     * that is obviously a curve and obviously adjustable; the slider in the
     * wall list takes it from there, in either direction.
     */
    const bulge = state.ui.tool === 'arc' ? length * 0.25 : 0;
    update((draft) => {
      draft.bench.walls = [...draft.bench.walls, {
        x1: pending.from.x, y1: pending.from.y, x2: pending.to.x, y2: pending.to.y,
        bulge, restitution: 0.3, mu: 0.6,
      }].slice(0, MAX_WALLS);
    });
  };

  const release = () => {
    if (input.panning) { input.panning = null; render(); return; }
    if (!input.pressed) return;
    input.pressed = false;
    paint(true);
  };
  dom.stage.addEventListener('pointerup', (event) => {
    if (endGesture(event)) return;
    release();
    finishWall(event);
  });
  dom.stage.addEventListener('pointercancel', (event) => {
    /*
     * A cancelled gesture is abandoned rather than completed. The browser
     * cancels a pointer when the system takes over — a notification, a
     * back-swipe from the edge — and finishing the throw then would launch
     * something at whatever speed the finger happened to be at.
     */
    input.gesture = null;
    input.touches.delete(event?.pointerId);
    input.drawing = null;
    release();
    paint(true);
  });
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
  }, {
    // Locks are not per step: pinning "The object" open means you want it in
    // view, and walking to the next step does not change that.
    get: (id) => !!state.ui.locks[id],
    set: (id, on) => { state.ui.locks[id] = on; saveSoon(); },
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
  // After the first render: see `watchStage`. Measuring before it reads zero.
  watchStage();
  visited.add(state.stage);
  save();

  /*
   * The welcome, once, and only when nobody arrived with an experiment.
   *
   * A share link or a saved project means somebody already knows what this is
   * and has been sent something specific — putting a card over it first is the
   * app talking over the person who sent it.
   */
  if (!state.ui.onboardedAt && !location.hash.length) openWelcome();

  // The share link has done its job once it has been read; leaving it in the
  // address bar means a later reload silently overrides the saved experiment.
  if (location.hash.length > 1) history.replaceState(null, '', location.pathname + location.search);
}

init();

// Exposed for the in-browser verification pass: assert on real values rather
// than looking at a screenshot.
window.PhysicsBench = {
  state, render, update, APP_VERSION, goToStage,
  examples: () => EXAMPLES.map(({ id, title, blurb, stage }) => ({ id, title, blurb, stage })),
  loadExample,
  showExamples,
  showBench,
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
  // The stage as last measured, and the canvas height that follows from it.
  // Interactive stands or falls on these two numbers agreeing with the screen.
  stage: () => ({ ...stageShape, canvas: stageCanvasHeight(), layout: layoutNow() }),
  measureStage,
};
