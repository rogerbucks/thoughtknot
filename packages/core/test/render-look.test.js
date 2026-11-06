// The look, part of layer L4 of the rendering spec (editor spec §73, render_look_in_marks): render/render-look.ts. Subjects take
// the mockups' colours; children take nearby shades; names pick the ink that reads best.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DARK, LIGHT, contrast, inkOn, rgbOf, shadeOf, subjectColour } from '../src/render/render-look.ts';

// proves: render_look_in_marks
test('subjects take the mockups colours in turn, light and dark', () => {
  assert.equal(subjectColour(LIGHT, 0), '#4b7bf5');
  assert.equal(subjectColour(DARK, 1), '#ff9a5e');
  assert.equal(subjectColour(LIGHT, LIGHT.subjects.length), subjectColour(LIGHT, 0));
  assert.equal(new Set(LIGHT.subjects).size, LIGHT.subjects.length);
});

// proves: render_look_in_marks
test('children take shades that differ from each other but stay close to their parent', () => {
  const base = '#4b7bf5';
  const shades = [0, 1, 2, 3].map((i) => shadeOf(base, i, 4, LIGHT));
  assert.equal(new Set(shades).size, 4);
  for (const s of shades) {
    const far = rgbOf(s).reduce((n, c, i) => n + Math.abs(c - rgbOf(base)[i]), 0);
    assert.ok(far < 200, `${s} strays from ${base}`);
  }
  assert.equal(shadeOf(base, 0, 1, LIGHT), base);
});

// proves: render_look_in_marks
test('a name on any subject colour reads at a contrast of at least 4.5', () => {
  for (const fill of [...LIGHT.subjects, ...DARK.subjects]) assert.ok(contrast(fill, inkOn(fill)) >= 4.5, fill);
});
