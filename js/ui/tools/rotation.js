/**
 * Rotation and torque, told through the rolling race.
 *
 * Three shapes released together down the same ramp. The result surprises
 * almost everyone, and — better still — the two things a learner expects to
 * matter, mass and size, turn out not to. That makes it a genuinely good
 * experiment: you can rule out your own first two hypotheses in about fifteen
 * seconds without being told to.
 */

import { el, svg } from '../dom.js';
import { section, numberField, sliderField, stat, banner, table, chipField } from '../widgets.js';
import { explain, equationPanel } from '../explain.js';
import { gravitySection, viewSection } from './common.js';
import { equation } from '../../models.js';
import { standaloneDisclosure, gravityFor } from '../../scenarios.js';
import { renderSeriesGraph } from '../graph-svg.js';
import {
  SHAPES, shapeById, rollingAcceleration, rollingRace, rollingEnergy,
  minimumRollingFriction, inertiaOf, parallelAxis, torque, angularAcceleration,
  rollingOmega, spinChange,
} from '../../rotation.js';
import { fmtFixed } from '../../format.js';
import { createCamera, toScreen, toPixels } from '../../camera.js';

export const meta = {
  id: 'rotation',
  label: 'Rotation & torque',
  short: 'Spin',
  concept: 'rotation',
  world: false,
  title: 'Where the mass sits decides how hard it is to spin',
};

const VIEW_W = 880;
const VIEW_H = 420;
const RAMP_LENGTH = 8;
const RACERS = ['solid-sphere', 'solid-disc', 'hoop', 'hollow-sphere'];

/* ------------------------------------------------------------ the sim --- */

export function createSim(p) {
  const gravity = gravityFor(p);
  const shapes = (p.shapes || ['solid-sphere', 'solid-disc', 'hoop']).map((id) => shapeById(id).id);

  const sim = {
    t: 0,
    shapes,
    g: gravity.g,
    slopeDeg: p.slopeDeg,
    // Distance travelled down the slope, and speed, for each racer.
    racers: shapes.map((id) => ({ id, shape: shapeById(id), s: 0, v: 0, finished: null })),
    frames: [],
  };

  sim.advance = (seconds) => {
    const steps = Math.max(1, Math.ceil(seconds / 0.002));
    const dt = seconds / steps;
    for (let i = 0; i < steps; i += 1) {
      for (const racer of sim.racers) {
        if (racer.finished !== null) continue;
        const a = rollingAcceleration(racer.id, sim.slopeDeg, sim.g).acceleration;
        const v = racer.v + a * dt;
        racer.s += ((racer.v + v) / 2) * dt;
        racer.v = v;
        if (racer.s >= RAMP_LENGTH) {
          racer.s = RAMP_LENGTH;
          racer.finished = sim.t + dt;
        }
      }
      sim.t += dt;
    }
    sim.sample();
  };

  sim.sample = () => {
    const last = sim.frames[sim.frames.length - 1];
    if (last && sim.t - last.t < 1 / 120) return;
    const values = {};
    for (const racer of sim.racers) {
      values[`s:${racer.id}`] = racer.s;
      values[`v:${racer.id}`] = racer.v;
    }
    sim.frames.push({ t: sim.t, values });
    if (sim.frames.length > 3000) sim.frames = sim.frames.slice(-3000);
  };

  sim.sample();
  return sim;
}

/* ----------------------------------------------------------- controls --- */

