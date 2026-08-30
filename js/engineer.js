/**
 * Engineer Mode: motors, gears, wheels, ramps and mechanical advantage. Pure.
 *
 * This is where the mechanics stop being a demonstration and start being a
 * design. The same three equations run the whole thing — τ = r×F, F = ma, and
 * friction ≤ μN — but they are now answering a question with a wrong answer:
 * will this robot climb that ramp?
 *
 * The lesson that carries over from every earlier lab is that nothing here
 * creates anything. A gearbox multiplies torque and divides speed by the same
 * factor, and loses a little of the product to friction. Bigger wheels go
 * faster and pull less hard. The ground can only push back as hard as friction
 * allows, and past that the wheels spin however much torque the motor makes.
 */

import { G_STANDARD } from './constants.js';

/**
 * A brushed DC motor's torque at a given speed, on the straight-line model.
 *
 * Torque falls linearly from its stall value at zero speed to nothing at free
 * speed. It is a decent first model for a brushed motor on a fixed voltage and
 * a poor one for anything with a controller, which holds torque flat and then
 * drops it off a cliff — a difference the disclosure names rather than hides.
 */
export function motorTorqueAt(rpm, { stallTorque, freeRpm }) {
  if (!(freeRpm > 0)) return 0;
  const fraction = 1 - Math.abs(rpm) / freeRpm;
  return stallTorque * Math.max(0, Math.min(1, fraction));
}

/** Mechanical power out of the motor at a given speed: P = τ·ω. */
export function motorPowerAt(rpm, motor) {
  return motorTorqueAt(rpm, motor) * ((Math.abs(rpm) * 2 * Math.PI) / 60);
}

/**
 * Peak power sits at half the free speed, where torque is half of stall.
 * A satisfying result, and a useful one: it is where a motor should be geared
 * to work if the job is to accelerate something.
 */
export const peakPower = (motor) => ({
  rpm: motor.freeRpm / 2,
  torque: motor.stallTorque / 2,
  power: motorPowerAt(motor.freeRpm / 2, motor),
});

/**
 * The force a wheel can push with, from the torque reaching it.
 *
 *   F = τ_motor · GR · η / r
 *
 * Notice the wheel radius is on the bottom. A bigger wheel travels further per
 * turn and pushes proportionally less hard — the same trade the gearbox makes,
 * arriving from a different direction.
 */
export function wheelForce({ motorTorque, gearRatio, efficiency = 0.9, wheelRadius, motors = 1 }) {
  if (!(wheelRadius > 0)) return 0;
  return (motorTorque * gearRatio * efficiency * motors) / wheelRadius;
}

/** Road speed from motor speed, through the gearbox and the wheel. */
export function roadSpeed({ motorRpm, gearRatio, wheelRadius }) {
  if (!(gearRatio > 0)) return 0;
  const wheelRads = ((motorRpm / gearRatio) * 2 * Math.PI) / 60;
  return wheelRads * wheelRadius;
}

/** And back the other way — what motor speed a road speed demands. */
export function motorRpmFor({ speed, gearRatio, wheelRadius }) {
  if (!(wheelRadius > 0)) return 0;
  return ((speed / wheelRadius) * 60 * gearRatio) / (2 * Math.PI);
}

/**
 * The hardest the ground can push back before the wheels spin.
 *
 * Only the weight actually on the driven wheels counts, which is why a
 * rear-wheel-drive car struggles to pull away on a hill and why a tracked
 * vehicle grips better than a wheeled one of the same mass.
 */
export function tractionLimit({ mass, g = G_STANDARD, mu, slopeDeg = 0, drivenFraction = 1 }) {
  const rad = (slopeDeg * Math.PI) / 180;
  const normal = mass * g * Math.cos(rad) * Math.max(0, Math.min(1, drivenFraction));
  return mu * normal;
}

/** The component of weight pulling the vehicle back down the slope. */
export const slopeResistance = ({ mass, g = G_STANDARD, slopeDeg }) =>
  mass * g * Math.sin((slopeDeg * Math.PI) / 180);

/**
 * Rolling resistance — the tyre and the surface deforming against each other.
 *
 * A different thing from the friction that grips: this one always opposes
 * motion and is much smaller. Typical C_rr: 0.01 for a car tyre on tarmac,
 * 0.002 for a steel wheel on rail, 0.3 on soft sand.
 */
export const rollingResistance = ({ mass, g = G_STANDARD, crr = 0.015, slopeDeg = 0 }) =>
  crr * mass * g * Math.cos((slopeDeg * Math.PI) / 180);

