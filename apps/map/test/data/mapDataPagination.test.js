import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { QueryGeoDataProvider } from '../../src/data/QueryGeoDataProvider.js';
import { createGeoJsonRuntimeLayer } from '../../src/engine/loaders/GeoJsonLayerLoader.js';

const layerItemSource = await readFile(new URL('../../src/ui/LayerPanelItem.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../../src/style.css', import.meta.url), 'utf8');

test('map API pagination advances by returned records, not emitted features', async () => {
  const offsets = [];
  const provider = new QueryGeoDataProvider({
    apiClient: {
      get: async (_path, options) => {
        offsets.push(options.query.offset);
        if (options.query.offset === 0) {
          return {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: null }],
            meta: { totalRecords: 3, returnedRecords: 2, returnedFeatures: 1, offset: 0, limit: 2, isPartial: true }
          };
        }
        return {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: null }],
          meta: { totalRecords: 3, returnedRecords: 1, returnedFeatures: 1, offset: 2, limit: 1, isPartial: false }
        };
      }
    }
  });

  const result = await provider.searchAll({ query: 't:10', limit: 2 });
  assert.deepEqual(offsets, [0, 2]);
  assert.equal(result.features.length, 2);
  assert.equal(result.meta.returnedFeatures, 2);
  assert.equal(result.meta.isPartial, false);
});


test('map API pagination keeps record page size when only a few features remain', async () => {
  const requests = [];
  const provider = new QueryGeoDataProvider({
    apiClient: {
      get: async (_path, options) => {
        requests.push({ offset: options.query.offset, limit: options.query.limit });

        if (options.query.offset === 0) {
          return {
            type: 'FeatureCollection',
            features: Array.from({ length: 8 }, (_, index) => ({
              type: 'Feature', id: index + 1, properties: {}, geometry: null
            })),
            meta: { totalRecords: 30, returnedRecords: 10, returnedFeatures: 8, offset: 0, limit: 10, isPartial: true }
          };
        }

        return {
          type: 'FeatureCollection',
          features: Array.from({ length: 7 }, (_, index) => ({
            type: 'Feature', id: index + 11, properties: {}, geometry: null
          })),
          meta: { totalRecords: 30, returnedRecords: 10, returnedFeatures: 7, offset: 10, limit: 10, isPartial: true }
        };
      }
    }
  });

  const result = await provider.searchAll({ query: 'sortby:-m', limit: 10, maxFeatures: 10 });

  assert.deepEqual(requests, [
    { offset: 0, limit: 10 },
    { offset: 10, limit: 10 }
  ]);
  assert.equal(result.features.length, 10);
  assert.equal(result.meta.returnedFeatures, 10);
  assert.equal(result.meta.isPartial, true);
});

test('GeoJSON runtime layer preserves map API result metadata', () => {
  const layer = createGeoJsonRuntimeLayer(
    {
      id: null,
      title: 'Filtered Result',
      visible: true,
      selectable: true,
      source: { type: 'heurist-query' },
      style: {},
      options: {}
    },
    { reference: { id: 'current-results', order: 0 } },
    {
      type: 'FeatureCollection',
      features: [],
      meta: { totalRecords: 25, returnedRecords: 10, returnedFeatures: 7, isPartial: true, offset: 0, limit: 10 }
    }
  );
  assert.deepEqual(layer.resultMeta, {
    totalRecords: 25,
    returnedRecords: 10,
    returnedFeatures: 7,
    offset: 0,
    limit: 10,
    isPartial: true
  });
});

test('current-results layer displays feature count and explicit partial warning', () => {
  assert.match(layerItemSource, /String\(layer\?\.id\) !== 'current-results'/);
  assert.match(layerItemSource, /Result: \$\{formatCount\(features\)\} features/);
  assert.match(layerItemSource, /Partial load:/);
  assert.match(layerItemSource, /title\.title = presentation\.title/);
  assert.match(cssSource, /heurist-map-layer-partial-warning/);
  assert.match(cssSource, /font-size:10px/);
});
