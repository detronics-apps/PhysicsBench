import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEARCH_ALIASES, searchText, guideMatches, howtoText, faqText, featureText,
  HOWTOS, FAQS, CONCEPTS, FEATURES, WELCOME, categories,
} from '../js/guide.js';
import { STAGES } from '../js/stages.js';
import { EXAMPLES } from '../js/examples.js';

/* ------------------------------------------------------------- search -- */

test('a search with nothing in it matches everything', () => {
  assert.equal(guideMatches('anything at all', ''), true);
  assert.equal(guideMatches('anything at all', '   '), true);
  assert.equal(guideMatches('anything at all', null), true);
});

test('every word must appear, so typing more narrows', () => {
  const text = 'Move it through air, water or honey';
  assert.equal(guideMatches(text, 'water'), true);
  assert.equal(guideMatches(text, 'water honey'), true);
  assert.equal(guideMatches(text, 'water granite'), false);
});

test('the search is case and order blind', () => {
  const text = 'Draw walls, ramps and obstacles';
  assert.equal(guideMatches(text, 'RAMPS walls'), true);
  assert.equal(guideMatches(text, 'walls ramps'), true);
});

/**
 * The point of the alias map: a reader searches for what they would call the
 * thing, which is never what the screen calls it.
 */
test('everyday words find the entry that uses the app word', () => {
  const found = (q) => HOWTOS.filter((h) => guideMatches(howtoText(h), q)).map((h) => h.id);

  assert.ok(found('air resistance').includes('fluids'));
  assert.ok(found('slow motion').includes('slow-it-down'));
  assert.ok(found('arrow keys').includes('drive'));
  assert.ok(found('spreadsheet').includes('export'));
  assert.ok(found('too much detail').includes('change-level'));
  assert.ok(found('how heavy').includes('make-it-heavier'));
  assert.ok(found('restitution').includes('bounce'));
  assert.ok(found('lost it').includes('camera'));
});

/**
 * An alias keyed on a word with a second meaning matches everything.
 *
 * "air resistance" was keyed on `drag`, and "drag the timeline", "drag on the
 * drawing" and "drag the slider" all contain it — so the search returned seven
 * unrelated entries and was worse than no aliases at all.
 */
test('every alias phrase finds something, and not everything', () => {
  const entries = [
    ...HOWTOS.map(howtoText), ...FAQS.map(faqText), ...FEATURES.map(featureText),
  ];
  const half = Math.ceil(entries.length / 2);

  for (const phrase of Object.values(SEARCH_ALIASES).flat()) {
    const hits = entries.filter((text) => guideMatches(text, phrase));
    assert.ok(hits.length > 0, `"${phrase}" finds nothing`);
    assert.ok(hits.length < half,
      `"${phrase}" matches ${hits.length} of ${entries.length} — its key has a second meaning`);
  }
});

test('an alias only widens the entries that actually use its term', () => {
  // "dark mode" is an alias of theme, which no how-to mentions, so it must not
  // start matching every entry.
  const hits = HOWTOS.filter((h) => guideMatches(howtoText(h), 'dark mode'));
  assert.equal(hits.length, 0);
});

test('searchText leaves the original text intact', () => {
  const original = 'Load a prepared experiment';
  assert.ok(searchText(original).startsWith(original));
});

test('searchText survives nothing being passed', () => {
  assert.doesNotThrow(() => searchText(undefined));
  assert.doesNotThrow(() => searchText(null));
});

test('one search covers the how-tos, the FAQs and the features', () => {
  const q = 'share';
  assert.ok(HOWTOS.some((h) => guideMatches(howtoText(h), q)));
  assert.ok(FAQS.some((f) => guideMatches(faqText(f), q)));
  assert.ok(FEATURES.some((f) => guideMatches(featureText(f), q)));
});

/* ------------------------------------------------------------ content -- */

test('every how-to has a category, a title and real steps', () => {
  for (const h of HOWTOS) {
    assert.ok(h.id, 'a how-to with no id');
    assert.ok(h.title.length > 5, `${h.id}: no title`);
    assert.ok(h.category.length > 0, `${h.id}: no category`);
    assert.ok(h.steps.length >= 3, `${h.id}: fewer than three steps`);
    for (const step of h.steps) assert.ok(step.length > 10, `${h.id}: a step that says nothing`);
  }
});

test('no two how-tos share an id', () => {
  assert.equal(new Set(HOWTOS.map((h) => h.id)).size, HOWTOS.length);
});

test('the categories come out in the order they are written, once each', () => {
  const list = categories();
  assert.equal(new Set(list).size, list.length);
  assert.equal(list[0], HOWTOS[0].category);
});

test('every FAQ is a question with an answer', () => {
  for (const f of FAQS) {
    assert.ok(f.q.trim().endsWith('?'), `not a question: ${f.q}`);
    assert.ok(f.a.length > 40, `too short to be an answer: ${f.q}`);
  }
});

test('every feature says where it lives', () => {
  for (const f of FEATURES) {
    assert.ok(f.name.length > 3, 'a feature with no name');
    assert.ok(f.where.length > 3, `${f.name}: nowhere to find it`);
    assert.ok(f.what.length > 20, `${f.name}: does not say what it does`);
  }
});

test('the concepts are ideas, not tasks', () => {
  assert.ok(CONCEPTS.length >= 3 && CONCEPTS.length <= 8);
  for (const c of CONCEPTS) assert.ok(c.what.length > 30, `${c.name}: says nothing`);
});

/* ----------------------------------------- what the guide claims is true -- */

/**
 * The guide is a promise like any other teaching text. These are the claims in
 * it that a later change could quietly falsify.
 */
test('every step a how-to sends someone to exists', () => {
  const ids = new Set(STAGES.map((s) => s.id));
  for (const item of WELCOME) {
    if (item.go.stage) assert.ok(ids.has(item.go.stage), `no such step: ${item.go.stage}`);
  }
});

test('the pages the welcome deep-links to are pages the app has', () => {
  for (const item of WELCOME) {
    assert.ok(['bench', 'examples', 'guide', 'achievements'].includes(item.go.page), `no such page: ${item.go.page}`);
    assert.ok(item.label.length > 3, `${item.title}: no button label`);
  }
});

test('the welcome is a short numbered path, not a manual', () => {
  assert.ok(WELCOME.length >= 3 && WELCOME.length <= 5, 'the welcome has drifted out of 3-5 steps');
});

test('the guide counts the steps and the experiments correctly', () => {
  // "One bench, seven steps" and the shelf's count are both claims.
  const concept = CONCEPTS.find((c) => c.name.includes('six steps'));
  assert.ok(concept, 'the six-steps tile has been renamed — check the count still matches');
  assert.equal(STAGES.length, 6, 'there are no longer six steps; the guide says there are');

  const shelf = FEATURES.find((f) => f.what.includes('Eleven scenes'));
  assert.ok(shelf, 'the prepared-experiments tile has been reworded — check the count');
  assert.equal(EXAMPLES.length, 11, 'the shelf no longer holds eleven; the guide says it does');
});

test('an alias entry keys on a word the content actually uses', () => {
  // A term nothing mentions is a dead entry: it can never fire.
  const all = [
    ...HOWTOS.map(howtoText), ...FAQS.map(faqText), ...FEATURES.map(featureText),
  ].join(' ').toLowerCase();
  const dead = Object.keys(SEARCH_ALIASES).filter((term) => !all.includes(term));
  assert.deepEqual(dead, [], `aliases that can never match: ${dead.join(', ')}`);
});
