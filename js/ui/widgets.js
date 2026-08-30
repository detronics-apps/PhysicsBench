/**
 * The small reusable pieces of interface: sections, numeric fields, stat tiles,
 * banners. Nothing here knows any physics — it is the vocabulary the labs are
 * written in.
 *
 * Two things every control does, because the shell rebuilds the whole sidebar
 * on every edit:
 *
 * - it carries a stable `data-field` name, so the caret can be put back where
 *   it was afterwards;
 * - it commits on `change`, never on `input`. Committing mid-interaction
 *   replaces the very element being used, so a drag dies on the first pixel.
 */

import { el, field, infoIcon, select, chips } from './dom.js';
import { parseEng } from '../units.js';
import { fmtFixed } from '../format.js';

/**
 * `parseEng` is the shared Detronics number parser — `1500`, `1.5k`, `1k5` all
 * arrive as 1500 — but it was written for component values, which are never
 * negative. Velocities and accelerations are, constantly, so the sign is peeled
 * off here and put back afterwards. It also accepts the typographic minus the
 * readouts emit, so a value can be copied out of a stat tile and pasted back in.
 */
export function parseNumber(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const cleaned = text.trim()
    .replace(/\s*(m\/s²|m\/s2|m\/s|kg·m\/s|kg|N·m|N|J|W|s|m|deg|degrees?|°|rad|rpm)\s*$/i, '')
    .trim();
  const negative = /^[-−–]/.test(cleaned);
  const value = parseEng(negative ? cleaned.slice(1).trim() : cleaned);
  if (value === null) return null;
  return negative ? -value : value;
}

/* --------------------------------------------------------------- layout -- */

let sectionStore = { get: () => true, set: () => {} };

export function configureSections(store) {
  sectionStore = store;
}

/** A titled, collapsible block in the sidebar. */
export function section(title, children, { info = null, actions = null, key = null, open = null } = {}) {
  const id = key || title;
  return el('details', {
    class: 'section',
    open: (open === null ? sectionStore.get(id) : open) ? '' : null,
    'data-section': id,
    on: {
      // Recorded, not re-rendered: collapsing a panel is not a change to the
      // experiment, and rebuilding the sidebar here would fight the animation.
      toggle: (event) => sectionStore.set(id, event.target.open),
    },
  }, [
    el('summary', { class: 'section__title' }, [title, info ? infoIcon(info) : null, actions]),
    el('div', { class: 'section__body' }, Array.isArray(children) ? children : [children]),
  ]);
}

/* --------------------------------------------------------------- fields -- */

/**
 * A number field that accepts what a person types.
 *
 * `1500`, `1.5k` and `1 500` all mean the same thing, and refusing two of them
 * is a way of being right and useless at the same time. The value is only
 * pushed upstream when it parses; while it does not, the field says so and
 * keeps what was typed.
 */
export function numberField(label, value, onChange, {
  info, hint, min = -Infinity, max = Infinity, step = null, integer = false, unit = '',
  decimals = 3, key = null,
} = {}) {
  const input = el('input', {
    class: 'input',
    type: 'text',
    inputmode: integer ? 'numeric' : 'decimal',
    value: show(value, decimals),
    autocomplete: 'off',
    spellcheck: 'false',
    'data-field': key || label,
  });

  const commit = () => {
    const parsed = parseNumber(input.value);
    if (parsed === null || !Number.isFinite(parsed)) {
      input.classList.add('input--invalid');
      return;
    }
    const clamped = Math.min(max, Math.max(min, integer ? Math.round(parsed) : parsed));
    input.classList.remove('input--invalid');
    if (clamped !== parsed) input.value = show(clamped, decimals);
    onChange(clamped);
  };

  input.addEventListener('input', () => {
    const parsed = parseNumber(input.value);
    input.classList.toggle('input--invalid', parsed === null || !Number.isFinite(parsed));
  });
  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { commit(); return; }
    if (!step) return;
    const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const current = parseNumber(input.value) ?? 0;
    const next = Math.min(max, Math.max(min, current + direction * step * (event.shiftKey ? 10 : 1)));
    input.value = show(next, decimals);
    onChange(integer ? Math.round(next) : next);
  });

  return field(unit ? `${label} (${unit})` : label, input, { info, hint });
}

/** Trailing zeros are noise in an input box, unlike in a live readout. */
const show = (value, decimals) => {
  if (!Number.isFinite(Number(value))) return '';
  const text = fmtFixed(Number(value), decimals);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
};

/**
 * A slider, for anything worth scrubbing rather than typing.
 *
 * The number beside it follows the thumb live, but the value is only committed
 * on release. Committing on every `input` event re-renders the sidebar, which
 * replaces the very element being dragged.
 */
export function sliderField(label, value, onChange, {
  min, max, step = 1, info, format = (v) => String(v), key = null, hint = null,
} = {}) {
  const readout = el('span', { class: 'value muted', text: format(value) });
  const input = el('input', {
    type: 'range', min, max, step, value,
    'data-field': key || label,
    on: {
      input: (event) => { readout.textContent = format(Number(event.target.value)); },
      change: (event) => onChange(Number(event.target.value)),
    },
  });
  return el('div', { class: 'field' }, [
    el('div', { class: 'field__label' }, [
      label, info ? infoIcon(info) : null,
      el('span', { class: 'field__spacer' }), readout,
    ]),
    input,
    hint ? el('div', { class: 'field__hint', text: hint }) : null,
  ]);
}

