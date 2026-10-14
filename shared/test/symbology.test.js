import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSymbology, colourGradient, effectiveSymbol, numberGradient, sparseSymbol, splitSymbology, vectorSymbol
} from '../src/symbology/symbology.js';
import {
  categoryRanges, findRange, formatRange, generateRanges, parseRange, rangeMatches
} from '../src/data/ranges/rangeDefinitions.js';
import { fieldValuesQuery, parseFieldCode } from '../src/symbology/thematicFields.js';
import { SymbologyService } from '../src/symbology/SymbologyService.js';

const renderer = { title: 'Population', fields: [{ code: '10:1109', ranges: [{ value: '1<>5', symbol: { color: '#00ff00' } }] }] };

test('splitSymbology reads the canonical value, the legacy array and a plain symbol', () => {
  assert.deepEqual(splitSymbology({ symbol: { color: '#111111' }, thematic: [renderer] }), { symbol: { color: '#111111' }, thematic: [renderer] });
  assert.deepEqual(splitSymbology([{ color: '#222222' }, renderer]), { symbol: { color: '#222222' }, thematic: [renderer] });
  assert.deepEqual(splitSymbology('{"color":"#333333"}'), { symbol: { color: '#333333' }, thematic: [] });
  assert.deepEqual(splitSymbology('not json'), { symbol: null, thematic: [] });
});

test('buildSymbology: a plain symbol without renderers, {symbol, thematic} with them', () => {
  assert.deepEqual(buildSymbology({ color: '#111111' }, []), { color: '#111111' });
  assert.deepEqual(buildSymbology({ color: '#111111' }, [renderer]), { symbol: { color: '#111111' }, thematic: [renderer] });
});

test('effectiveSymbol inherits built-in ← parent ← local; sparseSymbol keeps the differences only', () => {
  const parent = { color: '#0000ff', fillOpacity: 0.5 };
  const shown = effectiveSymbol({ weight: 5 }, parent);
  assert.equal(shown.color, '#0000ff');
  assert.equal(shown.weight, 5);
  assert.equal(shown.fillOpacity, 0.5);
  assert.equal(shown.iconSize, 18, 'one number');
  // a form shows the effective symbol; saving it unchanged stores nothing but the edit
  assert.deepEqual(sparseSymbol({ ...shown, weight: 5 }, parent), { weight: 5 });
  assert.deepEqual(sparseSymbol(shown, effectiveSymbol({ weight: 5 }, parent)), {});
  // a circle with its own size keeps the Leaflet radius (legacy)
  assert.deepEqual(sparseSymbol({ ...shown, iconType: 'circle', iconSize: 10 }, parent), { iconType: 'circle', iconSize: 10, radius: 5, weight: 5 });
  assert.deepEqual(vectorSymbol({ color: '#123456', iconSize: [9, 9], radius: 4, blur: null }), { color: '#123456', iconSize: 9 });
});

