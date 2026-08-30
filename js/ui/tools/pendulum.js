/**
 * The Pendulum Laboratory, simple and double.
 *
 * Two numbers sit side by side throughout: the small-angle period, which is the
 * formula everyone is taught, and the exact period, which is what the pendulum
 * actually does. At 5° they agree to four figures. At 90° they are 18% apart.
 * Watching that gap open as the angle is widened is the clearest demonstration
 * in the app of what an approximation is — and the simulation itself never uses
 * the approximation, only reports it.
 *
 * The stopwatch is a real measurement taken from the recorded motion, not the
 * formula printed back. When the measured period matches the exact one and not
 * the small-angle one, that is evidence rather than assertion.
 */

import { el, svg } from '../dom.js';
import { section, numberField, sliderField, toggleField, stat, banner, table } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { gravitySection, viewSection } from './common.js';
import { equation } from '../../models.js';
import { standaloneDisclosure, gravityFor } from '../../scenarios.js';
import { renderSeriesGraph } from '../graph-svg.js';
import {
  smallAnglePeriod, exactPeriod, smallAngleError, simpleDeriv, measurePeriod,
  dependencies, doubleDeriv, doublePositions, doubleEnergy,
} from '../../pendulum.js';
import { rk4 } from '../../integrator.js';
import { fmtFixed } from '../../format.js';
import { createCamera, toScreen, toPixels } from '../../camera.js';

export const meta = {
  id: 'pendulum',
  label: 'Pendulums',
  short: 'Swing',
  concept: 'pendulum',
  world: false,
  title: 'What changes the period, and what does not',
};

const VIEW_W = 880;
const VIEW_H = 420;
/** The longest arrow off the bob, plus its label. */
const ARROW_ROOM_PX = 84;
const BOB_PX = { min: 7, max: 26 };
const deg = (d) => (d * Math.PI) / 180;

/**
 * How big to draw a bob.
 *
 * Bounded at both ends: at 3000 px per metre a 5 cm bob would be drawn 150 px
 * across and swing straight off the canvas, and a 10 g one would vanish. The
 * mass is a number in the readout; here it is a bob.
 */
const bobRadius = (cam, mass) =>
  Math.max(BOB_PX.min, Math.min(BOB_PX.max, toPixels(cam, 0.05 * Math.cbrt(mass))));

/* ------------------------------------------------------------ the sim --- */

/**
 * The pendulum's own simulation.
 *
 * It keeps its history in the same shape the recorder uses, so the graphs go
 * through exactly the same renderer as every other lab's.
 */
export function createSim(p) {
  const gravity = gravityFor(p);
  const g = gravity.g;

  const sim = {
    t: 0,
    g,
    params: p,
    double: !!p.double,
    // [θ, ω] for the simple case, [θ₁, θ₂, ω₁, ω₂] for the double.
    y: p.double
      ? [deg(p.angleDeg), deg(p.angle2Deg), 0, 0]
      : [deg(p.angleDeg), 0],
    // The twin, started a fraction of a degree away, for the chaos comparison.
    twin: p.double && p.showTwin
      ? [deg(p.angleDeg) + deg(p.nudgeDeg), deg(p.angle2Deg), 0, 0]
      : null,
    frames: [],
    trail: [],
  };

  const derivSimple = simpleDeriv(p.length, g, p.damping);
  const derivDouble = doubleDeriv({ l1: p.length, l2: p.l2, m1: p.mass, m2: p.m2, g });

  sim.advance = (seconds) => {
    // Small fixed substeps: the double pendulum is stiff enough that a frame's
    // worth in one go is visibly wrong within a second or two.
    const steps = Math.max(1, Math.min(400, Math.ceil(seconds / 0.0005)));
    const dt = seconds / steps;
    const deriv = sim.double ? derivDouble : derivSimple;
    for (let i = 0; i < steps; i += 1) {
      sim.y = rk4(sim.y, sim.t, dt, deriv);
      if (sim.twin) sim.twin = rk4(sim.twin, sim.t, dt, derivDouble);
      sim.t += dt;
    }
    sim.sample();
  };

  sim.sample = () => {
    const last = sim.frames[sim.frames.length - 1];
    if (last && sim.t - last.t < 1 / 120) return;

    if (sim.double) {
      const { p1, p2 } = doublePositions({ l1: p.length, l2: p.l2 }, sim.y);
      const e = doubleEnergy({ l1: p.length, l2: p.l2, m1: p.mass, m2: p.m2, g }, sim.y);
      sim.frames.push({
        t: sim.t,
        values: {
          theta1: (sim.y[0] * 180) / Math.PI,
          theta2: (sim.y[1] * 180) / Math.PI,
          energy: e.total,
          kinetic: e.kinetic,
        },
      });
      sim.trail = [...sim.trail, p2].slice(-600);
    } else {
      const [theta, omega] = sim.y;
      const kinetic = 0.5 * p.mass * (p.length * omega) ** 2;
      const potential = p.mass * g * p.length * (1 - Math.cos(theta));
      sim.frames.push({
        t: sim.t,
        values: {
          theta: (theta * 180) / Math.PI,
          omega,
          speed: Math.abs(omega) * p.length,
          kinetic,
          potential,
          energy: kinetic + potential,
        },
      });
    }
    if (sim.frames.length > 4000) sim.frames = sim.frames.slice(-4000);
  };

  sim.sample();
  return sim;
}

