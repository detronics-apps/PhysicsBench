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
/* ------------------------------------------------------- the atmosphere -- */

/**
 * The International Standard Atmosphere, which is where "1.225 kg/m³" comes
 * from in the first place.
 *
 * Air is the one fluid on this bench that is not the same everywhere in it. A
 * balloon does not rise for ever: it rises until the air around it is as thin
 * as the balloon is, and that altitude is the answer to a question a fixed
 * density cannot even ask. Drag falls away with the density too, which is why
 * things thrown hard go further high up and why re-entry heating starts where
 * it does.
 *
 * Two layers are enough to cover anything this app can model:
 *
 *   0 to 11 km   the troposphere, cooling at 6.5 K per km
 *   above 11 km  the stratosphere, isothermal at 216.65 K
 *
 * Below sea level the troposphere formula is simply continued, which is right
 * for the few hundred metres of it that exist on Earth.
 */
const ISA = {
  seaLevelDensity: 1.225,          // kg/m³
  seaLevelTemperature: 288.15,     // K
  lapseRate: 0.0065,               // K/m
  gasConstant: 287.0528,           // J/(kg·K) for dry air
  g0: 9.80665,                     // m/s², the defined standard gravity
  tropopause: 11000,               // m
  tropopauseTemperature: 216.65,   // K
};

// ρ ∝ T^(g/(R·L) − 1). One exponent, derived rather than typed in.
const ISA_EXPONENT = ISA.g0 / (ISA.gasConstant * ISA.lapseRate) - 1;
// The scale height of the isothermal layer above the tropopause.
const ISA_SCALE_HEIGHT = (ISA.gasConstant * ISA.tropopauseTemperature) / ISA.g0;
const ISA_TROPOPAUSE_DENSITY = ISA.seaLevelDensity
  * (ISA.tropopauseTemperature / ISA.seaLevelTemperature) ** ISA_EXPONENT;

/*
 * The air in a column from sea level to the tropopause, as a constant.
 *
 * Written out rather than fetched by calling `atmosphereColumn(11000)`, which
 * is not below the tropopause and so recursed into itself for ever.
 */
const ISA_TROPOPAUSE_COLUMN = ((ISA.seaLevelDensity * ISA.seaLevelTemperature)
  / (ISA.lapseRate * (ISA_EXPONENT + 1)))
  * (1 - (ISA.tropopauseTemperature / ISA.seaLevelTemperature) ** (ISA_EXPONENT + 1));

/** Sutherland's law — viscosity depends on temperature, not on pressure. */
const sutherland = (temperature) => (1.458e-6 * temperature ** 1.5) / (temperature + 110.4);

/**
 * The air at a given height above sea level: what it weighs, how sticky it is,
 * how cold it is and what it presses at.
 */
export function atmosphereAt(altitude) {
  const h = Number.isFinite(altitude) ? altitude : 0;

  if (h < ISA.tropopause) {
    // Continued below sea level as well; a mine shaft is still troposphere.
    const temperature = ISA.seaLevelTemperature - ISA.lapseRate * h;
    const density = ISA.seaLevelDensity
      * (temperature / ISA.seaLevelTemperature) ** ISA_EXPONENT;
    return {
      density,
      viscosity: sutherland(temperature),
      temperature,
      pressure: density * ISA.gasConstant * temperature,
    };
  }

  const temperature = ISA.tropopauseTemperature;
  const density = ISA_TROPOPAUSE_DENSITY
    * Math.exp(-(h - ISA.tropopause) / ISA_SCALE_HEIGHT);
  return {
    density,
    viscosity: sutherland(temperature),
    temperature,
    pressure: density * ISA.gasConstant * temperature,
  };
}

/**
 * The mass of air in a column of unit area from sea level up to `altitude`.
 *
 * This is what makes buoyancy in a varying atmosphere still conservative, and
 * therefore what keeps the energy ledger honest. The buoyant force on a body of
 * volume V is ρ(y)·V·g, which depends on height — so the energy it takes to
 * lift the body is the *integral* of that, not the local value times the rise.
 * Using the local density instead would leave the books drifting by a little on
 * every frame, in an app whose central claim is that they do not.
 *
 * Closed form rather than a numerical integral, because it is one, and because
 * a per-body per-frame quadrature would be a real cost for no extra accuracy.
 */
export function atmosphereColumn(altitude) {
  const h = Number.isFinite(altitude) ? altitude : 0;

  if (h < ISA.tropopause) {
    // ∫ρ0·u^n dh with u = T/T0, which integrates to a difference of powers.
    const u = 1 - (ISA.lapseRate * h) / ISA.seaLevelTemperature;
    return (ISA.seaLevelDensity * ISA.seaLevelTemperature)
      / (ISA.lapseRate * (ISA_EXPONENT + 1))
      * (1 - u ** (ISA_EXPONENT + 1));
  }

  return ISA_TROPOPAUSE_COLUMN + ISA_TROPOPAUSE_DENSITY * ISA_SCALE_HEIGHT
    * (1 - Math.exp(-(h - ISA.tropopause) / ISA_SCALE_HEIGHT));
}

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
    id: 'atmosphere',
    label: 'Atmosphere',
    /*
     * The only fluid here that is not the same everywhere in it.
     *
     * The figures below are the sea-level values, and they are what everything
     * that does not know about the profile falls back to; `profile` is what
     * tells the physics to look the density up at the body's own height
     * instead.
     */
    density: 1.225,
    viscosity: 1.7894e-5,
    profile: 'isa',
    note: 'Real air, thinning with height, to the International Standard '
      + 'Atmosphere. Half of it is below 5.5 km. A balloon in this does not '
      + 'rise for ever — it stops where the air is as thin as the balloon is, '
      + 'which is a question a single fixed density cannot even ask. Drag falls '
      + 'away with the density too.',
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
