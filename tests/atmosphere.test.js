import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYERS, LANDMARKS, ISS_ALTITUDE, layerAt, passedLandmark, throughLayer,
} from '../js/atmosphere.js';

test('the layers stack with no gap and no overlap', () => {
  for (const [i, layer] of LAYERS.entries()) {
    assert.ok(layer.to > layer.from, `${layer.id} has no height`);
    if (i > 0) assert.equal(layer.from, LAYERS[i - 1].to, `a gap below ${layer.id}`);
  }
  assert.equal(LAYERS[0].from, 0);
});

test('every layer carries a fact worth the space', () => {
  for (const layer of LAYERS) {
    assert.ok(layer.name.length > 3, `${layer.id}: no name`);
    assert.ok(layer.fact.length > 80, `${layer.id}: the fact says too little`);
  }
});

test('a height lands in the layer it belongs to', () => {
  assert.equal(layerAt(0).id, 'troposphere');
  assert.equal(layerAt(11000).id, 'troposphere');      // an airliner
  assert.equal(layerAt(12000).id, 'stratosphere');     // exactly on the boundary
  assert.equal(layerAt(40000).id, 'stratosphere');
  assert.equal(layerAt(60000).id, 'mesosphere');
  assert.equal(layerAt(100000).id, 'thermosphere');    // the Kármán line
  assert.equal(layerAt(ISS_ALTITUDE).id, 'thermosphere');
  assert.equal(layerAt(1e9).id, 'exosphere');          // past the top, not off the end
});

test('a height below sea level is still in the bottom layer', () => {
  assert.equal(layerAt(-100).id, 'troposphere');
  assert.equal(layerAt(undefined).id, 'troposphere');
});

test('the landmarks are in order, and each is a real altitude', () => {
  for (const [i, mark] of LANDMARKS.entries()) {
    assert.ok(mark.at > 0, `${mark.name} is at ground level`);
    assert.ok(mark.name.length > 5, 'a landmark with no name');
    if (i > 0) assert.ok(mark.at > LANDMARKS[i - 1].at, `${mark.name} is out of order`);
  }
});

test('what you have passed, not what you are nearest to', () => {
  // Climbing, the useful sentence is the thing just below you.
  assert.equal(passedLandmark(0), null);
  assert.equal(passedLandmark(9000).name, 'The summit of Everest');
  assert.equal(passedLandmark(11000).name, 'An airliner at cruise');
  // 99 km is much nearer the Kármán line than the noctilucent clouds, and the
  // clouds are still the last thing actually passed.
  assert.equal(passedLandmark(99000).name, 'Noctilucent clouds — the highest clouds there are');
  assert.equal(passedLandmark(100000).name, 'The Kármán line, the conventional edge of space');
  assert.equal(passedLandmark(ISS_ALTITUDE).name, 'The International Space Station');
});

test('the ISS is where the ISS is, and in the layer it flies in', () => {
  assert.equal(ISS_ALTITUDE, 408000);
  assert.ok(LANDMARKS.some((m) => m.at === ISS_ALTITUDE));
  assert.equal(layerAt(ISS_ALTITUDE).id, 'thermosphere');
});

test('how far through a layer runs 0 to 1 and never leaves it', () => {
  assert.equal(throughLayer(0), 0);
  assert.equal(throughLayer(6000), 0.5);
  assert.ok(Math.abs(throughLayer(12000)) < 1e-9);   // the floor of the next one
  for (const h of [-5, 0, 1e3, 1e5, 1e7, 1e12]) {
    const t = throughLayer(h);
    assert.ok(t >= 0 && t <= 1, `out of range at ${h}: ${t}`);
  }
});
