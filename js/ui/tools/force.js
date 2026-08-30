/**
 * The Force Laboratory. Every force on one box, drawn separately, then summed.
 *
 * The design decision that carries the lesson: the net force is drawn as a
 * *dashed* arrow alongside the real ones, never instead of them. A learner who
 * only sees the net force learns that acceleration comes from "the force". A
 * learner who watches five solid arrows collapse into one dashed one has seen
 * the actual rule.
 */

import { el } from '../dom.js';
import { section, numberField, sliderField, stat, banner } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { gravitySection, airSection, surfaceSection, viewSection, compareSection, presets } from './common.js';
import { equation } from '../../models.js';
import { inspect } from '../../world.js';
import { gravityFor, surfaceFor } from '../../scenarios.js';
import { fmtFixed, fmtDirectionWords } from '../../format.js';

export const meta = {
  id: 'force',
  label: 'Force lab',
  short: 'Force',
  concept: 'force',
  world: true,
  title: 'Applied force, friction, gravity, the normal force — and their sum',
};

export const channels = [
  { label: 'Net force against time', ids: ['fx'] },
  { label: 'Velocity against time', ids: ['vx'] },
];

const PRESETS = [
  { id: 'stuck', label: 'Push, but not enough', title: 'Under the static limit: friction matches you exactly', params: { mass: 10, appliedX: 20, slopeDeg: 0, surfaceId: 'wood', dragOn: false } },
  { id: 'breaks', label: 'Just enough to move it', title: 'Past the static limit — watch friction drop', params: { mass: 10, appliedX: 55, slopeDeg: 0, surfaceId: 'wood', dragOn: false } },
  { id: 'steady', label: 'Constant velocity', title: 'Applied force exactly equals friction: moving, with zero net force', params: { mass: 10, appliedX: 29.4, slopeDeg: 0, surfaceId: 'wood', dragOn: false } },
  { id: 'ramp', label: 'On a slope', title: 'Gravity now has a component along the surface', params: { mass: 10, appliedX: 0, slopeDeg: 25, surfaceId: 'wood', dragOn: false } },
  { id: 'ice', label: 'On ice', title: 'Almost no friction at all', params: { mass: 10, appliedX: 20, slopeDeg: 0, surfaceId: 'ice', dragOn: false } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  const friction = surfaceFor(params);
  const gravity = gravityFor(params);
  const staticLimit = friction.muS * params.mass * gravity.g * Math.cos((params.slopeDeg * Math.PI) / 180);

  return [
    section('The experiment', [
      presets(PRESETS, ctx),
      sliderField('Push (horizontal)', params.appliedX, (v) => set('appliedX', v), {
        min: -300, max: 300, step: 1, key: 'appliedX',
        format: (v) => `${fmtFixed(v, 0)} N`,
        hint: `Static friction can resist up to ${fmtFixed(staticLimit, 1)} N before the box `
          + 'breaks away. Below that it matches your push exactly.',
      }),
      sliderField('Lift or press (vertical)', params.appliedY, (v) => set('appliedY', v), {
        min: -300, max: 300, step: 1, key: 'appliedY',
        format: (v) => `${fmtFixed(v, 0)} N`,
        info: 'Pressing down increases the normal force and so increases friction. '
          + 'Lifting reduces both — which is why you lift a heavy box slightly '
          + 'before you drag it.',
      }),
      numberField('Mass of the box', params.mass, (v) => set('mass', v), {
        unit: 'kg', min: 0.1, max: 1000, step: 1, key: 'mass',
      }),
    ], { key: 'setup' }),

    surfaceSection(ctx),
    gravitySection(ctx),
    airSection(ctx),
    compareSection(ctx),
    viewSection(ctx),
  ];
}

export function readouts(ctx) {
  const box = inspect(ctx.world, 'box');
  if (!box) return [];

  const tiles = box.forces.map((f) => stat(f.label, `${fmtFixed(f.magnitude, 1)} N`, {
    swatch: f.token,
    note: fmtDirectionWords(f.vec, { still: 'zero' }),
  }));

  tiles.push(stat('Net force', `${fmtFixed(box.net.magnitude, 1)} N`, {
    swatch: '--force-net',
    accent: true,
    note: box.net.magnitude < 1e-6 ? 'They cancel exactly' : fmtDirectionWords(box.net.vec),
  }));
  tiles.push(stat('Acceleration', `${fmtFixed(Math.hypot(box.acceleration.x, box.acceleration.y), 2)} m/s²`, {
    swatch: '--vec-acceleration',
    note: 'Net force ÷ mass',
  }));

  return tiles;
}

export function banners(ctx) {
  const box = inspect(ctx.world, 'box');
  if (!box) return [];
  const out = [];
  const contact = box.contact;

  if (contact.touching && contact.frictionMode === 'static') {
    out.push(banner('ok',
      `The box is not moving. Friction is supplying exactly `
      + `${fmtFixed(box.forces.find((f) => f.id === 'friction')?.magnitude ?? 0, 1)} N — `
      + `not its maximum of ${fmtFixed(contact.staticLimit, 1)} N, just enough to `
      + 'cancel what you are applying. Static friction is *at most* μs·N, which is '
      + 'the detail almost every textbook diagram gets wrong.'));
  }

  if (contact.frictionMode === 'breaking-away') {
    out.push(banner('warn',
      `Your push has passed the ${fmtFixed(contact.staticLimit, 1)} N static limit, so `
      + 'the box breaks away — and friction *drops* to the kinetic value. That '
      + 'sudden drop is why a stuck object lurches once it starts moving.'));
  }

  if (box.net.magnitude < 1e-3 && box.speed > 1e-3) {
    out.push(banner('ok',
      'Moving at a constant velocity with zero net force. This is the situation '
      + 'that makes Newton\'s first law hard to believe from everyday experience: '
      + 'four forces are acting, and the box carries on exactly as it was.'));
  }

  if (Math.abs(box.forces.find((f) => f.id === 'normal')?.magnitude ?? 1) < 1e-6 && contact.touching) {
    out.push(banner('warn',
      'The normal force has gone to zero — you are lifting hard enough to take '
      + 'the box off the surface. Friction goes with it, because friction is μ·N '
      + 'and N is now nothing.'));
  }

  return out;
}

export function explains(ctx) {
  const { params } = ctx;
  const box = inspect(ctx.world, 'box');
  if (!box) return [];

  const gravity = gravityFor(params);
  const friction = surfaceFor(params);
  const weight = params.mass * gravity.g;
  const normal = box.forces.find((f) => f.id === 'normal')?.magnitude ?? 0;
  const frictionForce = box.forces.find((f) => f.id === 'friction')?.magnitude ?? 0;

  const sum = box.forces
    .map((f) => `  ${f.symbol.padEnd(6)} ${fmtFixed(f.vec.x, 2).padStart(9)}  ${fmtFixed(f.vec.y, 2).padStart(9)}`)
    .join('\n');

  return [
    explain({
      title: 'It is the net force that matters, not the forces',
      plain: [
        'Four separate forces act on this box, and each is drawn in its own '
        + 'colour. The dashed arrow is their vector sum — the net force — and it '
        + 'is the only one of the five that decides what happens next.',
        'That is why a box can have plenty of forces on it and not accelerate at '
        + 'all. It is also why "there is a force on it, so it must be moving" is '
        + 'the single most common wrong sentence in mechanics.',
      ],
      open: true,
    }),

    equationPanel(equation('newton-2'),
      `Adding the forces, component by component (N):\n`
      + `         x           y\n${sum}\n`
      + `  ${'net'.padEnd(6)} ${fmtFixed(box.net.vec.x, 2).padStart(9)}  ${fmtFixed(box.net.vec.y, 2).padStart(9)}\n\n`
      + `a = F_net ÷ m = ${fmtFixed(box.net.magnitude, 2)} N ÷ ${fmtFixed(params.mass, 2)} kg`
      + ` = ${fmtFixed(Math.hypot(box.acceleration.x, box.acceleration.y), 3)} m/s²`),

    equationPanel(equation('friction'),
      `N = ${fmtFixed(normal, 2)} N\n\n`
      + `Static limit:   μs · N = ${friction.muS} × ${fmtFixed(normal, 2)} = ${fmtFixed(friction.muS * normal, 2)} N\n`
      + `Kinetic value:  μk · N = ${friction.muK} × ${fmtFixed(normal, 2)} = ${fmtFixed(friction.muK * normal, 2)} N\n\n`
      + `Currently: ${fmtFixed(frictionForce, 2)} N (${box.contact.frictionMode})`),

    equationPanel(equation('weight'),
      `W = m · g = ${fmtFixed(params.mass, 2)} kg × ${fmtFixed(gravity.g, 4)} m/s² = ${fmtFixed(weight, 2)} N\n\n`
      + (Math.abs(params.slopeDeg) > 0.5
        ? `On a ${fmtFixed(Math.abs(params.slopeDeg), 0)}° slope this splits into:\n`
          + `  into the surface:  W·cos θ = ${fmtFixed(weight * Math.cos((params.slopeDeg * Math.PI) / 180), 2)} N\n`
          + `  along the surface: W·sin θ = ${fmtFixed(weight * Math.sin((params.slopeDeg * Math.PI) / 180), 2)} N`
        : 'On level ground the whole of it presses into the surface, and the '
          + 'normal force cancels it exactly.')),

    explain({
      title: 'The normal force is a reaction, not a constant',
      plain: [
        'The surface pushes back exactly hard enough to stop the box sinking into '
        + 'it — no more, no less. Press down and it grows; lift and it shrinks; '
        + 'lift hard enough and it reaches zero and the box leaves the surface.',
        'Everything friction can do follows from it, because friction is μ times '
        + 'the normal force. That is why pressing down on something makes it '
        + 'harder to slide, and why it is easier to drag a box you are also '
        + 'lifting slightly.',
      ],
    }),
  ];
}
