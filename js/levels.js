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
