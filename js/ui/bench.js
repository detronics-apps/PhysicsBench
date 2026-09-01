/**
 * The bench: one set of controls that grows with the steps.
 *
 * Every panel asks "is this feature on?" rather than "which step is this?", so
 * the sidebar at step six is the sidebar from step one with four more sections
 * under it — and the mass slider is still exactly where it was.
 */

import { el } from './dom.js';
import {
  section, subsection, numberField, sliderField, selectField, toggleField, stat, banner, table,
  buttonRow, button,
} from './widgets.js';
import { explain, equationPanel } from './explain.js';
import { equation } from '../models.js';
import { stageById, featuresAt, pushState, pushRange, MAX_OBJECTS } from '../stages.js';
import { CONTROL_MODES, modeById, controlStatus } from '../control.js';
import { boxWalls, wallAngle, wallLength, arcLength, isCurved, MAX_WALLS } from '../segments.js';
import {
  SURFACES, surfaceById, matchSurface, describeSurface, slipAngle, brakingG, rollingFor,
} from '../friction.js';
import { collisionsOn, collisionsForced } from '../stages.js';
import { buoyantMass } from '../forces.js';
import {
  SHAPES, MATERIALS, describe as describeObject, sizeFor, dragComparison, floats,
  typicalFor, contactKind, materialById, pairBounce, describeBounce,
} from '../shapes.js';
import { MAX_CANNONS, PRINT_PARTS } from '../state.js';
import { FLUIDS, fluidById, drag as fluidDrag, terminalSpeed, atmosphereAt } from '../drag.js';
import { WORLDS, describeWorld, surfaceGravity, everydayComparison, massForGravity } from '../gravitation.js';
import { inspect, totals, findBody, elevation } from '../world.js';
import { len } from '../vec.js';
import { fmtFixed, fmtDirectionWords, fmtLength } from '../format.js';
import { G, G_STANDARD } from '../constants.js';

/* ---------------------------------------------------------- the controls -- */

export function controls(ctx) {
  const { params: p, set, state } = ctx;
  const f = ctx.features;
  const object = describeObject({ shapeId: p.shapeId, size: p.size, mass: p.mass });

  return [
    objectSection(ctx, object, f),
    f.has('applied') ? pushSection(ctx) : null,
    f.has('second-mass') && !f.has('planet') ? otherMassSection(ctx) : null,
    f.has('planet') ? worldSection(ctx) : null,
    f.has('ground') && !ctx.space ? surfaceSection(ctx) : null,
    f.has('fluid') ? fluidSection(ctx, object) : null,
    f.has('objects') ? objectsSection(ctx) : null,
    f.has('obstacles') ? wallsSection(ctx) : null,
    f.has('obstacles') ? cannonsSection(ctx) : null,
    f.has('objects') ? collisionSection(ctx) : null,
    f.has('control') ? controlSection(ctx) : null,
    viewSection(ctx),
  ].filter(Boolean);
}

function objectSection(ctx, object, f) {
  const { params: p, set } = ctx;
  return section('The object', [
    numberField('Mass', p.mass, (v) => set('mass', v), {
      unit: 'kg', min: 0.001, max: 1e7, step: 0.5, key: 'mass',
      info: 'How strongly it resists being accelerated. This is the one property '
        + 'the object has before anything happens to it.',
    }),

    /*
     * The shape is available from the first step, and for most of them it
     * changes nothing about the motion — which is worth being able to find out
     * rather than being protected from. An object's shape acts on a surface or
     * a fluid, and until there is one of those it has nothing to act on. The
     * hint says which of those two situations you are in.
     */
    /*
     * The shape is available from the first step, and for most of them it
     * changes nothing about the motion — which is worth being able to find out
     * rather than being protected from. An object's shape acts on a surface or
     * a fluid, and until there is one of those it has nothing to act on.
     *
     * Choosing one sets the size and mass to a real example of it. A car forty
     * centimetres long weighing a kilogram teaches the wrong thing twice: the
     * drawing is not a car, and the density that falls out of it is not a car's
     * either. Both stay adjustable immediately afterwards.
     */
    f.has('shape') ? selectField('Shape',
      SHAPES.map((x) => ({ value: x.id, label: `${x.label} — C_d ${x.cd}` })),
      p.shapeId,
      (v) => {
        const t = typicalFor(v);
        ctx.setMany({ shapeId: v, size: t.size, mass: t.mass });
      },
      {
        key: 'shapeId',
        hint: `Set to ${typicalFor(p.shapeId).of}, at its real size and mass — change `
          + 'either freely. '
          + (shapeMattersHere(ctx) ? object.shape.note : shapeDoesNothingYet(ctx)),
      }) : null,

    sliderField('Size', p.size, (v) => set('size', v), {
      // The range follows the shape, because one slider that covers a party
      // balloon and a Space Shuttle has no useful precision at either end.
      min: 0.05,
      max: Math.max(4, Math.round(typicalFor(p.shapeId).size * 2)),
      step: Math.max(0.01, typicalFor(p.shapeId).size / 100),
      key: 'size',
      format: (v) => `${fmtFixed(v, 2)} m`,
      info: 'Changes the volume, the frontal area and how it sits on a surface — '
        + 'but not the mass, which is set directly above. So making it bigger '
        + 'makes it less dense.',
    }),

    /*
     * What the object actually is, in the numbers that follow from the two
     * controls above it. Density is the one worth having on screen from the
     * first step: it is the whole of floating and sinking later on, and it is
     * the first quantity in the app that is a *ratio* rather than a reading.
     */
    el('div', { class: 'dims' }, [
      el('dt', { text: 'Volume' }),
      el('dd', { text: `${object.volume.toPrecision(3)} m³` }),
      el('dt', { text: 'Density' }),
      el('dd', { text: `${fmtFixed(object.density, object.density < 10 ? 2 : 0)} kg/m³` }),
      el('dt', { text: 'Drag coefficient' }),
      el('dd', { text: `C_d ${object.cd}` }),
      el('dt', { text: 'Frontal area' }),
      el('dd', { text: `${object.area.toPrecision(3)} m²` }),
    ]),
    el('div', {
      class: 'field__hint',
      text: `${fmtFixed(object.mass, 3)} kg spread through ${object.volume.toPrecision(3)} m³ `
        + `is ${fmtFixed(object.density, object.density < 10 ? 2 : 0)} kg/m³ — `
        + densityComparison(object.density),
    }),

    // Drag is the only thing C_d·A is about, so it only appears once there is
    // something to be dragged through.
    f.has('fluid') && !ctx.space ? el('div', { class: 'field__hint', text: dragComparison(p.shapeId, p.size).text }) : null,

    /*
     * The material is no longer decorative. It supplies the density the button
     * below uses, and — from step eight — how bouncy this object is when
     * something hits it, which is half of every collision it takes part in.
     */
    selectField('Material',
      MATERIALS.map((m) => ({ value: m.id, label: `${m.label} — ${m.density} kg/m³, bounce ${m.bounce}` })),
      p.materialId, (v) => set('materialId', v), {
        key: 'materialId',
        hint: f.has('collide')
          ? `What it is made of. It decides how bouncy every collision this object `
            + `takes part in is — against another ${materialById(p.materialId).label.toLowerCase()} `
            + `object that is e ≈ ${fmtFixed(pairBounce(p.materialId, p.materialId), 2)} — and it `
            + 'supplies the density for the button below. The mass stays whatever you set it to.'
          : 'Supplies the density for the button below, and from the last step it '
            + 'also decides how bouncy this object is in a collision. The mass '
            + 'stays whatever you set it to.',
      }),
    buttonRow([
      button('Set the mass from this material', () => {
        // A quick way to get a believable mass: pick a density, keep the size.
        ctx.setMany({ mass: object.volume * materialById(p.materialId).density });
      }, { small: true, title: 'Mass = volume × density, at the current size' }),
    ]),
  ].filter(Boolean), { key: 'object' });
}

/**
 * What a density is *like*, because the number on its own means very little
 * until it has been stood next to something.
 */
function densityComparison(density) {
  const marks = [
    [0.5, 'lighter than air, so it would float away in a still room'],
    [50, 'about expanded polystyrene: almost all of it is empty space'],
    [200, 'in the range a car or a boat averages out at — mostly air inside'],
    [600, 'about the density of dry softwood, which floats'],
    [997, 'a little lighter than water, so it would just float'],
    [2000, 'heavier than water, so it sinks — about the range of brick or glass'],
    [5000, 'about the range of stone and light metals'],
    [12000, 'in the range of steel and lead'],
    [Infinity, 'denser than lead, which almost nothing solid is'],
  ];
  return (marks.find(([limit]) => density < limit) || marks[marks.length - 1])[1];
}

/**
 * Every pairing actually on the bench, and what each one is worth.
 *
 * A table rather than a number, because the whole point of taking bounciness
 * from the materials is that there is no longer *a* number — there is one per
 * pair, and seeing them side by side is what makes that concrete.
 */
function bouncePairs(ctx) {
  const { params: p } = ctx;
  const here = [
    { name: 'The object', materialId: p.materialId },
    ...(p.objects || []).map((o, i) => ({ name: `Object ${i + 2}`, materialId: o.materialId })),
  ];

  const rows = [];
  for (let i = 0; i < here.length; i += 1) {
    for (let j = i; j < here.length; j += 1) {
      const a = here[i];
      const b = here[j];
      rows.push({
        pair: i === j ? `${a.name} with another like it` : `${a.name} into ${b.name.toLowerCase()}`,
        materials: `${materialById(a.materialId).label.toLowerCase()} / ${materialById(b.materialId).label.toLowerCase()}`,
        e: fmtFixed(pairBounce(a.materialId, b.materialId), 2),
      });
    }
  }

  return el('div', {}, [
    table([
      { label: 'Which pair', key: 'pair' },
      { label: 'Materials', key: 'materials' },
      { label: 'e', key: 'e', num: true },
    ], rows.slice(0, 12)),
    rows.length > 12 ? el('div', { class: 'field__hint', text: `…and ${rows.length - 12} more pairings.` }) : null,
  ].filter(Boolean));
}

