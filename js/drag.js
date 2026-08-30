/**
 * Fluid resistance, from treacle to open air. Pure.
 *
 * The reason this is its own module rather than one line in `forces.js` is that
 * "air resistance goes as v²" is only true in one regime, and the app lets the
 * learner pick honey, where it is flatly false.
 *
 * What actually decides the behaviour is the Reynolds number — the ratio of
 * inertial to viscous effects in the flow:
 *
 *     Re = ρ · v · D / μ
 *
 * At low Re the fluid is dominated by viscosity, the flow stays smooth, and
 * drag is proportional to **v**. At high Re it is dominated by inertia, a
 * turbulent wake forms behind the object, and drag is proportional to **v²**.
 * A marble in honey lives at Re ≈ 1; the same marble in air at the same speed
 * lives at Re ≈ 1000.
 *
 * Rather than switching between two formulas, this module uses one drag
 * coefficient that varies with Re — the Clift–Gauvin correlation for a sphere:
 *
 *     C_d = 24/Re + 6/(1 + √Re) + 0.4
 *
 * At low Re the first term dominates and the whole expression collapses,
 * exactly, to Stokes' law F = 3πμDv. At high Re it settles at about 0.44, the
 * familiar constant. One formula, correct at both ends, and the app can show
 * which term is doing the work.
 */

/** Reynolds number. `length` is the characteristic size — diameter, for a sphere. */
export function reynolds({ density, speed, length, viscosity }) {
  if (!(density > 0) || !(length > 0) || !(Math.abs(speed) > 0)) return 0;
  // An inviscid fluid is the Re → ∞ limit, not the Re = 0 one. Getting that
  // backwards makes a vacuum look like treacle, because the viscous term in the
  // drag correlation goes as 24/Re.
  if (!(viscosity > 0)) return Infinity;
  return (density * Math.abs(speed) * length) / viscosity;
}

/**
 * Drag coefficient of a sphere, across the whole practical range of Re.
 *
 * Clift–Gauvin. Accurate to a few per cent from Re ≈ 0.1 up to about 2×10⁵,
 * which covers everything in this app. It does not model the drag crisis — the
 * sudden drop above the critical Reynolds number that dimples on a golf ball
 * exist to trigger — and the app says so rather than pretending.
 */
export function sphereCd(re) {
  if (!(re > 0)) return Infinity;
  if (!Number.isFinite(re)) return 0.4;
  return 24 / re + 6 / (1 + Math.sqrt(re)) + 0.4;
}

/**
 * Which regime the flow is in, and what that means for the learner.
 *
 * The boundaries are conventional and fuzzy — nothing switches over at exactly
 * Re = 1 — so the descriptions say "roughly" and mean it.
 */
export function regime(re) {
  if (!Number.isFinite(re)) {
    return {
      id: 'turbulent',
      label: 'Inertial (inviscid) flow',
      power: 2,
      text: 'The fluid has no viscosity in this model, so only inertia resists — '
        + 'drag is proportional to the square of the speed, with a constant drag '
        + 'coefficient. This is the familiar ½ρC_dAv².',
    };
  }
  if (!(re > 0)) {
    return { id: 'none', label: 'No fluid', power: 0, text: 'Nothing to push out of the way.' };
  }
  if (re < 1) {
    return {
      id: 'stokes',
      label: 'Viscous (Stokes) flow',
      power: 1,
      text: 'Viscosity dominates. The fluid slides smoothly around the object '
        + 'and drag is proportional to speed, not to speed squared. Go twice as '
        + 'fast and the fluid pushes back twice as hard — not four times.',
    };
  }
  if (re < 1000) {
    return {
      id: 'transitional',
      label: 'Transitional flow',
      power: 1.5,
      text: 'Neither regime owns this. Drag is growing faster than the speed but '
        + 'slower than the speed squared, and no simple power law describes it — '
        + 'which is why the app uses a correlation rather than a formula.',
    };
  }
  return {
    id: 'turbulent',
    label: 'Inertial (turbulent) flow',
    power: 2,
    text: 'Inertia dominates and a turbulent wake trails behind the object. Drag '
      + 'is proportional to the square of the speed — this is the regime the '
      + 'familiar ½ρC_dAv² was written for.',
  };
}

/**
 * The drag force on a body moving through a fluid.
 *
 * @param {object} spec
 *   `{ speed, density, viscosity, diameter, area, cdShape }`
 *   `cdShape` is the high-Reynolds coefficient for a non-spherical shape; the
 *   viscous term is taken from the sphere correlation either way, which is an
 *   approximation the disclosure names.
 * @returns everything the readout needs, not just a number.
 */