export function controls(ctx) {
  const { params, set } = ctx;
  const gravity = gravityFor(params);

  return [
    section('The race', [
      chipField('Which shapes are racing', RACERS.map((id) => ({
        value: id, label: shapeById(id).label, title: shapeById(id).note,
      })), null, (id) => {
        const current = params.shapes || [];
        set('shapes', current.includes(id) ? current.filter((s) => s !== id) : [...current, id]);
      }, {
        hint: `Racing: ${(params.shapes || []).map((id) => shapeById(id).label).join(', ') || 'nothing — pick at least one'}`,
        info: 'Tap to add or remove. The result depends on the shape and on '
          + 'nothing else about the object.',
      }),
      sliderField('Slope', params.slopeDeg, (v) => set('slopeDeg', v), {
        min: 1, max: 45, step: 1, key: 'slopeDeg', format: (v) => `${v}°`,
      }),
    ], { key: 'race' }),

    section('The objects', [
      numberField('Mass (each)', params.mass, (v) => set('mass', v), {
        unit: 'kg', min: 0.01, max: 500, step: 0.5, key: 'mass',
        hint: 'Change it as much as you like. It makes no difference to the race, '
          + 'and that is the point.',
      }),
      numberField('Radius (each)', params.radius, (v) => set('radius', v), {
        unit: 'm', min: 0.01, max: 2, step: 0.05, key: 'radius',
        hint: 'Nor does this. A marble and a cannonball tie exactly.',
      }),
      el('div', {
        class: 'field__hint',
        text: `Minimum grip needed to roll rather than slide, at ${fmtFixed(params.slopeDeg, 0)}°: `
          + (params.shapes || []).map((id) => `${shapeById(id).label} ${fmtFixed(minimumRollingFriction(id, params.slopeDeg), 2)}`).join(', ')
          + '. Below that the analysis stops applying, and the object slips.',
      }),
    ], { key: 'objects' }),

    gravitySection(ctx),
    viewSection(ctx),
  ];
}

/* -------------------------------------------------------------- stage --- */

export function stage(ctx) {
  const sim = ctx.custom;
  const p = ctx.params;
  if (!sim || !sim.racers.length) return null;

  const rad = (p.slopeDeg * Math.PI) / 180;
  // Room for the objects themselves and for the lanes they are spread across —
  // a 1.5 m ball on a lane 0.55 m off the centreline sticks a long way out of a
  // box drawn around the ramp alone.
  const laneSpread = ((sim.racers.length - 1) / 2) * 0.55;
  // Two radii, not one: the centre sits a radius above the lane and the circle
  // reaches another radius above that.
  const margin = 2 * p.radius + laneSpread + 0.7;

  const cam = createCamera({
    world: {
      minX: -margin,
      maxX: RAMP_LENGTH * Math.cos(rad) + margin + 0.8,
      minY: -margin,
      maxY: Math.max(2.5, RAMP_LENGTH * Math.sin(rad) + margin),
    },
    viewWidth: VIEW_W, viewHeight: VIEW_H, padding: 30,
  });

  const root = svg('svg', { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, role: 'img', 'aria-label': 'The rolling race' });

  // The ramp: one lane per racer so they can be seen separately.
  const lanes = sim.racers.length;
  sim.racers.forEach((racer, i) => {
    const offset = (i - (lanes - 1) / 2) * 0.55;
    const top = { x: offset * Math.sin(rad), y: RAMP_LENGTH * Math.sin(rad) + offset * Math.cos(rad) };
    const bottom = { x: RAMP_LENGTH * Math.cos(rad) + offset * Math.sin(rad), y: offset * Math.cos(rad) };
    const a = toScreen(cam, top);
    const b = toScreen(cam, bottom);
    root.appendChild(svg('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: 'var(--ground)', 'stroke-width': 2, 'stroke-opacity': 0.6,
    }));

    const radius = Math.max(7, toPixels(cam, p.radius));
    const along = racer.s;
    const centre = toScreen(cam, {
      x: along * Math.cos(rad) + offset * Math.sin(rad) - p.radius * Math.sin(rad),
      y: RAMP_LENGTH * Math.sin(rad) - along * Math.sin(rad) + offset * Math.cos(rad) + p.radius * Math.cos(rad),
    });

    const colour = `var(--body-${i % 4})`;
    if (racer.id === 'hoop' || racer.id === 'hollow-sphere') {
      root.appendChild(svg('circle', {
        cx: centre.x, cy: centre.y, r: radius,
        fill: 'none', stroke: colour, 'stroke-width': Math.max(3, radius * 0.22),
      }));
    } else {
      root.appendChild(svg('circle', {
        cx: centre.x, cy: centre.y, r: radius, fill: colour,
        stroke: 'var(--text-dim)', 'stroke-width': 1.5,
      }));
    }

    // A spoke, so the rolling is visible rather than a sliding disc.
    const turned = p.radius > 0 ? along / p.radius : 0;
    root.appendChild(svg('line', {
      x1: centre.x, y1: centre.y,
      x2: centre.x + radius * Math.cos(-turned - rad),
      y2: centre.y + radius * Math.sin(-turned - rad),
      stroke: 'var(--body-ink)', 'stroke-width': 2, 'stroke-opacity': 0.65,
    }));

    root.appendChild(svg('text', {
      x: b.x + 6, y: b.y + 4, fill: colour, 'font-size': 11, 'font-weight': 600,
    }, racer.shape.label));
  });

  // The finish line.
  const finishTop = toScreen(cam, { x: RAMP_LENGTH * Math.cos(rad), y: 0.2 });
  const finishBottom = toScreen(cam, { x: RAMP_LENGTH * Math.cos(rad), y: -0.6 });
  root.appendChild(svg('line', {
    x1: finishTop.x, y1: finishTop.y, x2: finishBottom.x, y2: finishBottom.y,
    stroke: 'var(--ok)', 'stroke-width': 2.5, 'stroke-dasharray': '5 3',
  }));

  return root;
}

