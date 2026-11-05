/**
 * The furniture that floats over the drawing in Interactive.
 *
 * In Interactive the drawing is the whole screen and there is no sidebar, no
 * header and no step bar, so the few things that must always be reachable sit
 * in the corners as round buttons over the picture. Floating rather than
 * stacked is the point: on a phone in landscape there are 375 px of height in
 * total, and a row of chrome claiming 44 of them is a ninth of the bench.
 *
 * Three live here so far — the level, the step, and the way out. Add, Remove,
 * Arrows and the graphs join them in later commits; a button that does nothing
 * yet is worse than a button that is not there, so they are not drawn.
 *
 * ## Why `<details>` rather than a popover
 *
 * A menu wants a top layer, light dismiss and a close-on-choose. `<details>`
 * gives the open state and the keyboard for free and is what `section()` and
 * `renderNotices()` already use, so the app has one disclosure idiom rather
 * than two. Light dismiss is the one piece it does not give, and that is four
 * lines at the bottom of this file.
 *
 * ## Why it is a sibling of the stage and not inside it
 *
 * `paint()` empties the stage and rebuilds the drawing on every animation
 * frame. Anything parented there would be destroyed sixty times a second along
 * with any menu the reader had open.
 */

import { el, clear } from './dom.js';
import { LEVELS, INTERACTIVE, levelById } from '../levels.js';
import { STAGES } from '../stages.js';
import { ACHIEVEMENTS } from '../achievements.js';

/** S, A or E — the level, in one character, because the button is 44 px. */
const INITIAL = (id) => id.charAt(0).toUpperCase();

/**
 * Which menu is open, across rebuilds.
 *
 * `render()` rebuilds this overlay whenever anything changes, and a menu that
 * shut itself because the simulation advanced would be unusable. Held in a
 * module variable rather than in state: it is where a finger is, not something
 * about the experiment, and it should not survive a reload.
 */
let openMenu = null;

function menuFor(name, { label, title, items, align = 'left' }) {
  const host = el('details', {
    class: `corner corner--${align}`,
    'data-menu': name,
    open: openMenu === name ? '' : null,
  });

  host.appendChild(el('summary', {
    class: 'corner__btn', title, 'aria-label': title, 'data-field': `corner:${name}`,
  }, label));

  const list = el('div', { class: `corner__menu corner__menu--${align}`, role: 'menu' });
  for (const item of items.filter(Boolean)) {
    list.appendChild(el('button', {
      class: `corner__item${item.current ? ' is-current' : ''}`,
      type: 'button', role: 'menuitem',
      'aria-current': item.current ? 'true' : null,
      /*
       * Prefixed, because the mode bar and the step bar are still in the
       * document in this mode — hidden, but present, and carrying the same
       * names. Two elements with one `data-field` is a lookup that silently
       * finds whichever comes first in the DOM, which is the hidden one; the
       * first time this was driven, picking Advanced from this menu pressed
       * the mode bar's chip instead and dropped out of Interactive.
       */
      'data-field': item.field ? `corner:${item.field}` : null,
      title: item.title || null,
      on: {
        click: () => {
          // Closed before the action runs: the action re-renders, and a menu
          // left open would come back open over whatever it switched to.
          openMenu = null;
          host.open = false;
          item.go();
        },
      },
    }, [
      el('span', { class: 'corner__itemLabel', text: item.label }),
      item.note ? el('span', { class: 'corner__itemNote', text: item.note }) : null,
    ].filter(Boolean)));
  }
  host.appendChild(list);

  host.addEventListener('toggle', () => {
    if (host.open) {
      // One at a time. Two open menus on a phone cover the whole bench.
      for (const other of document.querySelectorAll('.corner[open]')) {
        if (other !== host) other.open = false;
      }
      openMenu = name;
    } else if (openMenu === name) {
      openMenu = null;
    }
  });

  return host;
}

