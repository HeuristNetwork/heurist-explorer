import test from 'node:test';
import assert from 'node:assert/strict';
import { MapConfigurationDialog } from '../../src/ui/config/MapConfigurationDialog.js';
import { normalizeMapLayer, reapplyMapLayerDefaults } from '../../src/core/MapLayer.js';

test('preferences mode always keeps the Options icon (the dialog is opened from it)', () => {
  const dialog = new MapConfigurationDialog({ mode: 'preferences', value: { options: { ui: { showOptions: false } } } });
  assert.equal(dialog.value.options.ui.showOptions, true);
});

test('website mode still hides the Options icon', () => {
  const dialog = new MapConfigurationDialog({ mode: 'website', value: { options: { ui: { showOptions: true } } } });
  assert.equal(dialog.value.options.ui.showOptions, false);
});

test('a persisted MapLayer with an empty popupTemplate inherits the global popup template', () => {
  const layer = normalizeMapLayer({ options: { popupTemplate: null } }, { defaults: { popupTemplate: 'basic' } });
  assert.equal(layer.options.popupTemplate, 'basic');
  assert.equal(reapplyMapLayerDefaults(layer, { popupTemplate: 'builtin' }), true);
  assert.equal(layer.options.popupTemplate, 'builtin');

  const explicit = normalizeMapLayer({ options: { popupTemplate: 'Map popup.tpl' } }, { defaults: { popupTemplate: 'basic' } });
  reapplyMapLayerDefaults(explicit, { popupTemplate: 'builtin' });
  assert.equal(explicit.options.popupTemplate, 'Map popup.tpl');
});
