/**
 * Gravity and projectiles.
 *
 * Three things this lab has to make visible, and each has a control aimed
 * straight at it:
 *
 *   - the acceleration arrow points down for the whole flight, including at
 *     the very top where the vertical velocity is zero;
 *   - horizontal and vertical motion are independent, which the 0° preset
 *     demonstrates by beating a dropped ball to nowhere at all;
 *   - the parabola is the *no-air* model, and switching the air on shows how
 *     far short of it reality falls.
 */

import { el } from '../dom.js';
import { section, numberField, sliderField, stat, banner, button, buttonRow } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { gravitySection, airSection, viewSection, compareSection, presets } from './common.js';
import { equation } from '../../models.js';
import { inspect } from '../../world.js';
import { gravityFor, fluidFor } from '../../scenarios.js';
import { apex, range, flightTime, bestAngle, anglesForRange, simulate, dragEffect, independenceCheck } from '../../projectile.js';
import { extremes } from '../../recorder.js';
import { sphereArea } from '../../constants.js';
import { fmtFixed } from '../../format.js';

export const meta = {
  id: 'projectile',
  label: 'Gravity & projectiles',
  short: 'Throw',
  concept: 'projectile',
  world: true,
  title: 'Launch something and watch gravity do the same thing all the way',
};

export const channels = [
  { label: 'Height against time', ids: ['y'] },
  { label: 'Velocity components — the horizontal one never changes without air', ids: ['vx', 'vy'] },
  { label: 'Acceleration — constant, downward, the whole flight', ids: ['ay'] },
];

