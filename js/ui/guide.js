/**
 * "How to use", and the welcome that runs once.
 *
 * The target is an app nobody has to ask about: a stranger opens it, and
 * without anyone to ask reaches a first real result. Two surfaces do that work
 * — a welcome on the very first open that names three or four things to *do*,
 * and this page, which is where anyone who gets stuck later goes.
 *
 * One search box over all of it. A reader does not know the app's words, so
 * the matching runs against each entry's text plus the everyday phrases that
 * mean the same thing (`js/guide.js`) — and every typed word has to appear, so
 * typing more narrows rather than widens.
 */

import { el, clear } from './dom.js';
import { button } from './widgets.js';
import {
  HOWTOS, FAQS, CONCEPTS, FEATURES, WELCOME,
  guideMatches, howtoText, faqText, featureText, categories,
} from '../guide.js';

/** A heading and a line saying what the block below it is for. */
const block = (title, note, kids) => el('section', { class: 'guide__block' }, [
  el('h3', { class: 'guide__heading', text: title }),
  note ? el('p', { class: 'guide__note', text: note }) : null,
  ...kids,
]);

const tile = (name, what, where = null) => el('div', { class: 'guide__tile' }, [
  el('div', { class: 'guide__tile-name', text: name }),
  where ? el('div', { class: 'guide__tile-where', text: where }) : null,
  el('p', { class: 'guide__tile-what', text: what }),
]);

export function guidePage(actions) {
  /*
   * The search rebuilds only the results, not the page.
   *
   * Rebuilding the page would replace the box being typed in, which is the
   * same bug as a slider that commits on `input` — so the input is created
   * once and the three result regions are refilled under it.
   */
  const results = {
    howtos: el('div', { class: 'guide__howtos' }),
    faqs: el('div', { class: 'guide__faqs' }),
    features: el('div', { class: 'guide__grid' }),
  };
  const counts = el('p', { class: 'guide__count' });

  const search = el('input', {
    class: 'input guide__search',
    type: 'search',
    placeholder: 'Search in your own words — "make it fall", "slow motion", "how heavy"',
    'aria-label': 'Search the guide',
    'data-field': 'guide:search',
    autocomplete: 'off',
  });

  const picker = el('select', { class: 'select', 'data-field': 'guide:howto', 'aria-label': 'Choose a task' });
  const steps = el('ol', { class: 'guide__steps' });

  /** Fill the task picker with whatever the search left, and show the first. */
  function fillHowtos(matching) {
    clear(picker);
    clear(steps);

    if (!matching.length) {
      picker.appendChild(el('option', { text: 'Nothing matches that' }));
      picker.disabled = true;
      steps.appendChild(el('li', { class: 'muted', text: 'Try fewer words.' }));
      return;
    }

    picker.disabled = false;
    for (const category of categories()) {
      const inThis = matching.filter((h) => h.category === category);
      if (!inThis.length) continue;
      for (const h of inThis) {
        picker.appendChild(el('option', { value: h.id, text: `${category} — ${h.title}` }));
      }
    }
    showSteps(matching[0]);
  }

  function showSteps(howto) {
    clear(steps);
    for (const line of howto.steps) steps.appendChild(el('li', { text: line }));
  }

  picker.addEventListener('change', () => {
    const chosen = HOWTOS.find((h) => h.id === picker.value);
    if (chosen) showSteps(chosen);
  });

  function apply() {
    const q = search.value;

    const howtos = HOWTOS.filter((h) => guideMatches(howtoText(h), q));
    fillHowtos(howtos);

    const faqs = FAQS.filter((f) => guideMatches(faqText(f), q));
    clear(results.faqs);
    if (!faqs.length) {
      results.faqs.appendChild(el('p', { class: 'muted', text: 'No questions match that.' }));
    }
    for (const f of faqs) {
      results.faqs.appendChild(el('div', { class: 'faq' }, [
        el('div', { class: 'faq__q', text: f.q }),
        el('p', { class: 'faq__a', text: f.a }),
      ]));
    }

    const features = FEATURES.filter((f) => guideMatches(featureText(f), q));
    clear(results.features);
    for (const f of features) results.features.appendChild(tile(f.name, f.what, f.where));

    counts.textContent = q.trim()
      ? `${howtos.length} task${howtos.length === 1 ? '' : 's'}, ${faqs.length} question${faqs.length === 1 ? '' : 's'}`
        + ` and ${features.length} feature${features.length === 1 ? '' : 's'} match "${q.trim()}".`
      : '';
  }

  // `input`, not `change`: a search box is the one control where reacting to
  // every keystroke is the whole point, and nothing here is being replaced.
  search.addEventListener('input', apply);
  apply();

  return el('section', { class: 'guide' }, [
    el('div', { class: 'prompt' }, [
      el('p', { class: 'prompt__meta', text: 'How to use' }),
      el('p', { class: 'prompt__ask', text: 'Everything this bench can do, and how to get at it.' }),
      el('div', { class: 'prompt__nav' }, [
        button('← Back to the bench', () => actions.showBench(), { small: true }),
        button('Show me around again', () => actions.showWelcome(), {
          small: true,
          title: 'Reopen the welcome you saw the first time',
        }),
      ]),
    ]),

    el('div', { class: 'guide__searchbar' }, [search, counts]),

    block('How do I…', 'Pick a task. The steps name the control, so there is nothing to work out.',
      [picker, steps]),

    block('Questions', null, [results.faqs]),

    block('Worth knowing', 'The things you would not find from a label.', [results.features]),

    block('The ideas behind it', 'Five things that make the rest of the app obvious.',
      [el('div', { class: 'guide__grid' }, CONCEPTS.map((c) => tile(c.name, c.what)))]),

  ].filter(Boolean));
}