/** Is there anything at this step for the object's shape to act on? */
const shapeMattersHere = (ctx) =>
  (ctx.features.has('ground') && !ctx.space)
  || (ctx.features.has('fluid') && fluidById(ctx.params.fluidId).density > 0)
  || (ctx.features.has('obstacles') && (ctx.params.walls || []).length > 0);

/** What it is doing instead, said plainly rather than left to be guessed at. */
function shapeDoesNothingYet(ctx) {
  const f = ctx.features;
  // Deep space first: there is a planet in the feature list at those steps, but
  // there is no world in the scene and nothing to land on.
  if (ctx.space) {
    return 'In deep space there is no surface and no fluid, so the shape has '
      + 'nothing to act on — it only decides which way the object is drawn '
      + 'facing. Draw a wall and it will have something to meet.';
  }
  if (f.has('planet')) {
    return 'It decides how the object sits when it lands — a sphere touches at a '
      + 'point, a cube on a face — and how far its centre is above the surface. '
      + 'It does not change the fall: nothing about shape is in g = G·M/r².';
  }
  return 'Nothing here responds to it yet: with no surface to rest on and no '
    + 'fluid to push through, a shape has nothing to act on. It changes the '
    + 'picture, and the volume — so the density — and that is all. That is worth '
    + 'noticing rather than assuming; shape starts mattering at step five, and '
    + 'you can watch exactly when.';
}

function pushSection(ctx) {
  const { params: p, set } = ctx;
  const f = ctx.features;
  const accel = p.mass > 0 ? p.pushForce / p.mass : 0;
  const gained = accel * p.pushSeconds;

  /*
   * The slider is sized by what the object weighs, so `g` has to come from
   * somewhere even where there is no world yet.
   *
   * Steps one and two have no planet at all, and deep space has no weight, but
   * the control still needs a sensible reach — so those fall back to standard
   * gravity. That is a decision about how far a slider travels, not a claim
   * that anything weighs anything: nothing on the bench reads this.
   */
  const onWorld = f.has('planet') && !ctx.space;
  const g = onWorld
    ? describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId }).g
    : G_STANDARD;
  const range = pushRange(p.mass, g);

  return section('The push', [
    sliderField('How hard', p.pushForce, (v) => set('pushForce', v), {
      ...range, key: 'pushForce',
      format: (v) => `${fmtFixed(v, range.step < 1 ? 2 : 0)} N`,
      info: 'A force, in newtons. Divided by the mass it gives the acceleration — '
        + 'so the same push does less to a heavier object.',
      hint: `The slider reaches ${fmtFixed(range.max, range.max < 10 ? 1 : 0)} N — twenty times `
        + `what this object weighs${onWorld ? '' : ' on Earth'}, so the far end is twenty `
        + 'gravities of acceleration whatever is on the bench. Make it heavier and '
        + 'the slider grows with it. Push the other way with the angle below.',
    }),
    sliderField('Which way', p.pushAngleDeg, (v) => set('pushAngleDeg', v), {
      min: -180, max: 180, step: 5, key: 'pushAngleDeg',
      format: (v) => `${v}°`,
      hint: '0° is to the right, 90° straight up. Measured anticlockwise, as '
        + 'angles are everywhere in this app.',
    }),
    sliderField('For how long', p.pushSeconds, (v) => set('pushSeconds', v), {
      min: 0, max: 20, step: 0.25, key: 'pushSeconds',
      format: (v) => `${fmtFixed(v, 2)} s`,
      info: 'The push stops after this. What happens next is the interesting '
        + 'part: nothing is needed to keep the object moving.',
    }),
    el('div', {
      class: 'field__hint',
      text: `${fmtFixed(p.pushForce, 0)} N on ${fmtFixed(p.mass, 2)} kg gives `
        + `${fmtFixed(accel, 2)} m/s², held for ${fmtFixed(p.pushSeconds, 2)} s — so it `
        + `should leave the push doing ${fmtFixed(Math.abs(gained), 2)} m/s.`,
    }),
    numberField('Starting velocity', p.v0, (v) => set('v0', v), {
      unit: 'm/s', step: 0.5, min: -500, max: 500, key: 'v0',
    }),
  ], { key: 'push' });
}

function otherMassSection(ctx) {
  const { params: p, set } = ctx;
  const comparison = everydayComparison(p.mass, p.otherMass, Math.abs(p.otherX));

  return section('The second mass', [
    numberField('Mass', p.otherMass, (v) => set('otherMass', v), {
      unit: 'kg', min: 0.001, max: 1e30, step: 100, key: 'otherMass',
      info: 'Both masses appear in G·m₁·m₂/r², so doubling either one doubles the '
        + 'pull. Neither is "the one doing the pulling".',
    }),
    sliderField('Size', p.otherSize, (v) => set('otherSize', v), {
      min: 0.1, max: 6, step: 0.1, key: 'otherSize', format: (v) => `${fmtFixed(v, 1)} m`,
    }),
    sliderField('How far away', p.otherX, (v) => set('otherX', v), {
      min: 1, max: 40, step: 0.5, key: 'otherX',
      format: (v) => `${fmtFixed(v, 1)} m`,
      info: 'The pull falls off as the square of this. Twice as far apart is a '
        + 'quarter of the force.',
    }),
    el('div', { class: 'field__hint', text: comparison.text }),
    buttonRow([
      button('Make it a planet', () => ctx.growPlanet(), {
        small: true, primary: true,
        title: 'Same equation, a mass twenty-four orders of magnitude bigger — watch it grow',
      }),
    ]),
  ], { key: 'other' });
}

function worldSection(ctx) {
  const { params: p, set } = ctx;
  const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });

  const f = ctx.features;

  /*
   * On a world, or in deep space.
   *
   * The two go together and it matters that they do. There is no such thing as
   * a world with gravity and nothing to stand on, or a floor with nothing
   * holding you down to it, so the choice removes both at once — and what is
   * left is the cleanest possible view of a force acting on its own.
   */
  const where = f.has('space') ? selectField('Where the bench is',
    [
      { value: 'planet', label: 'On a world' },
      { value: 'space', label: 'Deep space — no floor, no gravity' },
    ],
    p.worldMode, (v) => set('worldMode', v), {
      key: 'worldMode',
      hint: p.worldMode === 'space'
        ? 'No field and no floor, so weight, the normal force and friction all '
          + 'go with them. Draw a wall if you want something to stand on. Note '
          + 'that this is not why astronauts float: they are in orbit, which is '
          + 'falling continuously, with plenty of gravity acting.'
        : 'Anything with an up and a down is drawn side-on here. Switch to space '
          + 'and the same objects are drawn from above.',
    }) : null;

  if (ctx.space) {
    return section('The world it is on', [where], { key: 'world' });
  }

  return section('The world it is on', [
    where,
    selectField('A real one', [...WORLDS.map((w) => ({ value: w.id, label: w.label })), { value: 'custom', label: 'Something of your own' }],
      p.planetId, (v) => {
        const found = WORLDS.find((w) => w.id === v);
        if (found) ctx.setMany({ planetId: v, planetMass: found.mass, planetRadius: found.radius });
        else set('planetId', 'custom');
      }, { key: 'planetId', hint: world.note }),

    numberField('Its mass', p.planetMass, (v) => ctx.setMany({ planetMass: v, planetId: 'custom' }), {
      unit: 'kg', min: 1e10, max: 1e35, step: 1e23, key: 'planetMass', decimals: 4,
      info: 'Half the mass, half the surface gravity — a straight proportion.',
    }),
    numberField('Its radius', p.planetRadius / 1000, (v) => ctx.setMany({ planetRadius: v * 1000, planetId: 'custom' }), {
      unit: 'km', min: 1, max: 1e9, step: 100, key: 'planetRadius',
      info: 'Half the radius, four times the surface gravity — it goes as 1/r².',
    }),

    el('div', { class: 'dims' }, [
      el('dt', { text: 'Surface gravity' }),
      el('dd', { text: `${fmtFixed(world.g, 3)} m/s²` }),
      el('dt', { text: 'Mean density' }),
      el('dd', { text: `${fmtFixed(world.density, 0)} kg/m³` }),
      el('dt', { text: 'Escape speed' }),
      el('dd', { text: `${(world.escapeSpeed / 1000).toPrecision(3)} km/s` }),
      el('dt', { text: 'Your object would weigh' }),
      el('dd', { text: `${fmtFixed(p.mass * world.g, 2)} N` }),
    ]),
    el('div', {
      class: 'field__hint',
      text: 'Nothing here is looked up. g = G·M/r², computed from the two numbers '
        + 'above — which is why a small dense world can out-pull a huge fluffy one.',
    }),

    /*
     * The tilt of the ground, and what tilting it does to the weight.
     *
     * This belongs with the world rather than in a panel of its own: the slope
     * is a fact about the ground you are standing on, in the same way its
     * gravity is, and reading "surface gravity" and "tilt" as two unrelated
     * settings in two places made the surface look like a separate object that
     * had arrived from somewhere. Only shown where there is a floor to tilt.
     */
    f.has('ground') && !ctx.space ? sliderField('Tilt', p.slopeDeg, (v) => set('slopeDeg', v), {
      min: -60, max: 60, step: 1, key: 'slopeDeg',
      format: (v) => `${v}°`,
      info: 'Tilt the ground and only part of the weight presses into it. The rest '
        + 'is left over along the slope, and that leftover is what makes things '
        + 'slide — which is why the normal force shrinks as the tilt grows.',
      hint: 'A positive angle rises to the right, so downhill is to the left.',
    }) : null,
    f.has('ground') && !ctx.space ? el('div', { class: 'dims' }, [
      el('dt', { text: 'Weight' }),
      el('dd', { text: `${fmtFixed(p.mass * world.g, 2)} N` }),
      el('dt', { text: 'Pressing into the surface' }),
      el('dd', { text: `${fmtFixed(p.mass * world.g * Math.cos((p.slopeDeg * Math.PI) / 180), 2)} N` }),
      el('dt', { text: 'Left over, along the slope' }),
      el('dd', { text: `${fmtFixed(Math.abs(p.mass * world.g * Math.sin((p.slopeDeg * Math.PI) / 180)), 2)} N` }),
    ]) : null,

    sliderField('Drop it from', p.dropHeight, (v) => set('dropHeight', v), {
      min: 0, max: 20, step: 0.1, key: 'dropHeight', format: (v) => `${fmtFixed(v, 1)} m up`,
      info: 'How far above the surface it is released. It only moves the object '
        + 'while the clock is at zero — once it is falling, where it started is '
        + 'no longer a description of where it is.',
      hint: 'Whatever you set here, it accelerates at the same rate: the object\'s '
        + 'own mass is not in g = G·M/r². Higher only means longer to watch.',
    }),
  ].filter(Boolean), { key: 'world' });
}