/* ------------------------------------------------------------ readouts -- */

export function readouts(ctx) {
  const sim = ctx.custom;
  const p = ctx.params;
  if (!sim) return [];
  const gravity = gravityFor(p);

  const tiles = sim.racers.map((racer, i) => stat(racer.shape.label,
    racer.finished !== null ? `${fmtFixed(racer.finished, 2)} s` : `${fmtFixed(racer.s, 2)} m`, {
      swatch: null,
      sub: `a = ${fmtFixed(rollingAcceleration(racer.id, p.slopeDeg, gravity.g).acceleration, 3)} m/s²`,
      note: racer.finished !== null ? 'Finished' : `k = ${racer.shape.k}`,
    }));

  const sliding = gravity.g * Math.sin((p.slopeDeg * Math.PI) / 180);
  tiles.push(stat('If it could slide', `${fmtFixed(sliding, 3)} m/s²`, {
    accent: true,
    note: 'g·sinθ — faster than any of them, because nothing has to spin',
  }));

  return tiles;
}

export function banners(ctx) {
  const sim = ctx.custom;
  const p = ctx.params;
  const out = [];
  if (!sim) return out;
  const gravity = gravityFor(p);

  const race = rollingRace(p.slopeDeg, gravity.g, sim.racers.map((r) => r.id));
  if (race.length > 1) {
    out.push(banner('info',
      `Predicted order: ${race.map((r) => r.shape.label).join(', then ')}. `
      + 'It is decided entirely by where each shape keeps its mass — not by how '
      + 'much mass, and not by how big it is. Change either and check.'));
  }

  const finished = sim.racers.filter((r) => r.finished !== null);
  if (finished.length === sim.racers.length && sim.racers.length > 1) {
    const first = finished.reduce((best, r) => (r.finished < best.finished ? r : best));
    const last = finished.reduce((worst, r) => (r.finished > worst.finished ? r : worst));
    out.push(banner('ok',
      `${first.shape.label} won in ${fmtFixed(first.finished, 2)} s; `
      + `${last.shape.label} took ${fmtFixed(last.finished, 2)} s. Now change the mass or `
      + 'the radius and run it again — the times will be identical.'));
  }

  const worst = sim.racers.reduce((m, r) => Math.max(m, minimumRollingFriction(r.id, p.slopeDeg)), 0);
  if (worst > 0.6) {
    out.push(banner('warn',
      `On a ${fmtFixed(p.slopeDeg, 0)}° slope these shapes need a coefficient of friction of `
      + `at least ${fmtFixed(worst, 2)} to roll instead of slipping. That is more grip than `
      + 'most dry surfaces provide, so a real race this steep would be a slide, '
      + 'and this analysis would not apply to it.'));
  }

  return out;
}

