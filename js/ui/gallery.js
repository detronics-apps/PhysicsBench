/**
 * The shelf of prepared experiments.
 *
 * A card per example: a still of the scene as it will look when it loads, its
 * name, one line on what it shows, and a button. The still is drawn from the
 * example's own state through the ordinary renderer rather than stored as an
 * image — so it cannot drift out of date, it costs nothing to keep, and when
 * the drawing improves every card improves with it.
 *
 * The stills are deliberately quiet: no values, no trails, no playhead. A card
 * is a picture of an experiment, not a small copy of it running.
 */

import { el } from './dom.js';
import { button } from './widgets.js';
import { EXAMPLES, exampleState } from '../examples.js';
import { build } from '../stages.js';
import { renderScene } from './scene-svg.js';
import { stageById, stageIndex } from '../stages.js';

/** A still of an example, as it will be the moment it loads. */
function still(example) {
  try {
    const state = exampleState(example.id);
    const scenario = build(state.stage, state.bench);
    return renderScene(scenario.world, {
      vectors: state.vectors,
      view: { ...state.view, showValues: false, showTrail: false, showGrid: true },
      selectedId: state.selectedId,
    });
  } catch {
    /*
     * A card that cannot draw itself is still a card.
     *
     * The tests will not let a broken example reach anybody, but a gallery that
     * throws takes the whole page down with it — and losing nine working
     * experiments because the tenth has a typo is the wrong trade.
     */
    return el('div', { class: 'gallery__missing', text: 'No preview' });
  }
}

export function galleryPage(actions) {
  const cards = EXAMPLES.map((example) => {
    const stage = stageById(example.stage);
    return el('article', { class: 'gallery__card' }, [
      el('div', { class: 'gallery__still' }, still(example)),
      el('div', { class: 'gallery__text' }, [
        el('h3', { class: 'gallery__name', text: example.title }),
        el('p', { class: 'gallery__blurb', text: example.blurb }),
        el('p', {
          class: 'gallery__where',
          text: `Step ${stageIndex(example.stage) + 1} · ${stage.label}`,
        }),
      ]),
      el('div', { class: 'gallery__go' }, [
        button('Load this', () => actions.loadExample(example.id), {
          primary: true,
          title: `Put "${example.title}" on the bench`,
        }),
      ]),
    ]);
  });

  return el('section', { class: 'gallery' }, [
    el('div', { class: 'prompt' }, [
      el('p', { class: 'prompt__meta', text: 'Prepared experiments' }),
      el('p', {
        class: 'prompt__ask',
        text: 'Things worth watching, already set up.',
      }),
      el('div', { class: 'prompt__nav' }, [
        button('← Back to the bench', () => actions.showBench(), { small: true }),
      ]),
    ]),
    el('p', { class: 'gallery__note' }, [
      'Each one loads paused, with the arrows that matter to it already chosen '
      + 'and a note explaining what to do and what to look for. Nothing is '
      + 'locked: once it is on the bench it is an ordinary experiment and every '
      + 'control still works.',
    ]),
    cards.length
      ? el('div', { class: 'gallery__grid' }, cards)
      : el('p', { class: 'gallery__note', text: 'No prepared experiments yet.' }),
  ]);
}
