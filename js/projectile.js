/**
 * Projectile motion, both ways. Pure.
 *
 * The no-drag case has a closed-form answer and this module gives it exactly.
 * The case with air resistance does not — no elementary function describes it —
 * and this module integrates it instead. Having both, computed independently
 * and comparable side by side, is the whole teaching mechanism: the learner
 * sees the parabola, then switches the air on and watches the real trajectory
 * fall short of it, and the difference has a name and a size.
 *
 * The single most important property of the no-drag model, and the one the
 * Gravity lab is built to demonstrate: **horizontal and vertical motion are
 * completely independent.** Gravity acts only vertically, so the horizontal
 * velocity never changes and the vertical motion is exactly the same as if the
 * object had simply been dropped. Air resistance breaks that independence,
 * because drag depends on the total speed — which is worth knowing too.
 */

import { vec, len } from './vec.js';
import { rk4 } from './integrator.js';

const rad = (deg) => (deg * Math.PI) / 180;

/* ---------------------------------------------------- the exact model --- */

/**
 * The state at time t, with no air resistance.
 *
 * @param {object} launch `{ speed, angleDeg, height, g }`
 */
export function stateAt(launch, t) {
  const { speed, angleDeg, height = 0, g } = launch;
  const ux = speed * Math.cos(rad(angleDeg));
  const uy = speed * Math.sin(rad(angleDeg));
  return {
    t,
    pos: vec(ux * t, height + uy * t - 0.5 * g * t * t),
    vel: vec(ux, uy - g * t),
    // Constant, always, everywhere in this model — including at the apex.
    acc: vec(0, -g),
  };
}

/** The horizontal velocity, which never changes without air resistance. */
export const horizontalVelocity = ({ speed, angleDeg }) => speed * Math.cos(rad(angleDeg));

/** The vertical velocity at launch. */
export const verticalVelocity = ({ speed, angleDeg }) => speed * Math.sin(rad(angleDeg));

/**
 * The highest point.
 *
 * The vertical velocity is zero here — and the acceleration is not. That is the
 * experiment the spec asks for by name, so the returned object states it.
 */
export function apex(launch) {
  const { g, height = 0 } = launch;
  const uy = verticalVelocity(launch);
  if (!(g > 0)) return { reachable: false, t: Infinity, height: Infinity };
  if (uy <= 0) {
    return {
      reachable: true, t: 0, height, verticalVelocity: uy,
      note: 'Launched level or downward, so the start is already the highest point.',
    };
  }
  const t = uy / g;
  return {
    reachable: true,
    t,
    height: height + (uy * uy) / (2 * g),
    verticalVelocity: 0,
    acceleration: -g,
    note: 'At the top the vertical velocity is zero. The acceleration is not — '
      + 'it is still g downward, which is exactly why the object does not stay '
      + 'there.',
  };
}

/** When the projectile is at a given height, on the way up and on the way down. */
export function timesAtHeight(launch, y) {
  const { g, height = 0 } = launch;
  const uy = verticalVelocity(launch);
  const a = -0.5 * g;
  const b = uy;
  const c = height - y;
  if (Math.abs(a) < 1e-15) return b === 0 ? [] : [-c / b].filter((t) => t >= 0);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)]
    .filter((t) => t >= -1e-12)
    .map((t) => Math.max(0, t))
    .sort((x, y2) => x - y2);
}

/** Time of flight until it returns to a given ground level. */
export function flightTime(launch, groundY = 0) {
  const times = timesAtHeight(launch, groundY);
  return times.length ? times[times.length - 1] : Infinity;
}

/** Horizontal distance covered before landing. */
export function range(launch, groundY = 0) {
  const t = flightTime(launch, groundY);
  return Number.isFinite(t) ? horizontalVelocity(launch) * t : Infinity;
}

/**
 * The launch angles that put the projectile on a target at the same height.
 *
 * There are generally two — a flat, fast shot and a lobbed one — which is the
 * discovery the Challenge mode's target practice is built around. Above a
 * critical speed neither exists.
 */
