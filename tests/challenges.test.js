import test from 'node:test';
import assert from 'node:assert/strict';

import { CHALLENGES, challengeById, challengesFor, gradePrediction, evaluate } from '../js/challenges.js';
import { conceptById } from '../js/lessons.js';
import { TOOLS } from '../js/state.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b} (±${tol})`);

test('every challenge is complete and points at a real tool and concept', () => {
  assert.ok(CHALLENGES.length >= 8);
  for (const c of CHALLENGES) {
    assert.ok(c.id && c.title, `${c.id} incomplete`);
    assert.ok(TOOLS.includes(c.tool), `${c.id} points at unknown tool "${c.tool}"`);
    assert.ok(conceptById(c.concept), `${c.id} points at unknown concept "${c.concept}"`);
    assert.ok(c.brief.length > 50, `${c.id}: brief too thin`);
    assert.ok(c.predict?.label.includes('?'), `${c.id}: the prediction prompt must be a question`);
    assert.ok(c.hint.length > 20, `${c.id}: needs a hint`);
    assert.equal(typeof c.check, 'function');
  }
  assert.equal(challengeById('nope'), null);
  assert.ok(challengesFor('projectile').length >= 2);
  assert.equal(challengesFor('nonsense').length, 0);
});

test('every challenge explains itself, whichever way it went', () => {
  // A challenge that explains itself only on failure teaches that being right
  // needs no reasoning.
  for (const c of CHALLENGES) {
    const text = typeof c.explain === 'function' ? c.explain({}, {}) : c.explain;
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 80, `${c.id}: explanation too thin`);
  }
});

test('a close prediction is called close, generously', () => {
  const r = gradePrediction(42, 40, { tolerance: 0.1 });
  assert.equal(r.graded, true);
  assert.equal(r.close, true);
  close(r.percent, 5, 1e-9);
  assert.equal(r.direction, 'over');
  assert.match(r.text, /reasoning from the relationship/);
});

test('a wrong prediction is described, never scolded', () => {
  const r = gradePrediction(10, 40, { tolerance: 0.1 });
  assert.equal(r.close, false);
  assert.equal(r.direction, 'under');
  assert.match(r.text, /lower than the result/);
  // No "wrong", no "incorrect", no "failed".
  assert.doesNotMatch(r.text, /wrong|incorrect|failed|bad/i);
  assert.match(r.text, /worth chasing down/);
});

test('grading copes with no prediction and no result', () => {
  assert.equal(gradePrediction(null, 40).graded, false);
  assert.equal(gradePrediction('', 40).graded, false);
  assert.match(gradePrediction(undefined, 40).text, /No prediction/);
  assert.match(gradePrediction(5, NaN).text, /did not produce a result/);
});

test('grading a prediction of zero does not divide by zero', () => {
  const r = gradePrediction(0, 0);
  assert.equal(r.graded, true);
  assert.equal(r.close, true);
  assert.equal(r.direction, 'exact');
  assert.ok(Number.isFinite(gradePrediction(0, 5).percent));
});

test('evaluate insists on a prediction before it grades anything', () => {
  const none = evaluate('hit-the-target', { result: { range: 60 }, params: { angleDeg: 30, speed: 25 } });
  assert.equal(none.met, true);
  assert.equal(none.prediction.graded, false);
  assert.match(none.prediction.text, /before you run it/);
});

test('evaluate grades the prediction against the right quantity', () => {
  // The target challenge asks for an angle, so the prediction is graded against
  // the angle used — not the range, which is what the check tests.
  const r = evaluate('hit-the-target', {
    result: { range: 60 },
    params: { angleDeg: 30, speed: 25, g: 9.80665 },
    prediction: 30,
  });
  assert.equal(r.met, true);
  assert.equal(r.prediction.graded, true);
  assert.equal(r.prediction.close, true);
  assert.match(r.explanation, /two angles/i);
});

test('the target challenge explains what to do when the target is out of reach', () => {
  const r = evaluate('hit-the-target', { result: { range: 20 }, params: { speed: 10, g: 9.80665 }, prediction: 45 });
  assert.equal(r.met, false);
  assert.match(r.explanation, /cannot reach/);
  assert.match(r.explanation, /at least/);
});

test('the furthest-throw challenge grades against the real best angle, not 45°', () => {
  const r = evaluate('furthest-throw', {
    result: {},
    params: { speed: 20, height: 20, angleDeg: 32, g: 9.80665 },
    prediction: 45,
  });
  // 45° is the wrong answer from a height, and the grading says so.
  assert.equal(r.prediction.close, false);
  assert.ok(r.prediction.actual < 45);
  assert.match(r.explanation, /not 45°/);
});

test('the seconds-pendulum challenge grades against the real length', () => {
  const r = evaluate('seconds-pendulum', { result: { period: 2 }, params: { g: 9.80665 }, prediction: 0.994 });
  assert.equal(r.met, true);
  assert.equal(r.prediction.close, true);
  close(r.prediction.actual, 0.9938, 0.001);
  // And it warns that amplitude matters, which the usual formula denies.
  assert.match(r.explanation, /45°/);
});

test('the moon-shot challenge grades against the range ratio', () => {
  const r = evaluate('moon-shot', { result: { range: 100 }, params: {}, prediction: 6 });
  assert.equal(r.prediction.graded, true);
  // Earth's g is about 6.05 times the Moon's.
  close(r.prediction.actual, 9.80665 / 1.62, 0.01);
  assert.equal(r.prediction.close, true);
});

test('a check that throws is treated as not met rather than crashing the app', () => {
  const r = evaluate('newtons-cradle', { result: null, params: {}, prediction: 1 });
  assert.equal(r.met, false);
  assert.ok(r.explanation.length > 50);
});

test('evaluate refuses an unknown challenge', () => {
  assert.throws(() => evaluate('nope'), /No challenge named/);
});