function surfaceSection(ctx) {
  const { params: p, set } = ctx;
  const f = ctx.features;
  const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });
  const rad = (p.slopeDeg * Math.PI) / 180;
  const weight = p.mass * world.g;

  return section('The surface', [
    /*
     * A named pair of surfaces, not just two numbers.
     *
     * A slider from 0 to 2 will happily sit at 1.7, and nothing on the bench
     * said that no ordinary pair of dry solids does that. Picking "steel on
     * ice" and reading 0.03, then "tyre on dry asphalt" and reading 0.9, is
     * what puts a range around the number. The sliders stay underneath, because
     * "what would 1.7 do?" is a fair question — it is just no longer the only
     * way in.
     */
    f.has('friction') ? selectField('What is rubbing on what',
      [...SURFACES.map((x) => ({ value: x.id, label: `${x.label} — μs ${x.muS}` })),
        { value: 'custom', label: 'A value of my own' }],
      matchSurface(p.muS, p.muK)?.id ?? 'custom',
      (v) => {
        const pair = surfaceById(v);
        if (pair) ctx.setMany({ muS: pair.muS, muK: pair.muK });
      },
      { key: 'surfacePair', hint: describeSurface(matchSurface(p.muS, p.muK)) }) : null,

    f.has('friction') ? sliderField('Static friction μs', p.muS, (v) => set('muS', v), {
      min: 0, max: 2, step: 0.01, key: 'muS',
      format: (v) => fmtFixed(v, 2),
      info: 'The most friction can resist before it lets go, as a multiple of the '
        + 'normal force. It is a ratio of two forces, not a percentage — nothing '
        + 'caps it at 1, and a warm racing slick is about 1.4.',
    }) : null,
    f.has('friction') ? sliderField('Kinetic friction μk', p.muK, (v) => set('muK', Math.min(v, p.muS)), {
      min: 0, max: 2, step: 0.01, key: 'muK',
      format: (v) => fmtFixed(v, 2),
      hint: `Cannot exceed μs — that is what the two words mean. The drop from `
        + `${fmtFixed(p.muS, 2)} to ${fmtFixed(p.muK, 2)} is why a stuck object lurches when it moves.`,
    }) : null,
    f.has('friction') ? el('div', { class: 'dims' }, [
      el('dt', { text: 'This object' }),
      el('dd', { text: contactKind(p.shapeId).label }),
      el('dt', { text: 'Slides at' }),
      el('dd', { text: `${fmtFixed(slipAngle(p.muS), 1)}° of tilt` }),
      el('dt', { text: 'Could brake at' }),
      el('dd', { text: `${fmtFixed(brakingG(p.muK), 2)} g` }),
      el('dt', { text: 'If it rolls instead' }),
      el('dd', { text: `C_rr ${rollingFor(matchSurface(p.muS, p.muK))}` }),
    ]) : null,
    f.has('friction') ? el('div', { class: 'field__hint', text: contactKind(p.shapeId).note }) : null,
    f.has('friction') ? el('div', {
      class: 'field__hint',
      text: 'The slip angle is not a derived curiosity — tan θ = μs is how μs is '
        + 'actually measured, with a plank and a protractor. Every figure in the '
        + 'list is indicative: published values for the same pair differ by more '
        + 'than a factor of two with finish, cleanliness and temperature.',
    }) : null,
  ].filter(Boolean), { key: 'surface' });
}

function fluidSection(ctx, object) {
  const { params: p, set } = ctx;
  const table = FLUIDS.find((x) => x.id === p.fluidId) || FLUIDS[0];
  const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });

  /*
   * The atmosphere is the one fluid whose numbers are not a property of the
   * fluid but of where you are standing in it, so every figure below has to be
   * read at the object's own height rather than off the table.
   */
  const up = elevation(ctx.world, ctx.selectedId) ?? 0;
  const here = table.profile === 'isa' ? atmosphereAt(up) : null;
  const fluid = here
    ? { ...table, density: here.density, viscosity: here.viscosity }
    : table;
  /*
   * Terminal speed is where drag balances the *buoyant* weight, not mg.
   *
   * For anything close to the density of the fluid that is a large correction,
   * and for anything less dense than the fluid there is no downward terminal
   * speed at all — it goes up. Using mg here would print a confident number for
   * how fast a balloon sinks.
   */
  const effectiveMass = p.mass - fluid.density * object.volume;
  const vt = effectiveMass > 0 ? terminalSpeed({
    mass: effectiveMass, g: world.g, density: fluid.density, viscosity: fluid.viscosity,
    diameter: p.size, area: object.area, cdShape: object.cd,
  }) : NaN;
  const rise = effectiveMass < 0 ? terminalSpeed({
    mass: -effectiveMass, g: world.g, density: fluid.density, viscosity: fluid.viscosity,
    diameter: p.size, area: object.area, cdShape: object.cd,
  }) : NaN;

  return section('The fluid it moves through', [
    selectField('Fluid', FLUIDS.map((x) => ({ value: x.id, label: x.label })), p.fluidId, (v) => set('fluidId', v), {
      key: 'fluidId', hint: fluid.note,
    }),
    here ? el('div', { class: 'field__hint' }, [
      el('strong', { text: `${fmtLength(up)} up: ` }),
      el('span', {
        text: `${fmtFixed(here.density, 4)} kg/m³, ${fmtFixed(here.temperature - 273.15, 1)} °C, `
          + `${fmtFixed(here.pressure / 1000, 1)} kPa — `
          + `${fmtFixed((here.density / 1.225) * 100, 0)}% of the density at sea level.`,
      }),
    ]) : null,
    el('div', { class: 'dims' }, [
      el('dt', { text: here ? 'Density here' : 'Density' }),
      el('dd', { text: `${here ? fmtFixed(here.density, 4) : fluid.density} kg/m³` }),
      el('dt', { text: here ? 'Viscosity here' : 'Viscosity' }),
      el('dd', { text: `${here ? here.viscosity.toExponential(3) : fluid.viscosity} Pa·s` }),
      el('dt', { text: 'Buoyant force' }),
      el('dd', { text: `${fmtFixed(fluid.density * object.volume * world.g, 3)} N up` }),
      el('dt', { text: Number.isFinite(rise) ? 'Steady rising speed' : 'Terminal speed' }),
      el('dd', {
        text: Number.isFinite(rise) ? `${fmtFixed(rise, 2)} m/s upward`
          : (Number.isFinite(vt) ? `${fmtFixed(vt, 2)} m/s` : 'none'),
      }),
    ]),
    fluid.density > 0 ? el('div', { class: 'field__hint', text: floats(object.density, fluid.density).text }) : null,
    fluid.density > 0 ? el('div', {
      class: 'field__hint',
      text: `The fluid holds up ${fmtFixed(fluid.density * object.volume, 3)} kg of the `
        + `${fmtFixed(p.mass, 3)} kg — that is why the same stone is easier to lift underwater, `
        + 'and it is why a balloon goes the other way entirely.',
    }) : null,
  ].filter(Boolean), { key: 'fluid' });
}

/**
 * Every object after the first.
 *
 * A list rather than a fixed pair, because "what happens with twenty of these"
 * is a question worth being able to ask, and because the interesting collisions
 * are the ones you did not plan. Selecting a row opens the full editor for that
 * object below it — twenty expanded editors would be a scroll bar, not a panel.
 */
