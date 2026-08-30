/**
 * Engineer Mode: a drivetrain, a ramp, and a question with a wrong answer.
 *
 * The one thing this lab has to teach is that gearing is not free. It buys
 * force by spending speed, and past a certain point it buys nothing at all,
 * because the ground will only push back as hard as friction allows. Every
 * readout is arranged so that the binding constraint is named rather than left
 * to be inferred from a number that happens to be smaller than another number.
 */

import { el, svg } from '../dom.js';
import { section, numberField, sliderField, stat, banner, table, selectField } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { gravitySection, viewSection } from './common.js';
import { equation } from '../../models.js';
import { standaloneDisclosure, gravityFor } from '../../scenarios.js';
import { renderSeriesGraph } from '../graph-svg.js';
import {
  analyse, motorTorqueAt, motorPowerAt, peakPower, wheelForce, roadSpeed,
  MACHINES, machineById, machineResult,
} from '../../engineer.js';
import { fmtFixed } from '../../format.js';
import { createCamera, toScreen, toPixels } from '../../camera.js';

export const meta = {
  id: 'engineer',
  label: 'Engineer mode',
  short: 'Build',
  concept: 'machines',
  world: false,
  title: 'Motors, gears, wheels and ramps — will it climb?',
};

const VIEW_W = 880;
const VIEW_H = 420;

const clampX = (v, lo = 8, hi = VIEW_W - 8) => Math.min(hi, Math.max(lo, v));

/** A drivetrain has no clock of its own; the drawing is a static diagram. */
export function createSim(p) {
  return { t: 0, advance: () => {}, params: p };
}

const PRESETS = [
  { id: 'geared-low', label: 'Heavily geared', title: 'Lots of force, very little speed', params: { gearRatio: 60, wheelRadius: 0.04, mu: 0.9, slopeDeg: 25 } },
  { id: 'geared-high', label: 'Geared for speed', title: 'Quick on the flat, hopeless on a hill', params: { gearRatio: 6, wheelRadius: 0.08, mu: 0.9, slopeDeg: 25 } },
  { id: 'slippery', label: 'On a slippery surface', title: 'Where more gearing stops helping', params: { gearRatio: 200, mu: 0.15, slopeDeg: 15 } },
  { id: 'heavy', label: 'A heavy robot', title: 'More weight: more grip, and more to lift', params: { mass: 25, gearRatio: 40, mu: 0.9, slopeDeg: 20 } },
];

