/**
 * Position, time, speed and velocity.
 *
 * The lab exists for one distinction: two carts at 5 m/s in opposite directions
 * have the same speed and different velocities. That reads as pedantry written
 * down and is obvious the moment you watch them separate, which is the whole
 * argument for building it this way round.
 */

import { el } from '../dom.js';
import { section, numberField, sliderField, stat, toggleField, banner } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { viewSection, compareSection, presets } from './common.js';
import { equation } from '../../models.js';
import { inspect } from '../../world.js';
import { compareMotion } from '../../kinematics.js';
import { fmtFixed, fmtDirectionWords } from '../../format.js';

export const meta = {
  id: 'motion',
  label: 'Speed & velocity',
  short: 'Motion',
  concept: 'velocity',
  world: true,
  title: 'The difference between how fast and which way',
};

export const channels = [
  { label: 'Position against time — the slope of this line is the velocity', ids: ['x'] },
  { label: 'Velocity against time', ids: ['vx'] },
];

const PRESETS = [
  { id: 'opposite', label: 'Same speed, opposite ways', title: '5 m/s each, in opposite directions', params: { v0: 5, v0b: -5, x0: -6, x0b: 6, showSecond: true } },
  { id: 'chase', label: 'One catching the other', title: 'Both going right, one faster', params: { v0: 6, v0b: 2, x0: -8, x0b: -2, showSecond: true } },
  { id: 'single', label: 'Just one cart', title: 'The simplest case', params: { showSecond: false, v0: 4, x0: -6 } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  return [
    section('The experiment', [
      presets(PRESETS, ctx),
      toggleField('Show a second cart', params.showSecond, (v) => set('showSecond', v), {
        key: 'showSecond',
        hint: 'Two carts is where speed and velocity come apart.',
      }),
    ], { key: 'setup' }),

    section('Cart A', [
      sliderField('Starting velocity', params.v0, (v) => set('v0', v), {
        min: -20, max: 20, step: 0.5, key: 'v0',
        format: (v) => `${fmtFixed(v, 1)} m/s`,
        info: 'Negative means to the left. The sign is the direction, and the '
          + 'direction is half of what velocity means.',
      }),
      numberField('Starting position', params.x0, (v) => set('x0', v), { unit: 'm', step: 1, min: -50, max: 50, key: 'x0' }),
    ], { key: 'cartA' }),

    params.showSecond ? section('Cart B', [
      sliderField('Starting velocity', params.v0b, (v) => set('v0b', v), {
        min: -20, max: 20, step: 0.5, key: 'v0b',
        format: (v) => `${fmtFixed(v, 1)} m/s`,
      }),
      numberField('Starting position', params.x0b, (v) => set('x0b', v), { unit: 'm', step: 1, min: -50, max: 50, key: 'x0b' }),
    ], { key: 'cartB' }) : null,

    compareSection(ctx),
    viewSection(ctx),
  ].filter(Boolean);
}

export function readouts(ctx) {
  const a = inspect(ctx.world, 'a');
  const b = ctx.params.showSecond ? inspect(ctx.world, 'b') : null;
  if (!a) return [];

  const out = [
    stat('Cart A velocity', `${fmtFixed(a.vel.x, 2)} m/s`, {
      swatch: '--vec-velocity',
      note: fmtDirectionWords(a.vel, { still: 'not moving' }),
    }),
    stat('Cart A speed', `${fmtFixed(Math.abs(a.vel.x), 2)} m/s`, {
      note: 'The magnitude — no direction, never negative',
    }),
    stat('Cart A position', `${fmtFixed(a.pos.x, 2)} m`, { note: 'Measured from the middle of the track' }),
  ];

  if (b) {
    const c = compareMotion(a.vel.x, b.vel.x);
    out.push(stat('Cart B velocity', `${fmtFixed(b.vel.x, 2)} m/s`, {
      swatch: '--vec-velocity',
      note: fmtDirectionWords(b.vel, { still: 'not moving' }),
    }));
    out.push(stat('Gap between them', `${fmtFixed(Math.abs(a.pos.x - b.pos.x), 2)} m`, {
      accent: true,
      note: c.sameSpeed && !c.sameVelocity ? 'Same speed, different velocity' : 'Distance apart',
    }));
  }
  return out;
}

export function banners(ctx) {
  if (!ctx.params.showSecond) return [];
  const c = compareMotion(ctx.params.v0, ctx.params.v0b);
  const out = [];

  if (c.sameSpeed && !c.sameVelocity) {
    out.push(banner('ok',
      `Both carts are doing ${fmtFixed(Math.abs(ctx.params.v0), 1)} m/s — the same `
      + 'speed. Their velocities are different, because velocity includes the '
      + 'direction. Watch how far apart they end up: that gap is what the '
      + 'difference between the two words is worth.'));
  } else if (c.sameVelocity) {
    out.push(banner('info',
      'Identical velocities: same speed, same direction. They will keep the same '
      + 'gap for ever, because neither is accelerating.'));
  }
  return out;
}

export function explains(ctx) {
  const { params } = ctx;
  const t = Math.max(0.001, ctx.t);

  return [
    explain({
      title: 'Speed, velocity, and why the difference matters',
      plain: [
        'Speed says how fast. Velocity says how fast and which way. Everyday '
        + 'language treats them as the same word, and for something moving in a '
        + 'straight line in one direction they give the same number.',
        'The moment there is more than one direction involved, only velocity can '
        + 'tell you where something will be. Two cars closing on each other at '
        + '30 m/s each are approaching at 60 m/s — a fact you cannot get from '
        + 'their speeds alone, because speeds have no sign to add up.',
      ],
      open: true,
    }),

    explain({
      title: 'Nothing is pushing these carts',
      plain: [
        'The track is level and frictionless, and no force is being applied. The '
        + 'carts keep moving anyway, at exactly the velocity they started with.',
        'That is Newton\'s first law, and it is the least intuitive thing in '
        + 'mechanics — because on Earth everything does slow down when you stop '
        + 'pushing. What slows it is friction, which is another force. Take that '
        + 'away and motion needs no maintenance at all.',
      ],
    }),

    equationPanel(equation('suvat-s'),
      `x = x₀ + v·t   (with a = 0, the ½at² term disappears)\n\n`
      + `Cart A:  x = ${fmtFixed(params.x0, 2)} + ${fmtFixed(params.v0, 2)} × ${fmtFixed(t, 2)}`
      + ` = ${fmtFixed(params.x0 + params.v0 * t, 2)} m\n`
      + (params.showSecond
        ? `Cart B:  x = ${fmtFixed(params.x0b, 2)} + ${fmtFixed(params.v0b, 2)} × ${fmtFixed(t, 2)}`
          + ` = ${fmtFixed(params.x0b + params.v0b * t, 2)} m\n\n`
          + `Gap:     ${fmtFixed(Math.abs((params.x0 + params.v0 * t) - (params.x0b + params.v0b * t)), 2)} m`
        : '')),

    explain({
      title: 'Reading the position graph',
      plain: [
        'The position–time graph is a straight line, and its steepness is the '
        + 'velocity. A steeper line means faster; a line sloping downward means '
        + 'moving in the negative direction.',
        'Keep that in mind, because in the next lab the line stops being straight '
        + '— and the way it bends is exactly what acceleration is.',
      ],
    }),
  ];
}
