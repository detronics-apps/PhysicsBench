/**
 * Motion under constant acceleration — the "suvat" relations. Pure.
 *
 * Every function here carries the same caveat, and the app must never let it
 * out of sight: **these equations describe constant acceleration and nothing
 * else.** The moment air resistance is switched on they stop being true, and
 * the simulation stops agreeing with them. That disagreement is a feature —
 * it is how a learner discovers that an equation has a domain rather than
 * being a rule that always works.
 *
 * The sign convention is the one the whole app uses: positive is to the right
 * (or upward), and a negative acceleration is not "slowing down", it is
 * acceleration in the negative direction. Whether that speeds an object up or
 * slows it down depends entirely on which way it is already going, which is
 * what `describeMotion` exists to say out loud.
 */

/** v = u + a·t */
export const velocityAt = (u, a, t) => u + a * t;

/** s = u·t + ½·a·t² */
export const displacementAt = (u, a, t) => u * t + 0.5 * a * t * t;

/** x(t) from a starting position. */
export const positionAt = (x0, u, a, t) => x0 + displacementAt(u, a, t);

/** Average velocity over an interval — equal to (u + v)/2 only when a is constant. */
export const averageVelocity = (u, v) => (u + v) / 2;

/**
 * v² = u² + 2·a·s, returning the signed velocity.
 *
 * The square root has two roots and both are physical: a ball thrown up passes
 * a given height twice, once going up and once coming down. `direction` picks
 * which one is wanted; `bothRoots` returns the pair.
 */
export function velocityAfter(u, a, s, direction = 1) {
  const squared = u * u + 2 * a * s;
  if (squared < 0) return NaN;        // that displacement is never reached
  return Math.sign(direction || 1) * Math.sqrt(squared);
}

export function bothRoots(u, a, s) {
  const squared = u * u + 2 * a * s;
  if (squared < 0) return [];
  const root = Math.sqrt(squared);
  return root === 0 ? [0] : [root, -root];
}

/** How long to reach a given velocity. */
export const timeToVelocity = (u, v, a) => (a === 0 ? (u === v ? 0 : Infinity) : (v - u) / a);

/**
 * When the object passes a given displacement.
 *
 * ½at² + ut − s = 0. Returns every non-negative root in time order, because
 * "when does the ball pass 5 m?" genuinely has two answers when it is thrown
 * upward, and hiding one of them teaches that projectile motion is one-way.
 */
export function timesToDisplacement(u, a, s) {
  if (Math.abs(a) < 1e-15) {
    if (u === 0) return s === 0 ? [0] : [];
    const t = s / u;
    return t >= 0 ? [t] : [];
  }
  const disc = u * u + 2 * a * s;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  const times = [(-u + root) / a, (-u - root) / a]
    .filter((t) => t >= -1e-12)
    .map((t) => Math.max(0, t));
  return [...new Set(times.map((t) => Number(t.toPrecision(12))))].sort((x, y) => x - y);
}

/**
 * Fill in the missing quantities from any three of u, v, a, t, s.
 *
 * Returns the complete set plus the route taken, so the app can show *which*
 * equation produced each answer rather than presenting five numbers from
 * nowhere.
 */