export function controls(ctx) {
  const { params, set } = ctx;

  return [
    section('The job', [
      el('div', { class: 'chipset', style: { marginBottom: '12px' } }, PRESETS.map((p) => el('button', {
        class: 'chip', type: 'button', title: p.title, text: p.label,
        on: { click: () => ctx.setMany(p.params) },
      }))),
      sliderField('Slope to climb', params.slopeDeg, (v) => set('slopeDeg', v), {
        min: 0, max: 60, step: 1, key: 'slopeDeg', format: (v) => `${v}°`,
      }),
      numberField('Robot mass', params.mass, (v) => set('mass', v), {
        unit: 'kg', min: 0.1, max: 2000, step: 0.5, key: 'mass',
        hint: 'Weight is not simply the enemy here: more of it presses the wheels '
          + 'down and gives more grip. It also has to be lifted.',
      }),
    ], { key: 'job' }),

    section('The motor', [
      numberField('Stall torque', params.stallTorque, (v) => set('stallTorque', v), {
        unit: 'N·m', min: 0.001, max: 500, step: 0.05, key: 'stallTorque',
      }),
      numberField('Free speed', params.freeRpm, (v) => set('freeRpm', v), {
        unit: 'rpm', min: 1, max: 60000, step: 500, integer: true, key: 'freeRpm',
      }),
      numberField('How many motors', params.motors, (v) => set('motors', v), {
        min: 1, max: 12, step: 1, integer: true, key: 'motors',
      }),
      el('div', {
        class: 'field__hint',
        text: `Peak power is ${fmtFixed(peakPower({ stallTorque: params.stallTorque, freeRpm: params.freeRpm }).power, 1)} W `
          + `at ${fmtFixed(params.freeRpm / 2, 0)} rpm — half the free speed, on this straight-line model.`,
      }),
    ], { key: 'motor' }),

    section('The drivetrain', [
      sliderField('Gear ratio', params.gearRatio, (v) => set('gearRatio', v), {
        min: 1, max: 300, step: 1, key: 'gearRatio', format: (v) => `${v} : 1`,
        info: 'Multiplies torque and divides speed by the same number. It cannot '
          + 'create power, and it gives back slightly less than it takes.',
      }),
      numberField('Wheel radius', params.wheelRadius, (v) => set('wheelRadius', v), {
        unit: 'm', min: 0.005, max: 1, step: 0.005, key: 'wheelRadius',
        hint: 'A bigger wheel goes further per turn and pushes proportionally '
          + 'less hard — the same trade the gearbox makes, from another direction.',
      }),
      sliderField('Drivetrain efficiency', params.efficiency, (v) => set('efficiency', v), {
        min: 0.2, max: 1, step: 0.01, key: 'efficiency', format: (v) => `${fmtFixed(v * 100, 0)}%`,
      }),
    ], { key: 'drivetrain' }),

    section('Grip', [
      sliderField('Coefficient of friction μ', params.mu, (v) => set('mu', v), {
        min: 0.02, max: 2, step: 0.01, key: 'mu', format: (v) => fmtFixed(v, 2),
        hint: 'Rubber on dry asphalt is about 0.9; on wet, about 0.5; on ice, 0.1. '
          + 'Soft racing compounds exceed 1 — μ has no theoretical ceiling.',
      }),
      sliderField('Weight over the driven wheels', params.drivenFraction, (v) => set('drivenFraction', v), {
        min: 0.1, max: 1, step: 0.05, key: 'drivenFraction', format: (v) => `${fmtFixed(v * 100, 0)}%`,
        hint: 'Only the weight actually on the driven wheels contributes grip.',
      }),
      numberField('Rolling resistance C_rr', params.crr, (v) => set('crr', v), {
        min: 0, max: 0.5, step: 0.005, decimals: 4, key: 'crr',
        hint: 'A different thing from grip: this always opposes motion. Car tyre '
          + 'on tarmac ≈ 0.015; steel wheel on rail ≈ 0.002; soft sand ≈ 0.3.',
      }),
    ], { key: 'grip' }),

    section('Mechanical advantage', [
      selectField('Machine', MACHINES.map((m) => ({ value: m.id, label: m.label })), params.machineId, (v) => set('machineId', v), { key: 'machineId' }),
      ...machineInputs(ctx),
    ], { key: 'machine', open: false }),

    gravitySection(ctx),
    viewSection(ctx),
  ];
}

function machineInputs(ctx) {
  const { params, set } = ctx;
  const fields = {
    effortArm: ['Effort arm', 'm', 0.05],
    loadArm: ['Load arm', 'm', 0.05],
    supportingRopes: ['Rope sections supporting the load', '', 1],
    slopeDeg: ['Ramp angle', '°', 1],
    teethIn: ['Input teeth', '', 1],
    teethOut: ['Output teeth', '', 1],
    wheelRadius: ['Wheel radius', 'm', 0.005],
    axleRadius: ['Axle radius', 'm', 0.005],
  };
  return machineById(params.machineId).inputs.map((key) => {
    const [label, unit, step] = fields[key] || [key, '', 1];
    return numberField(label, params[key], (v) => set(key, v), { unit, step, min: 0.001, key: `machine:${key}` });
  });
}

/* -------------------------------------------------------------- stage --- */