const PRESETS = [
  { id: 'classic', label: '45° from the ground', title: 'The furthest a level launch can go', params: { speed: 20, angleDeg: 45, height: 0, dragOn: false } },
  { id: 'straight-up', label: 'Straight up', title: 'The clearest view of what happens at the top', params: { speed: 15, angleDeg: 90, height: 0, dragOn: false } },
  { id: 'horizontal', label: 'Horizontally off a cliff', title: 'Horizontal and vertical motion, side by side and independent', params: { speed: 12, angleDeg: 0, height: 25, dragOn: false } },
  { id: 'moon', label: 'The same throw on the Moon', title: 'Only g changed', params: { speed: 20, angleDeg: 45, height: 0, envId: 'moon', dragOn: false } },
  { id: 'air', label: 'With air resistance', title: 'The real trajectory, and how far short of the parabola it falls', params: { speed: 40, angleDeg: 45, height: 0, dragOn: true, shapeId: 'sphere', mass: 0.145, radius: 0.037 } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  const gravity = gravityFor(params);
  const best = bestAngle(params.speed, gravity.g, params.height, 0);

  return [
    section('The launch', [
      presets(PRESETS, ctx),
      sliderField('Speed', params.speed, (v) => set('speed', v), {
        min: 0, max: 80, step: 1, key: 'speed',
        format: (v) => `${v} m/s`,
      }),
      sliderField('Angle', params.angleDeg, (v) => set('angleDeg', v), {
        min: -90, max: 90, step: 1, key: 'angleDeg',
        format: (v) => `${v}°`,
        hint: `The furthest from this height and speed is ${fmtFixed(best.angleDeg, 1)}°. ${best.note}`,
      }),
      sliderField('Launch height', params.height, (v) => set('height', v), {
        min: 0, max: 100, step: 1, key: 'height',
        format: (v) => `${v} m`,
      }),
    ], { key: 'launch' }),

    section('The ball', [
      numberField('Mass', params.mass, (v) => set('mass', v), { unit: 'kg', min: 0.001, max: 100, step: 0.1, key: 'mass' }),
      numberField('Radius', params.radius, (v) => set('radius', v), { unit: 'm', min: 0.005, max: 2, step: 0.01, key: 'radius' }),
      sliderField('Bounciness', params.restitution, (v) => set('restitution', v), {
        min: 0, max: 1, step: 0.05, key: 'restitution',
        format: (v) => `e = ${fmtFixed(v, 2)}`,
        hint: 'The ball rebounds to e² of the height it fell from, so e = 0.8 '
          + 'gives 64%.',
      }),
      el('div', {
        class: 'field__hint',
        text: params.dragOn
          ? 'With the air on, mass and radius both matter — a heavier ball of the '
            + 'same size keeps more of its ideal range.'
          : 'In a vacuum neither mass nor radius makes the slightest difference '
            + 'to the trajectory. Change them and see.',
      }),
    ], { key: 'ball' }),

    gravitySection(ctx),
    airSection(ctx),
    compareSection(ctx),
    viewSection(ctx),
  ];
}

export function readouts(ctx) {
  const ball = inspect(ctx.world, 'ball');
  if (!ball) return [];
  const gravity = gravityFor(ctx.params);
  const ideal = { speed: ctx.params.speed, angleDeg: ctx.params.angleDeg, height: ctx.params.height, g: gravity.g };
  const peak = extremes(ctx.recorder, 'y').max;

  return [
    stat('Horizontal velocity', `${fmtFixed(ball.vel.x, 2)} m/s`, {
      swatch: '--vec-velocity',
      note: ctx.params.dragOn ? 'Falling, because drag acts on it' : 'Never changes — gravity acts only downward',
    }),
    stat('Vertical velocity', `${fmtFixed(ball.vel.y, 2)} m/s`, {
      swatch: '--vec-velocity',
      note: ball.vel.y > 0.05 ? 'Rising' : ball.vel.y < -0.05 ? 'Falling' : 'At the turning point',
    }),
    stat('Total speed', `${fmtFixed(ball.speed, 2)} m/s`, {}),
    stat('Acceleration', `${fmtFixed(Math.hypot(ball.acceleration.x, ball.acceleration.y), 2)} m/s²`, {
      swatch: '--vec-acceleration',
      note: 'Downward, all the way',
    }),
    stat('Height', `${fmtFixed(ball.heightAboveGround, 2)} m`, {
      note: peak ? `Highest so far ${fmtFixed(peak.value, 2)} m at t = ${fmtFixed(peak.t, 2)} s` : '',
    }),
    stat('Predicted range', `${fmtFixed(range(ideal), 2)} m`, {
      accent: true,
      note: ctx.params.dragOn ? 'What it would do with no air' : 'From the no-drag equations',
    }),
  ];
}

export function banners(ctx) {
  const ball = inspect(ctx.world, 'ball');
  if (!ball) return [];
  const out = [];
  const gravity = gravityFor(ctx.params);

  if (Math.abs(ball.vel.y) < 0.25 && ball.heightAboveGround > 0.5) {
    out.push(banner('ok',
      'At the top. The vertical velocity has passed through zero — and the '
      + `acceleration is still ${fmtFixed(gravity.g, 2)} m/s² downward. Nothing about `
      + 'gravity paused; that is precisely why the ball does not stay up here.'));
  }

  if (Math.abs(ctx.params.angleDeg) < 0.5 && ctx.params.height > 1 && !ctx.params.dragOn) {
    const check = independenceCheck(ctx.params.height, gravity.g, ctx.params.speed);
    out.push(banner('info',
      `Thrown horizontally from ${fmtFixed(ctx.params.height, 0)} m, this ball hits the `
      + `ground at t = ${fmtFixed(check.thrownTime, 2)} s — exactly when a ball simply `
      + 'dropped from the same height would. Gravity has no effect on the '
      + 'horizontal motion, and the horizontal motion has no effect on the fall.'));
  }

  if (ctx.params.dragOn) {
    const air = fluidFor(ctx.params);
    const result = simulate(
      { speed: ctx.params.speed, angleDeg: ctx.params.angleDeg, height: ctx.params.height, g: gravity.g, mass: ctx.params.mass },
      { density: air.density, cd: air.cd, area: sphereArea(ctx.params.radius) },
      { dt: 0.002 },
    );
    const effect = dragEffect(result);
    if (Number.isFinite(effect.rangePct)) {
      out.push(banner('warn',
        `Air resistance costs ${fmtFixed(Math.abs(effect.rangePct), 0)}% of the range and `
        + `${fmtFixed(Math.abs(effect.apexPct), 0)}% of the height. The parabola you saw `
        + 'with the air off was the idealised model; this is what the same throw '
        + 'actually does. Neither is wrong — one has fewer assumptions in it.'));
    }
  }

  if (ctx.params.envId === 'orbit') {
    out.push(banner('warn',
      'Gravity is set to zero, which is a deliberate fiction the app is being '
      + 'open about: at the height of the Space Station, gravity is still about '
      + '89% of its value at the ground. Things float there because everything is '
      + 'falling together, not because gravity has stopped.'));
  }

  return out;
}

export function explains(ctx) {
  const { params } = ctx;
  const gravity = gravityFor(params);
  const ideal = { speed: params.speed, angleDeg: params.angleDeg, height: params.height, g: gravity.g };
  const top = apex(ideal);
  const rad = (params.angleDeg * Math.PI) / 180;
  const ux = params.speed * Math.cos(rad);
  const uy = params.speed * Math.sin(rad);
  const targets = anglesForRange(range(ideal), params.speed, gravity.g);

  return [
    explain({
      title: 'One motion, two independent halves',
      plain: [
        'Gravity pulls straight down and does nothing else. So the horizontal '
        + 'motion carries on at a constant speed — nothing is pushing it along, '
        + 'and nothing is slowing it — while the vertical motion is exactly the '
        + 'same as a ball thrown straight up.',
        'The curve you see is those two happening at once. It is not a single '
        + 'complicated motion; it is two simple ones stacked, and every equation '
        + 'below treats them separately.',
        params.dragOn
          ? 'With the air switched on, that independence breaks: drag depends on '
            + 'the total speed, so the horizontal motion now affects the vertical '
            + 'one and vice versa. That coupling is why no formula gives the '
            + 'answer and the app has to step through it instead.'
          : 'Switch air resistance on and the independence goes away, because drag '
            + 'depends on the total speed.',
      ],
      open: true,
    }),

    explain({
      title: 'Splitting the launch',
      plain: 'The launch velocity is one arrow, and it is easier to work with as '
        + 'two — one along the ground and one straight up.',
      formula: 'uₓ = u · cos θ     u_y = u · sin θ',
      validWhen: 'Always — it is trigonometry, not physics.',
      worked: `uₓ = ${fmtFixed(params.speed, 1)} × cos ${fmtFixed(params.angleDeg, 0)}° = ${fmtFixed(ux, 2)} m/s\n`
        + `u_y = ${fmtFixed(params.speed, 1)} × sin ${fmtFixed(params.angleDeg, 0)}° = ${fmtFixed(uy, 2)} m/s`,
      becomes: 'Any vector can be split like this, along any two perpendicular '
        + 'directions you find convenient. On a ramp, the useful pair is along '
        + 'the slope and into it.',
    }),

    explain({
      title: 'The top of the flight',
      plain: 'The vertical velocity falls steadily to zero, and that instant is '
        + 'the highest point. The acceleration does not change there — which is '
        + 'the whole reason the ball comes back down.',
      formula: 't_apex = u_y / g          h_max = h₀ + u_y² / (2·g)',
      validWhen: 'No air resistance, constant g.',
      worked: uy > 0
        ? `t_apex = ${fmtFixed(uy, 2)} ÷ ${fmtFixed(gravity.g, 4)} = ${fmtFixed(top.t, 3)} s\n`
          + `h_max  = ${fmtFixed(params.height, 1)} + ${fmtFixed(uy, 2)}² ÷ (2 × ${fmtFixed(gravity.g, 4)})`
          + ` = ${fmtFixed(top.height, 2)} m`
        : 'Launched level or downward, so the start is already the highest point.',
      becomes: 'Notice the mass is nowhere in either expression. Two balls of any '
        + 'masses launched identically reach the same height at the same moment — '
        + 'in a vacuum.',
    }),

    explain({
      title: 'How far it goes',
      plain: params.height === 0
        ? 'On level ground the range depends on sin(2θ), which is symmetric about '
          + '45°. That is why two different angles reach the same target.'
        : 'Launched from a height, the flight is no longer symmetric and the '
          + 'closed form needs the quadratic solved for the landing time.',
      formula: params.height === 0 ? 'R = u² · sin(2θ) / g' : 'R = uₓ · t_flight,  with t from ½gt² − u_y·t − h₀ = 0',
      validWhen: 'No air resistance; flat, level ground.',
      worked: `t_flight = ${fmtFixed(flightTime(ideal), 3)} s\n`
        + `R = ${fmtFixed(ux, 2)} × ${fmtFixed(flightTime(ideal), 3)} = ${fmtFixed(range(ideal), 2)} m`
        + (targets.reachable && targets.angles.length > 1
          ? `\n\nThe same ${fmtFixed(range(ideal), 1)} m is also reached at `
            + `${targets.angles.map((a) => `${fmtFixed(a, 1)}°`).join(' and ')} — they add up to 90°.`
          : ''),
    }),

    equationPanel(equation('gravity-field'),
      `Here g = ${fmtFixed(gravity.g, 4)} m/s².\n\n${gravity.source}`),
  ];
}