/**
 * Build the overlay.
 *
 * @param {object} spec
 * @param {object} spec.state    the live state object
 * @param {object} spec.actions  `{ setLevel, goToStage, showExamples, showGuide,
 *                                 showAchievements, leave }`
 * @returns {Node[]} the clusters, to append to the overlay host
 */
export function stageFurniture({ state, actions }) {
  const here = Math.max(0, STAGES.findIndex((s) => s.id === state.stage));
  const found = Object.keys(state.ui.found || {}).length;

  const levels = menuFor('level', {
    label: INITIAL(state.ui.level),
    title: `Showing ${levelById(state.ui.level).label.toLowerCase()} detail. `
      + 'Tap to change how much each panel says — it never changes a value.',
    items: LEVELS.map((level) => ({
      label: level.label,
      note: level.note,
      current: level.id === state.ui.level,
      field: `level:${level.id}`,
      go: () => actions.setLevel(level.id),
    })),
  });

  const steps = menuFor('step', {
    label: `${here + 1}/${STAGES.length}`,
    title: `Step ${here + 1} of ${STAGES.length} — ${STAGES[here].label}. Tap for the rest.`,
    items: [
      ...STAGES.map((stage, i) => ({
        label: `${i + 1} · ${stage.label}`,
        note: stage.ask,
        current: i === here,
        field: `stage:${stage.id}`,
        go: () => actions.goToStage(stage.id),
      })),
      { label: 'Examples', note: 'Scenes already set up, with a note on what to watch', field: 'page:examples', go: actions.showExamples },
      { label: 'How to use', note: 'How to do anything here, searched in your own words', field: 'page:guide', go: actions.showGuide },
      {
        label: `Things to find (${found}/${ACHIEVEMENTS.length})`,
        note: 'Everything this bench does that you would never find from a label',
        field: 'page:achievements',
        go: actions.showAchievements,
      },
    ],
  });

  /*
   * The way out, beside the menu and never inside it.
   *
   * A phone opens in this mode without being asked, so leaving it has to be
   * one visible tap. A mode you have to go looking for the exit to is a trap,
   * and the reader who most wants out is the one least likely to hunt.
   */
  const leave = el('button', {
    class: 'corner__btn corner__btn--plain',
    type: 'button',
    'data-field': 'corner:leave',
    title: 'Leave Interactive — back to the full page, with the sidebar',
    'aria-label': 'Leave Interactive',
    on: { click: () => actions.leave() },
  }, '✕');

  /*
   * Everything the page layout has that is not a control for one thing on the
   * bench: what you can add, what you have added, the arrow picker, and the
   * teaching panel. Each item is the step's own — built from what the step
   * has, so the menu can never offer a wall on a step that cannot draw one.
   */
  const f = actions.features || new Set();
  const drawing = state.ui.tool === 'wall';
  const menu = menuFor('menu', {
    label: '☰',
    title: 'Add something, take something away, or change what is drawn',
    align: 'right',
    items: [
      f.has('objects') ? {
        label: 'Add an object',
        note: 'Another one on the bench, beside what is already there',
        field: 'add:object',
        go: actions.addObject,
      } : null,
      f.has('obstacles') ? {
        label: drawing ? 'Stop drawing walls' : 'Draw a wall',
        note: drawing
          ? 'Back to tapping things to change them'
          : 'Then drag across the bench to lay one down',
        current: drawing,
        field: 'add:wall',
        go: actions.toggleWallTool,
      } : null,
      f.has('obstacles') ? {
        label: 'Add a box of walls',
        note: 'Four of them, around what is on the bench',
        field: 'add:box',
        go: actions.addBox,
      } : null,
      f.has('obstacles') ? {
        label: 'Add a cannon',
        note: 'Aim it, set the shot, and it fires on a timer',
        field: 'add:cannon',
        go: actions.addCannon,
      } : null,
      f.has('objects') ? {
        label: 'What is on the bench',
        note: 'Everything you have added, each with a way to take it off',
        field: 'open:objects',
        go: () => actions.openPanel('objects'),
      } : null,
      f.has('obstacles') ? {
        label: 'The walls',
        note: 'Each one, with a way to remove it',
        field: 'open:walls',
        go: () => actions.openPanel('walls'),
      } : null,
      f.has('obstacles') ? {
        label: 'The cannons',
        note: 'Each one, with a way to remove it',
        field: 'open:cannons',
        go: () => actions.openPanel('cannons'),
      } : null,
      {
        label: 'Arrows',
        note: 'Which forces and motions are drawn on the bench',
        field: 'open:arrows',
        go: () => actions.openPanel('arrows'),
      },
      {
        label: 'How this works',
        note: 'The idea, the formula, and that formula with your own numbers in it',
        field: 'open:explain',
        go: () => actions.openPanel('explain'),
      },
    ],
  });

  /*
   * The graphs, bottom left, above the transport's own row.
   *
   * One graph on screen at a time and the rest a tap away. Two graphs on a
   * phone are two unreadable graphs, and a drawer that shows all six at once
   * is the page layout again with extra steps.
   */
  const graphs = actions.graphs || [];
  const strip = state.ui.strip;
  const graphMenu = graphs.length ? menuFor('graphs', {
    label: '▦',
    title: strip
      ? 'A graph is on screen. Tap to swap it, or to put it away.'
      : 'Keep one graph on screen while you watch',
    align: 'right',
    items: [
      ...graphs.map((g) => ({
        label: g.label.split('—')[0].trim(),
        note: g.label.includes('—') ? g.label.split('—')[1].trim() : null,
        current: g.id === strip,
        field: `graph:${g.id}`,
        go: () => actions.showGraph(g.id === strip ? null : g.id),
      })),
      strip ? {
        label: 'Put it away',
        note: 'Give the height back to the bench',
        field: 'graph:none',
        go: () => actions.showGraph(null),
      } : null,
    ],
  }) : null;

  return [
    el('div', { class: 'stage-ui__cluster stage-ui__cluster--tl' }, [levels, steps]),
    el('div', { class: 'stage-ui__cluster stage-ui__cluster--tr' }, [menu, leave]),
    /*
     * Bottom right, not bottom left: the drawing prints its grid size in the
     * bottom-left corner, and the transport's Play button is below. The first
     * placement covered Play outright, so the bench could not be started.
     */
    graphMenu
      ? el('div', { class: 'stage-ui__cluster stage-ui__cluster--br' }, [graphMenu])
      : null,
  ].filter(Boolean);
}