export function toggleField(label, value, onChange, { info, key = null, hint = null } = {}) {
  const input = el('input', {
    type: 'checkbox',
    checked: value || null,
    'data-field': key || label,
    on: { change: (event) => onChange(event.target.checked) },
  });
  return el('div', { class: 'field' }, [
    el('label', { class: 'field--toggle' }, [
      input,
      el('span', { class: 'field__label field__label--inline' }, [label, info ? infoIcon(info) : null]),
    ]),
    hint ? el('div', { class: 'field__hint', text: hint }) : null,
  ]);
}

export function selectField(label, options, value, onChange, { info, hint, key = null } = {}) {
  const control = select(options, value, onChange);
  control.dataset.field = key || label;
  return field(label, control, { info, hint });
}

export function chipField(label, options, value, onChange, { info, hint } = {}) {
  return el('div', { class: 'field' }, [
    el('div', { class: 'field__label' }, [label, info ? infoIcon(info) : null]),
    chips(options, value, onChange),
    hint ? el('div', { class: 'field__hint', text: hint }) : null,
  ]);
}

/* -------------------------------------------------------------- readout -- */

/**
 * A headline number.
 *
 * `swatch` is what ties the tile to the arrow on the drawing. A velocity
 * reading with no colour beside it, next to five coloured arrows, leaves the
 * learner to guess which arrow it belongs to — and guessing is the one thing
 * this app is trying to replace.
 */
export function stat(label, value, { note = '', info = null, accent = false, swatch = null, sub = null } = {}) {
  return el('div', {
    class: `stat${accent ? ' stat--accent' : ''}${swatch ? ' stat--vector' : ''}`,
    style: swatch ? { '--swatch': `var(${swatch})` } : null,
  }, [
    el('div', { class: 'stat__label' }, [
      swatch ? el('span', { class: 'stat__swatch' }) : null,
      label,
      info ? infoIcon(info) : null,
    ]),
    el('div', { class: 'stat__value', text: value }),
    sub ? el('div', { class: 'stat__sub', text: sub }) : null,
    note ? el('div', { class: 'stat__note', text: note }) : null,
  ]);
}

/* -------------------------------------------------------------- banners -- */

const BANNER_MARK = { error: '!', warn: '!', ok: '✓', info: 'i' };
const BANNER_CLASS = { error: 'banner-danger', warn: 'banner-warn', ok: 'banner-ok', info: 'banner-info' };

/**
 * Live warnings rather than validation on submit. An experiment being set up
 * is allowed to be odd for a moment; what it must never be is silently odd.
 */
export function banner(level, text) {
  return el('div', { class: `banner ${BANNER_CLASS[level] || BANNER_CLASS.info}` }, [
    el('span', { class: 'banner__mark', text: BANNER_MARK[level] || 'i' }),
    el('span', { text }),
  ]);
}

export function bannerList(problems, { emptyText = null } = {}) {
  const order = { error: 0, warn: 1, ok: 2, info: 3 };
  const sorted = [...problems].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
  if (!sorted.length && emptyText) return [banner('ok', emptyText)];
  return sorted.map((problem) => banner(problem.level, problem.text));
}

/* --------------------------------------------------------------- tables -- */

export function table(columns, rows, { onRowClick = null, selectedIndex = -1, foot = null } = {}) {
  const head = el('tr', {}, columns.map((column) => el('th', {
    class: column.num ? 'num' : null, text: column.label,
  })));

  const body = rows.map((row, index) => el('tr', {
    class: onRowClick ? 'is-clickable' : null,
    'aria-selected': index === selectedIndex ? 'true' : null,
    on: onRowClick ? { click: () => onRowClick(row, index) } : undefined,
  }, columns.map((column) => el('td', {
    class: column.num ? 'num value' : null,
    text: String(row[column.key] ?? ''),
  }))));

  return el('div', { class: 'table-wrap' }, [
    el('table', { class: 'table' }, [
      el('thead', {}, head),
      el('tbody', {}, body),
      foot ? el('tfoot', {}, el('tr', {}, columns.map((column) => el('td', {
        class: column.num ? 'num value' : null,
        text: String(foot[column.key] ?? ''),
      })))) : null,
    ]),
  ]);
}

/* -------------------------------------------------------------- buttons -- */

export const buttonRow = (buttons) => el('div', { class: 'btn-row' }, buttons);

export function button(label, onClick, {
  primary = false, small = false, danger = false, title = null, pressed = null,
  key = null, disabled = false,
} = {}) {
  return el('button', {
    class: `btn${primary ? ' btn-primary' : ''}${small ? ' btn-sm' : ''}${danger ? ' btn-danger' : ''}`,
    type: 'button',
    title,
    text: label,
    disabled: disabled || null,
    'aria-pressed': pressed === null ? null : String(pressed),
    'data-field': key,
    on: { click: onClick },
  });
}

/** A row of things the drawing is showing, keyed by colour. */
export const legend = (items) => el('div', { class: 'legend' }, items.map((item) => el('div', { class: 'legend__item' }, [
  el('span', { class: 'legend__key', style: { background: `var(${item.token})` } }),
  el('span', { text: item.label }),
])));
