/**
 * The Collision Laboratory.
 *
 * The before-and-after table is the centrepiece, and it is built to make one
 * thing impossible to miss: momentum comes out the same on every row, and
 * kinetic energy only does when e = 1. The app never states that as a rule —
 * it puts the two totals side by side and lets the learner change e until they
 * notice which column moves.
 *
 * Slow motion and Step exist for the moment of impact, which at real speed is
 * over in a frame or two and is exactly where the interesting thing happens.
 */

import { el } from '../dom.js';
import { section, numberField, sliderField, stat, banner, table, chipField, toggleField } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { viewSection, compareSection, presets } from './common.js';
import { equation } from '../../models.js';
import { inspect, totals } from '../../world.js';
import { collide1D, MODES, expectation, maxEnergyTransfer } from '../../collide.js';
import { fmtFixed } from '../../format.js';

export const meta = {
  id: 'collision',
  label: 'Collisions',
  short: 'Crash',
  concept: 'collision',
  world: true,
  title: 'What survives an impact, and what does not',
};

export const channels = [
  { label: 'Total momentum — flat through the impact, at every e', ids: ['sys-p'] },
  { label: 'Total kinetic energy — only flat when e = 1', ids: ['sys-ke', 'sys-heat'] },
];

const PRESETS = [
  { id: 'equal-elastic', label: 'Equal masses, elastic', title: 'They swap velocities exactly', params: { m1: 2, v1: 5, m2: 2, v2: 0, e: 1, x1: -5, x2: 4 } },
  { id: 'light-heavy', label: '1 kg into 10 kg', title: 'The light one bounces back', params: { m1: 1, v1: 6, m2: 10, v2: 0, e: 1, x1: -5, x2: 4 } },
  { id: 'heavy-light', label: '10 kg into 1 kg', title: 'The light one leaves at nearly twice the speed', params: { m1: 10, v1: 4, m2: 1, v2: 0, e: 1, x1: -5, x2: 4 } },
  { id: 'sticky', label: 'They stick together', title: 'Perfectly inelastic: the most energy any collision can move', params: { m1: 2, v1: 6, m2: 4, v2: -2, e: 0, x1: -5, x2: 4 } },
  { id: 'head-on', label: 'Head-on, zero total', title: 'Equal and opposite — everything can stop', params: { m1: 3, v1: 4, m2: 3, v2: -4, e: 0, x1: -5, x2: 4 } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  return [
    section('The collision', [
      presets(PRESETS, ctx),
      chipField('Kind of collision', MODES.map((m) => ({ value: m.id, label: m.label, title: m.note })),
        MODES.find((m) => Math.abs(m.e - params.e) < 1e-9)?.id ?? 'custom',
        (id) => {
          const mode = MODES.find((m) => m.id === id);
          if (mode && mode.id !== 'custom') set('e', mode.e);
        }, {
          info: 'e is the separation speed divided by the approach speed. It is '
            + 'not a property of a material — it falls as the impact gets faster.',
        }),
      sliderField('Coefficient of restitution e', params.e, (v) => set('e', v), {
        min: 0, max: 1, step: 0.05, key: 'e',
        format: (v) => `e = ${fmtFixed(v, 2)}`,
        hint: MODES.find((m) => Math.abs(m.e - params.e) < 1e-9)?.note
          || 'Somewhere between a perfect bounce and sticking together.',
      }),
    ], { key: 'setup' }),

    section('Cart A', [
      numberField('Mass', params.m1, (v) => set('m1', v), { unit: 'kg', min: 0.05, max: 500, step: 0.5, key: 'm1' }),
      sliderField('Velocity', params.v1, (v) => set('v1', v), { min: -20, max: 20, step: 0.5, key: 'v1', format: (v) => `${fmtFixed(v, 1)} m/s` }),
    ], { key: 'a' }),

    section('Cart B', [
      numberField('Mass', params.m2, (v) => set('m2', v), { unit: 'kg', min: 0.05, max: 500, step: 0.5, key: 'm2' }),
      sliderField('Velocity', params.v2, (v) => set('v2', v), { min: -20, max: 20, step: 0.5, key: 'v2', format: (v) => `${fmtFixed(v, 1)} m/s` }),
      toggleField('Walls at each end', params.walls, (v) => set('walls', v), {
        key: 'walls',
        hint: 'Keeps the carts on screen so the impact can be replayed.',
      }),
    ], { key: 'b' }),

    compareSection(ctx),
    viewSection(ctx),
  ];
}

export function readouts(ctx) {
  const a = inspect(ctx.world, 'a');
  const b = inspect(ctx.world, 'b');
  if (!a || !b) return [];
  const sums = totals(ctx.world);
  const predicted = collide1D(ctx.params.m1, ctx.params.v1, ctx.params.m2, ctx.params.v2, ctx.params.e);

  return [
    stat('A velocity', `${fmtFixed(a.vel.x, 2)} m/s`, {
      swatch: '--vec-velocity',
      sub: `p = ${fmtFixed(a.momentum.x, 2)} kg·m/s`,
    }),
    stat('B velocity', `${fmtFixed(b.vel.x, 2)} m/s`, {
      swatch: '--vec-velocity',
      sub: `p = ${fmtFixed(b.momentum.x, 2)} kg·m/s`,
    }),
    stat('Total momentum', `${fmtFixed(sums.momentumX, 3)} kg·m/s`, {
      swatch: '--vec-momentum',
      accent: true,
      note: 'Unchanged by the impact',
    }),
    stat('Total kinetic energy', `${fmtFixed(sums.kinetic, 2)} J`, {
      swatch: '--vec-velocity',
      note: ctx.params.e >= 0.999 ? 'Also unchanged, because e = 1' : 'Falls at the impact',
    }),
    stat('Moved elsewhere', `${fmtFixed(sums.elsewhere.impact, 2)} J`, {
      swatch: '--force-net',
      note: 'Heat, sound, deformation — not lost',
    }),
    stat('Centre of mass', `${fmtFixed(predicted.centreOfMassVelocity, 2)} m/s`, {
      note: 'Carries straight on through the whole thing',
    }),
  ];
}

export function banners(ctx) {
  const { params } = ctx;
  const out = [];
  const predicted = collide1D(params.m1, params.v1, params.m2, params.v2, params.e);
  const hit = ctx.recorder.events.some((e) => e.type === 'collision');

  out.push(banner(hit ? 'ok' : 'info', hit
    ? `They have collided. Momentum before ${fmtFixed(predicted.before.momentum, 3)} kg·m/s, `
      + `after ${fmtFixed(predicted.after.momentum, 3)} kg·m/s — the same number. `
      + `Kinetic energy went from ${fmtFixed(predicted.before.kinetic, 2)} J to `
      + `${fmtFixed(predicted.after.kinetic, 2)} J.`
    : `Before you press Play: ${expectation(params.m1, params.m2, params.e)}`));

  if (params.e >= 0.999 && hit) {
    out.push(banner('ok',
      'Perfectly elastic, so kinetic energy is conserved as well as momentum. '
      + 'Nothing real is quite this bouncy — colliding steel balls reach about '
      + 'e = 0.95, and gas molecules genuinely manage e = 1.'));
  } else if (params.e <= 0.001 && hit) {
    out.push(banner('warn',
      `Perfectly inelastic. This moves ${fmtFixed(predicted.energyTransferred, 2)} J of `
      + 'kinetic energy elsewhere, which is the most any collision can while '
      + `still conserving momentum. What survives — ${fmtFixed(predicted.after.kinetic, 2)} J — `
      + 'is the energy of the centre of mass, and momentum conservation fixes it.'));
  }

  if (Math.abs(params.v1 - params.v2) < 0.05) {
    out.push(banner('warn',
      'Both carts have the same velocity, so they will never meet. Give one of '
      + 'them a different speed.'));
  }

  return out;
}

export function explains(ctx) {
  const { params } = ctx;
  const r = collide1D(params.m1, params.v1, params.m2, params.v2, params.e);

  const rows = [
    {
      what: 'Velocity of A',
      before: `${fmtFixed(r.before.v1, 2)} m/s`,
      after: `${fmtFixed(r.after.v1, 2)} m/s`,
      verdict: Math.abs(r.after.v1 - r.before.v1) < 1e-9 ? 'unchanged' : 'changed',
    },
    {
      what: 'Velocity of B',
      before: `${fmtFixed(r.before.v2, 2)} m/s`,
      after: `${fmtFixed(r.after.v2, 2)} m/s`,
      verdict: Math.abs(r.after.v2 - r.before.v2) < 1e-9 ? 'unchanged' : 'changed',
    },
    {
      what: 'Momentum of A',
      before: `${fmtFixed(r.before.p1, 2)}`,
      after: `${fmtFixed(r.after.p1, 2)}`,
      verdict: 'changed',
    },
    {
      what: 'Momentum of B',
      before: `${fmtFixed(r.before.p2, 2)}`,
      after: `${fmtFixed(r.after.p2, 2)}`,
      verdict: 'changed',
    },
    {
      what: 'TOTAL momentum',
      before: `${fmtFixed(r.before.momentum, 3)}`,
      after: `${fmtFixed(r.after.momentum, 3)}`,
      verdict: 'CONSERVED',
    },
    {
      what: 'TOTAL kinetic energy',
      before: `${fmtFixed(r.before.kinetic, 2)} J`,
      after: `${fmtFixed(r.after.kinetic, 2)} J`,
      verdict: r.energyTransferred < 1e-9 ? 'CONSERVED' : `${fmtFixed(r.energyTransferred, 2)} J moved`,
    },
  ];

  return [
    explain({
      title: 'What is conserved, and what is not',
      plain: [
        'During the impact each cart pushes on the other with an equal and '
        + 'opposite force, for exactly the same length of time. So the impulse one '
        + 'receives is the exact negative of the other\'s — and whatever momentum '
        + 'one gains, the other loses. That is why the total cannot change.',
        'Kinetic energy has no such guarantee. It is conserved only when the '
        + 'collision is perfectly elastic, and almost nothing is. In every other '
        + 'case some of it goes into heating both bodies, into sound, and into '
        + 'bending them permanently — which is exactly what a crumple zone is for.',
      ],
      open: true,
    }),

    explain({
      title: 'Before and after, side by side',
      plain: 'Change e and watch which rows move. One of them never does.',
    }),

    table(
      [
        { key: 'what', label: 'Quantity' },
        { key: 'before', label: 'Before', num: true },
        { key: 'after', label: 'After', num: true },
        { key: 'verdict', label: '' },
      ],
      rows,
    ),

    equationPanel(equation('momentum-conservation'),
      `Before:  (${fmtFixed(params.m1, 2)} × ${fmtFixed(params.v1, 2)}) + (${fmtFixed(params.m2, 2)} × ${fmtFixed(params.v2, 2)})`
      + ` = ${fmtFixed(r.before.momentum, 3)} kg·m/s\n`
      + `After:   (${fmtFixed(params.m1, 2)} × ${fmtFixed(r.after.v1, 2)}) + (${fmtFixed(params.m2, 2)} × ${fmtFixed(r.after.v2, 2)})`
      + ` = ${fmtFixed(r.after.momentum, 3)} kg·m/s`),

    equationPanel(equation('restitution'),
      `Approach speed:    ${fmtFixed(r.before.approachSpeed, 2)} m/s\n`
      + `Separation speed:  ${fmtFixed(r.after.separationSpeed, 2)} m/s\n`
      + `e = ${fmtFixed(r.after.separationSpeed, 2)} ÷ ${fmtFixed(r.before.approachSpeed, 2)} = ${fmtFixed(r.e, 2)}\n\n`
      + `Solving momentum conservation and that definition together gives:\n`
      + `  v₁′ = ${fmtFixed(r.after.v1, 3)} m/s\n`
      + `  v₂′ = ${fmtFixed(r.after.v2, 3)} m/s`),

    explain({
      title: 'Where the energy went',
      plain: r.energyTransferred < 1e-9
        ? 'Nowhere: e = 1, so every joule of kinetic energy is still kinetic '
          + 'energy afterwards. This is the idealised case.'
        : `${fmtFixed(r.energyTransferred, 2)} J of kinetic energy is no longer kinetic `
          + 'energy. It has not been destroyed — it is heat in both carts, sound in '
          + 'the room, and permanent deformation where they touched. This '
          + 'simulation counts it but does not follow it, which is an assumption '
          + 'worth knowing about.',
      formula: 'Maximum possible transfer = ½ · (m₁m₂ / (m₁+m₂)) · (u₁ − u₂)²',
      validWhen: 'A perfectly inelastic head-on collision.',
      worked: `Most this collision could ever move: ${fmtFixed(maxEnergyTransfer(params.m1, params.v1, params.m2, params.v2), 2)} J\n`
        + `Actually moved at e = ${fmtFixed(params.e, 2)}: ${fmtFixed(r.energyTransferred, 2)} J`,
      becomes: 'Even a perfectly inelastic collision cannot take all of it. What '
        + 'survives is the kinetic energy of the centre of mass, and conservation '
        + 'of momentum will not allow that to change.',
    }),
  ];
}
