/**
 * The bench: one set of controls that grows with the steps.
 *
 * Every panel asks "is this feature on?" rather than "which step is this?", so
 * the sidebar at step six is the sidebar from step one with four more sections
 * under it — and the mass slider is still exactly where it was.
 */

import { el } from './dom.js';
import {
  section, numberField, sliderField, selectField, toggleField, stat, banner, table, buttonRow, button,
} from './widgets.js';
import { explain, equationPanel } from './explain.js';
import { equation } from '../models.js';
import { stageById, featuresAt, pushState } from '../stages.js';
import { SHAPES, MATERIALS, describe as describeObject, sizeFor, dragComparison, floats } from '../shapes.js';
import { FLUIDS, drag as fluidDrag, terminalSpeed } from '../drag.js';
import { WORLDS, describeWorld, surfaceGravity, everydayComparison, massForGravity } from '../gravitation.js';
import { inspect, totals, findBody } from '../world.js';
import { len } from '../vec.js';
import { fmtFixed, fmtDirectionWords } from '../format.js';
import { G, G_STANDARD } from '../constants.js';

/* ---------------------------------------------------------- the controls -- */

export function controls(ctx) {
  const { params: p, set, state } = ctx;
  const f = ctx.features;
  const object = describeObject({ shapeId: p.shapeId, size: p.size, mass: p.mass });

  return [
    objectSection(ctx, object, f),
    f.has('applied') ? pushSection(ctx) : null,
    f.has('second-mass') && !f.has('planet') ? otherMassSection(ctx) : null,
    f.has('planet') ? worldSection(ctx) : null,
    f.has('ground') ? surfaceSection(ctx) : null,
    f.has('fluid') ? fluidSection(ctx, object) : null,
    f.has('collide') ? secondObjectSection(ctx) : null,
    viewSection(ctx),
  ].filter(Boolean);
}

function objectSection(ctx, object, f) {
  const { params: p, set } = ctx;
  return section('The object', [
    numberField('Mass', p.mass, (v) => set('mass', v), {
      unit: 'kg', min: 0.001, max: 1e6, step: 0.5, key: 'mass',
      info: 'How strongly it resists being accelerated. This is the one property '
        + 'the object has before anything happens to it.',
      hint: `${fmtFixed(object.density, 0)} kg/m³ at this size — `
        + `${object.volume.toPrecision(3)} m³ of it.`,
    }),

    f.has('shape') ? selectField('Shape', SHAPES.map((s) => ({ value: s.id, label: s.label })), p.shapeId, (v) => set('shapeId', v), {
      key: 'shapeId',
      hint: object.shape.note,
    }) : null,

    sliderField('Size', p.size, (v) => set('size', v), {
      min: 0.05, max: 4, step: 0.05, key: 'size',
      format: (v) => `${fmtFixed(v, 2)} m across`,
      info: 'Changes the volume, the frontal area and how it sits on a surface — '
        + 'but not the mass, which is set directly above.',
    }),

    f.has('shape') ? el('div', { class: 'field__hint', text: dragComparison(p.shapeId, p.size).text }) : null,

    buttonRow([
      button('Match a material', () => {
        // A quick way to get a believable mass: pick a density, keep the size.
        const material = MATERIALS.find((m) => m.id === p.materialId) || MATERIALS[0];
        ctx.setMany({ mass: object.volume * material.density });
      }, { small: true, title: 'Set the mass from the size and a real density' }),
    ]),
    selectField('Material', MATERIALS.map((m) => ({ value: m.id, label: `${m.label} — ${m.density} kg/m³` })), p.materialId, (v) => set('materialId', v), {
      key: 'materialId',
      hint: 'Only used by the button above. The mass stays whatever you set it to.',
    }),
  ].filter(Boolean), { key: 'object' });
}

