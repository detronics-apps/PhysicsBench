/**
 * Display formatting. Pure.
 *
 * Internal values are kept at full precision so repeated arithmetic does not
 * drift; nothing here is allowed to leak that precision into prose. Every
 * number the learner reads goes through one of these with an explicit
 * significant-figure count.  See references/pitfalls.md #9.
 *
 * A teaching app has a second reason to be careful: a readout of
 * `9.80665000001 m/s²` quietly teaches that physics is about decimal places.
 * It is not. Round for the eye; keep full precision for the arithmetic.
 */

/** Round to `digits` significant figures. Returns a number, not a string. */
export function sig(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x) || x === 0) return 0;
  const d = Math.max(1, Math.min(15, Math.trunc(digits)));
  const mag = Math.ceil(Math.log10(Math.abs(x)));
  const factor = 10 ** (d - mag);
  return Math.round(x * factor) / factor;
}

/**
 * A number as a person would write it: significant figures, no exponent for
 * anything of everyday size, trailing zeros trimmed.
 */
export function fmtNum(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';

  const abs = Math.abs(x);
  if (abs >= 1e7 || abs < 1e-4) return sig(x, digits).toExponential(Math.max(0, digits - 1));

  const rounded = sig(x, digits);
  const decimals = Math.max(0, Math.min(6, digits - Math.ceil(Math.log10(Math.abs(rounded)))));
  return trimZeros(rounded.toFixed(decimals));
}

function trimZeros(text) {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/**
 * A fixed number of decimal places, for anything that updates every frame.
 *
 * Significant figures are right for a static result and wrong for a live
 * readout: as a velocity passes through zero, `fmtNum` swings from `12.34` to
 * `0.0009321` and the column jitters. A live value wants a stable width.
 */
export function fmtFixed(value, decimals = 2) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  /*
   * Past a certain size a fixed number of decimals stops being a stable width
   * and becomes an unreadable one: an acceleration of 2.5×10¹⁷ m/s² printed
   * this way is "253355152316725568.00", twenty-three characters that nobody
   * can read and that break every layout they land in. The whole reason for
   * fixed decimals is legibility, so where it stops serving that it gives way.
   *
   * Reachable in ordinary use — a light object in a dense fluid, or an invented
   * world — and the app already has a banner explaining that the model has run
   * out. The number beside it should be readable enough to confirm it.
   */
  if (Math.abs(x) >= 1e7) return superscripted(sig(x, 4).toExponential(2));
  // -0 renders as "-0.00", which reads as a direction that is not there.
  const safe = Object.is(x, -0) || Math.abs(x) < 0.5 * 10 ** -decimals ? 0 : x;
  // U+2212, not a hyphen. Sign is the whole point of half this app — a
  // velocity of −4 m/s means something specific — so it gets the character
  // that actually looks like a minus, everywhere, from one place.
  return safe.toFixed(decimals).replace('-', '−');
}

/** "2.53e+17" written the way it would be on paper: 2.53×10¹⁷. */
const SUPERSCRIPT = {
  '-': '⁻', '+': '', 0: '⁰', 1: '¹', 2: '²', 3: '³',
  4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
};

function superscripted(exponential) {
  const [mantissa, exponent] = exponential.split('e');
  const digits = exponent.split('').map((c) => SUPERSCRIPT[c] ?? c).join('');
  return `${mantissa.replace('-', '−')}×10${digits}`;
}

/** Signed value with an explicit `+`, for anything where direction matters. */
export function fmtSigned(value, decimals = 2) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) < 0.5 * 10 ** -decimals) return (0).toFixed(decimals);
  return (x > 0 ? '+' : '−') + Math.abs(x).toFixed(decimals);
}

/* ------------------------------------------------------------- units ---- *
 * Units are never optional. A number without its unit is not a physical
 * quantity, and this app is about physical quantities.                      */

export const fmtKg = (v, d = 2) => `${fmtFixed(v, d)} kg`;
export const fmtM = (v, d = 2) => `${fmtFixed(v, d)} m`;
export const fmtMps = (v, d = 2) => `${fmtFixed(v, d)} m/s`;
export const fmtMps2 = (v, d = 2) => `${fmtFixed(v, d)} m/s²`;
export const fmtN = (v, d = 2) => `${fmtFixed(v, d)} N`;
export const fmtJ = (v, d = 2) => `${fmtFixed(v, d)} J`;
export const fmtW = (v, d = 2) => `${fmtFixed(v, d)} W`;
export const fmtP = (v, d = 2) => `${fmtFixed(v, d)} kg·m/s`;
export const fmtS = (v, d = 2) => `${fmtFixed(v, d)} s`;
export const fmtDeg = (v, d = 1) => `${fmtFixed(v, d)}°`;
export const fmtNm = (v, d = 2) => `${fmtFixed(v, d)} N·m`;
export const fmtRad = (v, d = 2) => `${fmtFixed(v, d)} rad`;
export const fmtRadps = (v, d = 2) => `${fmtFixed(v, d)} rad/s`;
export const fmtKgm2 = (v, d = 3) => `${fmtFixed(v, d)} kg·m²`;

/** A percentage, for "how far the prediction was from the result". */
export function fmtPct(value, decimals = 1) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  return `${fmtFixed(x, decimals)}%`;
}

/* ----------------------------------------------------------- vectors ---- */

/** `(3.00, −4.00) m/s`, for a quantity that has a direction. */
export function fmtVec(v, unit = '', decimals = 2) {
  if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return '—';
  const body = `(${fmtFixed(v.x, decimals)}, ${fmtFixed(v.y, decimals)})`;
  return unit ? `${body} ${unit}` : body;
}

/** The magnitude of a vector, with its unit. */
export function fmtMag(v, unit = '', decimals = 2) {
  if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return '—';
  return `${fmtFixed(Math.hypot(v.x, v.y), decimals)}${unit ? ` ${unit}` : ''}`;
}

/**
 * A direction as a compass-free phrase — "up and to the right", "downward".
 *
 * A learner reading "acceleration 9.81 m/s², direction 270°" has to do a
 * conversion before they can picture it. Words remove that step, and this is
 * the only place the mapping lives so the arrows and the prose cannot drift
 * apart. Screen y is up-positive here: the renderer does the flip, not this.
 */
export function fmtDirectionWords(v, { still = 'no direction (magnitude is zero)' } = {}) {
  if (!v) return still;
  const mag = Math.hypot(v.x, v.y);
  if (!Number.isFinite(mag) || mag < 1e-9) return still;

  const flat = Math.abs(v.y) < mag * 0.08;
  const upright = Math.abs(v.x) < mag * 0.08;
  const horizontal = v.x >= 0 ? 'right' : 'left';
  const vertical = v.y >= 0 ? 'up' : 'down';

  if (flat) return `to the ${horizontal}`;
  if (upright) return v.y >= 0 ? 'upward' : 'downward';
  return `${vertical} and to the ${horizontal}`;
}

/** `36.9° above the horizontal`, measured anticlockwise from +x. */
export function fmtBearing(v, decimals = 1) {
  if (!v) return '—';
  const mag = Math.hypot(v.x, v.y);
  if (mag < 1e-9) return '—';
  const deg = (Math.atan2(v.y, v.x) * 180) / Math.PI;
  return `${fmtFixed(deg, decimals)}°`;
}

/**
 * A quantity rendered exactly as the app should always render it: the number,
 * the unit, and — where it matters — the direction in words.
 */
export function quantity(value, unit, { decimals = 2, direction = null } = {}) {
  const head = `${fmtFixed(value, decimals)} ${unit}`;
  return direction ? `${head} ${direction}` : head;
}