export function anglesForRange(distance, speed, g, groundY = 0, height = 0) {
  if (height !== groundY) return anglesForRangeNumeric(distance, speed, g, height - groundY);
  const s = (distance * g) / (speed * speed);
  if (Math.abs(s) > 1) return { reachable: false, angles: [], minimumSpeed: Math.sqrt(distance * g) };
  const twoTheta = Math.asin(s);
  const low = (twoTheta * 90) / Math.PI;
  const high = 90 - low;
  return {
    reachable: true,
    angles: low === high ? [low] : [low, high],
    minimumSpeed: Math.sqrt(distance * g),
    note: low === high
      ? 'This is the maximum range for that speed, and 45° is the only angle that reaches it.'
      : 'Two angles reach the same distance: a flat fast shot and a high lob. '
        + 'They always add up to 90°.',
  };
}

/** The same question from a launch height, solved by search rather than formula. */
function anglesForRangeNumeric(distance, speed, g, dropHeight) {
  const found = [];
  let previous = null;
  for (let deg = -89.5; deg <= 89.5; deg += 0.25) {
    const r = range({ speed, angleDeg: deg, height: dropHeight, g }, 0) - distance;
    if (previous !== null && Number.isFinite(r) && Math.sign(r) !== Math.sign(previous.r)) {
      found.push(refine(previous.deg, deg, (d) => range({ speed, angleDeg: d, height: dropHeight, g }, 0) - distance));
    }
    if (Number.isFinite(r)) previous = { deg, r };
  }
  return {
    reachable: found.length > 0,
    angles: found,
    note: found.length > 1
      ? 'Two angles reach the target. Launching from a height moves the best '
        + 'angle below 45°, because the extra fall time rewards horizontal speed.'
      : '',
  };
}

function refine(lo, hi, f, iterations = 40) {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i += 1) {
    const mid = (a + b) / 2;
    if (Math.sign(f(mid)) === Math.sign(f(a))) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

/**
 * The angle that goes furthest.
 *
 * 45° only when launching and landing at the same height. From a height it is
 * lower, and the app should never state the 45° rule without that condition.
 */
export function bestAngle(speed, g, launchHeight = 0, groundY = 0) {
  const drop = launchHeight - groundY;
  if (Math.abs(drop) < 1e-12) return { angleDeg: 45, exact: true, note: 'Exactly 45°, but only because the launch and landing heights are the same.' };
  // sin θ = 1/√(2 + 2gh/u²) is the closed form for a raised launch.
  const s = 1 / Math.sqrt(2 + (2 * g * drop) / (speed * speed));
  const angleDeg = (Math.asin(Math.min(1, Math.max(-1, s))) * 180) / Math.PI;
  return {
    angleDeg,
    exact: true,
    note: drop > 0
      ? 'Below 45°, because launching from a height gives extra falling time, and '
        + 'that time is better spent travelling forwards.'
      : 'Above 45°, because the projectile has to climb to reach the landing level.',
  };
}

/** A sampled trajectory of the exact model, for drawing. */
export function trajectory(launch, { groundY = 0, steps = 200 } = {}) {
  const total = flightTime(launch, groundY);
  const end = Number.isFinite(total) ? total : 10;
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(stateAt(launch, (end * i) / steps));
  }
  return out;
}

/* -------------------------------------------------- the numeric model --- */

/**
 * The same launch with air resistance, integrated step by step.
 *
 * No closed form exists, which is itself worth saying out loud: the reason the
 * textbook always says "ignore air resistance" is not that the air does not
 * matter, it is that including it makes the algebra impossible.
 *
 * @param {object} launch `{ speed, angleDeg, height, g, mass }`
 * @param {object} air    `{ density, cd, area }`
 */
