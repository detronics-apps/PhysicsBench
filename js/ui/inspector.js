/**
 * The Physics Inspector: the live state of the selected object.
 *
 * Every row is colour-keyed to the arrow it belongs to on the drawing, so a
 * number and the thing pointing at the ball are visibly the same quantity.
 * That connection is the panel's job — a column of numbers beside a picture
 * full of arrows, with nothing tying them together, is two displays rather than
 * one explanation.
 *
 * Numbers are shown to a fixed number of decimals rather than to significant
 * figures. A live readout that swings from `12.34` to `0.0009321` as a velocity
 * passes through zero jitters in a way that makes it unreadable, and the extra
 * digits mean nothing anyway.
 */

import { el } from './dom.js';
import { len } from '../vec.js';
import { fmtFixed, fmtVec, fmtDirectionWords, fmtMag } from '../format.js';
import { VECTOR_STYLE } from './scene-svg.js';

const row = (key, value, { token = null, note = null, total = false } = {}) =>
  el('div', { class: `inspector__row${total ? ' inspector__row--total' : ''}` }, [
    token
      ? el('span', { class: 'inspector__swatch', style: { background: `var(${token})` } })
      : el('span', {}),
    el('span', { class: 'inspector__key', text: key }),
    el('span', { class: 'inspector__val', text: value }),
    note ? el('span', { class: 'inspector__note', text: note }) : null,
  ]);

const group = (label) => el('div', { class: 'inspector__group', text: label });

/**
 * @param {object} snapshot the result of `world.inspect(world, id)`
 * @param {object} options  `{ mode, showForces }`
 */
export function renderInspector(snapshot, { mode = 'learn' } = {}) {
  if (!snapshot) {
    return el('div', { class: 'muted', text: 'Select an object to inspect it.' });
  }

  const host = el('div', { class: 'inspector' });
  const b = snapshot.body;

  host.appendChild(group('The object'));
  host.appendChild(row('Mass', `${fmtFixed(b.mass, 2)} kg`, {
    note: mode === 'play' ? null : 'How strongly it resists being accelerated.',
  }));
  host.appendChild(row('Position', fmtVec(snapshot.pos, 'm')));
  if (Number.isFinite(snapshot.heightAboveGround)) {
    host.appendChild(row('Height above ground', `${fmtFixed(snapshot.heightAboveGround, 2)} m`));
  }

  host.appendChild(group('How it is moving'));
  host.appendChild(row('Velocity', fmtVec(snapshot.vel, 'm/s'), {
    token: VECTOR_STYLE.velocity.token,
    note: `Speed ${fmtFixed(snapshot.speed, 2)} m/s, ${fmtDirectionWords(snapshot.vel, { still: 'not moving' })}.`,
  }));
  host.appendChild(row('Acceleration', fmtVec(snapshot.acceleration, 'm/s²'), {
    token: VECTOR_STYLE.acceleration.token,
    note: `${fmtMag(snapshot.acceleration, 'm/s²')}, ${fmtDirectionWords(snapshot.acceleration, { still: 'no acceleration' })}.`,
  }));
  host.appendChild(row('Momentum', fmtVec(snapshot.momentum, 'kg·m/s'), {
    token: VECTOR_STYLE.momentum.token,
    note: mode === 'play' ? null : 'p = m·v — mass and velocity together.',
  }));

  host.appendChild(group('Forces acting on it'));
  if (!snapshot.forces.length) {
    host.appendChild(row('None', '0 N', { note: 'Nothing is acting on it at all.' }));
  }
  for (const force of snapshot.forces) {
    host.appendChild(row(force.label, `${fmtFixed(force.magnitude, 2)} N`, {
      token: force.token,
      note: force.note || (mode === 'play' ? null : fmtDirectionWords(force.vec, { still: 'zero, so it has no direction' })),
    }));
  }
  host.appendChild(row('Net force', `${fmtFixed(snapshot.net.magnitude, 2)} N`, {
    token: '--force-net',
    total: true,
    note: snapshot.net.magnitude < 1e-6
      ? 'Zero. The forces cancel exactly, so the velocity is not changing — '
        + 'which is not the same as the object being still.'
      : `${fmtDirectionWords(snapshot.net.vec)}. Divided by the mass, this is the acceleration.`,
  }));

  if (mode !== 'play') {
    host.appendChild(group('Energy'));
    host.appendChild(row('Kinetic energy', `${fmtFixed(snapshot.kinetic, 2)} J`, {
      note: '½·m·v² — no direction, so two objects moving oppositely add rather than cancel.',
    }));
    host.appendChild(row('Potential energy', `${fmtFixed(snapshot.potential, 2)} J`, {
      note: 'Measured from the ground.',
    }));
    host.appendChild(row('Kinetic + potential', `${fmtFixed(snapshot.kinetic + snapshot.potential, 2)} J`, { total: true }));
  }

  if (snapshot.contact?.touching && mode !== 'play') {
    host.appendChild(group('Contact'));
    host.appendChild(row('Friction', friction(snapshot.contact), {
      token: '--force-friction',
      note: contactNote(snapshot.contact),
    }));
  }

  return host;
}

