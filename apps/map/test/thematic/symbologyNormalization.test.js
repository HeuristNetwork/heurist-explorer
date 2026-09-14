import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMapLayer } from '../../src/core/MapLayer.js';
import { DEFAULT_MAP_SYMBOL } from '../../src/utils/normalizeMapSymbol.js';

const globalDefaults = {
  symbology: {
    color: '#123456',
    fillColor: '#abcdef',
    iconSize: 18,
    opacity: 0.75
  }
};

function layerWith(style) {
  return normalizeMapLayer({
    source: { type: 'heurist-query', query: 't:12' },
    style,
    options: {}
  }, { defaults: globalDefaults });
}

test('layer without an own symbol uses global symbology completed from DEFAULT_MAP_SYMBOL', () => {
  const layer = layerWith({ thematic: [] });
  assert.equal(layer.style.symbol.color, '#123456');
  assert.equal(layer.style.symbol.fillColor, '#abcdef');
  assert.equal(layer.style.symbol.radius, 9);
  assert.equal(layer.style.symbol.opacity, 0.75);
  assert.equal(layer.style.symbol.weight, DEFAULT_MAP_SYMBOL.weight);
  assert.deepEqual(layer.style.symbol.iconSize, [18, 18]);
});

test('sparse layer symbol inherits missing properties from effective global symbology', () => {
  const layer = layerWith({
    symbol: { color: '#000000' }
  });
  assert.equal(layer.style.symbol.color, '#000000');
  assert.equal(layer.style.symbol.fillColor, '#abcdef');
  assert.equal(layer.style.symbol.radius, 9);
  assert.equal(layer.style.symbol.weight, DEFAULT_MAP_SYMBOL.weight);
  assert.equal(layer.style.symbol.opacity, 0.75);
});

test('thematic base symbol inherits from effective layer symbol', () => {
  const layer = layerWith({
    symbol: { color: '#111111', fillColor: '#222222' },
    thematic: [{
      title: 'Population',
      active: true,
      fields: [],
      symbol: { color: '#0070c0', iconSize: '10', fill: '0', opacity: 1 }
    }]
  });

  const theme = layer.style.thematic[0];
  assert.equal(theme.active, true);
  assert.equal(theme.symbol.color, '#0070c0');
  assert.equal(theme.symbol.fillColor, '#222222');
  assert.equal(theme.symbol.radius, 5);
  assert.deepEqual(theme.symbol.iconSize, [10, 10]);
  assert.equal(theme.symbol.fill, false);
  assert.equal(theme.symbol.opacity, 1);
});

test('thematic range symbols remain partial while legacy boundary values are normalized', () => {
  const layer = layerWith({
    thematic: [{
      active: true,
      fields: [{
        code: '12:133',
        title: 'Place type',
        ranges: [{
          value: '10443',
          symbol: {
            iconType: 'iconfont',
            iconFont: 'ui-icon-star',
            color: '#ff0000',
            opacity: '100',
            fill: '0',
            iconSize: '7'
          }
        }]
      }],
      symbol: {}
    }]
  });

  const rangeSymbol = layer.style.thematic[0].fields[0].ranges[0].symbol;
  assert.deepEqual(rangeSymbol, {
    iconType: 'iconfont',
    iconFont: 'ui-icon-star',
    iconSize: [7, 7],
    color: '#ff0000',
    opacity: 1,
    fill: false
  });
  assert.equal(Object.hasOwn(rangeSymbol, 'fillColor'), false);
  assert.equal(Object.hasOwn(rangeSymbol, 'radius'), false);
  assert.equal(Object.hasOwn(rangeSymbol, 'weight'), false);
});

test('normalization keeps at most one thematic map active and preserves field codes', () => {
  const layer = layerWith({
    thematic: [
      { active: true, fields: [{ code: '12:133', ranges: [] }], symbol: {} },
      { active: '1', fields: [{ code: '12:1160', ranges: [] }], symbol: {} }
    ]
  });

  assert.equal(layer.style.thematic[0].active, true);
  assert.equal(layer.style.thematic[1].active, false);
  assert.equal(layer.style.thematic[0].fields[0].code, '12:133');
  assert.equal(layer.style.thematic[1].fields[0].code, '12:1160');
});