/* ----------------------------------------------------------- controls --- */

const PRESETS = [
  { id: 'small', label: 'Small swing (5°)', title: 'Where the usual formula is almost exact', params: { angleDeg: 5, length: 1, mass: 1, damping: 0, double: false } },
  { id: 'wide', label: 'Wide swing (90°)', title: 'Where the small-angle formula is 18% out', params: { angleDeg: 90, length: 1, mass: 1, damping: 0, double: false } },
  { id: 'heavy', label: 'A much heavier bob', title: 'Predict the period before you press Play', params: { angleDeg: 30, length: 1, mass: 20, damping: 0, double: false } },
  { id: 'long', label: 'Four times the length', title: 'Period should double, not quadruple', params: { angleDeg: 30, length: 4, mass: 1, damping: 0, double: false } },
  { id: 'double', label: 'Double pendulum', title: 'Same laws, unpredictable in practice', params: { double: true, angleDeg: 120, angle2Deg: 60, length: 1, l2: 1, mass: 1, m2: 1, showTwin: true, nudgeDeg: 0.001 } },
];

export function controls(ctx) {
  const { params, set } = ctx;
  const gravity = gravityFor(params);

  return [
    section('The pendulum', [
      el('div', { class: 'chipset', style: { marginBottom: '12px' } }, PRESETS.map((p) => el('button', {
        class: 'chip', type: 'button', title: p.title, text: p.label,
        on: { click: () => ctx.setMany(p.params) },
      }))),
      toggleField('Double pendulum', params.double, (v) => set('double', v), {
        key: 'double',
        hint: 'Two arms, one hanging off the other. The equations are exact and '
          + 'the motion is still unpredictable — which is worth seeing.',
      }),
      sliderField('Length', params.length, (v) => set('length', v), {
        min: 0.1, max: 6, step: 0.05, key: 'length', format: (v) => `${fmtFixed(v, 2)} m`,
        info: 'The period goes as the square root of this. Four times the length '
          + 'gives twice the period, not four times.',
      }),
      numberField('Bob mass', params.mass, (v) => set('mass', v), {
        unit: 'kg', min: 0.01, max: 200, step: 0.5, key: 'mass',
        hint: 'Predict what this does to the period before you change it.',
      }),
      sliderField('Starting angle', params.angleDeg, (v) => set('angleDeg', v), {
        min: -170, max: 170, step: 1, key: 'angleDeg', format: (v) => `${v}°`,
        hint: `The small-angle formula is ${fmtFixed(smallAngleError(deg(Math.abs(params.angleDeg))) * 100, 2)}% out at this amplitude.`,
      }),
    ], { key: 'setup' }),

    params.double ? section('The second arm', [
      sliderField('Length', params.l2, (v) => set('l2', v), { min: 0.1, max: 6, step: 0.05, key: 'l2', format: (v) => `${fmtFixed(v, 2)} m` }),
      numberField('Mass', params.m2, (v) => set('m2', v), { unit: 'kg', min: 0.01, max: 200, step: 0.5, key: 'm2' }),
      sliderField('Starting angle', params.angle2Deg, (v) => set('angle2Deg', v), { min: -170, max: 170, step: 1, key: 'angle2Deg', format: (v) => `${v}°` }),
      toggleField('Run a twin, nudged slightly', params.showTwin, (v) => set('showTwin', v), {
        key: 'showTwin',
        hint: 'A second pendulum started a fraction of a degree away. Nothing '
          + 'random happens to either — watch how long they stay together.',
      }),
      params.showTwin ? numberField('How far off the twin starts', params.nudgeDeg, (v) => set('nudgeDeg', v), {
        unit: '°', min: 0.0001, max: 5, step: 0.001, decimals: 4, key: 'nudgeDeg',
      }) : null,
    ].filter(Boolean), { key: 'second' }) : null,

    section('Damping', [
      sliderField('Air and pivot friction', params.damping, (v) => set('damping', v), {
        min: 0, max: 2, step: 0.05, key: 'damping', format: (v) => fmtFixed(v, 2),
        hint: params.damping > 0
          ? 'The swing decays. Since the period depends slightly on amplitude, a '
            + 'real pendulum\'s period drifts as it dies away.'
          : 'None: a frictionless pivot in a vacuum, so the amplitude never '
            + 'changes and the period can be timed over many swings.',
      }),
    ], { key: 'damping' }),

    gravitySection(ctx),

    !params.double ? section('The two periods', [
      el('div', { class: 'field__hint' }, [
        `Small-angle formula: ${fmtFixed(smallAnglePeriod(params.length, gravity.g), 4)} s. `,
        `Exact: ${fmtFixed(exactPeriod(params.length, gravity.g, deg(Math.abs(params.angleDeg))), 4)} s. `,
        'Press Play and let the stopwatch decide which one the pendulum agrees with.',
      ]),
    ], { key: 'periods' }) : null,

    viewSection(ctx),
  ].filter(Boolean);
}

