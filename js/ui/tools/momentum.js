/**
 * Momentum, before anything collides.
 *
 * The carts pass each other rather than hitting, on purpose: the point here is
 * that momentum is a quantity an object *has*, with a size and a direction, and
 * that very different objects can carry the same amount of it. Collisions are
 * the next lab, and mixing them in muddles both.
 */

import { el } from '../dom.js';
import { section, numberField, sliderField, stat, banner, table } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { viewSection, compareSection, presets } from './common.js';
import { equation } from '../../models.js';
import { inspect, totals } from '../../world.js';
import { momentum1D, sameMomentum, stoppingForce, relativisticCorrection } from '../../momentum.js';
import { kinetic } from '../../energy.js';
import { fmtFixed } from '../../format.js';

export const meta = {
  id: 'momentum',
  label: 'Momentum',
  short: 'Momentum',
  concept: 'momentum',
  world: true,
  title: 'Mass and velocity together, with a direction',
};

export const channels = [
  { label: 'Total momentum of the system', ids: ['sys-p'] },
  { label: 'Total kinetic energy', ids: ['sys-ke'] },
];

const PRESETS = [
  { id: 'equal-p', label: 'Same momentum, different everything', title: '2 kg at 6 m/s and 12 kg at 1 m/s', params: { m1: 2, v1: 6, m2: 12, v2: 1, x1: -6, x2: -2 } },
  { id: 'cancel', label: 'Total momentum of zero', title: 'Equal and opposite — and zero is a real value', params: { m1: 4, v1: 5, m2: 4, v2: -5, x1: -6, x2: 6 } },
  { id: 'lorry', label: 'Lorry and bicycle', title: 'Slow and heavy against fast and light', params: { m1: 80, v1: 0.5, m2: 4, v2: 10, x1: -8, x2: -2 } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  return [
    section('Object A', [
      presets(PRESETS, ctx),
      numberField('Mass', params.m1, (v) => set('m1', v), { unit: 'kg', min: 0.1, max: 500, step: 0.5, key: 'm1' }),
      sliderField('Velocity', params.v1, (v) => set('v1', v), {
        min: -20, max: 20, step: 0.5, key: 'v1', format: (v) => `${fmtFixed(v, 1)} m/s`,
      }),
    ], { key: 'a' }),

    section('Object B', [
      numberField('Mass', params.m2, (v) => set('m2', v), { unit: 'kg', min: 0.1, max: 500, step: 0.5, key: 'm2' }),
      sliderField('Velocity', params.v2, (v) => set('v2', v), {
        min: -20, max: 20, step: 0.5, key: 'v2', format: (v) => `${fmtFixed(v, 1)} m/s`,
      }),
      el('div', {
        class: 'field__hint',
        text: 'Try to give B the same momentum as A using a different mass. There '
          + 'is exactly one velocity that does it, and it is not the same as A\'s.',
      }),
    ], { key: 'b' }),

    compareSection(ctx),
    viewSection(ctx),
  ];
}

export function readouts(ctx) {
  const { params } = ctx;
  const a = inspect(ctx.world, 'a');
  const b = inspect(ctx.world, 'b');
  if (!a || !b) return [];
  const sums = totals(ctx.world);

  return [
    stat('Momentum of A', `${fmtFixed(a.momentum.x, 2)} kg·m/s`, {
      swatch: '--vec-momentum',
      sub: `${fmtFixed(params.m1, 1)} kg × ${fmtFixed(a.vel.x, 2)} m/s`,
    }),
    stat('Momentum of B', `${fmtFixed(b.momentum.x, 2)} kg·m/s`, {
      swatch: '--vec-momentum',
      sub: `${fmtFixed(params.m2, 1)} kg × ${fmtFixed(b.vel.x, 2)} m/s`,
    }),
    stat('Total momentum', `${fmtFixed(sums.momentumX, 2)} kg·m/s`, {
      accent: true,
      note: 'A vector sum: opposite directions subtract',
    }),
    stat('Total kinetic energy', `${fmtFixed(sums.kinetic, 2)} J`, {
      swatch: '--vec-velocity',
      note: 'No direction, so these always add',
    }),
  ];
}

export function banners(ctx) {
  const { params } = ctx;
  const out = [];
  const pA = momentum1D(params.m1, params.v1);
  const pB = momentum1D(params.m2, params.v2);

  if (sameMomentum({ mass: params.m1, v: params.v1 }, { mass: params.m2, v: params.v2 }, 0.05)) {
    out.push(banner('ok',
      `Both objects are carrying ${fmtFixed(pA, 2)} kg·m/s, from completely different `
      + `masses and speeds. Their kinetic energies are not equal though — `
      + `${fmtFixed(kinetic(params.m1, params.v1), 1)} J against `
      + `${fmtFixed(kinetic(params.m2, params.v2), 1)} J. Momentum goes as v; energy goes as v².`));
  }

  if (Math.abs(pA + pB) < 0.05 && Math.abs(pA) > 0.05) {
    out.push(banner('info',
      'The total momentum of the system is zero. That is not "no momentum" — each '
      + 'object has plenty. It is two vectors of equal size pointing opposite '
      + 'ways, and zero is a perfectly good value for a conserved quantity to have.'));
  }

  const fast = Math.max(Math.abs(params.v1), Math.abs(params.v2));
  const correction = relativisticCorrection(fast);
  if (correction.relativeError > 1e-15) {
    out.push(banner('info',
      `p = m·v is the classical form. At ${fmtFixed(fast, 1)} m/s the true relativistic `
      + `momentum is higher by about ${correction.relativeError.toExponential(1)} — far `
      + 'below the last digit shown, which is why the classical form is used here '
      + 'and everywhere else in this app.'));
  }

  return out;
}

export function explains(ctx) {
  const { params } = ctx;
  const pA = momentum1D(params.m1, params.v1);
  const pB = momentum1D(params.m2, params.v2);

  const rows = [0.05, 0.5, 2].map((seconds) => ({
    time: `${seconds} s`,
    a: `${fmtFixed(stoppingForce(params.m1, params.v1, seconds), 0)} N`,
    b: `${fmtFixed(stoppingForce(params.m2, params.v2, seconds), 0)} N`,
  }));

  return [
    explain({
      title: 'What momentum is',
      plain: [
        'Momentum describes how much motion an object is carrying. It depends on '
        + 'both how much there is of it and how fast it is going — and, crucially, '
        + 'on which way.',
        'A slow lorry and a fast bicycle can carry the same momentum. What they '
        + 'cannot do is carry the same kinetic energy, because energy goes as the '
        + 'square of the speed and momentum does not. That difference is the '
        + 'reason a bullet and a thrown brick behave so unlike each other.',
      ],
      open: true,
    }),

    equationPanel(equation('momentum'),
      `A:  p = ${fmtFixed(params.m1, 2)} kg × ${fmtFixed(params.v1, 2)} m/s = ${fmtFixed(pA, 2)} kg·m/s\n`
      + `B:  p = ${fmtFixed(params.m2, 2)} kg × ${fmtFixed(params.v2, 2)} m/s = ${fmtFixed(pB, 2)} kg·m/s\n\n`
      + `Total: ${fmtFixed(pA, 2)} + (${fmtFixed(pB, 2)}) = ${fmtFixed(pA + pB, 2)} kg·m/s\n\n`
      + `For comparison, their kinetic energies:\n`
      + `A:  ½ × ${fmtFixed(params.m1, 2)} × ${fmtFixed(params.v1, 2)}² = ${fmtFixed(kinetic(params.m1, params.v1), 2)} J\n`
      + `B:  ½ × ${fmtFixed(params.m2, 2)} × ${fmtFixed(params.v2, 2)}² = ${fmtFixed(kinetic(params.m2, params.v2), 2)} J`),

    equationPanel(equation('impulse'),
      `Changing an object's momentum takes a force acting for a time — and only \n`
      + `the product matters. This is why crumple zones work: the change in \n`
      + `momentum is fixed by the crash, so the only thing left to negotiate is \n`
      + `how long you take over it.`),

    explain({
      title: 'The force needed to stop each object',
      plain: 'Same change in momentum, three different stopping times. The force '
        + 'is inversely proportional to the time, which is the entire engineering '
        + 'principle behind airbags, crash mats and packaging.',
    }),

    table(
      [
        { key: 'time', label: 'Stopped in' },
        { key: 'a', label: 'Force on A', num: true },
        { key: 'b', label: 'Force on B', num: true },
      ],
      rows,
    ),
  ];
}
