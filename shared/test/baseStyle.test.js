import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBaseStyle, baseStyleCss, baseStyleDiffers, normalizeBaseStyle, UI_BASE_SETTINGS } from '../src/ui/baseStyle.js';

test('base style: UI keys only, trimmed text values', () => {
  assert.equal(UI_BASE_SETTINGS.includes('site-width'), false);
  assert.equal(UI_BASE_SETTINGS.includes('site-logo-height'), false);
  assert.equal(UI_BASE_SETTINGS.includes('site-font-size'), true);
  assert.deepEqual(normalizeBaseStyle(null), {});
  assert.deepEqual(normalizeBaseStyle([1]), {});
  assert.deepEqual(normalizeBaseStyle({ 'color-bg': ' #000 ', 'site-width': '1200px', other: 'x', 'color-text': '', radius: {} }),
    { 'color-bg': '#000' });
  assert.equal(baseStyleDiffers({ 'color-bg': '#000' }, { 'color-bg': ' #000' }), false);
  assert.equal(baseStyleDiffers({}, { 'color-bg': '#000' }), true);
});

test('base style CSS: variables, primary hover, font sizes, headings; unsafe values left out', () => {
  assert.equal(baseStyleCss({}), '');
  assert.equal(baseStyleCss({ 'color-bg': 'red;}body{x' }), '');
  const css = baseStyleCss({ 'color-bg': '#000000', 'color-primary': '#123456', 'site-font-size': '14px',
    'site-heading-color': '#ff0000' });
  assert.match(css, /^html:root,html \.h-theme\{/);
  assert.match(css, /--h-color-bg:#000000;/);
  assert.match(css, /--h-color-primary-hover:color-mix\(in srgb, #123456 85%, black\);/);
  assert.match(css, /--h-font-size:var\(--h-site-font-size\);--h-font-size-large:calc\(var\(--h-site-font-size\) \* 14 \/ 12\);/);
  assert.match(css, /:is\(h1,h2,h3,h4,h5,h6\)\{color:var\(--h-site-heading-color\)\}/);
  assert.doesNotMatch(baseStyleCss({ 'color-bg': '#000' }), /h1/);
});

test('base style: one style element, last in the head, removed without settings', () => {
  const elements = [];
  const head = {
    append: (node) => {
      const index = elements.indexOf(node);
      if (index >= 0) elements.splice(index, 1);
      elements.push(node);
      node.remove = () => elements.splice(elements.indexOf(node), 1);
    }
  };
  const doc = {
    head,
    getElementById: (id) => elements.find((node) => node.id === id) || null,
    createElement: () => ({ id: '', textContent: '' })
  };
  applyBaseStyle(doc, { 'color-bg': '#000' });
  assert.equal(elements.length, 1);
  assert.match(elements[0].textContent, /--h-color-bg:#000;/);
  applyBaseStyle(doc, { 'color-bg': '#fff' });
  assert.equal(elements.length, 1);
  assert.match(elements[0].textContent, /#fff/);
  applyBaseStyle(doc, {}, { removeEmpty: false });
  assert.equal(elements.length, 1);
  applyBaseStyle(doc, {});
  assert.equal(elements.length, 0);
});