/*
 * Which sheet is open, across rebuilds, and nothing else about it.
 *
 * Every edit inside the sheet re-renders the app, which rebuilds this overlay.
 * Without remembering, changing a mass would close the panel the mass was
 * changed in. The *contents* are rebuilt from live state every time, like the
 * sidebar's are; only the fact that it is open survives.
 */
let openSheet = null;

/**
 * The buttons beside the selected thing.
 *
 * **Beside it, never on it.** A control drawn on top of the object hides the
 * object it edits, under the reader's own thumb — and the thing you are about
 * to change is the thing you most need to watch.
 *
 * Built when the selection changes, not per frame: `paint` runs sixty times a
 * second and rebuilding a button that often means it cannot be pressed. Only
 * its `transform` is written per frame, by `placeSatellites`.
 */
function satellites(actions) {
  const arm = (dir, glyph, label, field, go, current = false) => el('button', {
    class: `satellite satellite--${dir}${current ? ' is-armed' : ''}`, type: 'button',
    'data-field': `satellite:${field}`,
    'aria-pressed': current ? 'true' : null,
    title: label, 'aria-label': label,
    on: { click: go },
  }, [
    el('span', { class: 'satellite__glyph', 'aria-hidden': 'true', text: glyph }),
    el('span', { class: 'satellite__label', text: label }),
  ]);

  /*
   * Move is a one-shot arm rather than a mode.
   *
   * A drag from a body throws it, because that is the gesture worth having and
   * the one every physics game has already taught people. Moving is the other
   * thing you might mean by the same drag, so it is asked for first — and it
   * disarms itself after one drag, because a mode you can forget you are in is
   * a mode that makes the next throw do nothing.
   */
  return el('div', { class: 'satellites', id: 'satellites', hidden: true }, [
    arm('up', '▲', 'Properties', 'object', () => actions.openSheet('object')),
    arm('right', '▶', 'Force', 'push', () => actions.openSheet('push')),
    arm(
      'left',
      '◀',
      actions.moveArmed ? 'Drag it' : 'Move',
      'move',
      actions.armMove,
      !!actions.moveArmed,
    ),
  ]);
}

