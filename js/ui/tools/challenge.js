/**
 * Challenge mode: predict first, then run.
 *
 * The Run button is deliberately not the first thing on the panel. A learner
 * who adjusts a slider until the target lights up has understood nothing; a
 * learner who writes down a number first and then finds out has understood
 * whether their model of the situation works.
 *
 * The verdict never says "wrong". It says what was predicted, what happened,
 * and which relationship accounts for the gap.
 */

import { el, svg } from '../dom.js';
import { section, stat, banner, button, chipField } from '../widgets.js';
import { explain } from '../explain.js';
import { CHALLENGES, challengeById, evaluate } from '../../challenges.js';
import { conceptById } from '../../lessons.js';
import { fmtFixed } from '../../format.js';

export const meta = {
  id: 'challenge',
  label: 'Challenges',
  short: 'Try it',
  concept: null,
  world: false,
  title: 'A problem, a prediction, and an honest comparison',
};

export function createSim() {
  return { t: 0, advance: () => {} };
}

export function controls(ctx) {
  const { params, set, update } = ctx;
  const challenge = challengeById(params.id) || CHALLENGES[0];

  return [
    section('Pick a challenge', [
      chipField('Challenge', CHALLENGES.map((c) => ({ value: c.id, label: c.title, title: c.brief })), params.id, (v) => set('id', v)),
    ], { key: 'pick' }),

    section('Your prediction', [
      el('p', { class: 'field__hint', text: challenge.predict.label }),
      el('div', { class: 'challenge__predict' }, [
        el('input', {
          class: 'input',
          type: 'text',
          inputmode: 'decimal',
          placeholder: challenge.predict.unit ? `number in ${challenge.predict.unit}` : 'your number',
          value: params.prediction || '',
          'data-field': 'prediction',
          autocomplete: 'off',
          on: {
            change: (event) => set('prediction', event.target.value.slice(0, 32)),
            blur: (event) => set('prediction', event.target.value.slice(0, 32)),
          },
        }),
      ]),
      el('p', {
        class: 'field__hint',
        text: 'Write a number down before you go and try it. Being wrong on '
          + 'purpose, then finding out why, is worth more than getting it right by '
          + 'nudging a slider.',
      }),
      el('div', { class: 'btn-row' }, [
        button(`Go to the ${challenge.tool} lab`, () => update((draft) => { draft.tool = challenge.tool; }), {
          primary: true,
          title: 'Set the experiment up there, then come back',
        }),
        params.prediction
          ? button('Clear prediction', () => set('prediction', ''), { small: true })
          : null,
      ].filter(Boolean)),
    ], { key: 'predict' }),

    section('A hint, if you want one', [
      el('p', { class: 'field__hint', text: challenge.hint }),
    ], { key: 'hint', open: false }),
  ];
}

/* -------------------------------------------------------------- stage --- */

export function stage(ctx) {
  const challenge = challengeById(ctx.params.id) || CHALLENGES[0];
  const concept = conceptById(challenge.concept);

  // A brief rather than a simulation: the experiment itself lives in the lab
  // the challenge points at, which is where the controls for it already are.
  const root = svg('svg', { viewBox: '0 0 880 300', role: 'img', 'aria-label': challenge.title });

  root.appendChild(svg('rect', {
    x: 20, y: 20, width: 840, height: 260, rx: 14,
    fill: 'var(--accent-soft)', stroke: 'var(--accent)', 'stroke-width': 2,
  }));

  root.appendChild(svg('text', {
    x: 48, y: 68, fill: 'var(--text)', 'font-size': 22, 'font-weight': 700,
  }, challenge.title));

  wrap(challenge.brief, 74).forEach((line, i) => {
    root.appendChild(svg('text', {
      x: 48, y: 104 + i * 24, fill: 'var(--text-dim)', 'font-size': 15,
    }, line));
  });

  root.appendChild(svg('text', {
    x: 48, y: 236, fill: 'var(--accent-strong)', 'font-size': 14, 'font-weight': 600,
  }, challenge.predict.label));

  if (concept) {
    root.appendChild(svg('text', {
      x: 48, y: 260, fill: 'var(--text-faint)', 'font-size': 12,
    }, `Builds on: ${concept.label}`));
  }

  return root;
}

/** Break a sentence into lines that fit, since SVG text does not wrap. */
function wrap(text, chars) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((`${line} ${word}`).trim().length > chars) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 5);
}

/* ------------------------------------------------------------ readouts -- */

export function readouts(ctx) {
  const { params, state } = ctx;
  const challenge = challengeById(params.id) || CHALLENGES[0];
  const labParams = state.tools[challenge.tool] || {};
  const verdict = evaluate(challenge.id, {
    result: {},
    params: labParams,
    prediction: params.prediction,
  });

  return [
    stat('Your prediction', params.prediction ? `${params.prediction} ${challenge.predict.unit}` : '—', {
      note: params.prediction ? '' : 'Write one down first',
    }),
    stat('The answer', verdict.prediction.graded ? `${fmtFixed(verdict.prediction.actual, 2)} ${challenge.predict.unit}` : '—', {
      accent: true,
      note: verdict.prediction.graded ? 'Worked out from the physics' : 'Enter a prediction to compare',
    }),
    stat('How close', verdict.prediction.graded ? `${fmtFixed(Math.abs(verdict.prediction.percent), 1)}%` : '—', {
      swatch: verdict.prediction.close ? '--vec-velocity' : '--force-net',
      note: verdict.prediction.graded ? (verdict.prediction.close ? 'Within tolerance' : 'Worth chasing down') : '',
    }),
    stat('The lab to use', challenge.tool, { note: 'Set it up there, then come back' }),
  ];
}

export function banners(ctx) {
  const { params, state } = ctx;
  const challenge = challengeById(params.id) || CHALLENGES[0];
  const verdict = evaluate(challenge.id, {
    result: {},
    params: state.tools[challenge.tool] || {},
    prediction: params.prediction,
  });

  const out = [banner(verdict.prediction.graded ? (verdict.prediction.close ? 'ok' : 'warn') : 'info',
    verdict.prediction.text)];

  if (verdict.prediction.graded) {
    out.push(banner('info', verdict.explanation));
  }

  return out;
}

export function explains(ctx) {
  const { params, state } = ctx;
  const challenge = challengeById(params.id) || CHALLENGES[0];
  const concept = conceptById(challenge.concept);
  const verdict = evaluate(challenge.id, {
    result: {},
    params: state.tools[challenge.tool] || {},
    prediction: params.prediction,
  });

  return [
    explain({
      title: 'Why the prediction comes first',
      plain: [
        'A simulation you can adjust until it works is a puzzle, not an '
        + 'experiment. The value is in committing to an answer while you still '
        + 'might be wrong, because that is the only way to find out whether your '
        + 'picture of the situation was right or whether you were pattern-matching.',
        'Being a long way out is genuinely useful information — it points at '
        + 'exactly which relationship you had backwards. The app will never tell '
        + 'you that you failed; it will tell you the size of the gap and what '
        + 'accounts for it.',
      ],
      open: true,
    }),

    verdict.prediction.graded ? explain({
      title: 'The answer, worked through',
      plain: verdict.explanation,
    }) : null,

    concept ? explain({
      title: `The idea this rests on: ${concept.label}`,
      plain: [concept.discover, concept.misconception.actually],
    }) : null,
  ].filter(Boolean);
}