function pushSection(ctx) {
  const { params: p, set } = ctx;
  const accel = p.mass > 0 ? p.pushForce / p.mass : 0;
  const gained = accel * p.pushSeconds;

  return section('The push', [
    sliderField('How hard', p.pushForce, (v) => set('pushForce', v), {
      min: -200, max: 200, step: 1, key: 'pushForce',
      format: (v) => `${fmtFixed(v, 0)} N`,
      info: 'A force, in newtons. Divided by the mass it gives the acceleration — '
        + 'so the same push does less to a heavier object.',
    }),
    sliderField('Which way', p.pushAngleDeg, (v) => set('pushAngleDeg', v), {
      min: -180, max: 180, step: 5, key: 'pushAngleDeg',
      format: (v) => `${v}°`,
      hint: '0° is to the right, 90° straight up. Measured anticlockwise, as '
        + 'angles are everywhere in this app.',
    }),
    sliderField('For how long', p.pushSeconds, (v) => set('pushSeconds', v), {
      min: 0, max: 20, step: 0.25, key: 'pushSeconds',
      format: (v) => `${fmtFixed(v, 2)} s`,
      info: 'The push stops after this. What happens next is the interesting '
        + 'part: nothing is needed to keep the object moving.',
    }),
    el('div', {
      class: 'field__hint',
      text: `${fmtFixed(p.pushForce, 0)} N on ${fmtFixed(p.mass, 2)} kg gives `
        + `${fmtFixed(accel, 2)} m/s², held for ${fmtFixed(p.pushSeconds, 2)} s — so it `
        + `should leave the push doing ${fmtFixed(Math.abs(gained), 2)} m/s.`,
    }),
    numberField('Starting velocity', p.v0, (v) => set('v0', v), {
      unit: 'm/s', step: 0.5, min: -500, max: 500, key: 'v0',
    }),
  ], { key: 'push' });
}

function otherMassSection(ctx) {
  const { params: p, set } = ctx;
  const comparison = everydayComparison(p.mass, p.otherMass, Math.abs(p.otherX));

  return section('The second mass', [
    numberField('Mass', p.otherMass, (v) => set('otherMass', v), {
      unit: 'kg', min: 0.001, max: 1e30, step: 100, key: 'otherMass',
      info: 'Both masses appear in G·m₁·m₂/r², so doubling either one doubles the '
        + 'pull. Neither is "the one doing the pulling".',
    }),
    sliderField('Size', p.otherSize, (v) => set('otherSize', v), {
      min: 0.1, max: 6, step: 0.1, key: 'otherSize', format: (v) => `${fmtFixed(v, 1)} m`,
    }),
    sliderField('How far away', p.otherX, (v) => set('otherX', v), {
      min: 1, max: 40, step: 0.5, key: 'otherX',
      format: (v) => `${fmtFixed(v, 1)} m`,
      info: 'The pull falls off as the square of this. Twice as far apart is a '
        + 'quarter of the force.',
    }),
    el('div', { class: 'field__hint', text: comparison.text }),
    buttonRow([
      button('Make it a planet', () => ctx.goToStage('planet'), {
        small: true, primary: true,
        title: 'Same equation, a mass twenty-four orders of magnitude bigger',
      }),
    ]),
  ], { key: 'other' });
}