export function drag({ speed, density = 0, viscosity = 0, diameter = 0, area = 0, cdShape = null }) {
  const v = Math.abs(speed);
  if (!(density > 0) || !(area > 0) || v < 1e-12) {
    return { force: 0, re: 0, cd: 0, regime: regime(0), viscousShare: 0 };
  }

  const re = reynolds({ density, speed: v, length: diameter || Math.sqrt((4 * area) / Math.PI), viscosity });
  const sphere = sphereCd(re);
  // 24/∞ and 6/(1+∞) are both zero, so an inviscid fluid leaves only the
  // inertial coefficient — which is exactly the familiar constant-C_d model.
  const viscousPart = Number.isFinite(re) ? 24 / re : 0;
  const transitionPart = Number.isFinite(re) ? 6 / (1 + Math.sqrt(re)) : 0;

  /*
   * A non-spherical shape keeps its own high-Reynolds coefficient, but must
   * still obey the viscous term at low Re — a cube in honey is not four times
   * harder to move than a sphere in honey, because at Re ≈ 1 the shape barely
   * matters and the viscosity does everything.
   */
  const cd = cdShape === null || !Number.isFinite(cdShape)
    ? sphere
    : viscousPart + transitionPart + cdShape;

  const force = 0.5 * density * cd * area * v * v;
  const viscousTerm = 0.5 * density * viscousPart * area * v * v;

  return {
    force,
    re,
    cd,
    regime: regime(re),
    // How much of the drag is the viscous term: 1 in honey, ~0 in air.
    viscousShare: force > 0 ? Math.min(1, viscousTerm / force) : 0,
    // Stokes' law, for comparison, where it applies.
    stokes: diameter > 0 ? 3 * Math.PI * viscosity * diameter * v : NaN,
  };
}

/**
 * Terminal speed, found by search rather than formula.
 *
 * The usual closed form √(2mg / ρC_dA) assumes C_d is a constant, which it is
 * not — and in honey it is not even close. Solving it numerically costs
 * nothing and is right in every fluid.
 */
export function terminalSpeed({ mass, g, density, viscosity, diameter, area, cdShape = null }) {
  if (!(density > 0) || !(area > 0) || !(g > 0)) return Infinity;
  const weight = mass * g;
  const at = (v) => drag({ speed: v, density, viscosity, diameter, area, cdShape }).force - weight;

  if (at(1e-9) > 0) return 0;
  let hi = 1;
  for (let i = 0; i < 200 && at(hi) < 0; i += 1) hi *= 2;
  if (at(hi) < 0) return Infinity;

  let lo = 0;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Fluids, with the two properties that decide everything: how much of it there
 * is to shove aside, and how much it resists being sheared.
 *
 * Viscosity is the one that surprises people. Honey is only 40% denser than
 * water and about ten thousand times more viscous, and it is the viscosity that
 * makes it feel like honey.
 */
export const FLUIDS = [
  {
    id: 'vacuum',
    label: 'Vacuum',
    density: 0,
    viscosity: 0,
    note: 'No fluid at all. This is the idealisation most textbook problems '
      + 'assume without saying so.',
  },
  {
    id: 'air',
    label: 'Air',
    density: 1.225,
    viscosity: 1.81e-5,
    note: 'Sea level, 15 °C — the International Standard Atmosphere. Thin and '
      + 'barely viscous, so almost everything you throw through it is well into '
      + 'the v² regime.',
  },
  {
    id: 'water',
    label: 'Water',
    density: 997,
    viscosity: 1.0e-3,
    note: 'At 20 °C. Eight hundred times denser than air and fifty times more '
      + 'viscous — but still inertia-dominated for anything larger than a grain '
      + 'of sand moving at a sensible speed.',
  },
  {
    id: 'honey',
    label: 'Honey',
    density: 1420,
    viscosity: 10,
    note: 'At 20 °C, and this is the number that varies most in the whole app: '
      + 'honey runs from about 2 Pa·s when warm to over 100 when cold. Only 40% '
      + 'denser than water, and roughly ten thousand times more viscous — which '
      + 'is what makes it feel like honey. In here, drag is proportional to '
      + 'speed rather than to speed squared.',
  },
  {
    id: 'glycerol',
    label: 'Glycerol',
    density: 1261,
    viscosity: 1.41,
    note: 'Between water and honey, and the standard laboratory fluid for '
      + 'demonstrating Stokes\' law.',
  },
  {
    id: 'oil',
    label: 'Engine oil (SAE 30)',
    density: 890,
    viscosity: 0.29,
    note: 'At 20 °C. Viscosity falls sharply as it warms, which is the entire '
      + 'reason engine oil is graded the way it is.',
  },
];

export const fluidById = (id) => FLUIDS.find((f) => f.id === id) || FLUIDS[0];