test('gradients of colours and numbers', () => {
  assert.deepEqual(colourGradient('#000000', '#ffffff', 3), ['#000000', '#808080', '#ffffff']);
  assert.deepEqual(colourGradient('#f00', '#00f', 2), ['#ff0000', '#0000ff']);
  assert.deepEqual(colourGradient('red', '#00f', 2), []);
  assert.deepEqual(numberGradient(0.2, 1, 5), [0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(numberGradient(4, 20, 3, { round: 0 }), [4, 12, 20]);
});

test('range values: one value, an interval, a list', () => {
  assert.deepEqual(parseRange('40'), { kind: 'value', value: '40' });
  assert.deepEqual(parseRange('40<>50'), { kind: 'interval', min: '40', max: '50' });
  assert.deepEqual(parseRange('69,71,75'), { kind: 'list', values: ['69', '71', '75'] });
  assert.deepEqual(parseRange({ min: 1, max: 2 }), { kind: 'interval', min: '1', max: '2' });
  assert.equal(formatRange(10, 20), '10<>20');
  assert.equal(formatRange('', 20), '20');
  assert.equal(formatRange([1, 2, 3]), '1,2,3');
  assert.equal(rangeMatches(45, { value: '40<>50' }), true);
  assert.equal(rangeMatches(51, { value: '40<>50' }), false);
  assert.equal(rangeMatches('71', { value: '69,71,75' }), true);
  assert.equal(rangeMatches('1955-03-01', { value: '1950<>1959-12-31' }), true, 'dates as text');
  assert.equal(findRange(3, [{ value: '1<>2' }, { value: '3<>4' }]).value, '3<>4');
  assert.deepEqual(categoryRanges([5, '5', { value: 7 }, '']), [{ value: '5' }, { value: '7' }]);
});

test('generateRanges: legacy intervals, rounding, whole years for dates', () => {
  assert.deepEqual(generateRanges({ fieldType: 'integer', min: 0, max: 100, count: 4 }),
    [{ min: 0, max: 25 }, { min: 25, max: 50 }, { min: 50, max: 75 }, { min: 75, max: 100 }]);
  assert.deepEqual(generateRanges({ fieldType: 'float', min: 0, max: 1, count: 3, rounding: 2 }),
    [{ min: 0, max: 0.33 }, { min: 0.33, max: 0.66 }, { min: 0.66, max: 1 }], 'each bound from the rounded one before (legacy)');
  assert.deepEqual(generateRanges({ fieldType: 'integer', min: 0, max: 1000, count: 20, rounding: 100 }).length, 10, 'rounding is the smallest step');
  assert.deepEqual(generateRanges({ fieldType: 'date', min: '1900-09-01', max: '1969-12-31', count: 2 }),
    [{ min: 1900, max: 1935 }, { min: 1935, max: 1969 }]);
  assert.deepEqual(generateRanges({ fieldType: 'integer', min: 5, max: 1, count: 2 }), []);
});

test('field codes and the query of the records holding the values', () => {
  assert.deepEqual(parseFieldCode('10:1109'), { rectypeId: 10, hops: [], dty: 1109 });
  assert.deepEqual(parseFieldCode('10:lt240:48:237'), { rectypeId: 10, hops: [{ link: 'lt', dty: 240, rectypeId: 48 }], dty: 237 });
  assert.deepEqual(fieldValuesQuery('10:1109', '[{"t":"10"}]'), { query: [{ t: '10' }] });
  assert.deepEqual(fieldValuesQuery('10:lt241:12:1', [{ t: '10' }]), { query: [{ t: '12' }, { 'lf:241': [{ t: '10' }] }] });
  assert.equal(fieldValuesQuery('10:1109', 't:10').query, 't:10');
  assert.ok(fieldValuesQuery('10:lt241:12:1', 't:10').error, 'links need a JSON query');
});

test('SymbologyService: the style editor keeps renderers; a complete value keeps its icon type', async () => {
  const calls = [];
  const editors = {
    editSymbol: async (value, options) => { calls.push(['symbol', value, options]); return { color: '#abcdef' }; },
    editThematicMaps: async (value, options) => { calls.push(['thematic', value, options]); return value; },
    editImageFilter: async (value) => { calls.push(['image', value]); return { blur: '2px' }; }
  };
  const service = new SymbologyService({ api: {}, loadDbDefs: async () => ({}), loadEditors: async () => editors });
  assert.deepEqual(await service.edit({ color: '#111111' }, { complete: true, parentSymbol: { iconType: 'circle' } }),
    { color: '#abcdef', iconType: 'circle' });
  assert.equal(calls[0][2].mode, 'symbol');
  await service.edit('{"symbol":{},"thematic":[]}', { kind: 'thematic', query: 't:10' });
  assert.equal(calls[1][0], 'thematic');
  assert.equal(calls[1][2].query, 't:10');
  assert.deepEqual(await service.edit({}, { kind: 'image' }), { blur: '2px' });
  await service.edit({ color: '#000' }, { mode: 'draw' });
  assert.equal(calls.at(-1)[2].mode, 'draw');
});

test('SymbologyService.saveLayerSymbology patches DT_SYMBOLOGY of the Map Layer record', async () => {
  const requests = [];
  const api = {
    request: async (path, options) => {
      requests.push([options?.method, path, options?.body]);
      return { records: [{ rec_ID: '122' }], issues: [] };
    }
  };
  const service = new SymbologyService({ api, loadDbDefs: async () => ({ dbconst: (name) => (name === 'DT_SYMBOLOGY' ? 2006 : 0) }) });
  await service.saveLayerSymbology(122, { color: '#111111' });
  assert.equal(requests[0][0], 'PATCH');
  assert.equal(requests[0][1], '/records/122');
  assert.deepEqual(requests[0][2], { details: { 2006: ['{"color":"#111111"}'] } });
  await assert.rejects(new SymbologyService({ api, loadDbDefs: async () => ({ dbconst: () => 0 }) }).saveLayerSymbology(1, {}));
});