export function stage(ctx) {
  const p = ctx.params;
  const r = analyse({ ...p, g: gravityFor(p).g });
  const rad = (p.slopeDeg * Math.PI) / 180;

  const cam = createCamera({
    world: {
      minX: -1.4, maxX: 8 * Math.cos(rad) + 1.6,
      minY: -1.4, maxY: Math.max(3, 8 * Math.sin(rad) + 1.6),
    },
    viewWidth: VIEW_W, viewHeight: VIEW_H, padding: 30,
  });

  const root = svg('svg', { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, role: 'img', 'aria-label': 'The robot on the ramp' });

  // The ramp.
  const foot = toScreen(cam, { x: 0, y: 0 });
  const top = toScreen(cam, { x: 8 * Math.cos(rad), y: 8 * Math.sin(rad) });
  root.appendChild(svg('path', {
    d: `M ${foot.x} ${foot.y} L ${top.x} ${top.y} L ${top.x} ${foot.y} Z`,
    fill: 'var(--ground)', 'fill-opacity': 0.16, stroke: 'var(--ground)', 'stroke-width': 2,
  }));
  root.appendChild(svg('text', {
    x: (foot.x + top.x) / 2, y: foot.y - 8, fill: 'var(--text-faint)', 'font-size': 12, 'text-anchor': 'middle',
  }, `${fmtFixed(p.slopeDeg, 0)}° · max climbable ${fmtFixed(r.maxSlopeDeg, 1)}°`));

  // The robot, a third of the way up.
  const along = 3;
  const bodyW = toPixels(cam, 1.1);
  const bodyH = toPixels(cam, 0.5);
  /*
   * The wheel is drawn to a *bounded* size, not to scale.
   *
   * A 1 m wheel on a 1.1 m chassis is geometrically honest and draws a circle
   * bigger than the robot, which then swings off the canvas when the chassis is
   * rotated onto a steep ramp. The wheel radius is a number in the readouts and
   * in the working; here it is a wheel.
   */
  const wheelR = Math.max(6, Math.min(bodyH * 0.5, toPixels(cam, p.wheelRadius * 2)));
  const centre = toScreen(cam, {
    x: along * Math.cos(rad) - 0.45 * Math.sin(rad),
    y: along * Math.sin(rad) + 0.45 * Math.cos(rad),
  });
  const tilt = -p.slopeDeg;

  const chassis = svg('g', { transform: `translate(${centre.x} ${centre.y}) rotate(${tilt})` });
  chassis.appendChild(svg('rect', {
    x: -bodyW / 2, y: -bodyH / 2, width: bodyW, height: bodyH, rx: 5,
    fill: r.climbs ? 'var(--body-0)' : 'var(--body-3)',
    stroke: 'var(--text-dim)', 'stroke-width': 2,
  }));
  for (const dx of [-bodyW * 0.3, bodyW * 0.3]) {
    chassis.appendChild(svg('circle', {
      cx: dx, cy: bodyH / 2, r: wheelR,
      fill: 'var(--body-ink)', 'fill-opacity': 0.55, stroke: 'var(--text-dim)', 'stroke-width': 1.5,
    }));
  }
  chassis.appendChild(svg('text', {
    x: 0, y: 4, 'text-anchor': 'middle', fill: 'var(--body-ink)', 'font-size': 11, 'font-weight': 700,
  }, `${fmtFixed(p.mass, 1)} kg`));
  root.appendChild(chassis);

  // The three forces along the slope, drawn to one scale so they compare.
  const largest = Math.max(r.stallForce, r.grip, r.gravityDrag + r.rolling, 1e-6);

  // The drivetrain's own figure, not the usable one. Showing `usableForce`
  // here draws a bar identical to the grip bar whenever grip is the limit,
  // which hides exactly the comparison the chart exists to make.
  const bars = [
    { value: r.stallForce, colour: 'var(--force-applied)', label: 'drive available', dir: 1 },
    { value: r.grip, colour: 'var(--force-friction)', label: 'grip limit', dir: 1, dashed: true },
    { value: r.gravityDrag + r.rolling, colour: 'var(--force-weight)', label: 'slope + rolling', dir: -1 },
  ];

  /*
   * The three forces are drawn as a bar chart on a common baseline rather than
   * as arrows on the ramp.
   *
   * Arrows along a 60° slope point almost straight up and run off the top of
   * the canvas, taking their labels with them. More to the point, the question
   * this drawing answers is "which of these three is biggest?", and a common
   * baseline answers it at a glance in a way three tilted arrows never do.
   */
  // The category labels get their own column on the far left, so a bar running
  // leftward from the baseline cannot land on top of its own name.
  const labelX = 14;
  const baseX = 180;
  const barTop = 40;
  const maxBar = 380;
  bars.forEach((bar, i) => {
    const y = barTop + i * 30;
    const length = Math.min(maxBar, (Math.abs(bar.value) / largest) * maxBar);
    const x1 = baseX + length * bar.dir;
    root.appendChild(svg('line', {
      x1: baseX, y1: y, x2: clampX(x1), y2: y,
      stroke: bar.colour, 'stroke-width': 8, 'stroke-linecap': 'round',
      'stroke-opacity': bar.dashed ? 0.45 : 1,
      'stroke-dasharray': bar.dashed ? '8 5' : null,
    }));
    root.appendChild(svg('text', {
      x: labelX, y: y + 4, 'text-anchor': 'start',
      fill: 'var(--text-faint)', 'font-size': 11,
    }, bar.label));
    root.appendChild(svg('text', {
      x: clampX(x1 + 10 * bar.dir, 60, VIEW_W - 20), y: y + 4,
      'text-anchor': bar.dir > 0 ? 'start' : 'end',
      fill: bar.colour, 'font-size': 11, 'font-weight': 600,
    }, `${fmtFixed(Math.abs(bar.value), 0)} N`));
  });
  // The baseline the three are measured from.
  root.appendChild(svg('line', {
    x1: baseX, y1: barTop - 14, x2: baseX, y2: barTop + bars.length * 30 - 16,
    stroke: 'var(--border-strong)', 'stroke-width': 1.5,
  }));

  root.appendChild(svg('text', {
    x: VIEW_W / 2, y: VIEW_H - 14, 'text-anchor': 'middle',
    fill: r.climbs ? 'var(--ok)' : 'var(--danger)', 'font-size': 15, 'font-weight': 700,
  }, r.climbs
    ? `It climbs — ${fmtFixed(r.acceleration, 2)} m/s² to spare, limited by ${r.limitedBy}`
    : `It does not climb — ${fmtFixed(Math.abs(r.netForce), 0)} N short, limited by ${r.limitedBy}`));

  return root;
}