export function charts(ctx) {
  const sim = ctx.custom;
  if (!sim) return [];

  const series = (prefix, unit) => sim.racers.map((racer, i) => ({
    id: `${prefix}:${racer.id}`,
    label: racer.shape.label,
    unit,
    axis: unit,
    token: `--body-${i % 4}`,
    points: sim.frames.map((f) => ({ x: f.t, y: f.values[`${prefix}:${racer.id}`] })).filter((p) => Number.isFinite(p.y)),
  }));

  return [
    renderSeriesGraph(series('s', 'm'), { t: sim.t, title: 'Distance down the ramp' }),
    renderSeriesGraph(series('v', 'm/s'), { t: sim.t, title: 'Speed — the gradients are the accelerations' }),
  ];
}

export function inspector(ctx) {
  const p = ctx.params;
  const gravity = gravityFor(p);

  const rows = SHAPES.filter((s) => s.id !== 'point-mass').map((shape) => ({
    shape: shape.label,
    k: String(shape.k === 1 / 12 ? '1/12' : shape.k === 1 / 3 ? '1/3' : shape.k === 2 / 3 ? '2/3' : shape.k),
    inertia: `${fmtFixed(shape.inertia(p.mass, p.radius), 4)}`,
    accel: `${fmtFixed(rollingAcceleration(shape.id, p.slopeDeg, gravity.g).acceleration, 3)}`,
  }));

  return el('div', {}, [
    el('div', { class: 'inspector__group', text: 'Moment of inertia, I = k·m·r²' }),
    table(
      [
        { key: 'shape', label: 'Shape' },
        { key: 'k', label: 'k', num: true },
        { key: 'inertia', label: 'I (kg·m²)', num: true },
        { key: 'accel', label: 'a (m/s²)', num: true },
      ],
      rows,
    ),
    el('p', {
      class: 'field__hint',
      text: 'Rod values use the length rather than a radius, so their I is not '
        + 'comparable with the others in this table.',
    }),
  ]);
}

export const disclosure = (ctx) => standaloneDisclosure('rotation', ctx.params).disclosure;