export function solveSuvat(known = {}) {
  const has = (k) => known[k] !== undefined && known[k] !== null && Number.isFinite(Number(known[k]));
  const get = (k) => Number(known[k]);
  const given = ['u', 'v', 'a', 't', 's'].filter(has);

  if (given.length < 3) {
    return { ok: false, given, reason: 'Three of u, v, a, t and s are needed to find the other two.' };
  }

  const out = Object.fromEntries(given.map((k) => [k, get(k)]));
  const steps = [];

  const set = (key, value, equation) => {
    if (out[key] === undefined && Number.isFinite(value)) {
      out[key] = value;
      steps.push({ key, value, equation });
    }
  };

  // Two passes: some routes only open once an earlier one has filled a gap.
  for (let pass = 0; pass < 2; pass += 1) {
    const { u, v, a, t, s } = out;
    if (u !== undefined && a !== undefined && t !== undefined) {
      set('v', velocityAt(u, a, t), 'v = u + a·t');
      set('s', displacementAt(u, a, t), 's = u·t + ½·a·t²');
    }
    if (u !== undefined && v !== undefined && t !== undefined) {
      set('a', t === 0 ? NaN : (v - u) / t, 'a = (v − u) / t');
      set('s', averageVelocity(u, v) * t, 's = ½·(u + v)·t');
    }
    if (u !== undefined && v !== undefined && a !== undefined) {
      set('t', timeToVelocity(u, v, a), 't = (v − u) / a');
      set('s', a === 0 ? NaN : (v * v - u * u) / (2 * a), 's = (v² − u²) / (2·a)');
    }
    if (u !== undefined && a !== undefined && s !== undefined) {
      const roots = bothRoots(u, a, s);
      if (roots.length) {
        // Prefer the root that shares the sign of the displacement's direction.
        const preferred = roots.find((r) => Math.sign(r) === Math.sign(s || u || 1)) ?? roots[0];
        set('v', preferred, 'v² = u² + 2·a·s');
      }
      const times = timesToDisplacement(u, a, s);
      if (times.length) set('t', times[times.length - 1], 's = u·t + ½·a·t²  (solved for t)');
    }
    if (v !== undefined && a !== undefined && t !== undefined) {
      set('u', v - a * t, 'u = v − a·t');
    }
    if (v !== undefined && a !== undefined && s !== undefined) {
      const squared = v * v - 2 * a * s;
      if (squared >= 0) set('u', Math.sign(v || 1) * Math.sqrt(squared), 'u² = v² − 2·a·s');
    }
    if (u !== undefined && v !== undefined && s !== undefined && s !== 0) {
      set('a', (v * v - u * u) / (2 * s), 'a = (v² − u²) / (2·s)');
      if (u + v !== 0) set('t', (2 * s) / (u + v), 't = 2·s / (u + v)');
    }
    if (s !== undefined && t !== undefined && u !== undefined && t !== 0) {
      set('a', (2 * (s - u * t)) / (t * t), 'a = 2·(s − u·t) / t²');
    }
    if (s !== undefined && t !== undefined && v !== undefined && t !== 0) {
      set('u', (2 * s) / t - v, 'u = 2·s/t − v');
    }
  }

  const missing = ['u', 'v', 'a', 't', 's'].filter((k) => out[k] === undefined);
  return {
    ok: missing.length === 0,
    given,
    missing,
    steps,
    validWhen: 'Acceleration is constant over the whole interval.',
    ...out,
  };
}

/**
 * What the numbers actually mean, in words.
 *
 * "Acceleration" and "getting faster" are not the same thing, and the app's
 * whole acceleration lesson turns on it. Four cases, and every one of them
 * appears in the labs:
 *
 *   a and v the same sign      speeding up
 *   a and v opposite signs     slowing down — still accelerating
 *   a zero                     constant velocity
 *   v zero with a non-zero     momentarily stationary, still accelerating
 */
export function describeMotion(velocity, acceleration, tolerance = 1e-9) {
  const v = Math.abs(velocity) < tolerance ? 0 : velocity;
  const a = Math.abs(acceleration) < tolerance ? 0 : acceleration;

  if (a === 0 && v === 0) return { state: 'at-rest', text: 'At rest, with no acceleration.' };
  if (a === 0) return { state: 'constant-velocity', text: 'Moving at a constant velocity — no net force acts.' };
  if (v === 0) {
    return {
      state: 'turning-point',
      text: 'Momentarily stationary, but still accelerating — the velocity is '
        + 'passing through zero on its way to changing direction. This is the '
        + 'instant at the top of a throw.',
    };
  }
  if (Math.sign(v) === Math.sign(a)) {
    return { state: 'speeding-up', text: 'Speeding up: the acceleration points the same way as the velocity.' };
  }
  return {
    state: 'slowing-down',
    text: 'Slowing down — and still accelerating. The acceleration points '
      + 'against the motion, so it is reducing the speed rather than increasing it.',
  };
}

/** A regular sampling of the motion, for a graph or a table. */
export function sample(u, a, { from = 0, to = 1, steps = 100, x0 = 0 } = {}) {
  const out = [];
  const n = Math.max(1, Math.round(steps));
  for (let i = 0; i <= n; i += 1) {
    const t = from + ((to - from) * i) / n;
    out.push({ t, s: positionAt(x0, u, a, t), v: velocityAt(u, a, t), a });
  }
  return out;
}

/** Speed is the magnitude of velocity — no direction, never negative. */
export const speed = (velocity) => Math.abs(velocity);

/**
 * The distinction the Motion lab is built around.
 *
 * Two objects at ±5 m/s have the same speed and different velocities, and a
 * learner who has only ever seen "speed" has no word for the difference.
 */
export function compareMotion(a, b) {
  return {
    sameSpeed: Math.abs(speed(a) - speed(b)) < 1e-9,
    sameVelocity: Math.abs(a - b) < 1e-9,
    oppositeDirections: a * b < 0,
  };
}
