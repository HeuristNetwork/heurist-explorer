import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getFeatureThematicValues,
  resolveFeatureSymbol,
  resolveThematicFieldSymbol,
  thematicRangeMatches,
  mergeThematicSymbol
} from '../../src/thematic/thematicSymbolResolver.js';

const base = {
  iconType: 'circle',
  radius: 10,
  color: '#0070c0',
  fillColor: '#92cddc',
  weight: 1,
  opacity: 1,
  fillOpacity: 1,
  fill: true,
  stroke: true
};

test('ordinary layer symbol is returned when there is no active thematic map', () => {
  const ordinary = { color: '#111', radius: 6 };
  assert.equal(resolveFeatureSymbol({ properties: {} }, { symbol: ordinary, thematic: [] }), ordinary);
});

test('active thematic base replaces ordinary layer symbol and matching fields merge sequential overrides', () => {
  const feature = {
    properties: {
      thematic: {
        '12:133': { 101: '10443' },
        '12:1160': { 102: '20000000' }
      }
    }
  };
  const style = {
    symbol: { color: '#00b050', radius: 15 },
    thematic: [{
      active: true,
      symbol: base,
      fields: [
        { code: '12:133', ranges: [{ value: '10443', symbol: { iconType: 'iconfont', iconFont: 'ui-icon-star', color: '#ff0000' } }] },
        { code: '12:1160', ranges: [{ value: '15200000<>22600000', symbol: { iconSize: [15, 15] } }] }
      ]
    }]
  };

  assert.deepEqual(resolveFeatureSymbol(feature, style), {
    ...base,
    iconType: 'iconfont',
    iconFont: 'ui-icon-star',
    color: '#ff0000',
    iconSize: [15, 15]
  });
});

test('any thematic multivalue may match and first configured matching range wins', () => {
  const feature = { properties: { thematic: { '12:133': { 1: 'x', 2: 'b' } } } };
  const field = {
    code: '12:133',
    ranges: [
      { value: 'a,b,c', symbol: { color: 'first' } },
      { value: 'b', symbol: { color: 'second' } }
    ]
  };
  assert.deepEqual(getFeatureThematicValues(feature, field.code), ['x', 'b']);
  assert.deepEqual(resolveThematicFieldSymbol(feature, field), { color: 'first' });
});

test('enriched path-aware values resolve their actual value property', () => {
  const feature = { properties: { thematic: {
    '10:lt240:48:237': [
      {
        value: '10443',
        code: 'commercial',
        label: 'Commercial',
        path: { id: '1', recordIDs: ['101', '501'] }
      }
    ]
  } } };
  assert.deepEqual(getFeatureThematicValues(feature, '10:lt240:48:237'), ['10443']);
});

test('numeric interval matching is inclusive and accepts numeric strings', () => {
  const range = { value: '400000<>7800000' };
  assert.equal(thematicRangeMatches('400000', range), true);
  assert.equal(thematicRangeMatches(7800000, range), true);
  assert.equal(thematicRangeMatches('7800001', range), false);
});

test('pre-parsed arrays and min/max ranges are supported', () => {
  assert.equal(thematicRangeMatches('2', { value: ['1', '2', '3'] }), true);
  assert.equal(thematicRangeMatches('m', { min: 'a', max: 'z' }), true);
});

test('rec_GeoField is read locally and does not require thematic API details', () => {
  const feature = { properties: { rec_GeoField: '999' } };
  const field = { code: 'rec_GeoField', ranges: [{ value: '999', symbol: { weight: 7 } }] };
  assert.deepEqual(resolveThematicFieldSymbol(feature, field), { weight: 7 });
});

test('rec_GeoField accepts the modern linked-geometry field property', () => {
  const feature = { properties: { _geoFieldID: '134' } };
  assert.deepEqual(getFeatureThematicValues(feature, 'rec_GeoField'), ['134']);
});


test('persisted Place type and Population thematic fields compose icon type and size correctly', () => {
  const style = {
    symbol: { iconType: 'circle', iconSize: [15, 15], radius: 15, color: '#00b050' },
    thematic: [{
      active: true,
      fields: [
        { code: '12:133', ranges: [{ value: '10443', symbol: { iconType: 'iconfont', iconFont: 'ui-icon-star', color: '#ff0000', opacity: 1, fill: false, fillColor: '#c00000', fillOpacity: 1 } }] },
        { code: '12:1160', ranges: [
          { value: '400000<>7800000', symbol: { iconSize: [7, 7] } },
          { value: '7800000<>15200000', symbol: { iconSize: [11, 11] } }
        ] }
      ],
      symbol: { iconType: 'circle', iconSize: [10, 10], radius: 10, color: '#0070c0', weight: 1, opacity: 1, fill: true, fillColor: '#92cddc', fillOpacity: 1 }
    }]
  };

  const iconFeature = { properties: { thematic: {
    '12:133': { 1: '10443' },
    '12:1160': { 2: '9000000' }
  } } };
  const iconSymbol = resolveFeatureSymbol(iconFeature, style);
  assert.equal(iconSymbol.iconType, 'iconfont');
  assert.equal(iconSymbol.iconFont, 'ui-icon-star');
  assert.equal(iconSymbol.color, '#ff0000');
  assert.deepEqual(iconSymbol.iconSize, [11, 11]);

  const circleFeature = { properties: { thematic: {
    '12:133': { 1: '99999' },
    '12:1160': { 2: '9000000' }
  } } };
  const circleSymbol = resolveFeatureSymbol(circleFeature, style);
  assert.equal(circleSymbol.iconType, 'circle');
  assert.deepEqual(circleSymbol.iconSize, [11, 11]);
  assert.equal(circleSymbol.radius, 5.5);
});

test('circle thematic iconSize override controls radius while explicit radius wins', () => {
  assert.equal(mergeThematicSymbol({ iconType: 'circle', radius: 10 }, { iconSize: [19, 19] }).radius, 9.5);
  assert.equal(mergeThematicSymbol({ iconType: 'circle', radius: 10 }, { iconSize: [19, 19], radius: 4 }).radius, 4);
});