/**
 * Move the cluster to a point, or hide it.
 *
 * Called from the paint loop, so it writes one style and reads nothing: a
 * measurement here would force the browser to finish laying the page out,
 * sixty times a second.
 *
 * @param {Node} host   the overlay
 * @param {{x:number,y:number}|null} at  overlay-relative pixels
 * @param {{w:number,h:number}} bounds   the overlay's own box, for clamping
 */
export function placeSatellites(host, at, bounds) {
  const node = host?.querySelector('.satellites');
  if (!node) return;
  if (!at) { node.hidden = true; return; }

  /*
   * Clamped inside the overlay, because an object at the edge of the bench —
   * or off it entirely, which happens the moment anything is thrown — would
   * otherwise take its buttons with it and leave nothing to press.
   */
  const pad = 56;
  const x = Math.min(Math.max(at.x, pad), Math.max(pad, (bounds?.w ?? 0) - pad));
  const y = Math.min(Math.max(at.y, pad), Math.max(pad, (bounds?.h ?? 0) - pad));
  node.hidden = false;
  node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/**
 * The panel of controls for whatever was tapped.
 *
 * A **non-modal** `<dialog>`: it sits in the top layer, so it escapes every
 * clipping context on the page without a z-index fight, but it does not put a
 * backdrop over the bench. That matters more than it sounds — the reason to
 * change a mass is to watch what the change does, and a modal would cover the
 * one thing worth looking at while doing it.
 *
 * @param {Node} host
 * @param {object} spec  `{ title, nodes, onClose }`
 */
function buildSheet(host, { title, nodes, onClose }) {
  const panel = el('dialog', { class: 'sheet', id: 'sheet' }, [
    el('div', { class: 'sheet__head' }, [
      el('h2', { class: 'sheet__title', text: title }),
      el('button', {
        class: 'sheet__close', type: 'button',
        'data-field': 'sheet:close', title: 'Done', 'aria-label': 'Done',
        on: { click: () => onClose() },
      }, '✕'),
    ]),
    el('div', { class: 'sheet__body' }, nodes),
  ]);
  host.appendChild(panel);
  // `show`, not `showModal`: no backdrop, and the bench stays live behind it.
  if (!panel.open) panel.show();
  return panel;
}

/** What is open, so the app can rebuild it after a state change. */
export const sheetOpen = () => openSheet;

/** Open, change or close the sheet. `null` closes it. */
export function setSheet(target) { openSheet = target; }

/** Replace the overlay's contents. A no-op when the host is not there. */
export function renderStageUI(host, spec) {
  if (!host) return;
  clear(host);
  for (const node of stageFurniture(spec)) host.appendChild(node);
  host.appendChild(satellites(spec.actions));
  if (openSheet && spec.sheet) {
    buildSheet(host, {
      title: spec.sheet.title,
      nodes: spec.sheet.nodes,
      onClose: () => spec.actions.closeSheet(),
    });
  }
}

/*
 * Light dismiss, the one thing `<details>` does not bring with it.
 *
 * Wired once, at the document, because the menus are rebuilt constantly and a
 * listener per menu would be a listener leak per render. `pointerdown` rather
 * than `click`, so the menu is gone before whatever was tapped reacts.
 */
document.addEventListener('pointerdown', (event) => {
  for (const open of document.querySelectorAll('.corner[open]')) {
    if (!open.contains(event.target)) {
      open.open = false;
      openMenu = null;
    }
  }
}, true);
