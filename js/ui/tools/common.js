/**
 * The control panels every lab shares: which planet, which air, what to draw.
 *
 * They live in one place so that the gravity picker in the Projectile lab and
 * the one in the Pendulum lab cannot drift apart — and, more importantly, so
 * that the note explaining where the number came from is attached to the
 * control itself rather than remembered separately in thirteen files.
 */

import { el } from '../dom.js';
import { section, selectField, toggleField, sliderField, numberField, chipField } from '../widgets.js';
import { ENVIRONMENTS, FLUIDS, DRAG_SHAPES, SURFACES, MATERIALS, environmentById, G_ROUNDED, G_STANDARD } from '../../constants.js';
import { gravityFor } from '../../scenarios.js';
import { fmtFixed } from '../../format.js';
import { compareControls } from '../compare-view.js';

/**
 * Where the experiment is happening.
 *
 * The note under the picker is not decoration: an environment list that says
 * only "Moon — 1.62" teaches that the Moon has one gravity the way a table has
 * one length. Every entry carries how much the real value varies and why.
 */
export function gravitySection(ctx, { key = 'envId' } = {}) {
  const { params, set } = ctx;
  const env = environmentById(params[key]);
  const gravity = gravityFor(params);

  return section('Gravity', [
    selectField('Where are you?', ENVIRONMENTS.map((e) => ({ value: e.id, label: e.label })), params[key], (v) => set(key, v), {
      key: 'envId',
      hint: env.note,
    }),

    env.id === 'custom'
      ? numberField('Field strength', params.customG ?? G_STANDARD, (v) => set('customG', v), {
        unit: 'm/s²', step: 0.5, min: -100, max: 1000, key: 'customG',
        hint: 'Any value you like, including zero and negative. Physics keeps '
          + 'working; the result simply stops describing anywhere real.',
      })
      : null,

    toggleField(`Use ${G_ROUNDED} m/s² for easier arithmetic`, !!params.roundG, (v) => set('roundG', v), {
      key: 'roundG',
      info: 'A deliberate approximation, labelled as one. It is not the standard '
        + 'value and it is not the value anywhere on Earth.',
      hint: params.roundG
        ? `Approximation on: ${G_ROUNDED} m/s² instead of ${fmtFixed(gravity.exact, 5)} m/s². `
          + 'Every result is about 2% out — deliberately.'
        : `Using ${fmtFixed(gravity.g, gravity.g === G_STANDARD ? 5 : 2)} m/s² (${env.kind}). ${env.varies}.`,
    }),
  ], { key: 'gravity' });
}

/**
 * Air resistance: the switch that turns the idealised model into the real one.
 *
 * Off by default in most labs, because the point of the first look is to
 * isolate gravity — and the disclosure names that choice rather than hiding it.
 */
export function airSection(ctx, { shapes = true } = {}) {
  const { params, set } = ctx;

  return section('Air resistance', [
    toggleField('Air resistance on', !!params.dragOn, (v) => set('dragOn', v), {
      key: 'dragOn',
      info: 'With it off, the simulation is running in a vacuum. That is not a '
        + 'shortcut — it is the model that lets gravity be seen on its own.',
      hint: params.dragOn
        ? 'Drag is ½·ρ·C_d·A·v², opposing the motion. Every object now falls '
          + 'differently, and the difference is the air, not the gravity.'
        : 'Running in a vacuum. Every object at the same place falls identically.',
    }),

    params.dragOn ? selectField('Fluid', FLUIDS.map((f) => ({ value: f.id, label: f.label })), params.fluidId || 'air', (v) => set('fluidId', v), {
      key: 'fluidId',
      hint: FLUIDS.find((f) => f.id === (params.fluidId || 'air'))?.note,
    }) : null,

    params.dragOn && shapes ? selectField('Shape', DRAG_SHAPES.map((s) => ({ value: s.id, label: `${s.label} (C_d ${s.cd})` })), params.shapeId || 'sphere', (v) => set('shapeId', v), {
      key: 'shapeId',
      hint: 'C_d is not a property of a shape alone — it depends on speed and '
        + 'size through the Reynolds number. Holding it constant is an '
        + 'approximation, and a good one over this range.',
    }) : null,

    params.dragOn && params.shapeId === 'custom'
      ? numberField('Drag coefficient', params.customCd ?? 0.47, (v) => set('customCd', v), { step: 0.05, min: 0, max: 5, key: 'customCd' })
      : null,
  ], { key: 'air' });
}

