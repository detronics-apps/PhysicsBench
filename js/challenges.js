/**
 * Challenge mode: a problem, a prediction, and the honest comparison. Pure.
 *
 * The order is deliberate and it is the whole design. The learner is given a
 * goal, asked to *predict* the answer before running anything, and only then
 * allowed to run it. Predicting first is what turns a simulation into
 * learning: without it, a learner adjusts a slider until the target lights up
 * and has understood nothing.
 *
 * When the prediction is wrong, the app never says "wrong". It says what was
 * predicted, what happened, and — this is the part that matters — which
 * relationship accounts for the difference.
 */

import { G_STANDARD } from './constants.js';
import { range, anglesForRange, bestAngle } from './projectile.js';
import { collide1D } from './collide.js';
import { smallAnglePeriod, exactPeriod, lengthForPeriod } from './pendulum.js';

/**
 * Grade a prediction against what happened.
 *
 * The tolerance is relative and generous by design. A learner who predicts
 * "about 40 metres" and gets 42 has understood the physics, and telling them
 * they were wrong by 5% teaches them to distrust their own reasoning.
 */
export function gradePrediction(predicted, actual, { tolerance = 0.1, unit = '' } = {}) {
  // An empty box is not a prediction of zero. `Number('')` is 0, which would
  // silently grade a learner who typed nothing.
  const blank = predicted === null || predicted === undefined
    || (typeof predicted === 'string' && predicted.trim() === '');
  const p = blank ? NaN : Number(predicted);
  const a = Number(actual);
  if (!Number.isFinite(p)) {
    return { graded: false, text: 'No prediction was made, so there is nothing to compare.' };
  }
  if (!Number.isFinite(a)) {
    return { graded: false, text: 'The experiment did not produce a result to compare against.' };
  }

  // Error relative to the real answer, which is what "5% out" normally means.
  // When the real answer is effectively zero there is nothing to be a
  // percentage of, so the prediction's own size stands in.
  const scaleOf = Math.abs(a) > 1e-9 ? Math.abs(a) : Math.max(Math.abs(p), 1e-9);
  const error = p - a;
  const relative = error / scaleOf;
  const close = Math.abs(relative) <= tolerance;

  return {
    graded: true,
    predicted: p,
    actual: a,
    error,
    relative,
    percent: relative * 100,
    close,
    unit,
    direction: error > 0 ? 'over' : error < 0 ? 'under' : 'exact',
    text: close
      ? 'Close — your prediction and the result agree to within the tolerance. '
        + 'That means you were reasoning from the relationship, not guessing.'
      : `Your prediction was ${Math.abs(relative * 100).toFixed(0)}% `
        + `${error > 0 ? 'higher' : 'lower'} than the result. That gap is worth `
        + 'chasing down: which quantity did you expect to behave differently?',
  };
}

/**
 * Each challenge states what to change, what to hit, and how close counts.
 *
 * `tolerance` is a *fraction* of the real answer, not an absolute amount in the
 * quantity's own units — so 0.08 means "within 8%", whether the answer is in
 * degrees, metres or newtons.
 *
 * `check` receives whatever the tool measured and returns whether the goal was
 * met. `explain` is shown afterwards, whichever way it went — a challenge that
 * only explains itself on failure teaches that being right needs no
 * explanation.
 */
