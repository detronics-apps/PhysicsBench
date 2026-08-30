/**
 * Mass versus weight, and the free-fall comparison.
 *
 * This is the lab that has to correct the most stubborn belief in the subject —
 * that heavy things fall faster — and the way it does it matters. It does not
 * say the belief is wrong, because in air it is right, and a learner who is
 * told otherwise has simply been handed a second misconception.
 *
 * Instead: drop them in a vacuum and watch them stay level. Then switch the air
 * on and watch the everyday result come back, for the right reason.
 */

import { el } from '../dom.js';
import { section, numberField, toggleField, selectField, stat, banner, table } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { gravitySection, airSection, viewSection, compareSection, presets } from './common.js';
import { equation } from '../../models.js';
import { inspect, findBody } from '../../world.js';
import { gravityFor, fluidFor } from '../../scenarios.js';
import { terminalSpeed } from '../../forces.js';
import { ENVIRONMENTS, MATERIALS, sphereArea } from '../../constants.js';
import { fmtFixed } from '../../format.js';

export const meta = {
  id: 'weight',
  label: 'Mass vs weight',
  short: 'Weight',
  concept: 'gravity',
  world: true,
  title: 'The same mass everywhere; a different weight on every world',
};

export const channels = [
  { label: 'Height against time — two masses, dropped together', ids: ['y'] },
  { label: 'Speed against time', ids: ['speed'] },
];