function worldSection(ctx) {
  const { params: p, set } = ctx;
  const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });

  return section('The world it is on', [
    selectField('A real one', [...WORLDS.map((w) => ({ value: w.id, label: w.label })), { value: 'custom', label: 'Something of your own' }],
      p.planetId, (v) => {
        const found = WORLDS.find((w) => w.id === v);
        if (found) ctx.setMany({ planetId: v, planetMass: found.mass, planetRadius: found.radius });
        else set('planetId', 'custom');
      }, { key: 'planetId', hint: world.note }),

    numberField('Its mass', p.planetMass, (v) => ctx.setMany({ planetMass: v, planetId: 'custom' }), {
      unit: 'kg', min: 1e10, max: 1e35, step: 1e23, key: 'planetMass', decimals: 4,
      info: 'Half the mass, half the surface gravity — a straight proportion.',
    }),
    numberField('Its radius', p.planetRadius / 1000, (v) => ctx.setMany({ planetRadius: v * 1000, planetId: 'custom' }), {
      unit: 'km', min: 1, max: 1e9, step: 100, key: 'planetRadius',
      info: 'Half the radius, four times the surface gravity — it goes as 1/r².',
    }),

    el('div', { class: 'dims' }, [
      el('dt', { text: 'Surface gravity' }),
      el('dd', { text: `${fmtFixed(world.g, 3)} m/s²` }),
      el('dt', { text: 'Mean density' }),
      el('dd', { text: `${fmtFixed(world.density, 0)} kg/m³` }),
      el('dt', { text: 'Escape speed' }),
      el('dd', { text: `${(world.escapeSpeed / 1000).toPrecision(3)} km/s` }),
      el('dt', { text: 'Your object would weigh' }),
      el('dd', { text: `${fmtFixed(p.mass * world.g, 2)} N` }),
    ]),
    el('div', {
      class: 'field__hint',
      text: 'Nothing here is looked up. g = G·M/r², computed from the two numbers '
        + 'above — which is why a small dense world can out-pull a huge fluffy one.',
    }),

    sliderField('Drop it from', p.dropHeight ?? 0.6, (v) => set('dropHeight', v), {
      min: 0, max: 20, step: 0.1, key: 'dropHeight', format: (v) => `${fmtFixed(v, 1)} m up`,
    }),
  ], { key: 'world' });
}

function surfaceSection(ctx) {
  const { params: p, set } = ctx;
  const f = ctx.features;
  const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });
  const rad = (p.slopeDeg * Math.PI) / 180;
  const weight = p.mass * world.g;

  return section('The surface', [
    sliderField('Tilt', p.slopeDeg, (v) => set('slopeDeg', v), {
      min: -60, max: 60, step: 1, key: 'slopeDeg',
      format: (v) => `${v}°`,
      hint: 'A positive angle rises to the right, so downhill is to the left.',
    }),
    el('div', { class: 'dims' }, [
      el('dt', { text: 'Weight' }),
      el('dd', { text: `${fmtFixed(weight, 2)} N` }),
      el('dt', { text: 'Pressing into the surface' }),
      el('dd', { text: `${fmtFixed(weight * Math.cos(rad), 2)} N` }),
      el('dt', { text: 'Left over, along the slope' }),
      el('dd', { text: `${fmtFixed(Math.abs(weight * Math.sin(rad)), 2)} N` }),
    ]),

    f.has('friction') ? sliderField('Static friction μs', p.muS, (v) => set('muS', v), {
      min: 0, max: 2, step: 0.05, key: 'muS',
      format: (v) => fmtFixed(v, 2),
      info: 'The most friction can resist before it lets go, as a multiple of the '
        + 'normal force. Rubber on dry asphalt is about 0.9; PTFE on steel, 0.04.',
    }) : null,
    f.has('friction') ? sliderField('Kinetic friction μk', p.muK, (v) => set('muK', Math.min(v, p.muS)), {
      min: 0, max: 2, step: 0.05, key: 'muK',
      format: (v) => fmtFixed(v, 2),
      hint: `Cannot exceed μs — that is what the two words mean. The drop from `
        + `${fmtFixed(p.muS, 2)} to ${fmtFixed(p.muK, 2)} is why a stuck object lurches when it moves.`,
    }) : null,
    f.has('friction') ? el('div', {
      class: 'field__hint',
      text: `It will start to slide at ${fmtFixed((Math.atan(p.muS) * 180) / Math.PI, 1)}° — `
        + 'the angle where tan θ passes μs, which is a way of measuring μs with a '
        + 'plank and a protractor.',
    }) : null,
  ].filter(Boolean), { key: 'surface' });
}