/* ------------------------------------------------------------ readouts -- */

export function readouts(ctx) {
  const p = ctx.params;
  const r = analyse({ ...p, g: gravityFor(p).g });

  return [
    stat('Force at the wheels', `${fmtFixed(r.stallForce, 1)} N`, {
      swatch: '--force-applied',
      note: 'What the drivetrain can produce at a standstill',
    }),
    stat('Grip available', `${fmtFixed(r.grip, 1)} N`, {
      swatch: '--force-friction',
      note: 'The most the ground will accept',
    }),
    stat('The slope costs', `${fmtFixed(r.gravityDrag, 1)} N`, {
      swatch: '--force-weight',
      note: 'm · g · sin θ',
    }),
    stat('Net force', `${fmtFixed(r.netForce, 1)} N`, {
      swatch: '--force-net',
      accent: true,
      note: r.climbs ? 'It climbs' : 'It does not',
    }),
    stat('Limited by', r.limitedBy, {
      note: r.limitedBy === 'motor' ? 'More gearing would help' : 'More gearing would not',
    }),
    stat('Top speed on this slope', `${fmtFixed(r.topSpeed, 2)} m/s`, {
      note: r.topSpeed > 0 ? `at ${fmtFixed(r.topSpeedRpm, 0)} rpm` : 'It cannot move',
    }),
  ];
}