function objectsSection(ctx) {
  const { params: p, state } = ctx;
  const extras = p.objects || [];
  const selected = extras.find((o) => o.id === state.selectedId) || null;

  const rows = extras.map((o, i) => {
    const described = describeObject({ shapeId: o.shapeId, size: o.size, mass: o.mass });
    return el('div', {
      class: `object-row${state.selectedId === o.id ? ' is-selected' : ''}`,
    }, [
      el('span', { class: 'object-row__swatch', style: { background: `var(--body-${(i % 3) + 1})` } }),
      el('button', {
        class: 'link-btn object-row__name', type: 'button',
        'data-field': `object:${o.id}`,
        on: { click: () => ctx.selectBody(o.id) },
      }, [
        el('span', { text: `Object ${i + 2} · ${shapeLabel(o.shapeId)}` }),
        el('span', {
          class: 'object-row__meta',
          text: `${fmtFixed(o.mass, 2)} kg · ${fmtFixed(o.size, 2)} m · ${fmtFixed(described.density, 0)} kg/m³`,
        }),
      ]),
      button('Remove', () => ctx.removeObject(o.id), { small: true, title: 'Take this object off the bench' }),
    ]);
  });

  const editor = selected ? el('div', { class: 'object-edit' }, [
    numberField('Mass', selected.mass, (v) => ctx.setObject(selected.id, { mass: v }), {
      unit: 'kg', min: 0.001, max: 1e6, step: 0.5, key: `o:mass:${selected.id}`,
    }),
    selectField('Shape', SHAPES.map((x) => ({ value: x.id, label: `${x.label} — C_d ${x.cd}` })), selected.shapeId,
      (v) => {
        const t = typicalFor(v);
        ctx.setObject(selected.id, { shapeId: v, size: t.size, mass: t.mass });
      }, { key: `o:shape:${selected.id}`, hint: `Sets it to ${typicalFor(selected.shapeId).of}.` }),
    selectField('Material',
      MATERIALS.map((x) => ({ value: x.id, label: `${x.label} — bounce ${x.bounce}` })),
      selected.materialId, (v) => ctx.setObject(selected.id, { materialId: v }), {
        key: `o:material:${selected.id}`,
        hint: describeBounce(p.materialId, selected.materialId),
      }),
    sliderField('Size', selected.size, (v) => ctx.setObject(selected.id, { size: v }), {
      min: 0.05, max: 4, step: 0.05, key: `o:size:${selected.id}`, format: (v) => `${fmtFixed(v, 2)} m`,
    }),
    sliderField('Starts at', selected.x, (v) => ctx.setObject(selected.id, { x: v }), {
      min: -40, max: 40, step: 0.5, key: `o:x:${selected.id}`, format: (v) => `${fmtFixed(v, 1)} m along`,
    }),
    sliderField(ctx.space ? 'Height' : 'Above the surface', selected.y, (v) => ctx.setObject(selected.id, { y: v }), {
      min: ctx.space ? -20 : 0, max: 20, step: 0.25, key: `o:y:${selected.id}`, format: (v) => `${fmtFixed(v, 2)} m`,
    }),
    sliderField('Moving at', selected.vx, (v) => ctx.setObject(selected.id, { vx: v }), {
      min: -50, max: 50, step: 0.5, key: `o:vx:${selected.id}`, format: (v) => `${fmtFixed(v, 1)} m/s across`,
    }),
    sliderField('And upward', selected.vy, (v) => ctx.setObject(selected.id, { vy: v }), {
      min: -50, max: 50, step: 0.5, key: `o:vy:${selected.id}`, format: (v) => `${fmtFixed(v, 1)} m/s up`,
    }),
    el('div', {
      class: 'field__hint',
      text: 'Starting position and velocity apply while the clock is at zero. Once '
        + 'it is running they are no longer a description of anything on screen, so '
        + 'they wait for the next reset — everything else takes effect immediately.',
    }),
  ]) : null;

  return section(`Other objects (${extras.length} of ${MAX_OBJECTS - 1})`, [
    el('div', { class: 'objects' }, rows.length ? rows : [el('p', { class: 'muted', text: 'Nothing else on the bench yet.' })]),
    buttonRow([
      button('Add an object', () => ctx.addObject(), {
        small: true, primary: true,
        title: extras.length >= MAX_OBJECTS - 1 ? 'The bench is full' : 'Put another object on the bench',
      }),
      extras.length ? button('Clear them all', () => ctx.clearObjects(), { small: true }) : null,
    ].filter(Boolean)),
    editor,
  ].filter(Boolean), { key: 'objects' });
}

const shapeLabel = (id) => (SHAPES.find((x) => x.id === id) || SHAPES[0]).label;

/**
 * Whether things bounce off each other, and how hard.
 *
 * Its own section rather than a line at the bottom of the object list, because
 * it applies to everything on the bench — a cannon shot hitting the one object
 * that was already there involves no "other objects" at all, and a reader
 * looking for it after firing one had no reason to open a panel headed
 * "Other objects (0 of 19)".
 */
function collisionSection(ctx) {
  const { params: p } = ctx;
  const forced = collisionsForced(ctx.features);

  return section('Collisions', [
    toggleField('Objects bounce off each other', collisionsOn(p, ctx.features), (v) => ctx.set('collisions', v), {
      key: 'collisions',
      hint: forced
        ? 'Held on at this step, and not as a preference: gravity goes as 1/r², '
          + 'which has no limit at zero separation. Two bodies that can pass '
          + 'through each other find that singularity and one of them leaves at a '
          + 'fraction of the speed of light.'
        : 'Everything on the bench, and everything the cannons fire. Switch it '
          + 'off and they all pass straight through each other — nothing about '
          + 'gravity, drag or friction changes, only contact stops happening.',
      info: 'Applies to every pair on the bench, cannon shots included.',
    }),

    /*
     * Where bounciness comes from.
     *
     * A coefficient of restitution has never been a property of one object: a
     * rubber ball on concrete and the same ball on modelling clay are different
     * collisions, and neither number is something the ball carries about with
     * it. So the default is to take it from the two materials that actually
     * meet — which makes A into B genuinely different from A into C.
     */
    selectField('Bounciness comes from', [
      { value: 'material', label: "Each object's own material" },
      { value: 'fixed', label: 'One value for the whole bench' },
    ], p.bounceMode, (v) => ctx.set('bounceMode', v), {
      key: 'bounceMode',
      hint: p.bounceMode === 'fixed'
        ? 'One number for every impact, whatever is hitting what. Simpler, and a '
          + 'fair way to ask what a given e does — but it is not how restitution '
          + 'works: it belongs to the pair, not to the scene.'
        : 'Each impact uses the two objects that are meeting, as √(e₁·e₂). Pair '
          + 'anything with modelling clay and the collision is dead, because a '
          + 'near-zero factor dominates the product however lively the other side '
          + 'is — which is how a superball dropped into putty behaves.',
    }),

    p.bounceMode === 'fixed' ? sliderField('Bounciness e', p.restitution, (v) => ctx.set('restitution', v), {
      min: 0, max: 1, step: 0.05, key: 'restitution',
      format: (v) => `e = ${fmtFixed(v, 2)}`,
      info: 'Separation speed divided by approach speed, shared by everything on '
        + 'the bench. e = 1 conserves kinetic energy as well as momentum; e = 0 '
        + 'means they move off together.',
    }) : bouncePairs(ctx),

    el('div', {
      class: 'field__hint',
      text: p.bounceMode === 'fixed'
        ? (p.restitution >= 0.999
          ? 'Perfectly elastic: kinetic energy comes out exactly as it went in. '
            + 'Almost nothing real is, which is why the energy graph normally has a '
            + 'step in it and the momentum graph does not.'
          : `At e = ${fmtFixed(p.restitution, 2)} an impact keeps `
            + `${fmtFixed(p.restitution ** 2 * 100, 0)}% of the kinetic energy along the line of `
            + 'the collision. All of the momentum survives either way — that is the '
            + 'difference the two graphs are there to show.')
        : 'Whatever the pairing, all of the momentum survives and only the kinetic '
          + 'energy is at stake. That is the difference the two graphs are there '
          + 'to show, and it does not depend on what anything is made of.',
    }),
  ], { key: 'collisions' });
}

/**
 * Drawn obstacles.
 *
 * Drawing is armed rather than modal: the button turns the canvas into a
 * drawing surface until you turn it off again, so several walls can be drawn
 * without going back to the sidebar between each one.
 */
function wallsSection(ctx) {
  const { params: p, state } = ctx;
  const walls = p.walls || [];
  const armed = state.ui.tool === 'wall';

  return section(`Walls and obstacles (${walls.length})`, [
    buttonRow([
      el('button', {
        class: `btn btn-sm${armed ? ' is-armed' : ''}`, type: 'button',
        'data-field': 'tool:wall',
        title: 'Drag on the drawing to lay down a wall',
        on: { click: () => ctx.setTool(armed ? 'none' : 'wall') },
      }, armed ? 'Drawing — click to stop' : 'Draw a wall'),
      el('button', {
        class: `btn btn-sm${state.ui.tool === 'arc' ? ' is-armed' : ''}`,
        type: 'button',
        'data-field': 'tool:arc',
        title: 'Drag on the drawing to lay down a curved wall',
        on: { click: () => ctx.setTool(state.ui.tool === 'arc' ? 'none' : 'arc') },
      }, state.ui.tool === 'arc' ? 'Drawing — click to stop' : 'Draw an arc'),
      button('Add a box', () => ctx.addBox(), { small: true, title: 'Four walls around what is on the bench' }),
      walls.length ? button('Clear', () => ctx.clearWalls(), { small: true }) : null,
    ].filter(Boolean)),

    el('div', {
      class: 'field__hint',
      text: armed || state.ui.tool === 'arc'
        ? 'Drag across the drawing, end to end. An object rests on it exactly as '
          + 'it rests on the ground, and rolls off the end of it. An arc arrives '
          + 'already bowed — use the curve slider on it to open it out, flatten '
          + 'it, or bend it the other way.'
        : `Up to ${MAX_WALLS}. Each one behaves like the ground: same normal force, `
          + 'same friction, same settling. Curve is how far the middle bows off '
          + 'straight, so zero is a straight wall and there is no separate kind '
          + 'of thing to choose between.',
    }),

    /*
     * One row per wall: what it is, how much it bows, and a way to be rid of it.
     *
     * The curve slider is here rather than behind a per-wall panel because
     * bending a ramp is something you do while watching what runs down it, and
     * it spans both signs — dragging through zero flattens the wall and out the
     * other side without ever leaving the control.
     */
    walls.length ? el('div', { class: 'wall-list' }, walls.map((w, i) => {
      const span = Math.max(0.2, wallLength(w));
      return el('span', { class: 'wall-chip' }, [
        el('span', {
          text: isCurved(w)
            ? `${fmtFixed(arcLength(w), 2)} m curved`
            : `${fmtFixed(wallLength(w), 2)} m at ${fmtFixed(wallAngle(w), 0)}°`,
        }),
        el('input', {
          class: 'wall-chip__curve',
          type: 'range',
          // Bounded by the wall's own span: a bulge of one span is already most
          // of a circle, and anything past that is a loop with its ends buried.
          min: -span, max: span, step: span / 100,
          value: w.bulge || 0,
          'aria-label': `Curve of wall ${i + 1}`,
          title: 'How far the middle bows off straight. Centre is a straight wall.',
          'data-field': `wall:curve:${i}`,
          on: { input: (event) => ctx.setWall(i, { bulge: Number(event.target.value) }) },
        }),
        el('button', {
          class: 'link-btn', type: 'button', title: 'Remove this wall',
          'data-field': `wall:${i}`,
          on: { click: () => ctx.removeWall(i) },
        }, '×'),
      ]);
    })) : null,
  ].filter(Boolean), { key: 'walls' });
}

/**
 * Cannons.
 *
 * A cannon gives an object a velocity and then has nothing more to do with it,
 * which is the same lesson as the timed push one step earlier: whatever happens
 * afterwards is gravity, drag and walls, never a memory of having been fired.
 */
