import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyPersistedSettings } from '../../src/mapConfig.js';

test('simplified interface: no header, collapsed panel, "Current results" not loaded by extent', () => {
  const saved = {
    options: { ui: { showSourceHeader: true, initiallyExpanded: true } },
    config: { dynamicDocument: { title: 'My layers', dynamicRequests: true } }
  };
  const settings = applyPersistedSettings({ simplified: true, explorerHost: true }, saved).persistedSettings;
  assert.equal(settings.options.ui.showSourceHeader, false);
  assert.equal(settings.options.ui.initiallyExpanded, false);
  assert.equal(settings.config.dynamicDocument.title, 'Current results');
  assert.equal(settings.config.dynamicDocument.dynamicRequests, false);
  const normal = applyPersistedSettings({ explorerHost: true }, saved).persistedSettings;
  assert.equal(normal.config.dynamicDocument.title, 'My layers');
});

test('simplified configuration form: no Workspace section, no Heurist controls, no advanced switch (plan 29)', async () => {
  const { default: form } = await import('../../src/ui/config/mapConfigurationForm.json', { with: { type: 'json' } });
  const { describeConfigurationForm } = await import('../../../../shared/src/data/moduleConfigurationForm.js');
  const rows = describeConfigurationForm(form, { mode: 'configuration', simplified: true, showOptional: false });
  const shown = rows.filter((row) => row.shown).map((row) => row.key);
  assert.ok(!shown.some((key) => key.startsWith('config.dynamicDocument.')), 'no Workspace section');
  assert.ok(!shown.includes('options.ui.enabled') && !shown.includes('options.ui.showMapDocuments'), 'no Heurist controls');
  assert.ok(shown.includes('options.nativeControls.zoom'), 'native controls stay');
});