/**
 * Things to find, as a page of its own.
 *
 * It was a section at the foot of the guide, which is the wrong place twice
 * over: somebody who has just found one arrives from the card that told them
 * and should not have to scroll past the FAQs, and somebody browsing for what
 * is left is not looking for help. It is its own thing, so it gets its own
 * tab.
 */
export function achievementsPage(actions, held, groupsOf, all) {
  return el('section', { class: 'guide' }, [
    el('div', { class: 'prompt' }, [
      el('p', { class: 'prompt__meta', text: 'Things to find' }),
      el('p', {
        class: 'prompt__ask',
        text: 'Everything this bench does that you would never find from a label.',
      }),
      el('div', { class: 'prompt__nav' }, [
        button('\u2190 Back to the bench', () => actions.showBench(), { small: true }),
        button('How to use', () => actions.showGuide(), { small: true }),
      ]),
    ]),

    el('p', { class: 'guide__note' }, [
      'Each one fires once, at the moment you do the thing, and says what you just '
      + 'found. Nothing is locked behind them, nothing is scored, and there is nobody '
      + 'to compete with \u2014 they are a way of being told what a thing is for while it is '
      + 'still in front of you. Anything not yet found shows a hint instead.',
    ]),

    achievementsPanel(held, groupsOf, all),
  ]);
}

/* ------------------------------------------------------------ welcome -- */

/**
 * The first open.
 *
 * Not a wall of text: three or four things to *do*, each one click from where
 * it happens. It appears once — a stored timestamp, not a session flag — and
 * is reachable forever after from the guide, because the welcome and the guide
 * are the same content at two different moments.
 *
 * There is already a worked example on the bench behind it, so step one is a
 * real try on a populated screen rather than a blank form.
 */
export function welcomeOverlay(actions) {
  const close = () => actions.dismiss();

  const card = el('div', {
    class: 'welcome__card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome',
  }, [
    el('h2', { class: 'welcome__title', text: 'This is a bench, not a calculator' }),
    el('p', { class: 'welcome__lede' }, [
      'Change something, watch what happens, measure it — then read the equation '
      + 'that describes what you just saw. Seven steps, each adding one thing to '
      + 'the same object. Nothing resets.',
    ]),

    el('ol', { class: 'welcome__steps' }, WELCOME.map((item) => el('li', { class: 'welcome__step' }, [
      el('div', { class: 'welcome__step-title', text: item.title }),
      el('p', { class: 'welcome__step-what', text: item.what }),
      button(item.label, () => actions.go(item.go), { small: true }),
    ]))),

    el('div', { class: 'welcome__foot' }, [
      el('p', {
        class: 'muted',
        text: 'You can reopen this from "How to use" at any time.',
      }),
      button('Start exploring', close, { primary: true }),
    ]),
  ]);

  /*
   * Click the backdrop to dismiss, but only the backdrop. Without the target
   * check, any click that started inside the card and drifted out closes it.
   */
  const back = el('div', { class: 'welcome' }, card);
  back.addEventListener('click', (event) => { if (event.target === back) close(); });
  back.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  return back;
}