function fluidSection(ctx, object) {
  const { params: p, set } = ctx;
  const fluid = FLUIDS.find((x) => x.id === p.fluidId) || FLUIDS[0];
  const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });
  const vt = terminalSpeed({
    mass: p.mass, g: world.g, density: fluid.density, viscosity: fluid.viscosity,
    diameter: p.size, area: object.area, cdShape: object.cd,
  });

  return section('The fluid it moves through', [
    selectField('Fluid', FLUIDS.map((x) => ({ value: x.id, label: x.label })), p.fluidId, (v) => set('fluidId', v), {
      key: 'fluidId', hint: fluid.note,
    }),
    el('div', { class: 'dims' }, [
      el('dt', { text: 'Density' }),
      el('dd', { text: `${fluid.density} kg/m³` }),
      el('dt', { text: 'Viscosity' }),
      el('dd', { text: `${fluid.viscosity} Pa·s` }),
      el('dt', { text: 'Terminal speed' }),
      el('dd', { text: Number.isFinite(vt) ? `${fmtFixed(vt, 2)} m/s` : 'none' }),
    ]),
    fluid.density > 0 ? el('div', { class: 'field__hint', text: floats(object.density, fluid.density).text }) : null,
  ].filter(Boolean), { key: 'fluid' });
}

function secondObjectSection(ctx) {
  const { params: p, set } = ctx;
  return section('The second object', [
    numberField('Mass', p.mass2, (v) => set('mass2', v), { unit: 'kg', min: 0.001, max: 1e6, step: 0.5, key: 'mass2' }),
    selectField('Shape', SHAPES.map((s) => ({ value: s.id, label: s.label })), p.shape2Id, (v) => set('shape2Id', v), { key: 'shape2Id' }),
    sliderField('Size', p.size2, (v) => set('size2', v), { min: 0.05, max: 4, step: 0.05, key: 'size2', format: (v) => `${fmtFixed(v, 2)} m` }),
    sliderField('Starts at', p.x2, (v) => set('x2', v), { min: -40, max: 40, step: 0.5, key: 'x2', format: (v) => `${fmtFixed(v, 1)} m` }),
    sliderField('Moving at', p.v2, (v) => set('v2', v), { min: -50, max: 50, step: 0.5, key: 'v2', format: (v) => `${fmtFixed(v, 1)} m/s` }),
    sliderField('Bounciness e', p.restitution, (v) => set('restitution', v), {
      min: 0, max: 1, step: 0.05, key: 'restitution',
      format: (v) => `e = ${fmtFixed(v, 2)}`,
      info: 'Separation speed divided by approach speed. e = 1 conserves kinetic '
        + 'energy as well as momentum; e = 0 means they move off together.',
    }),
  ], { key: 'second' });
}

function viewSection(ctx) {
  const { state, setView } = ctx;
  return section('The drawing', [
    toggleField('Numbers on the arrows', state.view.showValues, (v) => setView('showValues', v), { key: 'view:values' }),
    toggleField('Trail', state.view.showTrail, (v) => setView('showTrail', v), { key: 'view:trail' }),
    toggleField('Metre grid', state.view.showGrid, (v) => setView('showGrid', v), { key: 'view:grid' }),
    toggleField('Graphs', state.view.graphs, (v) => setView('graphs', v), { key: 'view:graphs' }),
  ], { key: 'view', open: false });
}

/* ---------------------------------------------------------- the readouts -- */

/**
 * The headline numbers.
 *
 * Momentum and kinetic energy appear the moment anything can move and stay for
 * the rest of the bench. They are not a later topic — they are two more ways of
 * describing what is already on screen, and hiding them until a "momentum
 * chapter" is what makes them feel like one.
 */