const friction = (contact) => ({
  static: 'holding',
  kinetic: 'sliding',
  'breaking-away': 'breaking away',
  none: 'none',
}[contact.frictionMode] || contact.frictionMode);

function contactNote(contact) {
  if (contact.frictionMode === 'static') {
    return `Static friction can reach ${fmtFixed(contact.staticLimit, 1)} N before it lets go; `
      + `it is only being asked for ${fmtFixed(contact.tangentialDemand, 1)} N.`;
  }
  if (contact.frictionMode === 'kinetic') return 'Sliding, so friction is μk·N and points against the motion.';
  if (contact.frictionMode === 'breaking-away') {
    return `The push has passed the ${fmtFixed(contact.staticLimit, 1)} N static limit, so it breaks away `
      + 'and friction drops to the lower kinetic value.';
  }
  return '';
}

/**
 * The system-wide totals — momentum and the energy ledger.
 *
 * The ledger is what makes the energy row honest. Mechanical energy falling on
 * its own would teach that energy can be destroyed; showing where it went makes
 * the same event teach the opposite.
 */
export function renderTotals(totals, { mode = 'learn' } = {}) {
  const host = el('div', { class: 'inspector' });

  host.appendChild(group('The whole system'));
  host.appendChild(row('Total momentum', `${fmtFixed(totals.momentumX, 3)} kg·m/s`, {
    token: VECTOR_STYLE.momentum.token,
    note: mode === 'play' ? null : 'A vector sum: two objects moving oppositely cancel.',
  }));
  host.appendChild(row('Kinetic energy', `${fmtFixed(totals.kinetic, 2)} J`, { token: '--vec-velocity' }));
  host.appendChild(row('Potential energy', `${fmtFixed(totals.potential, 2)} J`, { token: '--force-weight' }));

  const moved = (totals.elsewhere.heat || 0) + (totals.elsewhere.impact || 0);
  if (moved > 1e-6) {
    if (totals.elsewhere.heat > 1e-6) {
      host.appendChild(row('…moved to heat', `${fmtFixed(totals.elsewhere.heat, 2)} J`, {
        token: '--force-friction',
        note: 'Friction did this. The energy is not gone — it is in the surfaces.',
      }));
    }
    if (totals.elsewhere.impact > 1e-6) {
      host.appendChild(row('…moved by impacts', `${fmtFixed(totals.elsewhere.impact, 2)} J`, {
        token: '--force-net',
        note: 'Absorbed by collisions: heat, sound and permanent deformation.',
      }));
    }
  }

  host.appendChild(row('Total energy', `${fmtFixed(totals.total, 2)} J`, {
    total: true,
    note: 'This number does not change. Whatever leaves the mechanical account '
      + 'appears on the line above it.',
  }));

  return host;
}

/** The picker for which body the inspector is following. */
export function renderBodyPicker(world, selectedId, onSelect) {
  const movable = world.bodies.filter((b) => !b.fixed);
  if (movable.length < 2) return null;

  return el('div', { class: 'body-list' }, movable.map((b) => el('button', {
    class: 'body-pick',
    type: 'button',
    'aria-pressed': String(b.id === selectedId),
    'data-field': `pick:${b.id}`,
    on: { click: () => onSelect(b.id) },
  }, [
    el('span', { class: 'body-pick__swatch', style: { background: `var(--body-${b.colour % 4})` } }),
    el('span', { class: 'body-pick__name', text: b.label || b.id }),
    el('span', { class: 'body-pick__meta', text: `${fmtFixed(b.mass, 2)} kg · ${fmtFixed(len(b.vel), 1)} m/s` }),
  ])));
}
