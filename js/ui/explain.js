/**
 * The "How this works" panel, and the model disclosure that sits beside it.
 *
 * Every tool carries both, and they answer different questions:
 *
 *   explain      how does this work? — the idea, the formula, and that formula
 *                worked through with the numbers currently on screen
 *   disclosure   what is this simulation actually doing? — the reality, the
 *                model, the assumptions and the approximations
 *
 * The second one is what stops the first from quietly lying. A worked example
 * of T = 2π√(L/g) is a fine thing to show and a bad thing to show *alone*,
 * because the equation is only true for small swings and nothing in the worked
 * example says so.
 *
 * Nothing here formats a number itself: everything arrives already rounded by
 * js/format.js, because a worked example reading `v = 19.6078431373 m/s` is
 * worse than no worked example at all.
 */

import { el, svg as svgEl } from './dom.js';
import { KIND_LABEL, KIND_MEANING } from '../models.js';

/**
 * @param {object} spec
 * @param {string} spec.title
 * @param {string|string[]} spec.plain   the idea, one or more paragraphs
 * @param {string} [spec.formula]        the general form
 * @param {string} [spec.validWhen]      the conditions it holds under
 * @param {string} [spec.worked]         the same thing with this screen's numbers
 * @param {string} [spec.becomes]        the wider statement this is a case of
 * @param {string|string[]} [spec.notes]
 */
/*
 * The triangle: A on top, B and C multiplying underneath.
 *
 * Laid out once here in a fixed 340×190 box and scaled by CSS, so the geometry
 * is arithmetic rather than guesswork and the labels cannot drift into the
 * lines at some other size. Names sit outside with a leader into the compartment
 * they belong to, as they do on every version of this diagram a reader will
 * have seen on a classroom wall.
 */
const TRI = {
  apexX: 170, apexY: 34, baseY: 150, halfBase: 66, dividerY: 92,
};

const part = (p, x, y, anchor) => [
  svgEl('text', {
    x, y, 'text-anchor': anchor, class: 'triangle__label',
  }, p.name),
  svgEl('text', {
    x, y: y + 13, 'text-anchor': anchor, class: 'triangle__unit',
  }, p.unit === 'none' ? 'no units' : `(${p.unit})`),
];

/** One equation as the triangle a reader can cover a corner of. */
export function equationTriangle(triangle) {
  const { apexX, apexY, baseY, halfBase, dividerY } = TRI;
  const left = apexX - halfBase;
  const right = apexX + halfBase;
  // Where the divider meets the two sloping sides.
  const inset = halfBase * ((dividerY - apexY) / (baseY - apexY));

  return svgEl('svg', {
    class: 'triangle',
    viewBox: '0 0 340 190',
    role: 'img',
    'aria-label': `${triangle.top.symbol} equals ${triangle.left.symbol} times ${triangle.right.symbol}`,
  }, [
    svgEl('path', {
      d: `M ${apexX} ${apexY} L ${right} ${baseY} L ${left} ${baseY} Z`,
      class: 'triangle__outline',
    }),
    svgEl('line', {
      x1: apexX - inset, y1: dividerY, x2: apexX + inset, y2: dividerY,
      class: 'triangle__divider',
    }),
    svgEl('text', { x: apexX, y: dividerY - 14, 'text-anchor': 'middle', class: 'triangle__symbol' },
      triangle.top.symbol),
    svgEl('text', { x: apexX - 30, y: baseY - 22, 'text-anchor': 'middle', class: 'triangle__symbol' },
      triangle.left.symbol),
    svgEl('text', { x: apexX, y: baseY - 22, 'text-anchor': 'middle', class: 'triangle__times' }, '×'),
    svgEl('text', { x: apexX + 30, y: baseY - 22, 'text-anchor': 'middle', class: 'triangle__symbol' },
      triangle.right.symbol),

    // Leaders, and the names they lead to.
    svgEl('line', { x1: 96, y1: 56, x2: apexX - 14, y2: dividerY - 26, class: 'triangle__leader' }),
    ...part(triangle.top, 92, 52, 'end'),
    svgEl('line', { x1: 96, y1: 132, x2: apexX - 46, y2: baseY - 26, class: 'triangle__leader' }),
    ...part(triangle.left, 92, 128, 'end'),
    svgEl('line', { x1: 244, y1: 132, x2: apexX + 46, y2: baseY - 26, class: 'triangle__leader' }),
    ...part(triangle.right, 248, 128, 'start'),
  ]);
}

