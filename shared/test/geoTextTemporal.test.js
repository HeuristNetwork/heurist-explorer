import test from 'node:test';
import assert from 'node:assert/strict';
import { geoToHuman, wktVertices } from '../src/utils/geoText.js';
import { temporalToHuman } from '../src/utils/temporal.js';

test('geoToHuman: type, number of vertices and coordinate ranges', () => {
  assert.equal(
    geoToHuman('POLYGON((-153.23896371 -38.3421436,190.6447474 -38.3421436,190.6447474 70.3620549,-153.23896371 70.3620549,-153.23896371 -38.3421436))'),
    'Polygon n=5 (X -153.2389637,190.6447474 Y -38.3421436,70.3620549)');
  assert.equal(geoToHuman('MULTIPOLYGON(((0 0,1 0,1 1,0 0)),((5 5,6 5,6 6,5 5)))'), 'MultiPolygon n=8 (X 0,6 Y 0,6)');
  assert.equal(geoToHuman('pl POLYGON((0 0,1 0,1 1,0 0))'), 'Polygon n=4 (X 0,1 Y 0,1)', 'a legacy type code is ignored');
  assert.equal(geoToHuman('POINT Z (1 2 3)'), 'Point (X 1 Y 2)', 'z is ignored');
  assert.equal(geoToHuman('GEOMETRYCOLLECTION(POINT(1 2),LINESTRING(3 4,5 6))'), 'GeometryCollection n=3 (X 1,5 Y 2,6)');
  assert.equal(geoToHuman('POINT EMPTY'), 'Point');
  assert.equal(geoToHuman(''), '');
  assert.equal(geoToHuman('not wkt'), 'not wkt');
  assert.deepEqual(wktVertices('LINESTRING(1 2, 3 4)'), [[1, 2], [3, 4]]);
});

test('temporalToHuman: plain dates', () => {
  assert.equal(temporalToHuman('1969'), '1969');
  assert.equal(temporalToHuman('1969-05'), 'May 1969');
  assert.equal(temporalToHuman('1969-05-03'), '3 May 1969');
  assert.equal(temporalToHuman('1969-05-03 10:20'), '3 May 1969 10:20');
  assert.equal(temporalToHuman('-500'), '500 BCE');
  assert.equal(temporalToHuman('rubbish'), 'rubbish');
});

test('temporalToHuman: temporal objects', () => {
  assert.equal(temporalToHuman('{"timestamp":{"in":"1969","type":"s","before":true},"comment":"1970","estMinDate":1969,"estMaxDate":1969}'), 'before 1969');
  assert.equal(temporalToHuman({ timestamp: { in: '1850', deviation: 'P10Y' } }), '1850 ±10 years');
  assert.equal(temporalToHuman({ timestamp: { in: '1850-03-01', circa: true } }), 'circa 1 Mar 1850');
  assert.equal(temporalToHuman({ start: { earliest: '1850' }, end: { latest: '1900-06' } }), '1850 to Jun 1900');
  assert.equal(temporalToHuman({ start: { earliest: '1850-07' }, end: { latest: '1850-07' }, estMinDate: 1850.0701, estMaxDate: 1850.0731 }), 'July 1850');
  assert.equal(temporalToHuman({ start: { earliest: '1850' }, end: { latest: '1850' }, estMinDate: 1850.0101, estMaxDate: 1850.1231 }), '1850');
  assert.equal(temporalToHuman('|VER=1|TYP=s|DAT=1969-05-03'), '3 May 1969');
  assert.equal(temporalToHuman('{bad json'), '{bad json');
});