export function banners(ctx) {
  const p = ctx.params;
  const r = analyse({ ...p, g: gravityFor(p).g });
  const out = [];

  out.push(banner(r.climbs ? 'ok' : 'warn', r.advice));

  if (r.limitedBy === 'traction' && r.climbs) {
    out.push(banner('info',
      'Traction-limited: the drivetrain can already produce more force than the '
      + `ground will take (${fmtFixed(r.stallForce, 0)} N against ${fmtFixed(r.grip, 0)} N). `
      + 'Adding gearing here does nothing but spin the wheels. This is the point '
      + 'where a designer stops thinking about the motor and starts thinking '
      + 'about weight distribution and tyres.'));
  }

  if (p.gearRatio > 150) {
    out.push(banner('info',
      `At ${fmtFixed(p.gearRatio, 0)}:1 the top speed is only ${fmtFixed(r.topSpeed, 2)} m/s. `
      + 'Gearing buys force with speed at a fixed exchange rate, and there is no '
      + 'setting that gives you both.'));
  }

  return out;
}

export function charts(ctx) {
  const p = ctx.params;
  const motor = { stallTorque: p.stallTorque, freeRpm: p.freeRpm };
  const points = [];
  for (let i = 0; i <= 60; i += 1) {
    const rpm = (p.freeRpm * i) / 60;
    points.push({ rpm, torque: motorTorqueAt(rpm, motor), power: motorPowerAt(rpm, motor) });
  }

  const asSeries = (id, label, unit, token, get) => ({
    id, label, unit, axis: unit, token,
    points: points.map((pt) => ({ x: roadSpeed({ motorRpm: pt.rpm, gearRatio: p.gearRatio, wheelRadius: p.wheelRadius }), y: get(pt) })),
  });

  return [
    renderSeriesGraph([
      asSeries('force', 'Force at the wheels', 'N', '--force-applied',
        (pt) => wheelForce({ motorTorque: pt.torque, gearRatio: p.gearRatio, efficiency: p.efficiency, wheelRadius: p.wheelRadius, motors: p.motors })),
    ], { title: 'Force against road speed — the trade, drawn (x axis is m/s)' }),
    renderSeriesGraph([
      asSeries('power', 'Mechanical power', 'W', '--vec-velocity', (pt) => pt.power * p.motors),
    ], { title: 'Power against road speed — peaking at half the free speed' }),
  ];
}

export function inspector(ctx) {
  const p = ctx.params;
  const machine = machineById(p.machineId);
  const result = machineResult(p.machineId, p, { inputForce: 100, efficiency: p.efficiency });

  return el('div', {}, [
    el('div', { class: 'inspector__group', text: 'Mechanical advantage' }),
    table(
      [
        { key: 'k', label: machine.label },
        { key: 'v', label: '', num: true },
      ],
      [
        { k: 'Ratio', v: Number.isFinite(result.ratio) ? `${fmtFixed(result.ratio, 3)} : 1` : '∞' },
        { k: 'From 100 N in, ideally', v: `${fmtFixed(result.idealOutput, 1)} N` },
        { k: `At ${fmtFixed(p.efficiency * 100, 0)}% efficiency`, v: `${fmtFixed(result.actualOutput, 1)} N` },
        { k: 'Lost to friction', v: `${fmtFixed(result.lostToFriction, 1)} N` },
        { k: 'Distance ratio', v: Number.isFinite(result.distanceRatio) ? `${fmtFixed(result.distanceRatio, 3)} : 1` : '0' },
      ],
    ),
    el('p', { class: 'field__hint', text: machine.formula }),
    el('p', { class: 'field__hint', text: machine.note }),
  ]);
}

export const disclosure = (ctx) => standaloneDisclosure('engineer', ctx.params).disclosure;

