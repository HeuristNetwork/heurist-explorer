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

test('simplified configuration dialog: no advanced settings, only native controls, no Workspace section', async () => {
  const dialog = await readFile(new URL('../../src/ui/config/MapConfigurationDialog.js', import.meta.url), 'utf8');
  assert.match(dialog, /if \(this\.mode !== 'publish' && !this\.simplified\) this\.form\.append\(this\.buildAdvancedPanel\(\)\);/);
  assert.match(dialog, /\.\.\.\(this\.simplified \? \[\] : \[this\.section\('Workspace\/Filtered Result Map'/);
  assert.match(dialog, /if \(this\.simplified\) heuristSection\.style\.display = 'none';/);
});
