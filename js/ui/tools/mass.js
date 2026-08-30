/**
 * Mass and inertia. The first lab, and the one the whole app is built on top of.
 *
 * Two carts, the same push, different masses. Nothing else differs — no
 * friction, no air, a level track — so that when they separate there is exactly
 * one thing it can be.
 *
 * The equation appears last, and only in Learn mode. A learner who has watched
 * a 10 kg cart crawl away from a 1 kg one already knows what F = ma says; the
 * formula is then a short way of writing something they have seen, rather than
 * a rule to take on trust.
 */

import { el } from '../dom.js';
import { section, numberField, sliderField, stat, banner } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { viewSection, compareSection, presets } from './common.js';
import { equation } from '../../models.js';
import { inspect, findBody } from '../../world.js';
import { fmtFixed } from '../../format.js';

export const meta = {
  id: 'mass',
  label: 'Mass & inertia',
  short: 'Mass',
  concept: 'mass',
  world: true,
  title: 'The same push on two different masses',
};

export const channels = [
  { label: 'Velocity against time — the same force, two masses', ids: ['vx'] },
  { label: 'Position against time', ids: ['x'] },
];

const PRESETS = [
  { id: 'ten-to-one', label: '1 kg vs 10 kg', title: 'A tenfold difference is impossible to miss', params: { m1: 1, m2: 10, force: 10 } },
  { id: 'double', label: '2 kg vs 4 kg', title: 'Exactly double — watch the acceleration halve', params: { m1: 2, m2: 4, force: 12 } },
  { id: 'same', label: 'Both the same', title: 'The control: identical carts must behave identically', params: { m1: 5, m2: 5, force: 15 } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  return [
    section('The experiment', [
      presets(PRESETS, ctx),
      sliderField('Force on both carts', params.force, (v) => set('force', v), {
        min: 1, max: 60, step: 1, key: 'force',
        format: (v) => `${v} N`,
        info: 'The same force is applied to both carts. That is what makes this a '
          + 'fair test of mass.',
      }),
    ], { key: 'setup' }),

    section('The two carts', [
      numberField('Cart A mass', params.m1, (v) => set('m1', v), {
        unit: 'kg', min: 0.1, max: 500, step: 1, key: 'm1',
      }),
      numberField('Cart B mass', params.m2, (v) => set('m2', v), {
        unit: 'kg', min: 0.1, max: 500, step: 1, key: 'm2',
      }),
      el('div', {
        class: 'field__hint',
        text: 'Both carts are drawn the same size on purpose. If the heavy one '
          + 'looked bigger it would suggest the size is what slows it down — and '
          + 'it is not, it is the mass.',
      }),
    ], { key: 'carts' }),

    compareSection(ctx),
    viewSection(ctx),
  ];
}

export function readouts(ctx) {
  const light = inspect(ctx.world, 'light');
  const heavy = inspect(ctx.world, 'heavy');
  if (!light || !heavy) return [];

  const ratio = heavy.acceleration.x !== 0 ? light.acceleration.x / heavy.acceleration.x : Infinity;

  return [
    stat('Cart A', `${fmtFixed(light.acceleration.x, 2)} m/s²`, {
      swatch: '--vec-acceleration',
      sub: `${fmtFixed(light.mass, 1)} kg · ${fmtFixed(light.vel.x, 2)} m/s`,
      note: 'Acceleration',
    }),
    stat('Cart B', `${fmtFixed(heavy.acceleration.x, 2)} m/s²`, {
      swatch: '--vec-acceleration',
      sub: `${fmtFixed(heavy.mass, 1)} kg · ${fmtFixed(heavy.vel.x, 2)} m/s`,
      note: 'Acceleration',
    }),
    stat('Mass ratio', `${fmtFixed(heavy.mass / light.mass, 2)} ×`, {
      note: 'B is this many times heavier than A',
    }),
    stat('Acceleration ratio', Number.isFinite(ratio) ? `${fmtFixed(ratio, 2)} ×` : '—', {
      accent: true,
      note: 'A accelerates this many times harder',
    }),
  ];
}

export function banners(ctx) {
  const out = [];
  const light = findBody(ctx.world, 'light');
  const heavy = findBody(ctx.world, 'heavy');
  if (!light || !heavy) return out;

  if (Math.abs(light.mass - heavy.mass) < 1e-9) {
    out.push(banner('info',
      'Both carts have the same mass, so they behave identically. That is worth '
      + 'seeing once: it is the control that shows the track is fair.'));
  } else {
    const massRatio = heavy.mass / light.mass;
    const accelRatio = ctx.params.force / light.mass / (ctx.params.force / heavy.mass);
    if (Math.abs(massRatio - accelRatio) < 1e-6) {
      out.push(banner('ok',
        `Cart B is ${fmtFixed(massRatio, 2)}× the mass and accelerates `
        + `${fmtFixed(1 / massRatio, 3)}× as hard. The two numbers are exact `
        + 'reciprocals — try another pair of masses and see whether that holds.'));
    }
  }

  if (ctx.params.force === 0) {
    out.push(banner('warn',
      'With no force, neither cart accelerates — whatever their masses. An object '
      + 'with no net force on it keeps doing exactly what it was doing.'));
  }
  return out.map((n) => n);
}

export function explains(ctx) {
  const { params } = ctx;
  const a1 = params.force / params.m1;
  const a2 = params.force / params.m2;

  return [
    explain({
      title: 'What you are looking at',
      plain: [
        'Both carts get exactly the same push. The track is level and '
        + 'frictionless, and there is no air, so the applied force is the only '
        + 'thing acting along the direction of travel.',
        'The lighter cart pulls away. Not because it is being pushed harder — it '
        + 'is not — but because the same push produces more change in its '
        + 'motion. That resistance to being changed is what mass measures, and it '
        + 'has a name: inertia.',
      ],
      open: true,
    }),

    equationPanel(equation('newton-2'),
      `a = F ÷ m\n\n`
      + `Cart A:  a = ${fmtFixed(params.force, 1)} N ÷ ${fmtFixed(params.m1, 2)} kg = ${fmtFixed(a1, 3)} m/s²\n`
      + `Cart B:  a = ${fmtFixed(params.force, 1)} N ÷ ${fmtFixed(params.m2, 2)} kg = ${fmtFixed(a2, 3)} m/s²\n\n`
      + `Ratio:   ${fmtFixed(params.m2 / params.m1, 3)}× the mass  →  ${fmtFixed(a2 / a1, 3)}× the acceleration`),

    explain({
      title: 'Why gravity is not part of this',
      plain: [
        'The carts have weight, and the track pushes up on them with exactly the '
        + 'same force. The two cancel, so nothing is left over to act along the '
        + 'track. That is why gravity does not appear in the numbers here.',
        'It is worth noticing that this cancellation is what makes a level '
        + 'surface useful for studying anything else. Tilt the track and it stops '
        + 'being true immediately — which is what the Force lab does next.',
      ],
    }),
  ];
}
