/**
 * Energy: a ball on a ramp, trading height for speed.
 *
 * The readout that carries the lesson is the total. With a frictionless surface
 * it does not move at all while its two halves swap places; with friction on,
 * the mechanical total falls and exactly that much appears on the heat line.
 * Nothing is ever allowed to simply shrink, because "energy gets used up" is the
 * misconception this lab exists to take apart.
 */

import { el } from '../dom.js';
import { section, numberField, sliderField, stat, banner } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { gravitySection, surfaceSection, viewSection, compareSection, presets } from './common.js';
import { equation } from '../../models.js';
import { inspect, totals } from '../../world.js';
import { gravityFor, surfaceFor } from '../../scenarios.js';
import { speedFromHeight } from '../../energy.js';
import { fmtFixed } from '../../format.js';

export const meta = {
  id: 'energy',
  label: 'Energy',
  short: 'Energy',
  concept: 'energy',
  world: true,
  title: 'Height traded for speed, and what friction takes',
};

export const channels = [
  { label: 'Energy against time — watch the total', ids: ['ke', 'pe', 'etotal'] },
  { label: 'The whole system, including what has gone to heat', ids: ['sys-ke', 'sys-heat', 'sys-e'] },
];

const PRESETS = [
  { id: 'ideal', label: 'Frictionless ramp', title: 'The total never moves', params: { surfaceId: 'frictionless', slopeDeg: 25, startDistance: 6, mass: 2 } },
  { id: 'rough', label: 'Wooden ramp', title: 'Watch where the missing energy turns up', params: { surfaceId: 'wood', slopeDeg: 25, startDistance: 6, mass: 2 } },
  { id: 'steep', label: 'Steeper and rougher', title: 'A shorter, faster run and more heat', params: { surfaceId: 'steel-dry', slopeDeg: 40, startDistance: 6, mass: 5 } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  return [
    section('The experiment', [
      presets(PRESETS, ctx),
      numberField('Mass of the ball', params.mass, (v) => set('mass', v), { unit: 'kg', min: 0.1, max: 200, step: 0.5, key: 'mass' }),
      sliderField('Starting distance up the ramp', params.startDistance, (v) => set('startDistance', v), {
        min: 1, max: 20, step: 0.5, key: 'startDistance',
        format: (v) => `${fmtFixed(v, 1)} m`,
      }),
      el('div', {
        class: 'field__hint',
        text: 'The mass changes every energy on screen — and not the speed at the '
          + 'bottom. Try it: double the mass and see which numbers move.',
      }),
    ], { key: 'setup' }),

    surfaceSection(ctx),
    gravitySection(ctx),
    compareSection(ctx),
    viewSection(ctx),
  ];
}

export function readouts(ctx) {
  const ball = inspect(ctx.world, 'ball');
  if (!ball) return [];
  const sums = totals(ctx.world);

  return [
    stat('Height', `${fmtFixed(ball.pos.y, 2)} m`, { note: 'Above the foot of the ramp' }),
    stat('Speed', `${fmtFixed(ball.speed, 2)} m/s`, { swatch: '--vec-velocity' }),
    stat('Potential energy', `${fmtFixed(sums.potential, 2)} J`, {
      swatch: '--force-weight',
      note: 'm · g · h',
    }),
    stat('Kinetic energy', `${fmtFixed(sums.kinetic, 2)} J`, {
      swatch: '--vec-velocity',
      note: '½ · m · v²',
    }),
    stat('Gone to heat', `${fmtFixed(sums.elsewhere.heat, 2)} J`, {
      swatch: '--force-friction',
      note: 'Friction put it in the ramp',
    }),
    stat('Total energy', `${fmtFixed(sums.total, 2)} J`, {
      accent: true,
      note: 'This does not change. Ever.',
    }),
  ];
}

export function banners(ctx) {
  const { params } = ctx;
  const friction = surfaceFor(params);
  const gravity = gravityFor(params);
  const sums = totals(ctx.world);
  const out = [];

  const rad = (params.slopeDeg * Math.PI) / 180;
  const willSlide = Math.tan(rad) > friction.muS;

  if (!willSlide && ctx.t < 0.2) {
    out.push(banner('warn',
      `On a ${fmtFixed(params.slopeDeg, 0)}° slope, gravity is pulling the ball down with `
      + `mg·sinθ and static friction can resist up to μs·mg·cosθ. Since `
      + `tan ${fmtFixed(params.slopeDeg, 0)}° = ${fmtFixed(Math.tan(rad), 2)} is below μs = ${friction.muS}, `
      + 'it will not move at all. Steepen the ramp or pick a slipperier surface.'));
  }

  if (friction.muK === 0) {
    out.push(banner('ok',
      'Frictionless. Kinetic and potential energy trade places, and their total '
      + `stays at ${fmtFixed(sums.total, 2)} J from start to finish. Nothing is removing `
      + 'energy from the system, so nothing can.'));
  } else if (sums.elsewhere.heat > 0.01) {
    out.push(banner('info',
      `Mechanical energy has fallen by ${fmtFixed(sums.elsewhere.heat, 2)} J — and exactly `
      + `${fmtFixed(sums.elsewhere.heat, 2)} J has appeared on the heat line. The energy is `
      + 'not gone. It is in the ramp and the ball, as a temperature rise far too '
      + 'small to feel.'));
  }

  if (gravity.g === 0) {
    out.push(banner('warn',
      'With gravity set to zero there is no potential energy to trade, so nothing '
      + 'will happen. Pick a real environment.'));
  }

  return out;
}

export function explains(ctx) {
  const { params } = ctx;
  const gravity = gravityFor(params);
  const friction = surfaceFor(params);
  const rad = (params.slopeDeg * Math.PI) / 180;
  const height = params.startDistance * Math.sin(rad);
  const pe = params.mass * gravity.g * height;
  const idealSpeed = speedFromHeight(height, gravity.g);
  const frictionLoss = friction.muK * params.mass * gravity.g * Math.cos(rad) * params.startDistance;
  const realSpeed = Math.sqrt(Math.max(0, 2 * (pe - frictionLoss) / params.mass));
  const sums = totals(ctx.world);

  return [
    explain({
      title: 'Energy is not used up. It moves.',
      plain: [
        'Lifting the ball up the ramp stored energy in it. Letting it roll down '
        + 'converts that store into motion, at a fixed exchange rate — and if '
        + 'nothing is removing energy, the total of the two never changes by so '
        + 'much as a joule.',
        'Switch friction on and the mechanical total does fall. That energy has '
        + 'not been destroyed; it has become heat in the ramp and the ball. The '
        + '"energy gone to heat" line and the mechanical energies always add to '
        + 'the same number, which is the point of showing both.',
      ],
      open: true,
    }),

    equationPanel(equation('potential-energy'),
      `Starting ${fmtFixed(params.startDistance, 1)} m up a ${fmtFixed(params.slopeDeg, 0)}° slope,\n`
      + `the vertical height is ${fmtFixed(params.startDistance, 1)} × sin ${fmtFixed(params.slopeDeg, 0)}° = ${fmtFixed(height, 2)} m\n\n`
      + `PE = m · g · h = ${fmtFixed(params.mass, 2)} × ${fmtFixed(gravity.g, 4)} × ${fmtFixed(height, 2)}`
      + ` = ${fmtFixed(pe, 2)} J`),

    equationPanel(equation('energy-conservation'),
      `With no friction, all of it becomes kinetic energy at the bottom:\n\n`
      + `  m·g·h = ½·m·v²    →    v = √(2·g·h)\n`
      + `  v = √(2 × ${fmtFixed(gravity.g, 4)} × ${fmtFixed(height, 2)}) = ${fmtFixed(idealSpeed, 2)} m/s\n\n`
      + `Notice the mass cancels: it is on both sides. A 1 kg ball and a 100 kg\n`
      + `ball reach the bottom of the same ramp at the same speed — with very\n`
      + `different energies.\n\n`
      + (friction.muK > 0
        ? `With μk = ${friction.muK}, friction removes:\n`
          + `  W = μk · m·g·cos θ · d\n`
          + `    = ${friction.muK} × ${fmtFixed(params.mass * gravity.g * Math.cos(rad), 2)} × ${fmtFixed(params.startDistance, 1)}`
          + ` = ${fmtFixed(frictionLoss, 2)} J\n\n`
          + `Leaving ${fmtFixed(Math.max(0, pe - frictionLoss), 2)} J of kinetic energy, so\n`
          + `  v = ${fmtFixed(realSpeed, 2)} m/s at the bottom.`
        : 'This surface is frictionless, so nothing is removed.')),

    explain({
      title: 'The books, right now',
      plain: 'Every joule accounted for.',
      formula: 'kinetic + potential + relocated = constant',
      validWhen: 'Always. This is the one that has no exceptions.',
      worked: `Kinetic      ${fmtFixed(sums.kinetic, 3).padStart(10)} J\n`
        + `Potential    ${fmtFixed(sums.potential, 3).padStart(10)} J\n`
        + `To heat      ${fmtFixed(sums.elsewhere.heat, 3).padStart(10)} J\n`
        + `${'—'.repeat(24)}\n`
        + `Total        ${fmtFixed(sums.total, 3).padStart(10)} J`,
      becomes: 'What actually runs out in the real world is not energy but its '
        + 'usefulness. Spread thinly enough as heat, energy is still all there and '
        + 'can no longer be made to do anything.',
    }),

    explain({
      title: 'Why the speed at the bottom does not depend on the mass',
      plain: [
        'Both sides of m·g·h = ½·m·v² have the mass in them, so it divides out and '
        + 'never reaches the answer. Double the mass and you double the potential '
        + 'energy and double the kinetic energy needed to carry it — the speed is '
        + 'untouched.',
        'It is the same cancellation as free fall, arriving from the direction of '
        + 'energy rather than force. Two routes to one fact is usually a sign the '
        + 'fact is important.',
      ],
    }),
  ];
}