/* -------------------------------------------------------------- stage --- */

export function stage(ctx) {
  const sim = ctx.custom;
  const p = ctx.params;
  if (!sim) return null;

  const reach = p.double ? p.length + p.l2 : p.length;
  // Frame the swing that is actually going to happen. A 5° pendulum framed for
  // a 170° one is a thread in the middle of an empty canvas — the bob ends up
  // too small to read the velocity arrow against.
  /*
   * Frame the swing that is actually going to happen.
   *
   * Two traps, both of which framed a large pendulum as a sliver in an empty
   * canvas. The widest point of a swing past 90° is at 90°, not at the end of
   * it — sin(170°) is 0.17. And a bob swinging past 90° rises *above* its
   * pivot, by as much as a whole arm's length at 180°, so the top of the box
   * cannot be a fixed fraction of the reach.
   *
   * A double pendulum can reach anywhere within its full extent, so it simply
   * gets a square.
   */
  const swingRad = Math.abs(deg(p.angleDeg));
  const halfWidth = p.double
    ? reach * 1.08
    : Math.max(reach * 0.32, reach * Math.sin(Math.min(Math.PI / 2, Math.max(deg(18), swingRad))) + reach * 0.22);
  const top = p.double
    ? reach * 1.08
    : reach * (Math.max(0.2, -Math.cos(Math.min(Math.PI, swingRad))) + 0.16);

  const cam = createCamera({
    world: { minX: -halfWidth, maxX: halfWidth, minY: -reach * 1.16, maxY: top },
    viewWidth: VIEW_W, viewHeight: VIEW_H,
    // Room for the bob and for the arrows coming off it, reserved in pixels —
    // the same reasoning as the main scene renderer.
    padding: 26 + ARROW_ROOM_PX,
    // A pendulum is a diagram of one object, so magnifying a short one is the
    // right thing to do: there is nothing else on the canvas to be out of scale
    // with.
    maxScale: 3000,
  });

  const root = svg('svg', { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, role: 'img', 'aria-label': 'The pendulum' });
  const pivot = toScreen(cam, { x: 0, y: 0 });

  // The rest position, so the angle is visible as an angle.
  const bottom = toScreen(cam, { x: 0, y: -reach });
  root.appendChild(svg('line', {
    x1: pivot.x, y1: pivot.y, x2: bottom.x, y2: bottom.y,
    stroke: 'var(--grid)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4',
  }));

  if (p.double) {
    if (sim.twin && p.showTwin) drawDouble(root, cam, p, sim.twin, { faded: true });
    drawTrail(root, cam, sim.trail);
    drawDouble(root, cam, p, sim.y, {});
  } else {
    drawSimple(root, cam, p, sim.y, ctx);
  }

  root.appendChild(svg('circle', { cx: pivot.x, cy: pivot.y, r: 6, fill: 'var(--text-dim)' }));
  return root;
}

