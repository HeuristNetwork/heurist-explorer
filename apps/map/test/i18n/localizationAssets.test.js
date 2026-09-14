import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseLocale } from '#shared/ui';

const assets = fileURLToPath(new URL('../../public/assets/localization/', import.meta.url));

test('English and French module dictionaries contain the same non-empty resources', async () => {
  const [english, french] = await Promise.all([
    readFile(`${assets}localization_eng.txt`, 'utf8').then(parseLocale),
    readFile(`${assets}localization_fre.txt`, 'utf8').then(parseLocale)
  ]);
  assert.deepEqual(Object.keys(french).sort(), Object.keys(english).sort());
  assert.equal(Object.values(english).every(Boolean), true);
  assert.equal(Object.values(french).every(Boolean), true);
});

test('every direct $HR string in map UI source is present in module dictionaries', async () => {
  const english = parseLocale(await readFile(`${assets}localization_eng.txt`, 'utf8'));
  const sourceFiles = [
    '../../src/main.js', '../../src/ui/MapControlPanel.js', '../../src/ui/MapDocumentSelector.js',
    '../../src/ui/LayerPanel.js', '../../src/ui/LayerPanelItem.js', '../../src/ui/DrawPanel.js',
    '../../src/ui/config/MapConfigurationDialog.js', '../../src/ui/legend/LegendRenderer.js'
  ];
  const sources = await Promise.all(sourceFiles.map((file) => readFile(fileURLToPath(new URL(file, import.meta.url)), 'utf8')));
  const keys = sources.flatMap((source) => [...source.matchAll(/\$HR\('([^']+)'/g)].map((match) => match[1]));
  assert.deepEqual(keys.filter((key) => !(key in english)), []);
});
