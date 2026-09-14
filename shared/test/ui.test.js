import test from 'node:test';
import assert from 'node:assert/strict';
import {
  $HR,
  applyI18n,
  initLocale,
  parseLocale,
  getActiveLanguage,
  getAssetBaseUrl,
  InlineHelp,
  PublishedDialog,
  CONFIGURATION_VERSION,
  serializeConfigurationSettings,
  unwrapSettings,
  boolean,
  enumValue,
  stringValue,
  nullableString,
  boundedNumber,
  nullableIdentifier,
  nullableList
} from '../src/ui/index.js';

test('locale parser reads Heurist resource lines', () => {
  assert.deepEqual(parseLocale('#Save#Save\n#Cancel#\r\nignored'), { Save: 'Save', Cancel: '' });
});

test('target locale overlays English and falls back for missing or empty values', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    text: async () => String(url).includes('_fre')
      ? '#Save#Enregistrer\n#Cancel#'
      : '#Save#Save\n#Cancel#Cancel'
  });
  try {
    await initLocale('fre', '/heurist/');
    assert.equal(getActiveLanguage(), 'fre');
    assert.equal(getAssetBaseUrl(), '/heurist');
    assert.equal($HR('Save'), 'Enregistrer');
    assert.equal($HR('Cancel'), 'Cancel');
    assert.equal($HR('Unknown'), 'Unknown');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('applyI18n translates marked text-only descendants', () => {
  const elements = [{ textContent: 'Save' }, { textContent: 'Unknown' }];
  applyI18n({ querySelectorAll: () => elements });
  assert.equal(elements[0].textContent, 'Enregistrer');
  assert.equal(elements[1].textContent, 'Unknown');
});

test('InlineHelp requires a moduleName and builds a per-language manual URL', async () => {
  assert.throws(() => new InlineHelp(), /moduleName/);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => '' });
  try {
    await initLocale('fre', 'https://example.org/map');
    const help = new InlineHelp({ moduleName: 'map' });
    assert.equal(help.manualUrl(), 'https://example.org/map/mapUserManualFre.htm');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('InlineHelp baseUrl overrides the current document\'s asset base, for a host opening another module\'s manual', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => '' });
  try {
    // The current document's own asset base (e.g. heurist-explorer's) must not
    // leak into a manual URL for a different module (e.g. heurist-map's).
    await initLocale('fre', 'https://example.org/explorer');
    const help = new InlineHelp({ moduleName: 'map', baseUrl: 'https://example.org/map' });
    assert.equal(help.manualUrl(), 'https://example.org/map/mapUserManualFre.htm');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PublishedDialog can be constructed without a document', () => {
  const dialog = new PublishedDialog({ publication: { url: 'https://example.org/p/1' } });
  assert.equal(dialog.publication.url, 'https://example.org/p/1');
  assert.equal(dialog.element, undefined);
});

test('configuration envelope and primitive normalizers', () => {
  assert.equal(CONFIGURATION_VERSION, 1);
  assert.deepEqual(
    serializeConfigurationSettings({ a: 1 }, (value) => ({ options: value, config: {} }), 'heurist-map-settings'),
    { format: 'heurist-map-settings', version: 1, options: { a: 1 }, config: {} }
  );
  assert.deepEqual(unwrapSettings(null), {});
  assert.deepEqual(unwrapSettings([1, 2]), {});
  assert.deepEqual(unwrapSettings({ options: {} }), { options: {} });
  assert.equal(boolean('true', false), true);
  assert.equal(boolean('nope', 'fallback'), 'fallback');
  assert.equal(enumValue('b', ['a', 'b'], 'a'), 'b');
  assert.equal(enumValue('z', ['a', 'b'], 'a'), 'a');
  assert.equal(stringValue(42, 'fallback'), 'fallback');
  assert.equal(nullableString(''), null);
  assert.equal(nullableString(42), '42');
  assert.equal(boundedNumber(50, 10, 0, 30), 30);
  assert.equal(nullableIdentifier('basemap-id'), 'basemap-id');
  assert.equal(nullableIdentifier('7', { numeric: true }), 7);
  assert.equal(nullableIdentifier('dynamic', { numeric: true, allowDynamic: true }), 'dynamic');
  assert.deepEqual(nullableList(['3', '3', 'x'], { numeric: true }), [3]);
});