function drawSimple(root, cam, p, [theta, omega], ctx) {
  const bob = toScreen(cam, { x: p.length * Math.sin(theta), y: -p.length * Math.cos(theta) });
  const pivot = toScreen(cam, { x: 0, y: 0 });

  root.appendChild(svg('line', {
    x1: pivot.x, y1: pivot.y, x2: bob.x, y2: bob.y,
    stroke: 'var(--text-dim)', 'stroke-width': 2.5,
  }));

  const radius = bobRadius(cam, p.mass);
  root.appendChild(svg('circle', {
    cx: bob.x, cy: bob.y, r: radius,
    fill: 'var(--body-0)', stroke: 'var(--text-dim)', 'stroke-width': 2,
  }));

  root.appendChild(svg('text', {
    x: bob.x, y: bob.y + radius + 16, 'text-anchor': 'middle',
    fill: 'var(--text-dim)', 'font-size': 11, 'font-weight': 600,
  }, `${fmtFixed(p.mass, 2)} kg`));

  if (ctx.show.velocity) {
    // Tangential: the bob moves along the arc, so its velocity is perpendicular
    // to the rod. Drawing it along the rod would be wrong and would look right.
    const speed = Math.abs(omega) * p.length;
    const dir = { x: Math.cos(theta) * Math.sign(omega || 1), y: Math.sin(theta) * Math.sign(omega || 1) };
    if (speed > 0.02) {
      const length = Math.min(70, 12 + speed * 12);
      root.appendChild(svg('line', {
        x1: bob.x, y1: bob.y,
        x2: bob.x + dir.x * length, y2: bob.y - dir.y * length,
        stroke: 'var(--vec-velocity)', 'stroke-width': 3, 'stroke-linecap': 'round',
      }));
    }
  }

  if (ctx.show.forces) {
    const weightPx = Math.min(62, 18 + p.mass * 2);
    root.appendChild(svg('line', {
      x1: bob.x, y1: bob.y, x2: bob.x, y2: bob.y + weightPx,
      stroke: 'var(--force-weight)', 'stroke-width': 3, 'stroke-linecap': 'round',
    }));
    root.appendChild(svg('text', {
      x: bob.x + 8, y: bob.y + weightPx + 4, fill: 'var(--force-weight)', 'font-size': 10.5,
    }, 'W'));
  }
}

function drawDouble(root, cam, p, y, { faded }) {
  const { p1, p2 } = doublePositions({ l1: p.length, l2: p.l2 }, y);
  const pivot = toScreen(cam, { x: 0, y: 0 });
  const a = toScreen(cam, p1);
  const b = toScreen(cam, p2);
  const opacity = faded ? 0.35 : 1;

  root.appendChild(svg('line', {
    x1: pivot.x, y1: pivot.y, x2: a.x, y2: a.y,
    stroke: 'var(--text-dim)', 'stroke-width': 2.5, opacity,
  }));
  root.appendChild(svg('line', {
    x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    stroke: 'var(--text-dim)', 'stroke-width': 2.5, opacity,
  }));
  root.appendChild(svg('circle', {
    cx: a.x, cy: a.y, r: bobRadius(cam, p.mass),
    fill: faded ? 'var(--text-faint)' : 'var(--body-0)', stroke: 'var(--text-dim)', 'stroke-width': 2, opacity,
  }));
  root.appendChild(svg('circle', {
    cx: b.x, cy: b.y, r: bobRadius(cam, p.m2),
    fill: faded ? 'var(--text-faint)' : 'var(--body-1)', stroke: 'var(--text-dim)', 'stroke-width': 2, opacity,
  }));
}

function drawTrail(root, cam, trail) {
  if (!trail || trail.length < 2) return;
  root.appendChild(svg('polyline', {
    points: trail.map((pt) => {
      const s = toScreen(cam, pt);
      return `${Math.round(s.x * 10) / 10},${Math.round(s.y * 10) / 10}`;
    }).join(' '),
    fill: 'none', stroke: 'var(--body-1)', 'stroke-width': 1.2, 'stroke-opacity': 0.5,
  }));
}

