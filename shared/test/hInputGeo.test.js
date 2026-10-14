import test from 'node:test';
import assert from 'node:assert/strict';
import { describeGeoValue } from '../src/widgets/form/inputs/HInputGeo.js';
import { extentToWkt } from '../src/utils/geoExtent.js';

test('geographic values show the shared readable text', () => {
  assert.equal(describeGeoValue('POINT(149.1 -34.2)'), 'Point (X 149.1 Y -34.2)');
  assert.equal(describeGeoValue('LINESTRING(0 0,1 1,2 2)'), 'LineString n=3 (X 0,2 Y 0,2)');
  assert.equal(describeGeoValue('POLYGON((0 0,1 0,1 1,0 0))'), 'Polygon n=4 (X 0,1 Y 0,1)');
  assert.equal(describeGeoValue({ west: 10, south: -5, east: 20, north: 8 }),
    'BBOX (X 10,20 Y -5,8)');
});

test('a selected map extent becomes polygon WKT for Builder field predicates', () => {
  assert.equal(extentToWkt({ west: 10, south: -5, east: 20, north: 8 }),
    'POLYGON((10 -5,20 -5,20 8,10 8,10 -5))');
});
