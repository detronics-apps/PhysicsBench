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

function menu(name, { label, title, items, align = 'left' }) {
  const host = el('details', {
    class: `corner corner--${align}`,
    'data-menu': name,
    open: openMenu === name ? '' : null,
  });

  host.appendChild(el('summary', {
    class: 'corner__btn', title, 'aria-label': title, 'data-field': `corner:${name}`,
  }, label));

  const list = el('div', { class: 'corner__menu', role: 'menu' });
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

  const levels = menu('level', {
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

  const steps = menu('step', {
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

  return [
    el('div', { class: 'stage-ui__cluster stage-ui__cluster--tl' }, [levels, steps]),
    el('div', { class: 'stage-ui__cluster stage-ui__cluster--tr' }, [leave]),
  ];
}

/** Replace the overlay's contents. A no-op when the host is not there. */
export function renderStageUI(host, spec) {
  if (!host) return;
  clear(host);
  for (const node of stageFurniture(spec)) host.appendChild(node);
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
