/**
 * @file mapPublication.test.js
 * @brief Publication options of a map page (plan 29): Show only active document, Preserve current state.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMapPublication } from '../../src/ui/config/mapPublication.js';

const settings = { options: { ui: { showMapDocuments: true, showCurrentDocument: true }, mapDocuments: { allowed: null } }, config: {} };
const state = { activeDocumentId: 12, query: 't:10', view: { zoom: 5 } };
const publication = { activeDocumentId: 12, dynamicDocumentId: 'dynamic', minimalState: { activeDocumentId: 12, query: 't:10' } };

test('Show only active document: a map document', () => {
  const result = prepareMapPublication({ settings, state, publish: { showOnlyActiveDocument: true }, publication });
  assert.deepEqual(result.settings.options.mapDocuments, { allowed: [12], initiallyActive: 12 });
  assert.equal(result.settings.options.ui.showCurrentDocument, false);
  assert.equal(settings.options.mapDocuments.allowed, null, 'the given settings are not changed');
  assert.deepEqual(result.state, state);
});

test('Show only active document: the dynamic document', () => {
  const result = prepareMapPublication({ settings, state, publish: { showOnlyActiveDocument: true },
    publication: { ...publication, activeDocumentId: 'dynamic' } });
  assert.deepEqual(result.settings.options.mapDocuments, { allowed: [], initiallyActive: null });
  assert.equal(result.settings.options.ui.showMapDocuments, false);
});

test('Preserve current state off: the active document and the query only', () => {
  const result = prepareMapPublication({ settings, state, publish: { preserveState: false }, publication });
  assert.deepEqual(result.state, { activeDocumentId: 12, query: 't:10' });
  assert.equal(result.settings.options.mapDocuments.allowed, null);
});

test('a base map list joined into one name is skipped: all base maps (2026-10-28)', async () => {
  const { applyPersistedSettings } = await import('../../src/mapConfig.js');
  const { getDefaultBaseMaps } = await import('../../src/basemaps/defaultBasemaps.js');
  const all = getDefaultBaseMaps().map((item) => item.id);
  const broken = applyPersistedSettings({}, { options: { baseMaps: { allowed: ['OpenStreetMap,OpenTopoMap,Esri'] } } });
  assert.deepEqual(broken.baseMaps.map((item) => item.id), all);
  const nested = applyPersistedSettings({}, { options: { baseMaps: { allowed: [['OpenStreetMap', 'None']] } } });
  assert.deepEqual(nested.baseMaps.map((item) => item.id), ['OpenStreetMap', 'None']);
});