/* ------------------------------------------------------------ readouts -- */

export function readouts(ctx) {
  const sim = ctx.custom;
  const p = ctx.params;
  if (!sim) return [];
  const gravity = gravityFor(p);

  if (p.double) {
    const e = doubleEnergy({ l1: p.length, l2: p.l2, m1: p.mass, m2: p.m2, g: gravity.g }, sim.y);
    const gap = sim.twin
      ? Math.hypot(
        doublePositions({ l1: p.length, l2: p.l2 }, sim.y).p2.x - doublePositions({ l1: p.length, l2: p.l2 }, sim.twin).p2.x,
        doublePositions({ l1: p.length, l2: p.l2 }, sim.y).p2.y - doublePositions({ l1: p.length, l2: p.l2 }, sim.twin).p2.y,
      )
      : null;
    return [
      stat('Upper angle', `${fmtFixed((sim.y[0] * 180) / Math.PI, 1)}°`, {}),
      stat('Lower angle', `${fmtFixed((sim.y[1] * 180) / Math.PI, 1)}°`, {}),
      stat('Total energy', `${fmtFixed(e.total, 3)} J`, {
        accent: true,
        note: 'Conserved exactly — the motion is complicated, not lawless',
      }),
      gap !== null
        ? stat('Twin separation', `${fmtFixed(gap, 3)} m`, {
          swatch: '--force-net',
          note: `Started ${p.nudgeDeg}° apart`,
        })
        : stat('Kinetic energy', `${fmtFixed(e.kinetic, 3)} J`, {}),
    ];
  }

  const [theta, omega] = sim.y;
  const small = smallAnglePeriod(p.length, gravity.g);
  const exact = exactPeriod(p.length, gravity.g, deg(Math.abs(p.angleDeg)));
  const measured = measurePeriod(sim.frames.map((f) => ({ t: f.t, theta: f.values.theta })));

  return [
    stat('Angle', `${fmtFixed((theta * 180) / Math.PI, 1)}°`, { note: `Started at ${fmtFixed(p.angleDeg, 0)}°` }),
    stat('Speed of the bob', `${fmtFixed(Math.abs(omega) * p.length, 2)} m/s`, { swatch: '--vec-velocity' }),
    stat('Small-angle formula', `${fmtFixed(small, 4)} s`, {
      note: `T = 2π√(L/g) — ${fmtFixed(smallAngleError(deg(Math.abs(p.angleDeg))) * 100, 2)}% out here`,
    }),
    stat('Exact period', `${fmtFixed(exact, 4)} s`, {
      accent: true,
      note: 'What the pendulum actually does',
    }),
    stat('Measured', measured ? `${fmtFixed(measured.period, 4)} s` : '—', {
      swatch: '--vec-velocity',
      note: measured ? `Timed over ${measured.swingsCounted} half-swings` : 'Press Play to start timing',
    }),
  ];
}

export function banners(ctx) {
  const p = ctx.params;
  const gravity = gravityFor(p);
  const out = [];

  if (p.double) {
    out.push(banner('info',
      'Nothing here is random. The equations are exact and the simulation is '
      + 'deterministic — run it twice from the same start and you get the same '
      + 'motion both times. What makes a double pendulum unpredictable is that '
      + 'any uncertainty in the starting angle grows exponentially, so predicting '
      + 'far ahead would need impossible precision.'));
    if (p.showTwin) {
      out.push(banner('warn',
        `The faded twin started just ${p.nudgeDeg}° away. Watch how long the two `
        + 'stay together, then how completely they part company. Both are correct.'));
    }
    return out;
  }

  const error = smallAngleError(deg(Math.abs(p.angleDeg)));
  if (error < 0.002) {
    out.push(banner('ok',
      `At ${fmtFixed(Math.abs(p.angleDeg), 0)}° the small-angle formula is within `
      + `${fmtFixed(error * 100, 3)}% of the truth. This is the regime it was derived for, `
      + 'and inside it the approximation costs you nothing you could measure.'));
  } else if (error > 0.02) {
    out.push(banner('warn',
      `At ${fmtFixed(Math.abs(p.angleDeg), 0)}° the small-angle formula is `
      + `${fmtFixed(error * 100, 1)}% out — it says ${fmtFixed(smallAnglePeriod(p.length, gravity.g), 3)} s `
      + `and the pendulum takes ${fmtFixed(exactPeriod(p.length, gravity.g, deg(Math.abs(p.angleDeg))), 3)} s. `
      + 'The approximation has not become wrong; you have left the range it was '
      + 'built for.'));
  }

  if (p.damping > 0) {
    out.push(banner('info',
      'With damping on, the amplitude decays — and because the period depends '
      + 'slightly on amplitude, the period drifts too, very slowly. Pendulum '
      + 'clocks are kept to small swings for exactly this reason.'));
  }

  return out;
}

