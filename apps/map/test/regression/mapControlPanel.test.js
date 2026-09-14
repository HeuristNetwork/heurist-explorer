import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const panelSource = await readFile(new URL('../../src/ui/MapControlPanel.js', import.meta.url), 'utf8');
const layerPanelSource = await readFile(new URL('../../src/ui/LayerPanel.js', import.meta.url), 'utf8');
const layerItemSource = await readFile(new URL('../../src/ui/LayerPanelItem.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../../src/style.css', import.meta.url), 'utf8')
  + await readFile(new URL('../../../../shared/src/ui/heurist-module.css', import.meta.url), 'utf8');

test('current-results document panel is independent from persisted MapDocument visibility', () => {
  assert.match(panelSource, /showCurrentDocument !== false \|\| this\.options\.showMapDocuments !== false/);
  assert.match(panelSource, /item\.persistent === false\) return this\.options\.showCurrentDocument !== false/);
  assert.match(panelSource, /return this\.options\.showMapDocuments !== false/);
});

test('empty layer panel reports loading while a MapDocument is activating', () => {
  assert.match(panelSource, /documentActivating = allDocuments\.some/);
  assert.match(layerPanelSource, /loading \? 'Loading\.\.\.' : 'No layers'/);
});

test('zoom-to-layer action is available but remains hover/focus-only', () => {
  assert.match(layerItemSource, /heurist-map-layer-zoom-action/);
  assert.doesNotMatch(cssSource, /not\(\.heurist-map-layer-zoom-action\)/);
  assert.match(cssSource, /heurist-map-row-actions[^}]*opacity:0/);
});

test('control-only mode removes title-toggle footprint and sizes to buttons', () => {
  assert.match(panelSource, /classList\.add\('controls-only'\)/);
  assert.match(cssSource, /\.heurist-module-control-panel\.controls-only\s*\{[\s\S]*?width:\s*auto/);
  assert.match(cssSource, /\.heurist-module-panel-header\s*\{[\s\S]*?box-sizing:\s*border-box/);
});


test('Map Control custom CSS supports declarations and complete CSS rules', () => {
  assert.match(panelSource, /applyControlCss\(\)/);
  assert.match(panelSource, /if \(!css\.includes\('\{'\)\)/);
  assert.match(panelSource, /style\.textContent = css/);
  assert.match(panelSource, /controlCssStyle\?\.remove\(\)/);
});

test('configuration dialog keeps Interface first and uses flat Default settings layout', async () => {
  const dialogSource = await readFile(new URL('../../src/ui/config/MapConfigurationDialog.js', import.meta.url), 'utf8');
  const interfaceIndex = dialogSource.indexOf("this.section('Interface'");
  const currentResultsIndex = dialogSource.indexOf("this.section('Workspace/Filtered Result Map'");
  assert.ok(interfaceIndex >= 0 && currentResultsIndex > interfaceIndex);
  assert.doesNotMatch(dialogSource, /legend\('Map defaults'\)|legend\('Layer defaults'\)/);
  assert.match(dialogSource, /heurist-map-config-inline-number/);
});

test('MapControlPanel owns edit integration and hides edit actions when editing is disabled', () => {
  assert.match(panelSource, /editingEnabled = this\.api\.getCapabilities\?\.\(\)\.editing === true/);
  assert.match(panelSource, /onEditDocument: \(documentId\) => this\.editMapDocument\(documentId\)/);
  assert.match(panelSource, /onEditLayer: \(layerId\) => this\.editLayer\(layerId\)/);
  assert.match(panelSource, /editMapDocument\(documentId\)[\s\S]*requestEditMapDocument\(documentId\)/);
  assert.match(panelSource, /editLayer\(layerId\)[\s\S]*requestEditLayer\(layerId\)/);
  assert.match(layerItemSource, /this\.editingEnabled && typeof this\.onEditLayer === 'function'/);
});

test('layer panel renders thematic radio choices and switches themes through the public API', () => {
  assert.match(layerItemSource, /heurist-map-layer-themes/);
  assert.match(layerItemSource, /createThemeRadio\('Default', null/);
  assert.match(layerItemSource, /theme\?\.title \|\| `Theme \$\{index \+ 1\}`/);
  assert.match(layerItemSource, /this\.api\.setLayerTheme\(this\.layer\.id, themeIndex\)/);
  assert.match(panelSource, /heurist-map-layer-style-changed/);
  assert.match(cssSource, /\.heurist-map-layer-theme-option/);
});


test('Base maps control is omitted when None is the only configured basemap', () => {
  assert.match(panelSource, /hasSelectableBaseMaps = this\.options\.showBaseMaps !== false/);
  assert.match(panelSource, /configuredBaseMaps\.some\(\(item\) => String\(item\?\.id\) !== 'None'\)/);
  assert.match(panelSource, /if \(hasSelectableBaseMaps\)/);
});

test('configuration transfer lists keep None and use first-selected basemap fallback', async () => {
  const dialogSource = await readFile(new URL('../../src/ui/config/MapConfigurationDialog.js', import.meta.url), 'utf8');
  assert.match(dialogSource, /fixedSelectedValues: \['None'\]/);
  assert.match(dialogSource, /fixedSelectedValues: new Set/);
  assert.match(dialogSource, /option\.disabled = true/);
  assert.doesNotMatch(dialogSource, /First selected/);
  assert.match(dialogSource, /choices\[0\]\?\.\[0\] \?\? ''/);
});

test('hidden layer actions do not reserve title width and legend editors appear on hover', () => {
  assert.match(cssSource, /\.heurist-map-layer-row>\.heurist-map-row-actions\{[\s\S]*?display:none/);
  assert.match(cssSource, /\.heurist-map-layer-row:hover>\.heurist-map-row-actions[\s\S]*?display:flex/);
  assert.doesNotMatch(cssSource, /background:linear-gradient\(to right/);
  assert.match(cssSource, /\.heurist-map-legend-actions\{[\s\S]*?opacity:0/);
  assert.match(cssSource, /\.heurist-map-layer-row:hover \.heurist-map-legend-actions[\s\S]*?opacity:1/);
});