export function simulate(launch, air = {}, { groundY = 0, dt = 0.001, maxTime = 120 } = {}) {
  const { speed, angleDeg, height = 0, g, mass = 1 } = launch;
  const k = 0.5 * (air.density || 0) * (air.cd || 0) * (air.area || 0);

  const deriv = (t, y) => {
    const [, , vx, vy] = y;
    const v = Math.hypot(vx, vy);
    const dragFactor = mass > 0 && v > 0 ? (k * v) / mass : 0;
    return [vx, vy, -dragFactor * vx, -g - dragFactor * vy];
  };

  let state = [0, height, speed * Math.cos(rad(angleDeg)), speed * Math.sin(rad(angleDeg))];
  let t = 0;
  const samples = [{ t: 0, pos: vec(state[0], state[1]), vel: vec(state[2], state[3]), acc: accelerationOf(state, deriv, 0) }];
  let peak = { t: 0, height: state[1] };

  while (t < maxTime) {
    const next = rk4(state, t, dt, deriv);
    const nextT = t + dt;
    if (next[1] > peak.height) peak = { t: nextT, height: next[1] };

    if (next[1] <= groundY && state[1] > groundY) {
      // Land exactly on the ground rather than a step past it: interpolate.
      const fraction = (state[1] - groundY) / (state[1] - next[1]);
      const landed = state.map((v, i) => v + (next[i] - v) * fraction);
      landed[1] = groundY;
      const landT = t + dt * fraction;
      samples.push({ t: landT, pos: vec(landed[0], landed[1]), vel: vec(landed[2], landed[3]), acc: accelerationOf(landed, deriv, landT) });
      state = landed;
      t = landT;
      break;
    }

    state = next;
    t = nextT;
    samples.push({ t, pos: vec(state[0], state[1]), vel: vec(state[2], state[3]), acc: accelerationOf(state, deriv, t) });
  }

  const withDrag = k > 0;
  const ideal = { speed, angleDeg, height, g };
  return {
    samples: thin(samples, 400),
    landed: state[1] <= groundY + 1e-9,
    flightTime: t,
    range: state[0],
    apexHeight: peak.height,
    apexTime: peak.t,
    impactSpeed: Math.hypot(state[2], state[3]),
    withDrag,
    // What the same launch would have done in a vacuum, for the comparison.
    ideal: {
      range: range(ideal, groundY),
      flightTime: flightTime(ideal, groundY),
      apexHeight: apex(ideal).height,
      impactSpeed: (() => {
        const tf = flightTime(ideal, groundY);
        const s = stateAt(ideal, tf);
        return len(s.vel);
      })(),
    },
  };
}

function accelerationOf(y, deriv, t) {
  const d = deriv(t, y);
  return vec(d[2], d[3]);
}

function thin(list, maxCount) {
  if (list.length <= maxCount) return list;
  const stride = Math.ceil(list.length / maxCount);
  const out = list.filter((_, i) => i % stride === 0);
  if (out[out.length - 1] !== list[list.length - 1]) out.push(list[list.length - 1]);
  return out;
}

/**
 * How much the air changed the answer, as percentages.
 *
 * The honest version of "air resistance is small": here is exactly how small,
 * for this object at this speed.
 */
export function dragEffect(result) {
  const pct = (real, ideal) => (Number.isFinite(ideal) && ideal !== 0 ? ((real - ideal) / ideal) * 100 : NaN);
  return {
    rangePct: pct(result.range, result.ideal.range),
    apexPct: pct(result.apexHeight, result.ideal.apexHeight),
    flightPct: pct(result.flightTime, result.ideal.flightTime),
    impactPct: pct(result.impactSpeed, result.ideal.impactSpeed),
  };
}

/**
 * The independence demonstration: a ball thrown horizontally and a ball simply
 * dropped from the same height hit the ground at the same moment.
 *
 * Only true without air resistance, and the returned object says so.
 */
export function independenceCheck(height, g, horizontalSpeed) {
  const dropped = flightTime({ speed: 0, angleDeg: 0, height, g });
  const thrown = flightTime({ speed: horizontalSpeed, angleDeg: 0, height, g });
  return {
    droppedTime: dropped,
    thrownTime: thrown,
    same: Math.abs(dropped - thrown) < 1e-9,
    horizontalDistance: horizontalSpeed * thrown,
    why: 'Gravity acts only vertically, so it has no effect at all on the '
      + 'horizontal motion — and the horizontal motion has no effect on how fast '
      + 'the object falls. The two are independent. Switch air resistance on and '
      + 'they stop being independent, because drag depends on the total speed.',
  };
}
