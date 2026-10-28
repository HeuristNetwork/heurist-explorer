/**
 * @file moduleLanguage.test.js
 * @brief Interface language of a module (plan 29, 2026-10-28): ?lang= of the page, then the
 *        module's own setting on a published page, then the host's language.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleLanguage, normalizeModuleBootstrap } from '../src/config/bootstrap.js';

const settings = (language) => ({ options: { ui: { language } } });

test('a published page: the module setting wins over the page language', () => {
  const bootstrap = { runtime: { runtimeMode: 'published', language: 'eng' }, settings: settings('fre') };
  assert.equal(moduleLanguage(bootstrap), 'fre');
  assert.equal(normalizeModuleBootstrap(bootstrap).runtime.language, 'fre');
});

test('?lang= of the page wins over the module setting', () => {
  const runtime = { runtimeMode: 'published', language: 'ger', languageRequested: true };
  assert.equal(moduleLanguage({ runtime, settings: settings('fre') }), 'ger');
});

test('auto, or not a published page: the host language', () => {
  assert.equal(moduleLanguage({ runtime: { runtimeMode: 'published', language: 'eng' }, settings: settings('auto') }), 'eng');
  assert.equal(moduleLanguage({ runtime: { runtimeMode: 'embedded', language: 'eng' }, settings: settings('fre') }), 'eng');
  assert.equal(moduleLanguage({}), null);
  assert.equal(normalizeModuleBootstrap({}).runtime.language, undefined);
});