/**
 * A complete answer to "will it climb that?".
 *
 * Everything is reported, not just the verdict: what force is available, what
 * the ground will accept, what the slope costs, and which of the three is the
 * binding constraint. A learner who is told only "no" has learned nothing
 * about what to change.
 */
export function analyse(p) {
  const g = Number.isFinite(p.g) ? p.g : G_STANDARD;
  const motor = { stallTorque: p.stallTorque ?? 0.5, freeRpm: p.freeRpm ?? 15000 };
  const efficiency = Math.max(0, Math.min(1, p.efficiency ?? 0.85));

  const stallForce = wheelForce({
    motorTorque: motor.stallTorque, gearRatio: p.gearRatio ?? 20,
    efficiency, wheelRadius: p.wheelRadius ?? 0.05, motors: p.motors ?? 1,
  });
  const grip = tractionLimit({
    mass: p.mass ?? 5, g, mu: p.mu ?? 0.9, slopeDeg: p.slopeDeg ?? 0,
    drivenFraction: p.drivenFraction ?? 1,
  });
  const gravityDrag = slopeResistance({ mass: p.mass ?? 5, g, slopeDeg: p.slopeDeg ?? 0 });
  const rolling = rollingResistance({ mass: p.mass ?? 5, g, crr: p.crr ?? 0.015, slopeDeg: p.slopeDeg ?? 0 });

  const usable = Math.min(stallForce, grip);
  const limitedBy = stallForce <= grip ? 'motor' : 'traction';
  const net = usable - gravityDrag - rolling;
  const acceleration = net / (p.mass ?? 5);

  // Top speed: where the motor's falling torque curve meets the resistances.
  const top = topSpeed({ ...p, g, motor, efficiency });

  return {
    motor,
    stallForce,
    grip,
    gravityDrag,
    rolling,
    usableForce: usable,
    limitedBy,
    netForce: net,
    acceleration,
    climbs: net > 0,
    topSpeed: top.speed,
    topSpeedRpm: top.rpm,
    maxSlopeDeg: maxClimbableSlope({ ...p, g, stallForce, efficiency }),
    peak: peakPower(motor),
    // The one sentence that says what to change.
    advice: advice({ limitedBy, net, grip, stallForce }),
  };
}

function advice({ limitedBy, net, grip, stallForce }) {
  if (net > 0 && limitedBy === 'motor') {
    return 'It climbs, and the motor is the limit. A taller gear ratio would '
      + 'give more force — up to the point where the wheels start to slip.';
  }
  if (net > 0) {
    return 'It climbs, and grip is the limit: the motor can already produce more '
      + 'force than the ground will accept. More gearing would only spin the '
      + 'wheels. More weight over the driven wheels, or a grippier surface, is '
      + 'what would help.';
  }
  if (limitedBy === 'traction') {
    return `It does not climb, and gearing will not fix it: the ground will only `
      + `accept ${grip.toFixed(1)} N however hard the wheels push. Weight over the `
      + 'driven wheels, or a better surface, is the lever here.';
  }
  return `It does not climb. The drivetrain can only manage ${stallForce.toFixed(1)} N, `
    + 'and the slope is asking for more. A taller gear ratio, a smaller wheel or '
    + 'a second motor would each buy force — and each costs speed.';
}

/**
 * Where the falling torque curve crosses the resistances.
 *
 * Solved by bisection rather than algebra: the honest reason is that the model
 * is a straight line today and might not be tomorrow, and a search does not
 * care what shape the curve is.
 */
export function topSpeed(p) {
  const motor = p.motor || { stallTorque: p.stallTorque ?? 0.5, freeRpm: p.freeRpm ?? 15000 };
  const efficiency = p.efficiency ?? 0.85;
  const resist = slopeResistance({ mass: p.mass ?? 5, g: p.g, slopeDeg: p.slopeDeg ?? 0 })
    + rollingResistance({ mass: p.mass ?? 5, g: p.g, crr: p.crr ?? 0.015, slopeDeg: p.slopeDeg ?? 0 });

  const surplusAt = (rpm) => wheelForce({
    motorTorque: motorTorqueAt(rpm, motor),
    gearRatio: p.gearRatio ?? 20, efficiency,
    wheelRadius: p.wheelRadius ?? 0.05, motors: p.motors ?? 1,
  }) - resist;

  if (surplusAt(0) <= 0) return { rpm: 0, speed: 0, stalled: true };
  // Nothing resisting at all — a level, frictionless surface — means it coasts
  // all the way to free speed. `>= 0` rather than `> 0`, because at free speed
  // the motor makes no torque and the surplus is exactly zero.
  if (surplusAt(motor.freeRpm) >= 0) {
    return { rpm: motor.freeRpm, speed: roadSpeed({ motorRpm: motor.freeRpm, gearRatio: p.gearRatio ?? 20, wheelRadius: p.wheelRadius ?? 0.05 }), stalled: false, unlimited: true };
  }

  let lo = 0;
  let hi = motor.freeRpm;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (surplusAt(mid) > 0) lo = mid;
    else hi = mid;
  }
  const rpm = (lo + hi) / 2;
  return { rpm, speed: roadSpeed({ motorRpm: rpm, gearRatio: p.gearRatio ?? 20, wheelRadius: p.wheelRadius ?? 0.05 }), stalled: false };
}