export function explains(ctx) {
  const p = ctx.params;
  const gravity = gravityFor(p);
  const r = analyse({ ...p, g: gravity.g });
  const rad = (p.slopeDeg * Math.PI) / 180;
  const machine = machineById(p.machineId);
  const result = machineResult(p.machineId, p, { inputForce: 100, efficiency: p.efficiency });

  return [
    explain({
      title: 'Three numbers decide it',
      plain: [
        'What the drivetrain can push with, what the ground will accept, and what '
        + 'the slope is asking for. The smaller of the first two is all you '
        + 'actually have; if it beats the third, it climbs.',
        'Which of the first two is smaller matters more than the numbers '
        + 'themselves, because it tells you what to change. Motor-limited means '
        + 'more gearing helps. Traction-limited means it will not, however much '
        + 'you add.',
      ],
      open: true,
    }),

    equationPanel(equation('gear-ratio'),
      `Force at the wheel:\n`
      + `  F = τ_motor × GR × η × motors ÷ r\n`
      + `    = ${fmtFixed(p.stallTorque, 3)} × ${fmtFixed(p.gearRatio, 0)} × ${fmtFixed(p.efficiency, 2)} × ${p.motors} ÷ ${fmtFixed(p.wheelRadius, 3)}\n`
      + `    = ${fmtFixed(r.stallForce, 1)} N\n\n`
      + `Road speed at free running:\n`
      + `  v = (rpm ÷ GR) × 2π ÷ 60 × r = ${fmtFixed(roadSpeed({ motorRpm: p.freeRpm, gearRatio: p.gearRatio, wheelRadius: p.wheelRadius }), 2)} m/s\n\n`
      + `Double the gear ratio and the first doubles while the second halves.\n`
      + `Their product — the power reaching the ground — does not move.`),

    equationPanel(equation('friction'),
      `Grip is a ceiling, not a force you can choose:\n\n`
      + `  N = m·g·cos θ × (fraction on the driven wheels)\n`
      + `    = ${fmtFixed(p.mass, 1)} × ${fmtFixed(gravity.g, 3)} × cos ${fmtFixed(p.slopeDeg, 0)}° × ${fmtFixed(p.drivenFraction, 2)}`
      + ` = ${fmtFixed(p.mass * gravity.g * Math.cos(rad) * p.drivenFraction, 1)} N\n`
      + `  F_max = μ · N = ${fmtFixed(p.mu, 2)} × ${fmtFixed(p.mass * gravity.g * Math.cos(rad) * p.drivenFraction, 1)}`
      + ` = ${fmtFixed(r.grip, 1)} N\n\n`
      + `No gearbox raises this. Only μ, the weight, or where the weight sits.`),

    explain({
      title: 'The sum, in full',
      plain: 'Everything above, added up along the slope.',
      formula: 'F_net = min(F_drive, F_grip) − m·g·sin θ − C_rr·m·g·cos θ',
      validWhen: 'Steady state at a standstill; rolling resistance modelled as a '
        + 'constant fraction of the normal force.',
      worked: `Drive available   ${fmtFixed(r.stallForce, 1).padStart(9)} N\n`
        + `Grip available    ${fmtFixed(r.grip, 1).padStart(9)} N\n`
        + `Usable (smaller)  ${fmtFixed(r.usableForce, 1).padStart(9)} N\n`
        + `Slope takes      −${fmtFixed(r.gravityDrag, 1).padStart(9)} N\n`
        + `Rolling takes    −${fmtFixed(r.rolling, 1).padStart(9)} N\n`
        + `${'—'.repeat(28)}\n`
        + `Net              ${fmtFixed(r.netForce, 1).padStart(9)} N   →  a = ${fmtFixed(r.acceleration, 3)} m/s²`,
      becomes: `The steepest slope this configuration could start on is `
        + `${fmtFixed(r.maxSlopeDeg, 1)}°.`,
    }),

    explain({
      title: `Mechanical advantage: ${machine.label.toLowerCase()}`,
      plain: 'Every machine that multiplies force divides distance by the same '
        + 'factor. That is not a limitation of the design — it is what "machine" '
        + 'means. The only thing a real one adds is a small loss.',
      formula: machine.formula,
      validWhen: 'Rigid components, steady load; η accounts for real losses.',
      worked: `Ratio: ${Number.isFinite(result.ratio) ? fmtFixed(result.ratio, 3) : '∞'} : 1\n`
        + `100 N in → ${fmtFixed(result.idealOutput, 1)} N out, ideally\n`
        + `        → ${fmtFixed(result.actualOutput, 1)} N out at ${fmtFixed(p.efficiency * 100, 0)}% efficiency\n`
        + `The load moves ${Number.isFinite(result.distanceRatio) ? fmtFixed(result.distanceRatio, 3) : '0'} m for every metre you pull.`,
      becomes: machine.note,
    }),
  ];
}