function cannonsSection(ctx) {
  const { params: p, state } = ctx;
  const cannons = p.cannons || [];

  const editors = cannons.map((c, i) => el('div', { class: 'object-edit' }, [
    el('div', { class: 'object-row' }, [
      el('span', { class: 'object-row__swatch', style: { background: 'var(--cannon)' } }),
      el('span', { class: 'object-row__name' }, [
        el('span', { text: `Cannon ${i + 1}` }),
        el('span', {
          class: 'object-row__meta',
          text: `${fmtFixed(c.speed, 1)} m/s at ${fmtFixed(c.angleDeg, 0)}°, `
            + (c.everySeconds > 0 ? `every ${fmtFixed(c.everySeconds, 2)} s` : 'one shot'),
        }),
      ]),
      button('Remove', () => ctx.removeCannon(i), { small: true }),
    ]),
    sliderField('Muzzle speed', c.speed, (v) => ctx.setCannon(i, { speed: v }), {
      min: 0, max: 60, step: 0.5, key: `c:speed:${i}`, format: (v) => `${fmtFixed(v, 1)} m/s`,
      info: 'An initial velocity, and nothing more. No force acts once the shot '
        + 'has left the barrel.',
    }),
    sliderField('Angle', c.angleDeg, (v) => ctx.setCannon(i, { angleDeg: v }), {
      min: -180, max: 180, step: 5, key: `c:angle:${i}`, format: (v) => `${v}°`,
    }),
    sliderField('Fires every', c.everySeconds, (v) => ctx.setCannon(i, { everySeconds: v }), {
      min: 0, max: 10, step: 0.25, key: `c:every:${i}`,
      // The readout beside a slider is a field eleven characters wide, so this
      // is the short version; the section's own hint carries the long one.
      format: (v) => (v > 0 ? `every ${fmtFixed(v, 2)} s` : 'one shot'),
    }),
    /*
     * Everything about the projectile itself, folded away.
     *
     * The split is between aiming a cannon and loading it. Where it stands,
     * which way it points, how fast and how often it fires are what a reader
     * reaches for again and again; what the shot is made of and how it behaves
     * once it lands are set once and then left. Seven controls of the second
     * kind in the middle of the panel pushed the position sliders below the
     * fold, which is the wrong way round.
     */
    subsection('Advanced — projectile properties', [
      numberField('Shot mass', c.mass, (v) => ctx.setCannon(i, { mass: v }), {
        unit: 'kg', min: 0.001, max: 1000, step: 0.1, key: `c:mass:${i}`,
      }),
      sliderField('Shot size', c.size, (v) => ctx.setCannon(i, { size: v }), {
        min: 0.02, max: 2, step: 0.02, key: `c:size:${i}`, format: (v) => `${fmtFixed(v, 2)} m`,
      }),
      selectField('Shot shape', SHAPES.map((x) => ({ value: x.id, label: x.label })), c.shapeId,
        (v) => ctx.setCannon(i, { shapeId: v }), { key: `c:shape:${i}` }),
      selectField('Shot material',
        MATERIALS.map((x) => ({ value: x.id, label: `${x.label} — bounce ${x.bounce}` })),
        c.materialId, (v) => ctx.setCannon(i, { materialId: v }), {
          key: `c:material:${i}`,
          hint: describeBounce(ctx.params.materialId, c.materialId),
        }),
      el('div', { class: 'grid-2' }, [
        sliderField('Shot grip μs', c.muS ?? 2, (v) => ctx.setCannon(i, { muS: v }), {
          min: 0, max: 5, step: 0.05, key: `c:muS:${i}`, format: (v) => fmtFixed(v, 2),
          info: 'How hard its shots grip what they land on. Shots carry their own '
            + 'friction rather than the one set for the bench, because a shot is not the '
            + 'experiment — it is what you fire at the experiment.',
        }),
        sliderField('Shot slide μk', Math.min(c.muK ?? 1.5, c.muS ?? 2),
          (v) => ctx.setCannon(i, { muK: Math.min(v, c.muS ?? 2) }), {
            min: 0, max: 5, step: 0.05, key: `c:muK:${i}`, format: (v) => fmtFixed(v, 2),
            info: 'Once it is sliding. Never more than the static value above — '
              + 'that is what the two words mean.',
          }),
      ]),
      sliderField('Shot roll drag', c.rolling ?? 0.25, (v) => ctx.setCannon(i, { rolling: v }), {
        min: 0, max: 2, step: 0.01, key: `c:rolling:${i}`, format: (v) => `C_rr ${fmtFixed(v, 2)}`,
        info: 'What stops a round shot. A ball rolls rather than slides, so the two '
          + 'grip sliders above do nothing to it — rolling resistance is a different '
          + 'mechanism, and normally a hundred times weaker, which is why a fired '
          + 'ball otherwise crosses the bench and keeps going.',
        hint: 'Set this to zero and a round shot rolls until something stops it. '
          + 'The grip sliders act on shots that slide: a cube, a plate, a car.',
      }),
    ], { key: `c:advanced:${i}` }),

    el('div', { class: 'grid-2' }, [
      sliderField('At x', c.x, (v) => ctx.setCannon(i, { x: v }), {
        min: -40, max: 40, step: 0.5, key: `c:x:${i}`, format: (v) => `${fmtFixed(v, 1)} m`,
      }),
      sliderField('At y', c.y, (v) => ctx.setCannon(i, { y: v }), {
        min: -20, max: 40, step: 0.25, key: `c:y:${i}`, format: (v) => `${fmtFixed(v, 2)} m`,
      }),
    ]),
  ]));

  return section(`Cannons (${cannons.length})`, [
    buttonRow([
      button('Add a cannon', () => ctx.addCannon(), {
        small: true, primary: true,
        title: cannons.length >= MAX_CANNONS ? 'That is as many as the bench takes' : 'Fires objects into the scene',
      }),
      cannons.length ? button('Clear', () => ctx.clearCannons(), { small: true }) : null,
    ].filter(Boolean)),
    el('div', {
      class: 'field__hint',
      text: `The bench holds ${MAX_OBJECTS} objects in total, cannon shots included. `
        + 'When it is full the cannons stop firing and say so rather than quietly '
        + 'dropping shots.',
    }),
    ...editors,
  ], { key: 'cannons', open: cannons.length > 0 });
}

/**
 * Driving one of the objects by hand.
 *
 * Both modes produce a force, which joins the same vector sum as weight and
 * friction, gets its own arrow, and has its work booked on the same ledger.
 * Moving the object directly instead would give it infinite acceleration and no
 * momentum history, and every arrow around it would then be describing a motion
 * that F = ma had no part in.
 */
function controlSection(ctx) {
  const { params: p, world } = ctx;
  const control = p.control || { mode: 'none', targetId: 'main', strength: 15 };
  const mode = modeById(control.mode);
  const bodies = world.bodies.filter((b) => !b.fixed && b.kind !== 'planet');

  return section('Take the controls', [
    selectField('Connect the object to', CONTROL_MODES.map((m) => ({ value: m.id, label: m.label })),
      control.mode, (v) => ctx.setControl({ mode: v }), { key: 'control:mode', hint: mode.note }),

    control.mode !== 'none' ? selectField('Which object',
      bodies.map((b) => ({ value: b.id, label: b.id === 'main' ? 'The main object' : `${b.id} · ${fmtFixed(b.mass, 2)} kg` })),
      control.targetId, (v) => ctx.setControl({ targetId: v }), { key: 'control:target' }) : null,

    control.mode !== 'none' ? sliderField('Strength', control.strength, (v) => ctx.setControl({ strength: v }), {
      min: 0, max: 120, step: 1, key: 'control:strength',
      format: (v) => `${fmtFixed(v, 0)} m/s² of engine`,
      info: 'Set per kilogram, so a car and a marble handle the same. The force '
        + 'that produces is mass × this, and it is shown as an arrow like any '
        + 'other force.',
    }) : null,

    control.mode === 'keyboard' ? el('div', {
      class: 'field__hint',
      text: 'Click the drawing to select it — until you do, the arrow keys scroll '
        + 'the page, which is what they should do. Once it is selected they steer '
        + 'instead, and Escape hands them back. There is no brake: letting go '
        + 'removes the force, and only friction, drag or a wall will slow it '
        + 'down. Draw a ramp and a floor, make the object a car, and drive over '
        + 'them.',
    }) : null,

    control.mode === 'mouse' ? el('div', {
      class: 'field__hint',
      text: 'An arrow shows where the pointer is from the object. Press and hold '
        + 'anywhere on the drawing to thrust along it, for exactly as long as you '
        + 'hold. Nothing is applied while you are only pointing, and letting go '
        + 'is not a brake — whatever velocity it has reached, it keeps.',
    }) : null,
  ].filter(Boolean), { key: 'control', open: control.mode !== 'none' });
}