export function readouts(ctx) {
  const f = ctx.features;
  const main = inspect(ctx.world, 'main');
  if (!main) return [];
  const sums = totals(ctx.world);
  const tiles = [];

  tiles.push(stat('Mass', `${fmtFixed(main.mass, main.mass < 10 ? 2 : 0)} kg`, {
    note: 'Unchanged by anything that happens to it',
  }));

  if (f.has('applied') || f.has('mutual-gravity')) {
    tiles.push(stat('Velocity', `${fmtFixed(main.speed, 2)} m/s`, {
      swatch: '--vec-velocity',
      note: fmtDirectionWords(main.vel, { still: 'not moving' }),
    }));
    tiles.push(stat('Acceleration', `${fmtFixed(len(main.acceleration), 2)} m/s²`, {
      swatch: '--vec-acceleration',
      note: fmtDirectionWords(main.acceleration, { still: 'none' }),
    }));
    tiles.push(stat('Net force', `${fmtFixed(main.net.magnitude, 2)} N`, {
      swatch: '--force-net',
      note: main.net.magnitude < 1e-9 ? 'The forces cancel' : fmtDirectionWords(main.net.vec),
    }));
    // Momentum and energy, from here to the end of the bench.
    tiles.push(stat('Momentum', `${fmtFixed(len(main.momentum), 2)} kg·m/s`, {
      swatch: '--vec-momentum',
      note: 'p = m·v',
    }));
    tiles.push(stat('Kinetic energy', `${fmtFixed(main.kinetic, 2)} J`, {
      swatch: '--vec-velocity',
      note: '½·m·v² — no direction',
    }));
  }

  if (f.has('ground')) {
    tiles.push(stat('Height', `${fmtFixed(main.heightAboveGround, 2)} m`, {}));
    tiles.push(stat('Potential energy', `${fmtFixed(sums.potential, 2)} J`, {
      swatch: '--force-weight',
      note: 'm·g·h from the ground',
    }));
  }

  if (f.has('friction') || f.has('fluid')) {
    tiles.push(stat('Gone to heat', `${fmtFixed(sums.elsewhere.heat + sums.elsewhere.impact, 2)} J`, {
      swatch: '--force-friction',
      note: 'Left the mechanical account — not the universe',
    }));
  }

  if (f.has('collide') || f.has('second-mass')) {
    tiles.push(stat('Total momentum', `${fmtFixed(sums.momentumX, 3)} kg·m/s`, {
      swatch: '--vec-momentum',
      accent: true,
      note: 'The whole system. Watch it through the impact.',
    }));
  }

  if (f.has('applied') && sums.supplied > 1e-9) {
    tiles.push(stat('Put in by the push', `${fmtFixed(sums.supplied, 2)} J`, {
      swatch: '--force-applied',
      note: 'Work you did on it: F·d',
    }));
  }

  if (f.has('applied') || f.has('ground')) {
    tiles.push(stat('The books', `${fmtFixed(sums.balance, 2)} J`, {
      accent: true,
      note: 'Everything it holds, minus what you put in. This does not change.',
    }));
  }

  return tiles;
}

/* ----------------------------------------------------------- the banners -- */

