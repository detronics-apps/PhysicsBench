import * as S from './js/stages.js';
import { advance, findBody } from './js/world.js';
import { defaults } from './js/state.js';

const MASS = 549054, W = MASS * 9.8203;
const apogee = (force, secs) => {
  const p = { ...defaults().bench, shapeId: 'spaceship', size: 70, mass: MASS,
    materialId: 'clay', x0: 0, dropHeight: 0, v0: 0, slopeDeg: 0,
    pushForce: force, pushAngleDeg: 90, pushSeconds: secs,
    fluidId: 'atmosphere', worldMode: 'planet', objects: [], cannons: [], walls: [] };
  const s = S.build('fluid', p);
  let w = S.applyPush(s.world, p, s.features);
  let peak = 0, tPeak = 0;
  for (let i = 0; i < 240 * 1600; i++) {
    w = S.applyPush(w, p, s.features); w = advance(w, 1 / 240);
    const b = findBody(w, 'main');
    if (b.pos.y > peak) { peak = b.pos.y; tPeak = w.t; }
    if (b.pos.y <= 0 && w.t > secs) break;
  }
  return { peak, tPeak };
};

// For each burn length, find the thrust that just reaches 400 km.
console.log('burn    thrust needed for ~400 km      apogee   at');
for (const secs of [370, 300, 180, 120]) {
  let lo = W * 1.05, hi = W * 8;
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    if (apogee(mid, secs).peak > 400000) hi = mid; else lo = mid;
  }
  const f = (lo + hi) / 2;
  const r = apogee(f, secs);
  console.log(String(secs).padStart(4) + ' s   ' + (f / 1e6).toFixed(2).padStart(6) + ' MN'
    + '  (T/W ' + (f / W).toFixed(2) + ')' + (Math.abs(f - 7607000) < 3e5 ? '  <- Falcon 9' : '')
    + '   ' + (r.peak / 1000).toFixed(0).padStart(4) + ' km   t=' + r.tPeak.toFixed(0) + ' s');
}
