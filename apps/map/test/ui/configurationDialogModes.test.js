import test from 'node:test';
import assert from 'node:assert/strict';
import form from '../../src/ui/config/mapConfigurationForm.json' with { type: 'json' };
import { describeConfigurationForm } from '../../../../shared/src/data/moduleConfigurationForm.js';
import { normalizeMapLayer, reapplyMapLayerDefaults } from '../../src/core/MapLayer.js';

test('configuration mode keeps the Options icon: no UI, its value stays (plan 29)', () => {
  const row = describeConfigurationForm(form, { mode: 'configuration' }).find((item) => item.key === 'options.ui.showOptions');
  assert.equal(row.noUI, true);
  assert.equal(row.forced, null);
});
test('website mode still hides the Options icon', () => {
  const row = describeConfigurationForm(form, { mode: 'website' }).find((item) => item.key === 'options.ui.showOptions');
  assert.deepEqual(row.forced, { value: false });
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