export const CHALLENGES = [
  {
    id: 'hit-the-target',
    tool: 'projectile',
    concept: 'projectile',
    title: 'Land on the target',
    brief: 'A target sits 60 m away on level ground. You may change the launch '
      + 'speed and the angle. Get the ball to land on it.',
    predict: { label: 'What angle will you need at 25 m/s?', unit: '°' },
    tolerance: 0.08,
    goal: { distance: 60, tolerance: 2 },
    check: (result) => Math.abs((result.range ?? Infinity) - 60) <= 2,
    hint: 'Two different angles reach the same distance. Try to find both.',
    explain: (params) => {
      const solution = anglesForRange(60, params.speed ?? 25, params.g ?? G_STANDARD);
      if (!solution.reachable) {
        return `At ${params.speed ?? 25} m/s the ball cannot reach 60 m at any `
          + `angle — the furthest it can go is with a 45° launch. You would need `
          + `at least ${solution.minimumSpeed.toFixed(1)} m/s.`;
      }
      return `At ${params.speed ?? 25} m/s two angles land on 60 m: `
        + `${solution.angles.map((a) => `${a.toFixed(1)}°`).join(' and ')}. They always `
        + 'add up to 90°, because the range depends on sin(2θ) and sin(2θ) is '
        + 'symmetric about 45°. The flat one gets there sooner; the lobbed one '
        + 'spends longer in the air and arrives more steeply.';
    },
  },
  {
    id: 'furthest-throw',
    tool: 'projectile',
    concept: 'projectile',
    title: 'Throw it as far as you can',
    brief: 'Launch from 20 m up. You have a fixed speed of 20 m/s. Find the '
      + 'angle that goes furthest — and notice it is not 45°.',
    predict: { label: 'What angle do you predict?', unit: '°' },
    tolerance: 0.08,
    check: (result, params) => {
      const best = bestAngle(params.speed ?? 20, params.g ?? G_STANDARD, params.height ?? 20, 0);
      return Math.abs((params.angleDeg ?? 45) - best.angleDeg) <= 3;
    },
    hint: 'You are starting above the landing point. Does that reward height or '
      + 'forward speed?',
    explain: (params) => {
      const best = bestAngle(params.speed ?? 20, params.g ?? G_STANDARD, params.height ?? 20, 0);
      return `From ${params.height ?? 20} m up at ${params.speed ?? 20} m/s the best `
        + `angle is ${best.angleDeg.toFixed(1)}°, not 45°. ${best.note} The 45° rule `
        + 'only holds when the launch and the landing are at the same height — a '
        + 'condition that is almost always left unsaid.';
    },
  },
  {
    id: 'moon-shot',
    tool: 'projectile',
    concept: 'gravity',
    title: 'Same throw, different world',
    brief: 'Throw a ball at 15 m/s and 45° on Earth, and note the range. Now '
      + 'switch to the Moon without changing anything else.',
    predict: { label: 'How many times further will it go on the Moon?', unit: '×' },
    tolerance: 0.15,
    check: (result) => Number.isFinite(result?.range),
    hint: 'Range goes as u²·sin(2θ)/g. Only one thing in that expression changed.',
    explain: () => {
      const earth = range({ speed: 15, angleDeg: 45, height: 0, g: G_STANDARD });
      const moon = range({ speed: 15, angleDeg: 45, height: 0, g: 1.62 });
      return `On Earth it goes ${earth.toFixed(1)} m; on the Moon, ${moon.toFixed(1)} m — `
        + `about ${(moon / earth).toFixed(1)} times further. Range is inversely `
        + `proportional to g, and the Moon's is about ${(G_STANDARD / 1.62).toFixed(1)} `
        + 'times weaker, so the ratio is exactly that. The shape of the arc is '
        + 'identical; it is simply stretched.';
    },
  },
  {
    id: 'stop-the-cart',
    tool: 'force',
    concept: 'force',
    title: 'Stop it in 3 metres',
    brief: 'A 20 kg cart is running at 6 m/s. Apply the smallest force you can '
      + 'that brings it to rest within 3 m.',
    predict: { label: 'What force will you need?', unit: 'N' },
    tolerance: 0.1,
    check: (result) => (result.stoppingDistance ?? Infinity) <= 3.05,
    hint: 'Which equation connects speed and distance without mentioning time?',
    explain: () => {
      // v² = u² + 2as, with v = 0: a = −u²/(2s) = −36/6 = −6 m/s².
      const a = 36 / (2 * 3);
      return `v² = u² + 2·a·s with v = 0 gives a = −u²/(2s) = −${a} m/s², so the `
        + `force needed is m·a = 20 × ${a} = ${20 * a} N. Any less and it runs past `
        + '3 m; any more is wasted. Notice this never mentions how long it takes.';
    },
  },
  {
    id: 'balance-the-box',
    tool: 'force',
    concept: 'force',
    title: 'Push without moving it',
    brief: 'A 10 kg box sits on wood (μs = 0.5). Find the hardest you can push '
      + 'it horizontally without it moving at all.',
    predict: { label: 'What is the largest force that leaves it still?', unit: 'N' },
    tolerance: 0.08,
    check: (result) => result.frictionMode === 'static' && (result.applied ?? 0) > 0,
    hint: 'Static friction matches whatever you apply — up to a limit. What sets '
      + 'that limit?',
    explain: (params) => {
      const limit = 0.5 * (params.mass ?? 10) * (params.g ?? G_STANDARD);
      return `Static friction can reach μs·N = 0.5 × ${(params.mass ?? 10).toFixed(0)} × `
        + `${(params.g ?? G_STANDARD).toFixed(2)} = ${limit.toFixed(1)} N, and no further. `
        + 'Below that it matches your push exactly and the net force is zero. Push '
        + 'harder and the box breaks away — and friction *drops*, to the kinetic '
        + 'value, which is why a stuck object often lurches once it starts moving.';
    },
  },
  {
    id: 'equal-momentum',
    tool: 'momentum',
    concept: 'momentum',
    title: 'Two ways to carry the same momentum',
    brief: 'Cart A is 2 kg at 6 m/s. Set cart B to a different mass and velocity '
      + 'that give it exactly the same momentum.',
    predict: { label: 'If B is 8 kg, what velocity does it need?', unit: 'm/s' },
    tolerance: 0.05,
    check: (result) => Math.abs((result.p1 ?? 0) - (result.p2 ?? 1)) < 0.05,
    hint: 'p = m·v, so if the mass goes up by a factor, the velocity comes down '
      + 'by the same one.',
    explain: () => 'A is carrying 2 × 6 = 12 kg·m/s. An 8 kg cart needs 1.5 m/s to '
      + 'match it. Their kinetic energies are not equal, though — 36 J against 9 J. '
      + 'Momentum goes as v and energy as v², so the fast light one carries four '
      + 'times the energy for the same momentum. That difference is exactly why a '
      + 'bullet and a thrown brick behave so differently.',
  },
  {
    id: 'newtons-cradle',
    tool: 'collision',
    concept: 'collision',
    title: 'Make the heavy one move fastest',
    brief: 'A 1 kg cart hits a 10 kg cart at rest. Try both e = 1 and e = 0. '
      + 'Which setting sends the heavy cart away fastest?',
    predict: { label: 'How fast will the 10 kg cart go, with e = 1 and a 5 m/s impact?', unit: 'm/s' },
    tolerance: 0.1,
    check: (result) => Number.isFinite(result?.after?.v2),
    hint: 'An elastic collision returns the light cart backwards. Where does that '
      + 'extra momentum have to come from?',
    explain: () => {
      const elastic = collide1D(1, 5, 10, 0, 1);
      const stuck = collide1D(1, 5, 10, 0, 0);
      return `Elastic (e = 1): the heavy cart leaves at ${elastic.after.v2.toFixed(2)} m/s `
        + `and the light one bounces back at ${elastic.after.v1.toFixed(2)} m/s. `
        + `Perfectly inelastic (e = 0): they move off together at `
        + `${stuck.after.v1.toFixed(2)} m/s. Bouncing back gives the heavy cart more, `
        + 'because the light cart has to hand over more momentum to reverse than '
        + 'to merely stop. Both conserve momentum exactly; only the elastic one '
        + 'conserves kinetic energy.';
    },
  },
  {
    id: 'matching-pendulums',
    tool: 'pendulum',
    concept: 'pendulum',
    title: 'Two pendulums, one period',
    brief: 'One pendulum is 1 m long with a 1 kg bob. Build a second with a 4 kg '
      + 'bob that swings with the same period.',
    predict: { label: 'What length will the second one need?', unit: 'm' },
    tolerance: 0.05,
    check: (result) => Math.abs((result.periodA ?? 0) - (result.periodB ?? 1)) < 0.02,
    hint: 'Look at what is actually in the period formula. Is mass there at all?',
    explain: () => {
      const t = smallAnglePeriod(1, G_STANDARD);
      return `Also 1 m. Mass does not appear in T = 2π√(L/g) at all, so a 4 kg bob `
        + `swings at exactly the same ${t.toFixed(2)} s as a 1 kg one. This is the `
        + 'same cancellation as free fall: the heavier bob is pulled harder and '
        + 'resists more, equally. To change the period you have to change the '
        + 'length or the gravity — or swing it much further, which changes it a '
        + 'little in a way the usual formula does not admit to.';
    },
  },
  {
    id: 'seconds-pendulum',
    tool: 'pendulum',
    concept: 'pendulum',
    title: 'Build a clock',
    brief: 'Make a pendulum whose full swing takes exactly two seconds — the '
      + '"seconds pendulum" that ran clocks for three hundred years.',
    predict: { label: 'How long does it need to be?', unit: 'm' },
    tolerance: 0.05,
    check: (result) => Math.abs((result.period ?? 0) - 2) < 0.02,
    hint: 'Rearrange T = 2π√(L/g) for L.',
    explain: () => {
      const l = lengthForPeriod(2, G_STANDARD);
      const wide = exactPeriod(l, G_STANDARD, Math.PI / 4);
      return `L = g·T²/(4π²) = ${l.toFixed(4)} m — just under a metre, which is why `
        + 'longcase clocks are the height they are. Note the catch: at a 45° swing '
        + `the real period is ${wide.toFixed(3)} s, not 2. Pendulum clocks are kept `
        + 'to a small amplitude for exactly this reason, and they run slightly '
        + 'differently at different latitudes because g does.';
    },
  },
  {
    id: 'rolling-race',
    tool: 'rotation',
    concept: 'rotation',
    title: 'Pick the winner',
    brief: 'A hoop, a solid disc and a solid sphere are released together on a '
      + 'ramp. Predict the order before you run it.',
    predict: { label: 'How much faster is the sphere than the hoop, as a ratio?', unit: '×' },
    tolerance: 0.1,
    check: () => true,
    hint: 'Each one has to spend part of its energy on spinning. Which spends '
      + 'least?',
    explain: () => 'Sphere, then disc, then hoop — and neither mass nor size comes '
      + 'into it. Acceleration is g·sinθ/(1 + k), where k is 0.4 for a solid '
      + 'sphere, 0.5 for a disc and 1 for a hoop. The hoop has all its mass at '
      + 'the rim, so half its energy goes into spinning and only half into '
      + 'travelling. The sphere keeps five sevenths for travelling. A tiny marble '
      + 'and a cannonball tie exactly.',
  },
  {
    id: 'climb-the-ramp',
    tool: 'engineer',
    concept: 'machines',
    title: 'Get the robot up the ramp',
    brief: 'A 5 kg robot has to climb a 20° ramp. Choose a gear ratio that gets '
      + 'it up — then find out why more gearing eventually stops helping.',
    predict: { label: 'What gear ratio do you think it needs?', unit: ':1' },
    tolerance: 0.3,
    check: (result) => result.climbs === true,
    hint: 'More gearing means more force at the wheel. What else has to grow for '
      + 'that force to do anything?',
    explain: () => 'Gearing up multiplies the force at the wheel — until the '
      + 'wheels start to slip. Past that point the ground is the limit, not the '
      + 'motor: friction can only supply μ·N, and no gearbox changes that. When '
      + 'the readout says traction-limited, more gearing is wasted and weight over '
      + 'the driven wheels, or a grippier surface, is what would help.',
  },
];