export function explain({
  title, plain, formula, validWhen, worked, becomes, notes, body, open = false,
}) {
  const paragraphs = (value) => (Array.isArray(value) ? value : [value]).filter(Boolean);

  return el('details', { class: 'explain', open: open || null }, [
    el('summary', { text: title }),
    el('div', { class: 'explain__body' }, [
      ...paragraphs(plain).map((text) => el('p', { text })),

      /*
       * Nodes rather than text, for a panel whose content is a drawing.
       *
       * Everything else here is prose the panel formats. The equation list is a
       * figure per equation and could not be expressed as a string, so it comes
       * in already built — and it sits above the formula slot rather than
       * replacing it, because a panel can legitimately want both.
       */
      ...(Array.isArray(body) ? body : [body]).filter(Boolean),

      formula ? el('p', { class: 'explain__caption', text: 'The formula' }) : null,
      formula ? el('pre', { class: 'explain__formula', text: formula }) : null,

      // The domain of validity sits immediately under the formula, not in a
      // footnote. An equation without its conditions is a magic rule.
      validWhen ? el('p', { class: 'explain__valid' }, [
        el('b', { text: 'Holds when: ' }), validWhen,
      ]) : null,

      worked ? el('p', { class: 'explain__caption', text: 'With the values on screen' }) : null,
      worked ? el('pre', { class: 'explain__worked', text: worked }) : null,

      becomes ? el('p', { class: 'explain__caption', text: 'The wider picture' }) : null,
      becomes ? el('p', { class: 'muted', text: becomes }) : null,

      ...paragraphs(notes).map((text) => el('p', { class: 'muted', text })),
    ]),
  ]);
}

/** A stack of panels, the first one open. */
export const explainStack = (specs) =>
  specs.filter(Boolean).map((spec, i) => explain({ ...spec, open: spec.open ?? i === 0 }));

/**
 * An equation from `js/models.js`, rendered with everything it carries.
 *
 * Going through the registry rather than writing the text at the call site is
 * what guarantees that F = ma is never shown without the note that it is the
 * constant-mass case of F = dp/dt — wherever in the app it turns up.
 */
export const equationPanel = (equation, worked = null, open = false) => explain({
  title: equation.name,
  plain: [equation.plain, equation.misreads || null].filter(Boolean),
  formula: equation.formula,
  validWhen: equation.validWhen,
  worked,
  becomes: equation.general ? `${equation.general}\n\n${equation.becomes}` : equation.becomes,
  open,
});

/* ------------------------------------------------------- the disclosure -- */

/**
 * What the simulation is actually doing, in the four kinds it must keep apart.
 *
 * This panel is the app's central promise made visible. It is not decoration
 * and it is not optional: the whole point is that a learner can always find out
 * which parts of what they are watching are physics and which are the
 * simplifications that made it watchable.
 */
export function disclosurePanel(disclosure, { open = false } = {}) {
  const items = (list) => list.map((item) => el('div', { class: 'kind__item' }, [
    el('div', { class: 'kind__name', text: item.label }),
    el('p', { class: 'kind__text', text: item.statement }),
    el('p', { class: 'kind__if' }, [el('b', { text: 'Why: ' }), item.why]),
    el('p', { class: 'kind__if' }, [el('b', { text: 'Without it: ' }), item.ifRemoved]),
  ]));

  const group = (kind, list) => (list.length ? el('div', { class: `kind kind--${kind}` }, [
    el('div', { class: 'kind__label', title: KIND_MEANING[kind], text: KIND_LABEL[kind] }),
    ...items(list),
  ]) : null);

  return el('details', { class: 'disclosure', open: open || null }, [
    el('summary', {}, [
      'What this simulation is doing',
      el('span', { class: 'disclosure__summary', text: disclosure.summary }),
    ]),
    el('div', { class: 'disclosure__body' }, [
      // An approximation that is switched on is a banner, not a footnote.
      disclosure.hasApproximations
        ? el('div', { class: 'approx-flag' }, [
          el('span', { text: '≈' }),
          el('span', {
            text: `An approximation is switched on: ${disclosure.approximations.map((a) => a.label).join(', ')}. `
              + 'The physics is unchanged — only the arithmetic has been simplified.',
          }),
        ])
        : null,

      el('div', { class: 'kind kind--reality' }, [
        el('div', { class: 'kind__label', title: KIND_MEANING.reality, text: KIND_LABEL.reality }),
        el('p', { class: 'kind__text', text: disclosure.reality }),
      ]),

      group('model', disclosure.models),
      group('assumption', disclosure.assumptions),
      group('approximation', disclosure.approximations),

      disclosure.numbers.length ? el('div', { class: 'numbers' }, disclosure.numbers.map((n) => el('div', { class: 'numbers__row' }, [
        el('div', { class: 'numbers__head' }, [
          el('span', { class: 'numbers__label', text: n.label }),
          el('span', { class: 'numbers__value', text: n.value }),
        ]),
        n.note ? el('div', { class: 'numbers__note', text: n.note }) : null,
      ]))) : null,
    ]),
  ]);
}

/**
 * The question that opens a lab, and the misconception it is built to correct.
 *
 * The question comes first and the explanation second, on purpose: a learner
 * who reads the answer before touching anything has no reason to experiment.
 * In Play mode only the question shows.
 */
export function promptPanel(concept, { mode = 'learn' } = {}) {
  if (!concept) return null;

  return el('div', { class: 'prompt' }, [
    el('p', { class: 'prompt__meta', text: concept.label }),
    el('p', { class: 'prompt__ask', text: concept.ask }),

    mode === 'play' ? null : el('p', { class: 'prompt__body', text: concept.discover }),

    mode === 'play' ? null : el('dl', { class: 'misconception' }, [
      el('dt', { text: 'What most people expect' }),
      el('dd', { text: concept.misconception.belief }),
      el('dt', { text: 'Why that is a reasonable thing to think' }),
      el('dd', { text: concept.misconception.why }),
      el('dt', { text: 'What actually happens' }),
      el('dd', { text: concept.misconception.actually }),
    ]),
  ]);
}
