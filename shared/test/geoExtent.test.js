import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isExtent, extentToWkt, extentToGeoJson, extentFromGeoJson, extentFromWkt, roundExtent
} from '../src/utils/geoExtent.js';

test('roundExtent: precision follows the smaller side, always rounding outward', () => {
  // ≥ 5° -> whole degrees (the extent from a drawn POLYGON)
  assert.deepEqual(
    roundExtent({ west: -20.70981465, south: 44.86969648, east: 6.01248562, north: 58.82844087 }),
    { west: -21, south: 44, east: 7, north: 59 }
  );
  // 2..5° -> 2 decimals
  assert.deepEqual(
    roundExtent({ west: 10.123, south: 20.456, east: 13.001, north: 23.9 }),
    { west: 10.12, south: 20.45, east: 13.01, north: 23.9 }
  );
  // 1..2° -> 4 decimals
  assert.deepEqual(
    roundExtent({ west: 1.123456, south: 2.123456, east: 2.5, north: 3.9 }),
    { west: 1.1234, south: 2.1234, east: 2.5, north: 3.9 }
  );
  // < 1° -> unchanged
  const small = { west: 1.123456789, south: 2.1, east: 1.5, north: 2.2 };
  assert.deepEqual(roundExtent(small), small);
  // a long thin box keeps its thin dimension precise (40° x 1.5° -> 4 decimals)
  assert.equal(roundExtent({ west: 0.123456, south: 50.123456, east: 40.5, north: 51.6 }).south, 50.1234);
});

test('roundExtent: clamps to valid coordinates and handles the antimeridian', () => {
  assert.deepEqual(
    roundExtent({ west: -179.6, south: -89.7, east: -100.2, north: 89.6 }),
    { west: -180, south: -90, east: -100, north: 90 }
  );
  assert.deepEqual(
    roundExtent({ west: 170.3, south: -10.2, east: -170.4, north: 10.1 }),
    { west: 170, south: -11, east: -170, north: 11 }
  );
  assert.equal(roundExtent('POLYGON((0 0))'), null);
});

test('extent <-> WKT / GeoJSON conversions', () => {
  const extent = { west: 10, south: -5, east: 20, north: 8 };
  assert.ok(isExtent(extent));
  assert.ok(!isExtent({ west: 10, south: -5, east: 20 }));
  assert.equal(extentToWkt(extent), 'POLYGON((10 -5,20 -5,20 8,10 8,10 -5))');
  assert.deepEqual(extentFromWkt(extentToWkt(extent)), extent);
  assert.deepEqual(extentFromGeoJson(extentToGeoJson(extent)), extent);
  assert.deepEqual(
    extentFromGeoJson({ type: 'FeatureCollection', features: [{ geometry: { type: 'Point', coordinates: [3, 4] } }] }),
    { west: 3, south: 4, east: 3, north: 4 }
  );
  assert.equal(extentFromWkt('nothing'), null);
});