export const challengeById = (id) => CHALLENGES.find((c) => c.id === id) || null;
export const challengesFor = (toolId) => CHALLENGES.filter((c) => c.tool === toolId);

/**
 * Run a challenge's check and assemble everything the interface shows.
 *
 * The prediction comparison and the explanation both appear whether the goal
 * was met or not — a challenge that explains itself only on failure teaches
 * that being right needs no reasoning.
 */
export function evaluate(id, { result = {}, params = {}, prediction = null } = {}) {
  const challenge = challengeById(id);
  if (!challenge) throw new Error(`No challenge named "${id}"`);

  let met = false;
  try {
    met = !!challenge.check(result, params);
  } catch {
    met = false;
  }

  return {
    challenge,
    met,
    prediction: prediction === null || prediction === ''
      ? { graded: false, text: 'Make a prediction before you run it — that is where the learning is.' }
      : gradePrediction(prediction, predictedQuantity(challenge, result, params), {
        tolerance: challenge.tolerance ?? 0.1,
        unit: challenge.predict?.unit || '',
      }),
    explanation: typeof challenge.explain === 'function' ? challenge.explain(params, result) : challenge.explain,
    hint: challenge.hint,
  };
}

/**
 * Which measured number the prediction should be compared against.
 *
 * Each challenge asks for a specific quantity, so this is where the question
 * and the measurement are tied together — rather than in the interface, where
 * the two could drift apart and grade a launch angle against a range.
 */
function predictedQuantity(challenge, result, params) {
  switch (challenge.id) {
    case 'hit-the-target': return params.angleDeg;
    case 'furthest-throw': return bestAngle(params.speed ?? 20, params.g ?? G_STANDARD, params.height ?? 20, 0).angleDeg;
    case 'moon-shot': return range({ speed: 15, angleDeg: 45, height: 0, g: 1.62 })
      / range({ speed: 15, angleDeg: 45, height: 0, g: G_STANDARD });
    case 'stop-the-cart': return ((params.mass ?? 20) * (params.u ?? 6) ** 2) / (2 * 3);
    case 'balance-the-box': return (params.muS ?? 0.5) * (params.mass ?? 10) * (params.g ?? G_STANDARD);
    case 'equal-momentum': return 1.5;
    case 'newtons-cradle': return collide1D(1, 5, 10, 0, 1).after.v2;
    case 'matching-pendulums': return 1;
    case 'seconds-pendulum': return lengthForPeriod(2, params.g ?? G_STANDARD);
    case 'rolling-race': return (1 + 1) / (1 + 0.4);
    case 'climb-the-ramp': return result.gearRatio ?? params.gearRatio;
    default: return result.value;
  }
}
