/**
 * Simple, Advanced, Expert — how much of the bench is on screen.
 *
 * The level never changes the physics and never changes a value. Every
 * integration step still runs, every force is still computed, and a field
 * hidden at Simple keeps whatever it was set to. It decides one thing: how
 * much of what the app knows is shown at once.
 *
 * The three answer three different people:
 *
 *   Simple    someone meeting the subject. What the thing is doing, and the
 *             formula that says so. Nothing to tune, nothing to read past.
 *   Advanced  someone using the bench. The energy books, the conditions each
 *             equation holds under, and the knobs worth turning.
 *   Expert    someone learning the model itself. What each equation is a
 *             special case of, what people get wrong about it, and the
 *             recording trade the app would otherwise decide silently.
 *
 * The ordering lives here and nowhere else, so a caller asks "is this reader
 * at least at Advanced?" rather than listing the levels that qualify — the
 * list that is always one short when a fourth level appears.
 */

export const LEVELS = [
  {
    id: 'simple',
    label: 'Simple',
    note: 'What it is doing, and the formula that says so. Everything else runs on its defaults.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    note: 'Adds the energy books, the conditions each equation holds under, and the settings '
      + 'worth changing.',
  },
  {
    id: 'expert',
    label: 'Expert',
    note: 'Everything: what each equation is a special case of, what people commonly get wrong '
      + 'about it, and what the app is recording.',
  },
];

export const LEVEL_IDS = LEVELS.map((l) => l.id);

/**
 * Interactive — the fourth chip, which is a layout rather than a level.
 *
 * It sits beside the three because that is where a reader looks for "how much
 * of the bench is on screen", and it answers the same question — but it
 * answers it by moving the controls rather than by hiding them. The drawing
 * takes the whole screen and every input is reached by tapping the thing it
 * belongs to.
 *
 * Deliberately **not** a fourth rank in the list above. `atLeast` is asked
 * several hundred times across the app, and a fourth rank would make every
 * `at('expert')` either always true or always false depending on which end it
 * was added at. A layout and a level are two questions; this is the other one,
 * and the level you picked still decides what the sheets show.
 */
export const INTERACTIVE = {
  id: 'interactive',
  label: 'Interactive',
  note: 'The drawing, full screen, with every control reached by tapping the thing it belongs '
    + 'to. Made for a phone, and the way a phone opens.',
};

export const LAYOUTS = ['page', 'interactive'];

/**
 * The largest "smaller side" that still counts as a phone, in CSS pixels.
 *
 * 560 sits above every phone held either way — the tallest common phone is 430
 * across in portrait and 430 tall in landscape — and below every tablet, the
 * smallest common one being 768. The gap is wide enough that the number does
 * not need revisiting every time a handset grows.
 */
export const PHONE_SIDE = 560;

/**
 * Which layout a reader who has never chosen one should get.
 *
 * Measured on the *smaller* side of the viewport, never the width. A phone in
 * landscape is 812 px across — wider than a laptop in a split window — so a
 * width test would send exactly the case this mode was asked for into the page
 * layout. The smaller side is 375 whichever way the phone is held.
 *
 * The coarse pointer is the second half of the question: a 500 px browser
 * window on a desktop is a small screen being used with a mouse, and a mouse
 * does not have the problem this mode solves.
 *
 * This is a *default*, not an override. It decides what somebody sees who has
 * never expressed a preference; the moment they press the X or pick a level,
 * their choice is stored and this is never consulted again.
 */
export function defaultLayout({ coarse = false, minSide = Infinity } = {}) {
  return coarse && minSide <= PHONE_SIDE ? 'interactive' : 'page';
}

const RANK = Object.fromEntries(LEVELS.map((l, i) => [l.id, i]));

/** Is `level` at or above `needed`? An unknown level reads as Simple. */
export function atLeast(level, needed) {
  return (RANK[level] ?? 0) >= (RANK[needed] ?? 0);
}

/**
 * A predicate bound to one level, for a caller that asks many times.
 *
 *   const at = shownAt(ctx.level);
 *   at('expert') ? thePanel : null
 */
export const shownAt = (level) => (needed) => atLeast(level, needed);

export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