export function charts(ctx) {
  const sim = ctx.custom;
  if (!sim) return [];
  const p = ctx.params;
  // No early return on an empty recording: the renderer draws its own "press
  // Play" state, and a lab whose graphs simply are not there yet reads as a
  // lab that has no graphs.


  const seriesOf = (id, label, unit, token) => ({
    id, label, unit, token, axis: unit,
    points: sim.frames.map((f) => ({ x: f.t, y: f.values[id] })).filter((pt) => Number.isFinite(pt.y)),
  });

  if (p.double) {
    return [
      renderSeriesGraph([
        seriesOf('theta1', 'Upper arm', '°', '--body-0'),
        seriesOf('theta2', 'Lower arm', '°', '--body-1'),
      ], { t: sim.t, title: 'Both angles against time — no repeating pattern at all' }),
      renderSeriesGraph([
        seriesOf('energy', 'Total energy', 'J', '--accent-strong'),
      ], { t: sim.t, title: 'Total energy — flat, because the laws are being obeyed exactly' }),
    ];
  }

  return [
    renderSeriesGraph([seriesOf('theta', 'Angle', '°', '--accent-strong')],
      { t: sim.t, title: 'Angle against time — count the crossings to time it yourself' }),
    renderSeriesGraph([
      seriesOf('kinetic', 'Kinetic', 'J', '--vec-velocity'),
      seriesOf('potential', 'Potential', 'J', '--force-weight'),
      seriesOf('energy', 'Total', 'J', '--accent-strong'),
    ], { t: sim.t, title: 'Energy trading back and forth, with a flat total' }),
  ];
}

export function inspector(ctx) {
  const sim = ctx.custom;
  const p = ctx.params;
  if (!sim) return null;
  const gravity = gravityFor(p);
  const d = dependencies(p.length, gravity.g, deg(Math.abs(p.angleDeg)));

  return el('div', {}, [
    el('div', { class: 'inspector__group', text: 'Change one thing — what happens?' }),
    table(
      [
        { key: 'change', label: 'If you…' },
        { key: 'effect', label: 'Period', num: true },
      ],
      [
        { change: 'double the bob mass', effect: `× ${fmtFixed(d.doubleMass.factor, 3)}` },
        { change: 'double the length', effect: `× ${fmtFixed(d.doubleLength.factor, 3)}` },
        { change: 'double gravity', effect: `× ${fmtFixed(d.doubleGravity.factor, 3)}` },
        { change: 'double the angle', effect: `× ${fmtFixed(d.doubleAmplitude.factor, 3)}` },
      ],
    ),
    el('p', { class: 'field__hint', text: d.doubleMass.note }),
    el('p', { class: 'field__hint', text: d.doubleAmplitude.note }),
  ]);
}

export const disclosure = (ctx) => standaloneDisclosure('pendulum', ctx.params).disclosure;