/* --------------------------------------------------------------- panels -- */

/**
 * One of the three footer panels, as a dismissible card.
 *
 * The same backdrop and the same card as the welcome, because they are the
 * same kind of thing: a short read that stops the reader doing what they were
 * doing, and gets out of the way on a click, a backdrop press or Escape.
 *
 * Each panel is `{ title, body: [[heading, text], ...] }` from `js/guide.js`.
 * Nothing here composes prose — it renders what the data says, so the wording
 * lives in one place and can be read without opening the app.
 */
export function panelOverlay(panel, onClose) {
  const close = () => { back.remove(); onClose?.(); };

  const card = el('div', {
    class: 'welcome__card', role: 'dialog', 'aria-modal': 'true', 'aria-label': panel.title,
    tabindex: '-1',
  }, [
    el('div', { class: 'panel__head' }, [
      el('h2', { class: 'welcome__title', text: panel.title }),
      el('button', {
        class: 'btn btn--icon', type: 'button', 'aria-label': 'Close', title: 'Close',
        on: { click: close },
      }, el('span', { class: 'btn__glyph', 'aria-hidden': 'true', text: '×' })),
    ]),

    ...panel.body.map(([heading, text]) => el('div', { class: 'panel__item' }, [
      el('div', { class: 'panel__item-title', text: heading }),
      el('p', { class: 'panel__item-text', text }),
    ])),

    el('div', { class: 'welcome__foot' }, [
      el('p', { class: 'muted', text: panel.version ? `Version ${panel.version}` : '' }),
      button('Close', close, { primary: true }),
    ]),
  ]);

  const back = el('div', { class: 'welcome' }, card);
  back.addEventListener('click', (event) => { if (event.target === back) close(); });
  back.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  return back;
}

/* --------------------------------------------------- what you have found -- */

/**
 * The card that says you just found something.
 *
 * It sits where a toast sits and behaves like one, but it stays four times as
 * long, because the point is not the badge — it is the sentence under it, and
 * a sentence nobody had time to read is a sentence that was not written.
 *
 * Clicking it opens the full list; clicking the × dismisses it.
 */
export function achievementToast(achievement, { onOpen, onClose }) {
  const card = el('div', {
    class: 'unlock', role: 'status',
  }, [
    el('button', {
      class: 'unlock__body', type: 'button',
      title: 'See everything there is to find',
      on: { click: () => { card.remove(); onOpen?.(); } },
    }, [
      el('div', { class: 'unlock__eyebrow', text: 'Found something' }),
      el('div', { class: 'unlock__name', text: achievement.name }),
      el('p', { class: 'unlock__what', text: achievement.what }),
    ]),
    el('button', {
      class: 'unlock__close', type: 'button', 'aria-label': 'Dismiss', title: 'Dismiss',
      on: { click: () => { card.remove(); onClose?.(); } },
    }, el('span', { 'aria-hidden': 'true', text: '\u00d7' })),
  ]);
  return card;
}

/**
 * Everything there is to find, held and unheld.
 *
 * Locked ones show their hint rather than their name, because the name gives
 * the discovery away and the hint is the invitation. Nothing here is a spoiler
 * and nothing is a chore: the list exists so somebody who has stopped finding
 * things has somewhere to look for what is left.
 */
export function achievementsPanel(held, groupsOf, all) {
  const earned = all.filter((a) => held[a.id]).length;

  return el('section', { class: 'found' }, [
    el('p', {
      class: 'found__count',
      text: `${earned} of ${all.length} found`,
    }),
    el('div', {
      class: 'found__bar', role: 'img',
      'aria-label': `${earned} of ${all.length} found`,
    }, el('div', {
      class: 'found__bar-fill',
      style: { width: `${Math.round((earned / all.length) * 100)}%` },
    })),

    ...groupsOf().map((group) => el('div', { class: 'found__group' }, [
      el('h3', { class: 'guide__heading', text: group }),
      el('div', { class: 'found__grid' }, all.filter((a) => a.group === group).map((a) => {
        const got = !!held[a.id];
        return el('div', { class: `found__item${got ? ' is-found' : ''}` }, [
          el('div', { class: 'found__name', text: got ? a.name : 'Not found yet' }),
          el('p', { class: 'found__text', text: got ? a.what : a.hint }),
        ]);
      })),
    ])),
  ]);
}