/** The steepest slope it can start on, found the same way. */
export function maxClimbableSlope(p) {
  const canClimb = (deg) => {
    const force = Math.min(
      p.stallForce ?? wheelForce({
        motorTorque: p.stallTorque ?? 0.5, gearRatio: p.gearRatio ?? 20,
        efficiency: p.efficiency ?? 0.85, wheelRadius: p.wheelRadius ?? 0.05, motors: p.motors ?? 1,
      }),
      tractionLimit({ mass: p.mass ?? 5, g: p.g, mu: p.mu ?? 0.9, slopeDeg: deg, drivenFraction: p.drivenFraction ?? 1 }),
    );
    return force > slopeResistance({ mass: p.mass ?? 5, g: p.g, slopeDeg: deg })
      + rollingResistance({ mass: p.mass ?? 5, g: p.g, crr: p.crr ?? 0.015, slopeDeg: deg });
  };
  if (!canClimb(0)) return 0;
  if (canClimb(89.9)) return 89.9;
  let lo = 0;
  let hi = 89.9;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (canClimb(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* --------------------------------------------- mechanical advantage ----- */

/**
 * The five classic machines, each with its ratio and its honest caveat.
 *
 * The caveat is always the same and always worth restating: whatever is gained
 * in force is lost in distance. A machine changes how a job is done, never how
 * much work it takes.
 */
export const MACHINES = [
  {
    id: 'lever',
    label: 'Lever',
    inputs: ['effortArm', 'loadArm'],
    ratio: (p) => (p.loadArm > 0 ? p.effortArm / p.loadArm : Infinity),
    formula: 'MA = effort arm / load arm',
    note: 'The effort end moves further, by exactly the same factor as the force '
      + 'is multiplied.',
  },
  {
    id: 'pulley',
    label: 'Pulley block',
    inputs: ['supportingRopes'],
    ratio: (p) => Math.max(1, Math.round(p.supportingRopes || 1)),
    formula: 'MA = number of rope sections supporting the load',
    note: 'You pull that many metres of rope for every metre the load rises.',
  },
  {
    id: 'ramp',
    label: 'Inclined plane',
    inputs: ['slopeDeg'],
    ratio: (p) => {
      const s = Math.sin((p.slopeDeg * Math.PI) / 180);
      return s > 0 ? 1 / s : Infinity;
    },
    formula: 'MA = 1 / sin θ',
    note: 'A gentler ramp needs less force and more distance. The work done '
      + 'against gravity — m·g·h — is the same either way.',
  },
  {
    id: 'gear',
    label: 'Gear pair',
    inputs: ['teethOut', 'teethIn'],
    ratio: (p) => (p.teethIn > 0 ? p.teethOut / p.teethIn : Infinity),
    formula: 'MA = output teeth / input teeth',
    note: 'Torque up, speed down, by the same ratio — minus what friction takes.',
  },
  {
    id: 'wheel-axle',
    label: 'Wheel and axle',
    inputs: ['wheelRadius', 'axleRadius'],
    ratio: (p) => (p.axleRadius > 0 ? p.wheelRadius / p.axleRadius : Infinity),
    formula: 'MA = wheel radius / axle radius',
    note: 'A capstan, a screwdriver handle and a doorknob are all this machine.',
  },
];

export const machineById = (id) => MACHINES.find((m) => m.id === id) || MACHINES[0];

/**
 * What a machine actually delivers, ideal and real.
 *
 * The efficiency line is the point: an ideal machine and a real one differ, and
 * the difference has gone somewhere — into heat, as always.
 */
export function machineResult(id, params, { inputForce = 100, efficiency = 1 } = {}) {
  const machine = machineById(id);
  const ratio = machine.ratio(params);
  const ideal = inputForce * ratio;
  const real = ideal * Math.max(0, Math.min(1, efficiency));
  return {
    machine,
    ratio,
    idealOutput: ideal,
    actualOutput: real,
    efficiency,
    lostToFriction: ideal - real,
    // Work in equals work out, in the ideal case — which is the whole point.
    distanceRatio: ratio > 0 ? 1 / ratio : 0,
    note: machine.note,
  };
}