export function explains(ctx) {
  const p = ctx.params;
  const gravity = gravityFor(p);
  const rad = (p.slopeDeg * Math.PI) / 180;
  const example = shapeById((p.shapes || ['solid-disc'])[0] || 'solid-disc');
  const roll = rollingAcceleration(example.id, p.slopeDeg, gravity.g);
  const split = rollingEnergy(example.id, p.mass, p.radius, 3);
  const skater = spinChange(inertiaOf('solid-disc', p.mass, p.radius), 4, inertiaOf('solid-disc', p.mass, p.radius / 2));

  return [
    explain({
      title: 'Why they do not all arrive together',
      plain: [
        'Every one of these objects releases the same energy coming down the same '
        + 'slope. The difference is what they spend it on: a rolling object has to '
        + 'put some of it into spinning, and only what is left goes into moving '
        + 'forwards.',
        'How much has to go into spinning depends on where the mass sits. A hoop '
        + 'keeps all of its mass as far from the axis as possible, so it pays the '
        + 'most — half of everything it releases. A solid sphere has most of its '
        + 'mass close in, and pays only two sevenths.',
        'Neither the total mass nor the radius comes into it, because both appear '
        + 'on the top and the bottom of the sum and cancel. That is why a marble '
        + 'and a cannonball tie.',
      ],
      open: true,
    }),

    explain({
      title: 'Moment of inertia',
      plain: 'The rotational equivalent of mass — and unlike mass, it depends on '
        + 'where the material is, not just how much of it there is. Mass a metre '
        + 'from the axis resists turning four times as hard as the same mass half '
        + 'a metre out.',
      formula: 'I = k · m · r²      (k depends only on the shape)',
      validWhen: 'A rigid body rotating about the axis the k was quoted for.',
      worked: `${example.label}:  I = ${example.k} × ${fmtFixed(p.mass, 2)} × ${fmtFixed(p.radius, 3)}²`
        + ` = ${fmtFixed(example.inertia(p.mass, p.radius), 5)} kg·m²`,
      becomes: 'Moving the axis changes I too: the parallel axis theorem says '
        + `adding a distance d adds m·d². A rod about its end is `
        + `${fmtFixed(parallelAxis(inertiaOf('rod-centre', p.mass, 1), p.mass, 0.5) / inertiaOf('rod-centre', p.mass, 1), 0)}× `
        + 'as hard to swing as the same rod about its middle.',
    }),

    explain({
      title: 'The race, worked out',
      plain: 'Acceleration down a slope for something rolling without slipping.',
      formula: 'a = g · sin θ ÷ (1 + k)',
      validWhen: 'Rolling without slipping, which needs enough friction — and the '
        + 'friction does no work, because the contact point is momentarily still.',
      worked: `${example.label} on a ${fmtFixed(p.slopeDeg, 0)}° slope:\n`
        + `  a = ${fmtFixed(gravity.g, 4)} × sin ${fmtFixed(p.slopeDeg, 0)}° ÷ (1 + ${example.k})\n`
        + `    = ${fmtFixed(gravity.g * Math.sin(rad), 4)} ÷ ${fmtFixed(1 + example.k, 3)}\n`
        + `    = ${fmtFixed(roll.acceleration, 4)} m/s²\n\n`
        + `Sliding without friction it would manage ${fmtFixed(roll.slidingAcceleration, 4)} m/s².\n`
        + roll.note,
      becomes: 'Neither m nor r survives the algebra, which is the surprising part '
        + 'and the reason this is worth running rather than reading.',
    }),

    equationPanel(equation('newton-2-rotational'),
      `The linear and rotational forms are the same statement in two costumes:\n\n`
      + `  F = m · a          τ = I · α\n\n`
      + `Torque on ${example.label} from friction at the contact point:\n`
      + `  τ = r × F = ${fmtFixed(p.radius, 3)} × ${fmtFixed(p.mass * roll.acceleration, 3)}`
      + ` = ${fmtFixed(torque(p.radius, p.mass * roll.acceleration), 4)} N·m\n`
      + `  α = τ ÷ I = ${fmtFixed(angularAcceleration(torque(p.radius, p.mass * roll.acceleration), example.inertia(p.mass, p.radius)), 3)} rad/s²\n`
      + `  and a = α · r, which closes the loop back to the linear answer.`),

    explain({
      title: 'Where the energy is, at 3 m/s',
      plain: `A ${example.label.toLowerCase()} rolling at 3 m/s.`,
      formula: 'Total KE = ½·m·v²  +  ½·I·ω²      with ω = v ÷ r',
      validWhen: 'Rolling without slipping.',
      worked: `Moving:   ${fmtFixed(split.translational, 3)} J\n`
        + `Spinning: ${fmtFixed(split.rotational, 3)} J\n`
        + `${'—'.repeat(24)}\n`
        + `Total:    ${fmtFixed(split.total, 3)} J`
        + `\n\n${fmtFixed(split.spinFraction * 100, 0)}% of it is spin, and ω = ${fmtFixed(split.omega, 2)} rad/s.`,
    }),

    explain({
      title: 'The skater, and where the extra energy comes from',
      plain: [
        'Pull the mass in towards the axis and I falls. Angular momentum is '
        + 'conserved, so ω has to rise to compensate — which is why a spinning '
        + 'skater speeds up when they pull their arms in.',
        'The kinetic energy rises too, and that always looks like something for '
        + 'nothing. It is not: pulling the mass inward against its tendency to '
        + 'keep going straight takes work, and the work done is exactly the '
        + 'difference.',
      ],
      formula: 'L = I · ω is conserved,  so  ω₂ = ω₁ · (I₁ ÷ I₂)',
      validWhen: 'No external torque acting.',
      worked: `Halving the radius quarters I:\n`
        + `  ω:  4 → ${fmtFixed(skater.omegaAfter, 2)} rad/s\n`
        + `  KE: ${fmtFixed(skater.energyBefore, 3)} → ${fmtFixed(skater.energyAfter, 3)} J\n`
        + `  Work done pulling in: ${fmtFixed(skater.workDone, 3)} J`,
    }),
  ];
}