function viewSection(ctx) {
  const { state, setView } = ctx;
  const cam = state.view.camera;
  const span = cam.mode === 'manual' ? cam.span : (ctx.autoSpan ?? null);

  return section('The drawing', [
    /*
     * Zoom and pan, because the automatic framing is right until it is not.
     * A shot arcing away or a planet arriving pulls the view out until the
     * thing being watched is a speck, and before this there was no way back
     * short of resetting the experiment.
     *
     * Home does not mean "fit once" — it hands the framing back to the scene,
     * so it goes on following whatever happens next.
     */
    /*
     * Zoom, pan and Home live above the drawing now, beside the arrow filters,
     * because they are things you reach for while looking at it. What stays
     * here is the one that is not: going back to framing the whole bench, which
     * is a decision about the experiment rather than a nudge to the view.
     */
    el('div', { class: 'tool-row' }, [
      button('Fit everything', () => ctx.fitAll(), {
        small: true, primary: cam.mode !== 'auto',
        title: 'Frame the whole bench again, and keep re-framing as it moves',
      }),
    ]),
    el('div', {
      class: 'field__hint',
      text: cam.mode === 'manual'
        ? `Held at ${fmtFixed(cam.span, cam.span < 10 ? 2 : 0)} m across, centred on `
          + `(${fmtFixed(cam.cx, 1)}, ${fmtFixed(cam.cy, 1)}). It will stay there while things `
          + 'move — press Home to centre on the object at this zoom.'
        : cam.mode === 'follow'
          ? `Following the object at ${fmtFixed(cam.span, cam.span < 10 ? 2 : 0)} m across. `
            + 'The zoom is yours and stays put; the centre keeps up with it.'
          : 'Following the scene: the view widens and narrows to hold whatever is on '
            + 'the bench. Zoom or pan and it will hold still instead.',
    }),

    selectField('Grid spacing', [
      { value: 'auto', label: 'Automatic — always readable' },
      // Down to a millimetre, because a twelve-centimetre robot on a
      // metre-spaced grid has no grid on it at all.
      ...[0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]
        .map((v) => ({ value: String(v), label: fmtLength(v) })),
    ], String(state.view.grid), (v) => ctx.setGrid(v === 'auto' ? 'auto' : Number(v)), {
      key: 'view:gridsize',
      hint: state.view.grid === 'auto'
        ? 'Chosen to keep the lines 40 to 120 pixels apart at any zoom, which is '
          + 'right for reading a distance off and wrong for comparing two runs at '
          + 'different scales — fix it to a number for that.'
        : `Fixed at ${fmtLength(state.view.grid)}, so the same distance looks the same at any `
          + 'zoom. Zoom far enough out and the lines will be too dense to read.',
    }),

    toggleField('Numbers on the arrows', state.view.showValues, (v) => setView('showValues', v), { key: 'view:values' }),
    toggleField('Trail', state.view.showTrail, (v) => setView('showTrail', v), { key: 'view:trail' }),
    toggleField('Metre grid', state.view.showGrid, (v) => setView('showGrid', v), { key: 'view:grid' }),
    toggleField('Graphs', state.view.graphs, (v) => setView('graphs', v), { key: 'view:graphs' }),

    /*
     * What goes on paper, which is the same thing as what goes into a PDF: a
     * browser treats "save as PDF" as a printer. Nothing here is a second
     * renderer — the page already knows how to lay itself out on paper, and a
     * separate PDF writer would be one more thing to keep in step with it.
     */
    el('div', { class: 'print-choices' }, [
      el('div', { class: 'field__label', text: 'What to print or save as PDF' }),
      ...PRINT_PARTS.map((part) => toggleField(PRINT_LABEL[part], state.view.print[part],
        (v) => ctx.setPrint(part, v), { key: `print:${part}` })),
      el('div', {
        class: 'field__hint',
        text: 'Use Print / PDF at the bottom of the page. In the dialog, choose '
          + '"Save as PDF" as the destination. The inputs are written out as '
          + 'values on the sheet — a result without the settings that produced '
          + 'it is not something anyone can check or repeat.',
      }),
    ]),
  ], { key: 'view', open: false });
}

const PRINT_LABEL = {
  drawing: 'The drawing',
  inputs: 'What was set — every input',
  measurements: 'What it is doing — the measurements',
  graphs: 'The graphs',
  working: 'The working and the assumptions',
};

/* ---------------------------------------------------------- the readouts -- */

/**
 * The headline numbers.
 *
 * Momentum and kinetic energy appear the moment anything can move and stay for
 * the rest of the bench. They are not a later topic — they are two more ways of
 * describing what is already on screen, and hiding them until a "momentum
 * chapter" is what makes them feel like one.
 */
export function readouts(ctx) {
  const f = ctx.features;
  const main = inspect(ctx.world, 'main');
  if (!main) return [];
  const sums = totals(ctx.world);
  const tiles = [];

  tiles.push(stat('Mass', `${fmtFixed(main.mass, main.mass < 10 ? 2 : 0)} kg`, {
    note: 'Unchanged by anything that happens to it',
  }));

  if (f.has('applied') || f.has('mutual-gravity')) {
    tiles.push(stat('Velocity', `${fmtFixed(main.speed, 2)} m/s`, {
      swatch: '--vec-velocity',
      note: fmtDirectionWords(main.vel, { still: 'not moving' }),
    }));
    tiles.push(stat('Acceleration', `${fmtFixed(len(main.acceleration), 2)} m/s²`, {
      swatch: '--vec-acceleration',
      note: fmtDirectionWords(main.acceleration, { still: 'none' }),
    }));
    tiles.push(stat('Net force', `${fmtFixed(main.net.magnitude, 2)} N`, {
      swatch: '--force-net',
      note: main.net.magnitude < 1e-9 ? 'The forces cancel' : fmtDirectionWords(main.net.vec),
    }));
    // Momentum and energy, from here to the end of the bench.
    tiles.push(stat('Momentum', `${fmtFixed(len(main.momentum), 2)} kg·m/s`, {
      swatch: '--vec-momentum',
      note: 'p = m·v',
    }));
    tiles.push(stat('Kinetic energy', `${fmtFixed(main.kinetic, 2)} J`, {
      swatch: '--vec-velocity',
      note: '½·m·v² — no direction',
    }));
  }

  if (f.has('ground')) {
    tiles.push(stat('Height', `${fmtFixed(main.heightAboveGround, 2)} m`, {}));
    tiles.push(stat('Potential energy', `${fmtFixed(sums.potential, 2)} J`, {
      swatch: '--force-weight',
      note: 'm·g·h from the ground',
    }));
  }

  const buoyancy = main.forces.find((x) => x.id === 'buoyancy');
  if (buoyancy && buoyancy.magnitude > 1e-9) {
    // A share of the weight while it is a share of it, and a multiple once it
    // is more — "72358% of its weight" is arithmetically right and unreadable.
    const share = buoyancy.magnitude / Math.max(1e-9, main.weight);
    tiles.push(stat('Buoyancy', `${fmtFixed(buoyancy.magnitude, 3)} N`, {
      swatch: '--force-buoyancy',
      note: share > 1.5
        ? `${fmtFixed(share, share < 100 ? 1 : 0)}× its weight — so it rises`
        : `Holds up ${fmtFixed(share * 100, 0)}% of its weight`,
    }));
  }

  const driving = main.forces.find((x) => x.id === 'control');
  if (driving && driving.magnitude > 1e-9) {
    tiles.push(stat('Your control', `${fmtFixed(driving.magnitude, 2)} N`, {
      swatch: '--force-control',
      note: fmtDirectionWords(driving.vec),
    }));
  }

  if (f.has('friction') || f.has('fluid')) {
    tiles.push(stat('Gone to heat', `${fmtFixed(sums.elsewhere.heat + sums.elsewhere.impact, 2)} J`, {
      swatch: '--force-friction',
      note: 'Left the mechanical account — not the universe',
    }));
  }

  if (f.has('collide') || f.has('second-mass')) {
    tiles.push(stat('Total momentum', `${fmtFixed(sums.momentumX, 3)} kg·m/s`, {
      swatch: '--vec-momentum',
      accent: true,
      note: 'The whole system. Watch it through the impact.',
    }));
  }

  if (Math.abs(sums.supplied) > 1e-9) {
    tiles.push(stat('Put in from outside', `${fmtFixed(sums.supplied, 2)} J`, {
      swatch: '--force-applied',
      note: 'Work done on it by the push and by you: F·d',
    }));
  }

  if (f.has('applied') || f.has('ground')) {
    tiles.push(stat('The books', `${fmtFixed(sums.balance, 2)} J`, {
      accent: true,
      note: 'Everything it holds, minus what you put in. This does not change.',
    }));
  }

  return tiles;
}

/* ----------------------------------------------------------- the banners -- */