export function banners(ctx) {
  const f = ctx.features;
  const p = ctx.params;
  const out = [];
  const main = inspect(ctx.world, 'main');
  if (!main) return out;

  /*
   * If the simulation has hit the edge of what it can honestly describe, that
   * is the first thing to say — before any reading from it is quoted.
   */
  const relativistic = ctx.recorder.events.some((e) => e.type === 'relativistic');
  const diverged = ctx.recorder.events.some((e) => e.type === 'diverged');
  if (relativistic || diverged) {
    out.push(banner('danger',
      'The object has been accelerated past a tenth of the speed of light, where '
      + 'classical mechanics stops describing anything. Momentum is γmv there, '
      + 'not mv, and no finite force can reach c at all. The simulation has held '
      + 'it at that limit rather than showing you numbers with nothing behind '
      + 'them — turn the gravity or the push down to get back to physics this '
      + 'model can do.'));
  }

  const push = pushState(ctx.world, p, f);
  if (f.has('applied') && p.pushSeconds > 0) {
    const accelerating = len(main.acceleration) > 1e-6;
    if (push.active && accelerating) {
      out.push(banner('info',
        `The push is still on — ${fmtFixed(push.remaining, 2)} s left. The velocity is `
        + `changing at ${fmtFixed(len(main.acceleration), 2)} m/s every second.`));
    } else if (push.active) {
      // Pushing and going nowhere is the more interesting of the two cases, and
      // "climbing at 0.00 m/s every second" throws it away.
      out.push(banner('info',
        'You are pushing and nothing is happening. Something is cancelling it '
        + 'exactly — look at the arrows: they add up to zero, and a net force of '
        + 'zero means no change in motion, however many forces are acting.'));
    } else {
      out.push(banner('ok',
        'The push has stopped, and the object has not. Nothing is needed to keep '
        + 'it moving — only to change how it moves. That is Newton\'s first law, '
        + 'and it is the least obvious thing in mechanics.'));
    }
  }

  if (f.has('mutual-gravity') && !f.has('planet')) {
    const c = everydayComparison(p.mass, p.otherMass, Math.abs(p.otherX));
    out.push(banner('warn', `These two masses really do attract, with ${c.text}`));
  }

  if (f.has('planet') && !f.has('ground')) {
    const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });
    out.push(banner('ok', `Same equation as the last step. With ${p.planetMass.toExponential(2)} kg `
      + `at a radius of ${(p.planetRadius / 1000).toPrecision(3)} km it gives `
      + `${fmtFixed(world.g, 3)} m/s² — and the object weighs ${fmtFixed(p.mass * world.g, 2)} N. `
      + 'Nothing was added to make that happen except size.'));
    if (world.relativisticallyWrong) {
      out.push(banner('danger', 'At this field strength the Newtonian answer this app '
        + 'computes is badly wrong. General relativity is not optional here, and '
        + 'the number above should not be believed.'));
    }
  }

  if (f.has('ground')) {
    const contact = main.contact;
    if (contact?.touching && contact.frictionMode === 'static' && f.has('friction')) {
      out.push(banner('ok', `Not sliding. Friction is supplying exactly what is needed — `
        + `${fmtFixed(main.forces.find((x) => x.id === 'friction')?.magnitude ?? 0, 2)} N of a possible `
        + `${fmtFixed(contact.staticLimit, 2)} N. Static friction is *at most* μs·N, not equal to it.`));
    }
    if (contact?.frictionMode === 'breaking-away') {
      out.push(banner('warn', `The push has passed the ${fmtFixed(contact.staticLimit, 2)} N static `
        + 'limit, so it breaks away — and friction drops to the lower kinetic value.'));
    }
  }

  if (f.has('fluid')) {
    const dragForce = main.forces.find((x) => x.id === 'drag');
    if (dragForce?.flow && dragForce.flow.re > 0) {
      const flow = dragForce.flow;
      out.push(banner('info', `Re ≈ ${flow.re < 10 ? flow.re.toFixed(2) : flow.re.toPrecision(3)} — `
        + `${flow.regime.label.toLowerCase()}. ${flow.regime.text}`));
    }
  }

  if (f.has('collide')) {
    const hit = ctx.recorder.events.some((e) => e.type === 'collision');
    if (hit) {
      const sums = totals(ctx.world);
      out.push(banner('ok', `They have collided. Total momentum is ${fmtFixed(sums.momentumX, 3)} kg·m/s, `
        + `which is what it was before. ${fmtFixed(sums.elsewhere.impact, 2)} J of kinetic `
        + 'energy has moved into heat, sound and deformation — it has not gone anywhere else.'));
    }
  }

  return out;
}

/* ---------------------------------------------------------- the teaching -- */

