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

/**
 * A titled, collapsible block in the sidebar.
 *
 * `open` is where the panel *starts*, not where it is held. It used to win over
 * the remembered state on every render, which meant a panel a caller wanted
 * closed by default could never be kept open: the first click on anything
 * inside it re-rendered the sidebar and folded it away again, with the reader's
 * own choice sitting in the store being ignored.
 *
 * So a recorded state always wins, and `open` decides only what happens before
 * there is one.
 */
export function section(title, children, { info = null, actions = null, key = null, open = null } = {}) {
  const id = key || title;
  const remembered = sectionStore.get(id);
  const showing = remembered === undefined || remembered === null
    ? (open === null ? true : open)
    : remembered;

  return el('details', {
    class: 'section',
    open: showing ? '' : null,
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
 * Is a slider being dragged right now?
 *
 * True only for the duration of the `onChange` call that an `input` event
 * makes, which is exactly the window in which the shell must not rebuild the
 * sidebar — replacing the element under the thumb ends the drag.
 *
 * A shared flag rather than an extra argument, because every one of the forty
 * or so call sites would otherwise have to forward it, and the one that forgot
 * would fail in a way nobody would notice until they tried to drag it.
 */
export const drag = { active: false };

/**
 * A slider, for anything worth scrubbing rather than typing.
 *
 * The value is committed on every movement of the thumb, not on release,
 * because the whole point of the bench is watching the change happen: drag the
 * push angle while the object is moving and its path bends as you go. That was
 * impossible while sliders only committed on release, and it is the difference
 * between an instrument and a form.
 *
 * The cost is that the shell must not rebuild the sidebar mid-drag — it would
 * replace the element being dragged and the drag would simply stop. Hence the
 * flag above: the shell repaints the drawing and the readouts every movement,
 * and rebuilds the controls once, on release.
 *
 * The value beside it is typed into as well as dragged. A slider is the right
 * control for finding out what a quantity does and the wrong one for setting it
 * to 9.81, and making the reader choose between the two would be a poor trade
 * when the same field can be both. Click the number, type, press Enter.
 */
export function sliderField(label, value, onChange, {
  min, max, step = 1, info, format = (v) => String(v), key = null, hint = null,
  unit = null,
} = {}) {
  const field = key || label;

  /*
   * One element that shows the formatted value and accepts a typed one.
   *
   * Formatted text — "0.40 m across", "45°" — cannot be typed into, so the
   * field swaps to the bare number the moment it takes focus and back to the
   * sentence when it loses it. Swapping the *element* instead would lose the
   * caret and the focus-restoring machinery that survives a re-render.
   */
  /*
   * Committing is wired to `change` as well as `blur`.
   *
   * `blur` alone is the obvious choice and it is not enough: a text field fires
   * `change` on Enter and on losing focus, and a browser window that does not
   * itself have focus never fires `blur` at all. Two events, one commit, and it
   * is idempotent — so nothing happens twice when both arrive.
   */
  const commit = (node) => {
    const typed = parseNumber(node.value);
    node.classList.remove('input--invalid');
    if (typed === null || !Number.isFinite(typed)) {
      // Nonsense is refused and the value put back, never turned into a NaN
      // that reaches the physics as a silent NaN everywhere.
      node.value = format(value);
      return;
    }
    // A value past the ends of the slider is clamped rather than rejected —
    // the thumb moving to its end says why more clearly than an error would.
    const clamped = Math.min(max, Math.max(min, typed));
    node.value = format(clamped);
    if (clamped !== value) onChange(clamped);
  };

  const reveal = (node) => {
    if (node.dataset.raw === '1') return;
    node.dataset.raw = '1';
    node.value = trim(value);
  };

  const readout = el('input', {
    type: 'text',
    class: 'value value--typed',
    value: format(value),
    inputmode: 'decimal',
    spellcheck: 'false',
    'data-field': `${field}:typed`,
    'aria-label': `${label}${unit ? ` in ${unit}` : ''} — type a value`,
    title: 'Click to type a value',
    on: {
      // Both, because a pointer press is the reliable signal that this is about
      // to be typed into and `focus` is the one that catches keyboard tabbing.
      focus: (event) => { reveal(event.target); event.target.select(); },
      pointerdown: (event) => reveal(event.target),
      keydown: (event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit(event.target); event.target.blur(); }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.target.value = format(value);
          event.target.blur();
        }
        // The arrow keys belong to the field being typed in, not to whatever
        // else on the page might be listening for them.
        event.stopPropagation();
      },
      change: (event) => commit(event.target),
      blur: (event) => commit(event.target),
      input: (event) => {
        const typed = parseNumber(event.target.value);
        event.target.classList.toggle('input--invalid', typed === null || !Number.isFinite(typed));
      },
    },
  });

  const input = el('input', {
    type: 'range', min, max, step, value,
    'data-field': field,
    on: {
      input: (event) => {
        readout.value = format(Number(event.target.value));
        drag.active = true;
        try { onChange(Number(event.target.value)); } finally { drag.active = false; }
      },
      change: (event) => { drag.active = false; onChange(Number(event.target.value)); },
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

/** A number as short a string as it can honestly be, for typing back into. */
const trim = (v) => {
  const rounded = Math.abs(v) >= 1000 ? v.toPrecision(6) : String(Number(v.toPrecision(8)));
  return rounded.includes('e') ? String(v) : rounded.replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m));
};

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

/*
 * `danger` and `error` are the same level under two names, and both are here
 * deliberately.
 *
 * An unrecognised level used to fall back to `info` in silence, which meant
 * every `banner('danger', …)` in the app — the warnings that say the model has
 * run out and the number beside it should not be believed — was rendered as a
 * neutral grey note. A severity that quietly downgrades itself is worse than no
 * severity at all, so the alias exists and `bannerLevel` is exported for the
 * test that pins it.
 */
const BANNER_MARK = { error: '!', danger: '!', warn: '!', ok: '✓', info: 'i' };
const BANNER_CLASS = {
  error: 'banner-danger', danger: 'banner-danger',
  warn: 'banner-warn', ok: 'banner-ok', info: 'banner-info',
};

/** Every level a banner will honour. Anything else is a caller's typo. */
export const BANNER_LEVELS = Object.keys(BANNER_CLASS);

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
  const order = { error: 0, danger: 0, warn: 1, ok: 2, info: 3 };
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
