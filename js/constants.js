/**
 * The physical constants, and nothing else. Pure data.
 *
 * The catalogues that used to live here — worlds, fluids, shapes, materials —
 * moved out to the modules that use them, because each of those is a set of
 * *measurements* with its own caveats rather than a constant. What is left is
 * the handful of numbers that genuinely do not depend on anything.
 *
 * Two of the three are exact by definition and one is measured, and the app
 * says which is which wherever it shows them. That distinction is not
 * pedantry: it is the difference between a number that can be improved by a
 * better experiment and one that cannot.
 */

/**
 * Newtonian constant of gravitation, CODATA 2022: 6.67430(15)×10⁻¹¹.
 *
 * **Measured**, and the least precisely known of the fundamental constants —
 * relative standard uncertainty 2.2×10⁻⁵, which is enormous next to, say, the
 * speed of light. Every gravitational number in this app inherits that
 * uncertainty in its fifth significant figure, which is far below anything
 * shown on screen.
 */
export const G = 6.6743e-11;
export const G_UNCERTAINTY = 0.00015e-11;

/**
 * Standard gravity, gₙ.
 *
 * **Defined** — not measured — as exactly 9.80665 m/s² by the 3rd CGPM in
 * 1901, so that the kilogram-force had a fixed meaning. It is close to, but
 * not the same as, the gravitational acceleration at any particular point on
 * Earth: nowhere on Earth is it exactly this.
 *
 * The app computes g from a world's mass and radius rather than using this,
 * and only falls back on it where a scene has no world in it at all.
 */
export const G_STANDARD = 9.80665;

/**
 * Speed of light in vacuum. **Defined** as exactly this since 1983 — the metre
 * is derived from it, rather than the other way round.
 *
 * Used only to put a number on how wrong p = mv is, which at the speeds in
 * this app is about one part in 10¹³.
 */
export const C_LIGHT = 299792458;