/** What the drawing shows. Chrome, so it never rebuilds the world. */
export function viewSection(ctx) {
  const { state, setView } = ctx;
  const v = state.view;

  return section('What to draw', [
    toggleField('Vectors (arrows)', v.showVectors, (x) => setView('showVectors', x), { key: 'view:vectors' }),
    v.showVectors ? el('div', { style: { paddingLeft: '18px' } }, [
      toggleField('Forces', v.showForces, (x) => setView('showForces', x), { key: 'view:forces' }),
      toggleField('Velocity', v.showVelocity, (x) => setView('showVelocity', x), { key: 'view:velocity' }),
      toggleField('Acceleration', v.showAcceleration, (x) => setView('showAcceleration', x), { key: 'view:accel' }),
      toggleField('Momentum', v.showMomentum, (x) => setView('showMomentum', x), { key: 'view:momentum' }),
    ]) : null,
    toggleField('Numbers on the arrows', v.showValues, (x) => setView('showValues', x), { key: 'view:values' }),
    toggleField('Trail', v.showTrail, (x) => setView('showTrail', x), { key: 'view:trail' }),
    toggleField('Metre grid', v.showGrid, (x) => setView('showGrid', x), { key: 'view:grid' }),
  ], { key: 'view', open: false });
}

/** The "what if?" controls, offered by every lab that can compare. */
export const compareSection = (ctx) => section('What if?', [
  el('p', {
    class: 'field__hint',
    style: { marginBottom: '8px' },
    text: 'Keep the current settings, change exactly one thing, and the app will '
      + 'show you both runs together.',
  }),
  compareControls(ctx),
], { key: 'compare', open: false });

/** The surface a box or a ball is sitting on. */
export function surfaceSection(ctx, { slope = true } = {}) {
  const { params, set } = ctx;
  const surface = SURFACES.find((s) => s.id === (params.surfaceId || 'wood'));

  return section('Surface', [
    selectField('Materials in contact', SURFACES.map((s) => ({ value: s.id, label: s.label })), params.surfaceId, (v) => set('surfaceId', v), {
      key: 'surfaceId',
      hint: surface ? `μs ${surface.muS}, μk ${surface.muK}. ${surface.note}` : '',
      info: 'These are indicative textbook figures. Published values for the same '
        + 'pair of materials differ by more than a factor of two depending on '
        + 'finish, cleanliness and contact pressure.',
    }),

    params.surfaceId === 'custom' ? el('div', { class: 'field-row' }, [
      numberField('μs', params.customMuS, (v) => set('customMuS', v), { step: 0.05, min: 0, max: 5, key: 'customMuS' }),
      numberField('μk', params.customMuK, (v) => set('customMuK', v), { step: 0.05, min: 0, max: 5, key: 'customMuK' }),
    ]) : null,

    slope ? sliderField('Slope', params.slopeDeg ?? 0, (v) => set('slopeDeg', v), {
      min: -45, max: 45, step: 1, key: 'slopeDeg',
      format: (x) => `${x}°`,
      hint: 'A positive angle rises to the right, so downhill is to the left.',
    }) : null,
  ], { key: 'surface' });
}

/** A row of one-click starting points. */
export const presets = (list, ctx) => chipField('Try one of these', list.map((p) => ({ value: p.id, label: p.label, title: p.title })), null, (id) => {
  const found = list.find((p) => p.id === id);
  if (found) ctx.setMany(found.params);
});

export { MATERIALS };