export function banners(ctx) {
  const f = ctx.features;
  const p = ctx.params;
  const out = [];
  const main = inspect(ctx.world, 'main');
  if (!main) return out;

  /*
   * If the simulation has hit the edge of what it can honestly describe, that
   * is the first thing to say — before any reading from it is quoted.
   */
  const relativistic = ctx.recorder.events.some((e) => e.type === 'relativistic');
  const diverged = ctx.recorder.events.some((e) => e.type === 'diverged');
  if (relativistic || diverged) {
    out.push(banner('danger',
      'The object has been accelerated past a tenth of the speed of light, where '
      + 'classical mechanics stops describing anything. Momentum is γmv there, '
      + 'not mv, and no finite force can reach c at all. The simulation has held '
      + 'it at that limit rather than showing you numbers with nothing behind '
      + 'them — turn the gravity or the push down to get back to physics this '
      + 'model can do.'));
  }

  const push = pushState(ctx.world, p, f);
  if (f.has('applied') && p.pushSeconds > 0) {
    const accelerating = len(main.acceleration) > 1e-6;
    if (push.active && accelerating) {
      out.push(banner('info',
        `The push is still on — ${fmtFixed(push.remaining, 2)} s left. The velocity is `
        + `changing at ${fmtFixed(len(main.acceleration), 2)} m/s every second.`));
    } else if (push.active) {
      // Pushing and going nowhere is the more interesting of the two cases, and
      // "climbing at 0.00 m/s every second" throws it away.
      out.push(banner('info',
        'You are pushing and nothing is happening. Something is cancelling it '
        + 'exactly — look at the arrows: they add up to zero, and a net force of '
        + 'zero means no change in motion, however many forces are acting.'));
    } else {
      out.push(banner('ok',
        'The push has stopped, and the object has not. Nothing is needed to keep '
        + 'it moving — only to change how it moves. That is Newton\'s first law, '
        + 'and it is the least obvious thing in mechanics.'));
    }
  }

  if (ctx.space) {
    out.push(banner('info',
      'Deep space: no field, no floor. Nothing here will change its velocity '
      + 'unless you make it — which makes this the cleanest place to watch what a '
      + 'single force actually does. Anything with an up and a down is drawn from '
      + 'above, because side-on would be a picture of a situation that does not '
      + 'exist.'));
  }

  const bump = ctx.recorder.events.find((e) => e.type === 'cannon-full');
  if (bump) {
    out.push(banner('warn', `The bench is full at ${bump.limit} objects, so the cannons `
      + 'have stopped firing. Remove something, or clear the objects, to make room.'));
  }

  if (f.has('control') && p.control?.mode !== 'none') {
    const target = findBody(ctx.world, p.control.targetId);
    if (target) {
      const force = main.forces.find((x) => x.id === 'control');
      const status = controlStatus({
        mode: p.control.mode,
        force: force ? force.vec : { x: 0, y: 0 },
        body: target,
        pointer: ctx.pointer,
        keys: ctx.keys,
        pressed: ctx.pressed,
        engaged: ctx.engaged,
      });
      if (status) out.push(banner('info', status));
    }
  }

  if (f.has('fluid')) {
    const lift = main.forces.find((x) => x.id === 'buoyancy');
    const weight = main.forces.find((x) => x.id === 'weight');
    if (lift && weight && lift.magnitude > weight.magnitude && weight.magnitude > 1e-9) {
      out.push(banner('ok',
        'It is going up. Nothing was switched on to make that happen — the fluid '
        + 'pushes up on everything in it by the weight of what it displaces, and '
        + 'this object displaces more than it weighs. Floating and sinking are the '
        + 'same force with the comparison coming out the other way.'));
    }
  }

  if (f.has('mutual-gravity') && !f.has('planet') && !ctx.space) {
    const c = everydayComparison(p.mass, p.otherMass, Math.abs(p.otherX));
    out.push(banner('warn', `These two masses really do attract, with ${c.text}`));
  }

  if (f.has('planet') && !f.has('ground') && !ctx.space) {
    const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });
    out.push(banner('ok', `Same equation as the last step. With ${p.planetMass.toExponential(2)} kg `
      + `at a radius of ${(p.planetRadius / 1000).toPrecision(3)} km it gives `
      + `${fmtFixed(world.g, 3)} m/s² — and the object weighs ${fmtFixed(p.mass * world.g, 2)} N. `
      + 'Nothing was added to make that happen except size.'));
    if (world.relativisticallyWrong) {
      out.push(banner('danger', 'At this field strength the Newtonian answer this app '
        + 'computes is badly wrong. General relativity is not optional here, and '
        + 'the number above should not be believed.'));
    }
  }

  if (f.has('ground') || ctx.world.walls?.length) {
    const contact = main.contact;
    if (contact?.touching && contact.frictionMode === 'static' && f.has('friction')) {
      out.push(banner('ok', `Not sliding. Friction is supplying exactly what is needed — `
        + `${fmtFixed(main.forces.find((x) => x.id === 'friction')?.magnitude ?? 0, 2)} N of a possible `
        + `${fmtFixed(contact.staticLimit, 2)} N. Static friction is *at most* μs·N, not equal to it.`));
    }
    if (contact?.frictionMode === 'breaking-away') {
      out.push(banner('warn', `The push has passed the ${fmtFixed(contact.staticLimit, 2)} N static `
        + 'limit, so it breaks away — and friction drops to the lower kinetic value.'));
    }
  }

  if (f.has('fluid')) {
    const dragForce = main.forces.find((x) => x.id === 'drag');
    if (dragForce?.flow && dragForce.flow.re > 0) {
      const flow = dragForce.flow;
      out.push(banner('info', `Re ≈ ${flow.re < 10 ? flow.re.toFixed(2) : flow.re.toPrecision(3)} — `
        + `${flow.regime.label.toLowerCase()}. ${flow.regime.text}`));
    }
  }

  if (f.has('collide')) {
    const hit = ctx.recorder.events.some((e) => e.type === 'collision');
    if (hit) {
      const sums = totals(ctx.world);
      out.push(banner('ok', `They have collided. Total momentum is ${fmtFixed(sums.momentumX, 3)} kg·m/s, `
        + `which is what it was before. ${fmtFixed(sums.elsewhere.impact, 2)} J of kinetic `
        + 'energy has moved into heat, sound and deformation — it has not gone anywhere else.'));
    }
  }

  return out;
}

/* ---------------------------------------------------------- the teaching -- */