const PRESETS = [
  { id: 'vacuum', label: 'Vacuum drop', title: '1 kg and 10 kg, no air. They stay level.', params: { m1: 1, m2: 10, dragOn: false, sameSize: true, height: 40 } },
  { id: 'air', label: 'The same drop, with air', title: 'Now they separate — and the reason is the air, not the gravity', params: { m1: 1, m2: 10, dragOn: true, sameSize: true, height: 200 } },
  { id: 'moon', label: 'On the Moon', title: 'A sixth of the weight, the same mass', params: { envId: 'moon', dragOn: false, height: 40 } },
  { id: 'jupiter', label: 'On Jupiter', title: 'Two and a half times Earth', params: { envId: 'jupiter', dragOn: false, height: 40 } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  return [
    section('The two objects', [
      presets(PRESETS, ctx),
      numberField('Ball A mass', params.m1, (v) => set('m1', v), { unit: 'kg', min: 0.001, max: 1000, step: 0.5, key: 'm1' }),
      numberField('Ball B mass', params.m2, (v) => set('m2', v), { unit: 'kg', min: 0.001, max: 1000, step: 0.5, key: 'm2' }),
      toggleField('Same size', params.sameSize, (v) => set('sameSize', v), {
        key: 'sameSize',
        hint: params.sameSize
          ? 'Same size, different mass — which isolates mass as the only difference.'
          : 'Sized from their material densities, so the heavy one is also bigger '
            + 'and meets more air. Two things differ now, not one.',
      }),
      !params.sameSize ? selectField('Ball A material', MATERIALS.map((m) => ({ value: m.id, label: m.label })), params.material1, (v) => set('material1', v), { key: 'material1' }) : null,
      !params.sameSize ? selectField('Ball B material', MATERIALS.map((m) => ({ value: m.id, label: m.label })), params.material2, (v) => set('material2', v), { key: 'material2' }) : null,
      numberField('Drop height', params.height, (v) => set('height', v), { unit: 'm', min: 1, max: 2000, step: 5, key: 'height' }),
    ].filter(Boolean), { key: 'objects' }),

    gravitySection(ctx),
    airSection(ctx),
    compareSection(ctx),
    viewSection(ctx),
  ];
}

export function readouts(ctx) {
  const { params } = ctx;
  const gravity = gravityFor(params);
  const light = inspect(ctx.world, 'light');
  const heavy = inspect(ctx.world, 'heavy');
  if (!light || !heavy) return [];

  return [
    stat('Ball A mass', `${fmtFixed(params.m1, 2)} kg`, { note: 'The same everywhere in the universe' }),
    stat('Ball A weight', `${fmtFixed(params.m1 * gravity.g, 2)} N`, {
      swatch: '--force-weight',
      note: `A force: m × g on ${gravity.env.short}`,
    }),
    stat('Ball B mass', `${fmtFixed(params.m2, 2)} kg`, { note: 'Also unchanged by where it is' }),
    stat('Ball B weight', `${fmtFixed(params.m2 * gravity.g, 2)} N`, {
      swatch: '--force-weight',
      note: `${fmtFixed(params.m2 / params.m1, 1)}× the weight of A, and always will be`,
    }),
    stat('Height difference', `${fmtFixed(Math.abs(light.pos.y - heavy.pos.y), 3)} m`, {
      accent: true,
      note: params.dragOn ? 'The air is separating them' : 'They fall together',
    }),
    stat('Acceleration', `${fmtFixed(Math.hypot(heavy.acceleration.x, heavy.acceleration.y), 2)} m/s²`, {
      swatch: '--vec-acceleration',
      note: params.dragOn ? 'Falling as drag builds' : 'Identical for both, whatever their masses',
    }),
  ];
}

export function banners(ctx) {
  const { params } = ctx;
  const gravity = gravityFor(params);
  const out = [];
  const light = findBody(ctx.world, 'light');
  const heavy = findBody(ctx.world, 'heavy');
  if (!light || !heavy) return out;

  if (!params.dragOn) {
    out.push(banner('ok',
      `Both balls are accelerating at ${fmtFixed(gravity.g, 3)} m/s², and the gap `
      + `between them is ${fmtFixed(Math.abs(light.pos.y - heavy.pos.y), 4)} m — nothing. `
      + `Ball B is pulled ${fmtFixed(params.m2 / params.m1, 1)}× harder and resists `
      + 'acceleration exactly that much more. The two cancel.'));
  } else {
    const air = fluidFor(params);
    const vt = (mass, radius) => terminalSpeed(mass, gravity.g, { density: air.density, cd: air.cd, area: sphereArea(radius) });
    out.push(banner('warn',
      'With air, the heavier ball wins — and not because gravity pulls it harder. '
      + 'Both feel the same drag at the same speed, but the heavier one needs far '
      + `more drag to balance its weight. Terminal speeds: `
      + `${fmtFixed(vt(light.mass, light.radius), 1)} m/s and `
      + `${fmtFixed(vt(heavy.mass, heavy.radius), 1)} m/s.`));
  }

  if (params.envId === 'moon') {
    out.push(banner('info',
      'The Moon has effectively no atmosphere, so the no-air-resistance model is '
      + 'very nearly the truth there. That is what made the Apollo 15 hammer and '
      + 'feather drop work in front of a camera.'));
  }

  if (!params.sameSize && params.dragOn) {
    out.push(banner('warn',
      'The balls now differ in both mass and size, so whichever lands first, you '
      + 'cannot say which of the two caused it. Turn "same size" back on to make '
      + 'this a fair test.'));
  }

  return out;
}

export function explains(ctx) {
  const { params } = ctx;
  const gravity = gravityFor(params);

  const rows = ENVIRONMENTS.filter((e) => !['custom', 'orbit'].includes(e.id)).map((e) => ({
    where: e.short,
    g: `${fmtFixed(e.g, 2)} m/s²`,
    mass: `${fmtFixed(params.m2, 1)} kg`,
    weight: `${fmtFixed(params.m2 * e.g, 1)} N`,
  }));

  return [
    explain({
      title: 'Mass and weight are not the same quantity',
      plain: [
        'Mass is how much matter something has, and how strongly it resists being '
        + 'accelerated. It is measured in kilograms and it does not change when '
        + 'you move it.',
        'Weight is the force gravity exerts on that mass. It is measured in '
        + 'newtons, and it changes with where you are — a sixth as much on the '
        + 'Moon, two and a half times as much on Jupiter.',
        'Bathroom scales confuse the two by measuring a force and printing '
        + 'kilograms on the dial. Take a set to the Moon and they would read a '
        + 'sixth as much, while nothing about you had changed.',
      ],
      open: true,
    }),

    equationPanel(equation('weight'),
      `Ball A:  W = ${fmtFixed(params.m1, 2)} kg × ${fmtFixed(gravity.g, 4)} m/s² = ${fmtFixed(params.m1 * gravity.g, 2)} N\n`
      + `Ball B:  W = ${fmtFixed(params.m2, 2)} kg × ${fmtFixed(gravity.g, 4)} m/s² = ${fmtFixed(params.m2 * gravity.g, 2)} N\n\n`
      + `On ${gravity.env.label}.`),

    explain({
      title: 'Why they fall together — the cancellation, written out',
      plain: 'This is the whole answer, and it fits on three lines. The mass that '
        + 'gravity pulls on and the mass that resists acceleration are the same '
        + 'number, so it divides out and never reaches the answer at all.',
      formula: 'a = F ÷ m = (m · g) ÷ m = g',
      validWhen: 'No air resistance, and the two objects at the same place.',
      worked: `Ball A:  a = (${fmtFixed(params.m1, 2)} × ${fmtFixed(gravity.g, 4)}) ÷ ${fmtFixed(params.m1, 2)} = ${fmtFixed(gravity.g, 4)} m/s²\n`
        + `Ball B:  a = (${fmtFixed(params.m2, 2)} × ${fmtFixed(gravity.g, 4)}) ÷ ${fmtFixed(params.m2, 2)} = ${fmtFixed(gravity.g, 4)} m/s²\n\n`
        + 'Different weights. Identical accelerations.',
      becomes: 'That the two masses are the same number is not obvious — it is an '
        + 'experimental fact, tested to about one part in 10¹⁵, and it is the '
        + 'observation general relativity is built on.',
    }),

    explain({
      title: 'The same mass, weighed around the solar system',
      plain: `Ball B is ${fmtFixed(params.m2, 2)} kg wherever it goes. Its weight is `
        + 'a different number in every column.',
      notes: 'Values for the gas giants are quoted at the depth where the pressure '
        + 'is one bar, because there is no surface to stand on.',
    }),

    table(
      [
        { key: 'where', label: 'Where' },
        { key: 'g', label: 'g', num: true },
        { key: 'mass', label: 'Mass', num: true },
        { key: 'weight', label: 'Weight', num: true },
      ],
      rows,
    ),

    params.dragOn ? equationPanel(equation('terminal-velocity'),
      `A heavier object of the same size has a higher terminal speed, so in air it \n`
      + `does fall faster — for a reason that has nothing to do with gravity \n`
      + `pulling it harder.\n\n`
      + `v_t ∝ √(m ÷ A):  ${fmtFixed(params.m2 / params.m1, 1)}× the mass gives `
      + `${fmtFixed(Math.sqrt(params.m2 / params.m1), 2)}× the terminal speed.`) : null,
  ].filter(Boolean);
}