export function explains(ctx) {
  const p = ctx.params;
  const gravity = gravityFor(p);
  const small = smallAnglePeriod(p.length, gravity.g);
  const exact = exactPeriod(p.length, gravity.g, deg(Math.abs(p.angleDeg)));

  if (p.double) {
    return [
      explain({
        title: 'Same laws, no prediction',
        plain: [
          'A double pendulum obeys exactly the equations you would write down for '
          + 'one pendulum hanging off another. There is no extra ingredient, '
          + 'nothing random, and no approximation in the motion.',
          'What it has is sensitivity. Two starts a thousandth of a degree apart '
          + 'follow the same rules to identical answers — for a few seconds. Then '
          + 'the gap between them, which was growing exponentially the whole time, '
          + 'becomes as large as the pendulum itself.',
          'This is worth meeting early, because it separates two things that are '
          + 'easy to confuse: whether a system is governed by rules, and whether '
          + 'anyone can predict what it will do. The answer here is yes and no.',
        ],
        open: true,
      }),
      explain({
        title: 'How to tell it is not just broken maths',
        plain: 'Watch the total energy graph. It is flat. A simulation that had '
          + 'lost control of the arithmetic would show energy drifting away, and '
          + 'this one holds it to about one part in a million over half a minute. '
          + 'The motion is chaotic; the computation is not.',
      }),
    ];
  }

  return [
    explain({
      title: 'What the period depends on — and what it does not',
      plain: [
        'A pendulum swings because gravity pulls the bob back towards the lowest '
        + 'point, and its own momentum carries it past. How long that takes '
        + 'depends on the length of the arm and on the strength of gravity.',
        'It does not depend on the mass of the bob. Not approximately — at all. A '
        + 'heavier bob is pulled harder and resists acceleration exactly that much '
        + 'more, which is the same cancellation that makes everything fall '
        + 'together. Change the mass here and watch nothing happen.',
      ],
      open: true,
    }),

    equationPanel(equation('pendulum-period'),
      `T ≈ 2π × √(L ÷ g)\n`
      + `  = 2π × √(${fmtFixed(p.length, 3)} ÷ ${fmtFixed(gravity.g, 4)})\n`
      + `  = ${fmtFixed(small, 4)} s\n\n`
      + `Exact period at ${fmtFixed(Math.abs(p.angleDeg), 0)}°:  ${fmtFixed(exact, 4)} s\n`
      + `Difference:  ${fmtFixed(smallAngleError(deg(Math.abs(p.angleDeg))) * 100, 3)}%\n\n`
      + `The mass of the bob (${fmtFixed(p.mass, 2)} kg) appears nowhere in either.`),

    explain({
      title: 'Where the approximation comes from, and where it goes',
      plain: [
        'The restoring force on a pendulum goes as sin θ. That makes the equation '
        + 'of motion one that has no solution in elementary functions — so the '
        + 'standard derivation replaces sin θ with θ, which is very nearly true '
        + 'for small angles, and the problem becomes solvable in a line.',
        'That replacement is where T = 2π√(L/g) comes from, and it is why the '
        + 'amplitude does not appear in it. The real period does depend on '
        + 'amplitude: 0.2% longer at 10°, 1.7% at 30°, 18% at 90°.',
        'This simulation never makes that substitution. It integrates the exact '
        + 'equation, which is why the stopwatch agrees with the exact period and '
        + 'not with the formula — and why widening the swing makes the two '
        + 'numbers on screen visibly separate.',
      ],
      formula: 'θ″ = −(g/L)·sin θ          (what the simulation solves)\n'
        + 'θ″ ≈ −(g/L)·θ              (what the formula assumes)',
      validWhen: 'The approximation holds while sin θ ≈ θ, which is to better than '
        + '1% below about 25°.',
      worked: `At ${fmtFixed(Math.abs(p.angleDeg), 0)}°:  sin θ = ${fmtFixed(Math.sin(deg(Math.abs(p.angleDeg))), 5)},  θ = ${fmtFixed(deg(Math.abs(p.angleDeg)), 5)} rad\n`
        + `Difference: ${fmtFixed(Math.abs(Math.sin(deg(Math.abs(p.angleDeg))) - deg(Math.abs(p.angleDeg))) / Math.max(1e-9, deg(Math.abs(p.angleDeg))) * 100, 3)}%`,
    }),

    equationPanel(equation('energy-conservation'),
      `At the ends of the swing the bob is momentarily still — all potential.\n`
      + `At the bottom it is moving fastest — all kinetic.\n\n`
      + `Height risen at ${fmtFixed(Math.abs(p.angleDeg), 0)}°:  L(1 − cos θ) = ${fmtFixed(p.length * (1 - Math.cos(deg(Math.abs(p.angleDeg)))), 4)} m\n`
      + `PE there:  ${fmtFixed(p.mass * gravity.g * p.length * (1 - Math.cos(deg(Math.abs(p.angleDeg)))), 3)} J\n`
      + `Speed at the bottom:  √(2·g·h) = ${fmtFixed(Math.sqrt(2 * gravity.g * p.length * (1 - Math.cos(deg(Math.abs(p.angleDeg))))), 3)} m/s\n\n`
      + `The mass cancels in the speed, as it always does.`),
  ];
}