export function explains(ctx) {
  const f = ctx.features;
  const p = ctx.params;
  const stage = stageById(ctx.state.stage);
  const main = inspect(ctx.world, 'main');
  const out = [];

  out.push(explain({
    title: `What this step adds: ${stage.label.toLowerCase()}`,
    plain: [stage.discover, stage.watch],
    open: true,
  }));

  if (main) {
    const object = describeObject({ shapeId: p.shapeId, size: p.size, mass: p.mass });
    out.push(explain({
      title: 'Mass, size, and the thing that connects them',
      plain: [
        'Mass and size are set separately here, and that is deliberate: they are '
        + 'independent, and the quantity that relates them has a name. Density is '
        + 'mass divided by volume — how much stuff is packed into how much room.',
        'It is the first number in this app that is a *ratio* rather than a '
        + 'reading, and it is worth getting used to early, because almost '
        + 'everything later turns on it. Whether something floats is a comparison '
        + 'of densities and nothing else. Two objects of the same size and wildly '
        + 'different mass behave differently for every reason except gravity, '
        + 'which ignores mass entirely.',
        'Change the size slider without touching the mass: the same stuff is '
        + 'spread through more room, so the density falls. Nothing about the '
        + 'motion changes yet — but by step seven it will decide which way the '
        + 'object goes.',
      ],
      formula: 'ρ = m / V',
      validWhen: 'A uniform object. A real car is not uniform at all, and the '
        + 'figure here is its average — 1400 kg spread through the space a car '
        + 'occupies, most of which is air.',
      worked: `Mass      ${fmtFixed(object.mass, 3).padStart(12)} kg\n`
        + `Volume    ${object.volume.toPrecision(4).padStart(12)} m³   (${object.shape.label.toLowerCase()}, ${fmtFixed(object.size, 2)} m)\n`
        + `Density   ${fmtFixed(object.density, object.density < 10 ? 3 : 0).padStart(12)} kg/m³\n\n`
        + `${densityComparison(object.density)}\n`
        + `Water is 997 and air is 1.225, so this is `
        + `${object.density < 997 ? 'lighter' : 'heavier'} than water and `
        + `${object.density < 1.225 ? 'lighter' : 'heavier'} than air.`,
      becomes: 'Density is not a fundamental property either — it is a bulk '
        + 'average over a great many atoms, and it changes with temperature and '
        + 'pressure. For a gas it changes a great deal.',
    }));
  }

  if (f.has('applied') && main) {
    out.push(equationPanel(equation('newton-2'),
      `a = F ÷ m = ${fmtFixed(p.pushForce, 2)} N ÷ ${fmtFixed(p.mass, 3)} kg`
      + ` = ${fmtFixed(p.mass > 0 ? p.pushForce / p.mass : 0, 3)} m/s²\n\n`
      + `Held for ${fmtFixed(p.pushSeconds, 2)} s, that leaves the object at\n`
      + `v = u + a·t = ${fmtFixed(p.v0, 2)} + ${fmtFixed(p.pushForce / p.mass, 3)} × ${fmtFixed(p.pushSeconds, 2)}`
      + ` = ${fmtFixed(p.v0 + (p.pushForce / p.mass) * p.pushSeconds, 3)} m/s`));

    out.push(equationPanel(equation('momentum'),
      `p = m · v = ${fmtFixed(main.mass, 3)} × ${fmtFixed(main.vel.x, 3)} = ${fmtFixed(main.momentum.x, 3)} kg·m/s\n\n`
      + `The push delivered an impulse of F·t = ${fmtFixed(p.pushForce, 2)} × ${fmtFixed(p.pushSeconds, 2)}`
      + ` = ${fmtFixed(p.pushForce * p.pushSeconds, 3)} kg·m/s,\n`
      + 'and that is exactly the momentum it now has. Impulse *is* the change in\n'
      + 'momentum — they are the same statement written two ways.'));

    out.push(equationPanel(equation('kinetic-energy'),
      `KE = ½ · m · v² = ½ × ${fmtFixed(main.mass, 3)} × ${fmtFixed(main.speed, 3)}²`
      + ` = ${fmtFixed(main.kinetic, 3)} J\n\n`
      + 'Notice how differently this grows from the momentum: doubling the speed\n'
      + 'doubles p and quadruples KE. Two objects with the same momentum can have\n'
      + 'very different energies, which is the difference between a thrown brick\n'
      + 'and a bullet.'));
  }

  if (f.has('mutual-gravity')) {
    const distance = f.has('planet') ? p.planetRadius : Math.abs(p.otherX);
    const otherMass = f.has('planet') ? p.planetMass : p.otherMass;
    const force = (G * p.mass * otherMass) / (distance * distance);
    out.push(equationPanel(equation('gravity-field'),
      `F = G · m₁ · m₂ / r²\n\n`
      + `  G  = ${G.toExponential(4)} m³ kg⁻¹ s⁻²\n`
      + `  m₁ = ${p.mass.toPrecision(4)} kg          (your object)\n`
      + `  m₂ = ${otherMass.toExponential(4)} kg     (the other mass)\n`
      + `  r  = ${distance.toPrecision(4)} m\n\n`
      + `  F  = ${force.toExponential(4)} N\n\n`
      + `Divide by your object's mass and the m₁ cancels:\n`
      + `  a = G·m₂/r² = ${fmtFixed(surfaceGravity(otherMass, distance), 4)} m/s²\n\n`
      + 'Your object\'s mass is not in that last line. It never is — which is the\n'
      + 'whole reason everything falls together.'));
  }

  if (f.has('ground') && !ctx.space) {
    const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });
    const rad = (p.slopeDeg * Math.PI) / 180;
    const weight = p.mass * world.g;
    out.push(explain({
      title: 'What the surface does',
      plain: 'The surface can only push perpendicular to itself. On the level that '
        + 'is straight up and it cancels the weight exactly. Tilted, it can only '
        + 'cancel the part of the weight pressing into it — and the rest is left '
        + 'over, with nothing to oppose it.',
      formula: 'N = m·g·cos θ        left over along the slope = m·g·sin θ',
      validWhen: 'A rigid body resting on a rigid surface, with the weight the only '
        + 'thing pressing it down.',
      worked: `Weight            ${fmtFixed(weight, 2).padStart(9)} N\n`
        + `Into the surface  ${fmtFixed(weight * Math.cos(rad), 2).padStart(9)} N   (× cos ${fmtFixed(Math.abs(p.slopeDeg), 0)}°)\n`
        + `Along the slope   ${fmtFixed(Math.abs(weight * Math.sin(rad)), 2).padStart(9)} N   (× sin ${fmtFixed(Math.abs(p.slopeDeg), 0)}°)`,
      becomes: 'Those two are the same weight, split along two perpendicular '
        + 'directions chosen because they are convenient. Nothing was created or '
        + 'lost in the splitting.',
    }));

    out.push(equationPanel(equation('potential-energy'),
      `PE = m · g · h = ${fmtFixed(p.mass, 3)} × ${fmtFixed(world.g, 3)} × ${fmtFixed(main?.heightAboveGround ?? 0, 3)}`
      + ` = ${fmtFixed(p.mass * world.g * (main?.heightAboveGround ?? 0), 3)} J\n\n`
      + 'Measured from the ground, because only differences in potential energy\n'
      + 'ever matter and the ground is convenient.'));
  }

  if (f.has('friction') && !ctx.space && main) {
    const object = describeObject({ shapeId: p.shapeId, size: p.size, mass: p.mass });
    const normal = main.forces.find((x) => x.id === 'normal')?.magnitude ?? 0;
    const kind = contactKind(p.shapeId);
    const crr = rollingFor(matchSurface(p.muS, p.muK));
    const footprint = object.size * object.size;

    out.push(explain({
      title: 'What the shape of the contact changes — and what it does not',
      plain: [
        'The surprising half first. Sliding friction does not depend on how much '
        + 'surface is touching. Make the box twice as wide at the same mass and '
        + 'the friction is identical, because real surfaces meet only at their '
        + 'high points: spreading the same weight over twice the area halves the '
        + 'pressure, and the same tiny patches end up actually in contact. It is '
        + 'in the equation to be read — F = μ·N — and there is no area in it.',
        'The half that does matter is whether the thing rolls. That is not a '
        + 'smaller coefficient for the same mechanism, it is a different '
        + 'mechanism: rolling resistance comes from the ball and the ground '
        + 'flexing under the load rather than from surfaces being dragged across '
        + 'each other, and it is between ten and a thousand times weaker. Which '
        + 'is the entire reason wheels were worth inventing.',
      ],
      formula: 'sliding   f = μ·N          rolling   f = C_rr·N',
      validWhen: 'Dry contact between solids, at ordinary loads. Very soft '
        + 'materials, very clean surfaces and very high pressures all add an '
        + 'adhesion term that does scale with real contact area, which is why a '
        + 'racing tyre is wide — that is a genuine exception rather than a '
        + 'correction to the rule.',
      worked: `This ${object.shape.label.toLowerCase()} ${kind.label}.\n\n`
        + `  Normal force        N = ${fmtFixed(normal, 2).padStart(9)} N\n`
        + `  Apparent footprint      ${footprint.toPrecision(3).padStart(9)} m²  (not used)\n\n`
        + (kind.mode === 'rolling'
          ? `  Rolling      C_rr·N = ${fmtFixed(crr * normal, 3).padStart(9)} N\n`
            + `  Had it slid    μk·N = ${fmtFixed(p.muK * normal, 3).padStart(9)} N\n\n`
            + `  ${Math.round(p.muK / Math.max(1e-9, crr))} times less resistance, from the same object on the same surface.`
          : `  Sliding        μk·N = ${fmtFixed(p.muK * normal, 3).padStart(9)} N\n`
            + `  Had it rolled C_rr·N = ${fmtFixed(crr * normal, 3).padStart(9)} N\n\n`
            + 'Change the size above at a fixed mass: the normal force does not move,\n'
            + 'so neither does the friction. Change the shape to a sphere and it does.'),
      becomes: 'Both are approximations to the same underlying story — surfaces '
        + 'are rough, contact is patchy, and energy is lost where materials are '
        + 'deformed. Amontons\' law is the version that survives when the '
        + 'deformation is confined to asperities being sheared.',
    }));
  }

  if (f.has('fluid') && main) {
    const fluid = FLUIDS.find((x) => x.id === p.fluidId) || FLUIDS[0];
    const object = describeObject({ shapeId: p.shapeId, size: p.size, mass: p.mass });
    const displaced = fluid.density * object.volume;
    const world = describeWorld({ mass: p.planetMass, radius: p.planetRadius, id: p.planetId });
    out.push(explain({
      title: 'Why anything floats',
      plain: [
        'The pressure in a fluid rises with depth, so the fluid presses harder on '
        + 'the bottom of a submerged object than on its top. The difference is an '
        + 'upward force, and it comes out equal to the weight of the fluid the '
        + 'object pushed out of the way.',
        'Notice what is not in that: what the object is made of. Only its volume '
        + 'matters. That is why a steel ship floats and a steel bolt does not — '
        + 'same material, wildly different volume for the same mass.',
      ],
      formula: 'F_b = ρ_fluid · V · g',
      validWhen: 'A body completely surrounded by fluid. A partly submerged one '
        + 'displaces only the volume under the surface, which is what makes a boat '
        + 'settle at a waterline instead of leaping out — this app assumes full '
        + 'immersion and says so.',
      worked: `Volume of the object   ${object.volume.toPrecision(4)} m³\n`
        + `Fluid it displaces     ${displaced.toPrecision(4)} kg  (${fluid.label.toLowerCase()}, ρ = ${fluid.density})\n`
        + `Upward push            ${fmtFixed(displaced * world.g, 4)} N\n`
        + `Its own weight         ${fmtFixed(p.mass * world.g, 4)} N\n\n`
        + (displaced > p.mass
          ? 'The push wins, so it rises.'
          : `The weight wins, so it sinks — but ${fmtFixed((displaced / p.mass) * 100, 0)}% of it is `
            + 'already being carried by the fluid.'),
      becomes: 'The same statement, one level down, is just that pressure increases '
        + 'with depth. Archimedes\' principle is what you get when you add up that '
        + 'pressure over the whole surface of the object.',
    }));
  }

  if (f.has('friction') && !ctx.space) {
    out.push(equationPanel(equation('friction'),
      `N = ${fmtFixed(main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0, 2)} N\n\n`
      + `Static limit   μs · N = ${fmtFixed(p.muS, 2)} × ${fmtFixed(main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0, 2)}`
      + ` = ${fmtFixed(p.muS * (main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0), 2)} N\n`
      + `Kinetic value  μk · N = ${fmtFixed(p.muK, 2)} × ${fmtFixed(main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0, 2)}`
      + ` = ${fmtFixed(p.muK * (main?.forces.find((x) => x.id === 'normal')?.magnitude ?? 0), 2)} N\n\n`
      + `Right now: ${fmtFixed(main?.forces.find((x) => x.id === 'friction')?.magnitude ?? 0, 2)} N `
      + `(${main?.contact?.frictionMode ?? 'no contact'})`));
  }

  if (f.has('fluid')) {
    const fluid = FLUIDS.find((x) => x.id === p.fluidId) || FLUIDS[0];
    const flow = main?.forces.find((x) => x.id === 'drag')?.flow;
    out.push(explain({
      title: 'Why honey is not just thick air',
      plain: [
        'Two properties of a fluid matter, and they do different jobs. Density is '
        + 'how much of it has to be shoved aside; viscosity is how much it resists '
        + 'being sheared. Honey is only 40% denser than water and about ten '
        + 'thousand times more viscous, and it is the viscosity you feel.',
        'Which one dominates is decided by the Reynolds number. Above about a '
        + 'thousand, inertia wins and drag goes as v². Below about one, viscosity '
        + 'wins and drag goes as v — a completely different law, from the same '
        + 'equation.',
      ],
      formula: 'Re = ρ·v·D/μ        F = ½·ρ·C_d(Re)·A·v²        C_d ≈ 24/Re + 6/(1+√Re) + 0.4',
      validWhen: 'A roughly spherical body, from Re ≈ 0.1 up to about 2×10⁵. Above '
        + 'that the drag crisis sets in, which this correlation does not model.',
      worked: flow
        ? `In ${fluid.label.toLowerCase()}, at ${fmtFixed(main.speed, 3)} m/s:\n\n`
          + `  Re = ${fluid.density} × ${fmtFixed(main.speed, 3)} × ${fmtFixed(p.size, 3)} ÷ ${fluid.viscosity}`
          + ` = ${flow.re < 10 ? flow.re.toFixed(3) : flow.re.toPrecision(4)}\n`
          + `  C_d = ${flow.cd.toPrecision(4)}\n`
          + `  F  = ${flow.force.toPrecision(4)} N\n\n`
          + `  ${(flow.viscousShare * 100).toFixed(0)}% of that is the viscous term.\n`
          + (Number.isFinite(flow.stokes)
            ? `  Stokes' law, 3πμDv, would give ${flow.stokes.toPrecision(4)} N — `
              + `${flow.re < 1 ? 'and at this Re it is very nearly right.' : 'which is far off, because this is not Stokes flow.'}`
            : '')
        : 'Set the object moving to see the flow conditions.',
      becomes: 'At the low-Reynolds end this whole expression collapses, exactly, '
        + 'to Stokes\' law. It is not two models with a switch between them; it is '
        + 'one model whose behaviour changes with the flow.',
    }));
  }

  if (f.has('collide')) {
    out.push(equationPanel(equation('momentum-conservation'),
      'During the impact each object pushes on the other with an equal and\n'
      + 'opposite force, for exactly the same length of time. So the impulse one\n'
      + 'receives is the exact negative of the other\'s, and whatever momentum one\n'
      + 'gains, the other loses. The total cannot change.\n\n'
      + 'Kinetic energy has no such guarantee, and only survives intact when\n'
      + 'e = 1. Watch the two totals on the graph through the impact: one line is\n'
      + 'flat and the other has a step in it.'));
  }

  return out;
}

/** The stage the second-mass panel jumps to, exposed for the shell to wire up. */
export { stageById };