export function explains(ctx) {
  const f = ctx.features;
  const p = ctx.params;
  const stage = stageById(ctx.state.stage);
  const main = inspect(ctx.world, 'main');
  const out = [];

  out.push(explain({
    title: `What this step adds: ${stage.label.toLowerCase()}`,
    plain: [stage.discover, stage.watch],
    open: true,
  }));

  if (f.has('applied') && main) {
    out.push(equationPanel(equation('newton-2'),
      `a = F ÷ m = ${fmtFixed(p.pushForce, 2)} N ÷ ${fmtFixed(p.mass, 3)} kg`
      + ` = ${fmtFixed(p.mass > 0 ? p.pushForce / p.mass : 0, 3)} m/s²\n\n`
      + `Held for ${fmtFixed(p.pushSeconds, 2)} s, that leaves the object at\n`
      + `v = u + a·t = ${fmtFixed(p.v0, 2)} + ${fmtFixed(p.pushForce / p.mass, 3)} × ${fmtFixed(p.pushSeconds, 2)}`
      + ` = ${fmtFixed(p.v0 + (p.pushForce / p.mass) * p.pushSeconds, 3)} m/s`));

    out.push(equationPanel(equation('momentum'),
      `p = m · v = ${fmtFixed(main.mass, 3)} × ${fmtFixed(main.vel.x, 3)} = ${fmtFixed(main.momentum.x, 3)} kg·m/s\n\n`
      + `The push delivered an impulse of F·t = ${fmtFixed(p.pushForce, 2)} × ${fmtFixed(p.pushSeconds, 2)}`
      + ` = ${fmtFixed(p.pushForce * p.pushSeconds, 3)} kg·m/s,\n`
      + 'and that is exactly the momentum it now has. Impulse *is* the change in\n'
      + 'momentum — they are the same statement written two ways.'));

    out.push(equationPanel(equation('kinetic-energy'),
      `KE = ½ · m · v² = ½ × ${fmtFixed(main.mass, 3)} × ${fmtFixed(main.speed, 3)}²`
      + ` = ${fmtFixed(main.kinetic, 3)} J\n\n`
      + 'Notice how differently this grows from the momentum: doubling the speed\n'
      + 'doubles p and quadruples KE. Two objects with the same momentum can have\n'
      + 'very different energies, which is the difference between a thrown brick\n'
      + 'and a bullet.'));
  }

  if (f.has('mutual-gravity')) {
    const distance = f.has('planet') ? p.planetRadius : Math.abs(p.otherX);
    const otherMass = f.has('planet') ? p.planetMass : p.otherMass;
    const force = (G * p.mass * otherMass) / (distance * distance);
    out.push(equationPanel(equation('gravity-field'),
      `F = G · m₁ · m₂ / r²\n\n`
      + `  G  = ${G.toExponential(4)} m³ kg⁻¹ s⁻²\n`
      + `  m₁ = ${p.mass.toPrecision(4)} kg          (your object)\n`
      + `  m₂ = ${otherMass.toExponential(4)} kg     (the other mass)\n`
      + `  r  = ${distance.toPrecision(4)} m\n\n`
      + `  F  = ${force.toExponential(4)} N\n\n`
      + `Divide by your object's mass and the m₁ cancels:\n`
      + `  a = G·m₂/r² = ${fmtFixed(surfaceGravity(otherMass, distance), 4)} m/s²\n\n`
      + 'Your object\'s mass is not in that last line. It never is — which is the\n'
      + 'whole reason everything falls together.'));
  }

  if (f.has('ground')) {
    const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });
    const rad = (p.slopeDeg * Math.PI) / 180;
    const weight = p.mass * world.g;
    out.push(explain({
      title: 'What the surface does',
      plain: 'The surface can only push perpendicular to itself. On the level that '
        + 'is straight up and it cancels the weight exactly. Tilted, it can only '
        + 'cancel the part of the weight pressing into it — and the rest is left '
        + 'over, with nothing to oppose it.',
      formula: 'N = m·g·cos θ        left over along the slope = m·g·sin θ',
      validWhen: 'A rigid body resting on a rigid surface, with the weight the only '
        + 'thing pressing it down.',
      worked: `Weight            ${fmtFixed(weight, 2).padStart(9)} N\n`
        + `Into the surface  ${fmtFixed(weight * Math.cos(rad), 2).padStart(9)} N   (× cos ${fmtFixed(Math.abs(p.slopeDeg), 0)}°)\n`
        + `Along the slope   ${fmtFixed(Math.abs(weight * Math.sin(rad)), 2).padStart(9)} N   (× sin ${fmtFixed(Math.abs(p.slopeDeg), 0)}°)`,
      becomes: 'Those two are the same weight, split along two perpendicular '
        + 'directions chosen because they are convenient. Nothing was created or '
        + 'lost in the splitting.',
    }));

    out.push(equationPanel(equation('potential-energy'),
      `PE = m · g · h = ${fmtFixed(p.mass, 3)} × ${fmtFixed(world.g, 3)} × ${fmtFixed(main?.heightAboveGround ?? 0, 3)}`
      + ` = ${fmtFixed(p.mass * world.g * (main?.heightAboveGround ?? 0), 3)} J\n\n`
      + 'Measured from the ground, because only differences in potential energy\n'
      + 'ever matter and the ground is convenient.'));
  }

  if (f.has('friction')) {
    out.push(equationPanel(equation('friction'),
      `N = ${fmtFixed(main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0, 2)} N\n\n`
      + `Static limit   μs · N = ${fmtFixed(p.muS, 2)} × ${fmtFixed(main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0, 2)}`
      + ` = ${fmtFixed(p.muS * (main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0), 2)} N\n`
      + `Kinetic value  μk · N = ${fmtFixed(p.muK, 2)} × ${fmtFixed(main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0, 2)}`
      + ` = ${fmtFixed(p.muK * (main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0), 2)} N\n\n`
      + `Right now: ${fmtFixed(main?.forces.find((x) => x.id === 'friction')?.magnitude ?? 0, 2)} N `
      + `(${main?.contact?.frictionMode ?? 'no contact'})`));
  }

  if (f.has('fluid')) {
    const fluid = FLUIDS.find((x) => x.id === p.fluidId) || FLUIDS[0];
    const flow = main?.forces.find((x) => x.id === 'drag')?.flow;
    out.push(explain({
      title: 'Why honey is not just thick air',
      plain: [
        'Two properties of a fluid matter, and they do different jobs. Density is '
        + 'how much of it has to be shoved aside; viscosity is how much it resists '
        + 'being sheared. Honey is only 40% denser than water and about ten '
        + 'thousand times more viscous, and it is the viscosity you feel.',
        'Which one dominates is decided by the Reynolds number. Above about a '
        + 'thousand, inertia wins and drag goes as v². Below about one, viscosity '
        + 'wins and drag goes as v — a completely different law, from the same '
        + 'equation.',
      ],
      formula: 'Re = ρ·v·D/μ        F = ½·ρ·C_d(Re)·A·v²        C_d ≈ 24/Re + 6/(1+√Re) + 0.4',
      validWhen: 'A roughly spherical body, from Re ≈ 0.1 up to about 2×10⁵. Above '
        + 'that the drag crisis sets in, which this correlation does not model.',
      worked: flow
        ? `In ${fluid.label.toLowerCase()}, at ${fmtFixed(main.speed, 3)} m/s:\n\n`
          + `  Re = ${fluid.density} × ${fmtFixed(main.speed, 3)} × ${fmtFixed(p.size, 3)} ÷ ${fluid.viscosity}`
          + ` = ${flow.re < 10 ? flow.re.toFixed(3) : flow.re.toPrecision(4)}\n`
          + `  C_d = ${flow.cd.toPrecision(4)}\n`
          + `  F  = ${flow.force.toPrecision(4)} N\n\n`
          + `  ${(flow.viscousShare * 100).toFixed(0)}% of that is the viscous term.\n`
          + (Number.isFinite(flow.stokes)
            ? `  Stokes' law, 3πμDv, would give ${flow.stokes.toPrecision(4)} N — `
              + `${flow.re < 1 ? 'and at this Re it is very nearly right.' : 'which is far off, because this is not Stokes flow.'}`
            : '')
        : 'Set the object moving to see the flow conditions.',
      becomes: 'At the low-Reynolds end this whole expression collapses, exactly, '
        + 'to Stokes\' law. It is not two models with a switch between them; it is '
        + 'one model whose behaviour changes with the flow.',
    }));
  }

  if (f.has('collide')) {
    out.push(equationPanel(equation('momentum-conservation'),
      'During the impact each object pushes on the other with an equal and\n'
      + 'opposite force, for exactly the same length of time. So the impulse one\n'
      + 'receives is the exact negative of the other\'s, and whatever momentum one\n'
      + 'gains, the other loses. The total cannot change.\n\n'
      + 'Kinetic energy has no such guarantee, and only survives intact when\n'
      + 'e = 1. Watch the two totals on the graph through the impact: one line is\n'
      + 'flat and the other has a step in it.'));
  }

  return out;
}

/** The stage the second-mass panel jumps to, exposed for the shell to wire up. */
export { stageById };
