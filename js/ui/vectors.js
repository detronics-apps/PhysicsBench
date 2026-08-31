/**
 * The arrow picker: which quantities are drawn on the object.
 *
 * Nine arrows on one object is a thicket, and almost every question worth
 * asking is about two of them. Turning the rest off is not tidying up — it is
 * how you look at something.
 *
 * Two rules the picker has to obey to be worth having:
 *
 *   It only offers arrows that exist at this step. An offer to draw friction
 *   before there is a surface teaches that friction is always there.
 *
 *   Hiding an arrow never changes the length of the others. The scales are
 *   computed over every force whether it is drawn or not, so switching the
 *   weight arrow off does not stretch the friction arrow and quietly break the
 *   comparison the picker exists to enable.
 */

import { el } from './dom.js';

/**
 * @param {Array} available  from `stages.vectorsFor(stage)`
 * @param {object} chosen    the `state.vectors` map
 * @param {(id: string, on: boolean) => void} onToggle
 * @param {(patch: object) => void} onSet   for the all/none shortcuts
 */
export function vectorPicker(available, chosen, onToggle, onSet) {
  const forces = available.filter((v) => v.kind === 'force');
  const motion = available.filter((v) => v.kind === 'motion');

  const chip = (v) => el('button', {
    class: 'vchip',
    type: 'button',
    'aria-pressed': String(!!chosen[v.id]),
    style: { '--vchip': `var(${v.token})` },
    title: chosen[v.id] ? `Hide the ${v.label.toLowerCase()} arrow` : `Show the ${v.label.toLowerCase()} arrow`,
    'data-field': `vector:${v.id}`,
    on: { click: () => onToggle(v.id, !chosen[v.id]) },
  }, [
    el('span', { class: 'vchip__key' }),
    el('span', { text: v.label }),
  ]);

  const setAll = (on) => onSet(Object.fromEntries(available.map((v) => [v.id, on])));

  return el('div', { class: 'vectors' }, [
    el('div', { class: 'vectors__head' }, [
      el('span', { class: 'vectors__title', text: 'Arrows on the object' }),
      el('span', { class: 'stage-tools__spacer' }),
      el('button', {
        class: 'btn btn-sm', type: 'button', text: 'All',
        'data-field': 'vectors:all',
        on: { click: () => setAll(true) },
      }),
      el('button', {
        class: 'btn btn-sm', type: 'button', text: 'None',
        'data-field': 'vectors:none',
        on: { click: () => setAll(false) },
      }),
    ]),

    motion.length ? el('div', { class: 'vectors__group' }, [
      el('span', { class: 'vectors__label', text: 'Motion' }),
      el('div', { class: 'vectors__chips' }, motion.map(chip)),
    ]) : null,

    forces.length ? el('div', { class: 'vectors__group' }, [
      el('span', { class: 'vectors__label', text: 'Forces' }),
      el('div', { class: 'vectors__chips' }, forces.map(chip)),
    ]) : null,
  ]);
}

/**
 * The arrows worth having on at each step, for the "just show me this" button.
 *
 * Not a default the app imposes — a suggestion it offers, because at step six
 * the question is nearly always about friction against the push, and finding
 * that view by clicking seven chips off is a chore.
 */
export const SUGGESTED = {
  mass: { velocity: true, acceleration: true, net: true },
  push: { velocity: true, acceleration: true, applied: true, net: true },
  'two-masses': { velocity: true, weight: true, net: true },
  planet: { velocity: true, acceleration: true, weight: true, net: true },
  surface: { weight: true, normal: true, net: true },
  friction: { applied: true, friction: true, rolling: true, normal: true, net: true },
  fluid: { velocity: true, drag: true, buoyancy: true, weight: true, net: true },
  collide: { velocity: true, momentum: true, control: true, net: true },
};

/** The suggestion for a step, with everything else switched off. */
export function suggestionFor(stageId, available) {
  const wanted = SUGGESTED[stageId] || {};
  return Object.fromEntries(available.map((v) => [v.id, !!wanted[v.id]]));
}
