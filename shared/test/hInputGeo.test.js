import test from 'node:test';
import assert from 'node:assert/strict';
import { describeGeoValue } from '../src/widgets/form/inputs/HInputGeo.js';
import { extentToWkt } from '../src/utils/geoExtent.js';

test('geographic values show concise coordinate-aware summaries', () => {
  assert.equal(describeGeoValue('POINT(149.1 -34.2)'), 'POINT (-34.2 149.1 lat long)');
  assert.equal(describeGeoValue('LINESTRING(0 0,1 1,2 2)'), 'LINE 3 vertices');
  assert.equal(describeGeoValue('POLYGON((0 0,1 0,1 1,0 0))'), 'POLYGON 3 vertices');
  assert.equal(describeGeoValue({ west: 10, south: -5, east: 20, north: 8 }),
    'BBOX (-5 20 – 8 10 lat long)');
});

test('a selected map extent becomes polygon WKT for Builder field predicates', () => {
  assert.equal(extentToWkt({ west: 10, south: -5, east: 20, north: 8 }),
    'POLYGON((10 -5,20 -5,20 8,10 8,10 -5))');
});
