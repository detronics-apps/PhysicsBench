/**
 * Acceleration — and the four cases that show it is not "getting faster".
 *
 * The controls are deliberately set up so that the interesting case is one
 * click away: a positive starting velocity with a negative acceleration, where
 * the cart slows, stops, and comes back. Watching the velocity trace cross zero
 * while the acceleration trace sits flat and negative is the lesson; the words
 * only confirm what has already been seen.
 */

import { el } from '../dom.js';
import { section, numberField, sliderField, stat, banner } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { viewSection, compareSection, presets } from './common.js';
import { equation } from '../../models.js';
import { inspect } from '../../world.js';
import { describeMotion, solveSuvat } from '../../kinematics.js';
import { fmtFixed } from '../../format.js';

export const meta = {
  id: 'accel',
  label: 'Acceleration',
  short: 'Accel',
  concept: 'acceleration',
  world: true,
  title: 'Velocity changing at a steady rate',
};

export const channels = [
  { label: 'Position against time — a curve now, not a straight line', ids: ['x'] },
  { label: 'Velocity against time — the slope is the acceleration', ids: ['vx'] },
  { label: 'Acceleration against time — flat, because it is constant', ids: ['ax'] },
];

const PRESETS = [
  { id: 'from-rest', label: 'From rest', title: 'The simplest case: start at zero and speed up', params: { u: 0, a: 3, x0: -8 } },
  { id: 'slowing', label: 'Slowing down', title: 'Positive velocity, negative acceleration', params: { u: 10, a: -3, x0: -8 } },
  { id: 'turn-around', label: 'Slow, stop, come back', title: 'The velocity crosses zero while the acceleration never changes', params: { u: 8, a: -4, x0: -4 } },
  { id: 'none', label: 'No acceleration', title: 'Constant velocity, for comparison', params: { u: 5, a: 0, x0: -8 } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  return [
    section('The experiment', [
      presets(PRESETS, ctx),
      sliderField('Starting velocity u', params.u, (v) => set('u', v), {
        min: -20, max: 20, step: 0.5, key: 'u',
        format: (v) => `${fmtFixed(v, 1)} m/s`,
      }),
      sliderField('Acceleration a', params.a, (v) => set('a', v), {
        min: -15, max: 15, step: 0.5, key: 'a',
        format: (v) => `${fmtFixed(v, 1)} m/s²`,
        info: 'Held constant, which is the condition that lets v = u + a·t be '
          + 'used at all. Switch air resistance on anywhere in this app and the '
          + 'acceleration stops being constant, and so does that equation.',
      }),
      el('div', {
        class: 'field__hint',
        text: 'Try a positive u with a negative a. The cart slows, stops, and '
          + 'comes back — and the acceleration never changes at any point.',
      }),
    ], { key: 'setup' }),

    section('The cart', [
      numberField('Mass', params.mass, (v) => set('mass', v), { unit: 'kg', min: 0.1, max: 500, step: 0.5, key: 'mass' }),
      numberField('Starting position', params.x0, (v) => set('x0', v), { unit: 'm', step: 1, min: -50, max: 50, key: 'x0' }),
      el('div', {
        class: 'field__hint',
        text: 'The mass changes the force needed to produce this acceleration, '
          + 'but not the motion — the acceleration is what is being held fixed.',
      }),
    ], { key: 'cart' }),

    compareSection(ctx),
    viewSection(ctx),
  ];
}

export function readouts(ctx) {
  const cart = inspect(ctx.world, 'a');
  if (!cart) return [];
  const motion = describeMotion(cart.vel.x, cart.acceleration.x);

  return [
    stat('Velocity', `${fmtFixed(cart.vel.x, 2)} m/s`, {
      swatch: '--vec-velocity',
      note: `Started at ${fmtFixed(ctx.params.u, 1)} m/s`,
    }),
    stat('Acceleration', `${fmtFixed(cart.acceleration.x, 2)} m/s²`, {
      swatch: '--vec-acceleration',
      note: 'Constant throughout',
    }),
    stat('Position', `${fmtFixed(cart.pos.x, 2)} m`, {}),
    stat('What it is doing', motion.state.replace(/-/g, ' '), {
      accent: true,
      note: 'From the signs of v and a',
    }),
  ];
}

export function banners(ctx) {
  const cart = inspect(ctx.world, 'a');
  if (!cart) return [];
  const motion = describeMotion(cart.vel.x, cart.acceleration.x);
  const out = [];

  const level = motion.state === 'slowing-down' || motion.state === 'turning-point' ? 'ok' : 'info';
  out.push(banner(level, motion.text));

  if (ctx.params.a !== 0 && Math.sign(ctx.params.u) === -Math.sign(ctx.params.a) && ctx.params.u !== 0) {
    const stopAt = -ctx.params.u / ctx.params.a;
    if (stopAt > 0 && ctx.t < stopAt) {
      out.push(banner('info',
        `It will be momentarily stationary at t = ${fmtFixed(stopAt, 2)} s. Use Step `
        + 'to creep up on that moment and check what the acceleration is doing '
        + 'while the velocity is zero.'));
    }
  }
  return out;
}

export function explains(ctx) {
  const { params } = ctx;
  const t = Math.max(0.001, ctx.t);
  const solved = solveSuvat({ u: params.u, a: params.a, t });

  return [
    explain({
      title: 'Acceleration is a rate of change, not a speed',
      plain: [
        'Acceleration says how quickly the velocity is changing. If it points '
        + 'the same way as the motion, the object speeds up. If it points against '
        + 'the motion, the object slows down — and is still accelerating the '
        + 'whole time.',
        'The word does more work in physics than it does in a car. A car braking '
        + 'is accelerating. So is one going round a roundabout at a steady speed, '
        + 'because its direction is changing even though its speed is not.',
      ],
      open: true,
    }),

    equationPanel(equation('suvat-v'),
      `v = u + a·t\n\n`
      + `v = ${fmtFixed(params.u, 2)} + (${fmtFixed(params.a, 2)} × ${fmtFixed(t, 2)})`
      + ` = ${fmtFixed(solved.v, 2)} m/s`),

    equationPanel(equation('suvat-s'),
      `s = u·t + ½·a·t²\n\n`
      + `s = (${fmtFixed(params.u, 2)} × ${fmtFixed(t, 2)}) + (½ × ${fmtFixed(params.a, 2)} × ${fmtFixed(t, 2)}²)\n`
      + `s = ${fmtFixed(params.u * t, 2)} + ${fmtFixed(0.5 * params.a * t * t, 2)}`
      + ` = ${fmtFixed(solved.s, 2)} m`),

    explain({
      title: 'What the three graphs are telling you',
      plain: [
        'The acceleration graph is flat: it is being held constant, which is the '
        + 'condition every equation above depends on.',
        'The velocity graph is a straight line whose steepness is that constant. '
        + 'Where it crosses zero, the object is momentarily still — and the '
        + 'acceleration line does not so much as flinch at that moment.',
        'The position graph is a curve. Its steepness at any instant is the '
        + 'velocity at that instant, which is why it flattens out exactly where '
        + 'the velocity line crosses zero, and then bends the other way.',
      ],
    }),

    explain({
      title: 'And the force behind it',
      plain: `Producing ${fmtFixed(params.a, 2)} m/s² on ${fmtFixed(params.mass, 2)} kg `
        + `takes a steady ${fmtFixed(params.mass * params.a, 2)} N. Double the mass and `
        + 'you would need double the force for the same motion — which is the '
        + 'Mass lab, arrived at from the other direction.',
      formula: 'F = m · a',
      validWhen: 'Constant mass, classical speeds.',
      worked: `F = ${fmtFixed(params.mass, 2)} kg × ${fmtFixed(params.a, 2)} m/s² = ${fmtFixed(params.mass * params.a, 2)} N`,
    }),
  ];
}
