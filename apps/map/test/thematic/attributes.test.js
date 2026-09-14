import test from 'node:test';
import assert from 'node:assert/strict';

import { ThematicAttributeProvider } from '../../src/data/ThematicAttributeProvider.js';
import { GeoJsonLayerLoader } from '../../src/engine/loaders/GeoJsonLayerLoader.js';
import {
  applyThematicAttributes,
  collectThematicRecordIds,
  getActiveThematicMap,
  getThematicFieldCodes,
  pathOccurrencesMatch
} from '../../src/thematic/thematicAttributes.js';

const thematicStyle = {
  type: 'thematic',
  symbol: {},
  thematic: [
    {
      title: 'Inactive',
      active: false,
      fields: [{ code: '10:999', ranges: [] }]
    },
    {
      title: 'Active',
      active: true,
      fields: [
        { code: '10:133', ranges: [] },
        { code: '10:lt240:48:237', ranges: [] },
        { code: '10:lt240:48:237', ranges: [] },
        { code: 'rec_GeoField', ranges: [] }
      ]
    }
  ]
};

function queryLayer(style = thematicStyle) {
  return {
    id: 20,
    title: 'Thematic query',
    description: '',
    visible: true,
    selectable: true,
    source: { type: 'heurist-query', query: [{ t: 10 }], limit: 1000 },
    style,
    options: {},
    timeline: { enabled: false, fields: [] }
  };
}

function geoJson() {
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { rec_ID: 101, rec_RecTypeID: 10 }, geometry: null },
      { type: 'Feature', properties: { rec_ID: 101, rec_RecTypeID: 10 }, geometry: null },
      { type: 'Feature', properties: { rec_ID: 102, rec_RecTypeID: 10 }, geometry: null }
    ],
    meta: { total: 2, returnedRecords: 2, returnedFeatures: 3 }
  };
}

test('active thematic map and API field codes are extracted without client-side path interpretation', () => {
  const theme = getActiveThematicMap(thematicStyle);
  assert.equal(theme.title, 'Active');
  assert.deepEqual(getThematicFieldCodes(theme), [
    '10:133',
    '10:lt240:48:237'
  ]);
});

test('thematic record IDs are deduplicated from normalized or legacy feature properties', () => {
  const data = geoJson();
  data.features[2].properties = { heurist: { recordId: 102 } };
  assert.deepEqual(collectThematicRecordIds(data), [101, 102]);
});

test('ThematicAttributeProvider posts deduplicated IDs and exact field-path codes', async () => {
  let call;
  const provider = new ThematicAttributeProvider({
    apiClient: {
      async post(path, options) {
        call = { path, options };
        return { records: [], meta: { entity: 'records' } };
      }
    }
  });

  await provider.load({
    recordIds: [101, '101', 102, 0, null],
    fieldCodes: ['10:133', '10:133', '10:lt240:48:237', '']
  });

  assert.equal(call.path, '/records');
  assert.deepEqual(call.options.body, {
    ids: [101, 102],
    fields: ['10:133', '10:lt240:48:237'],
    resolveDetails: true
  });
});

test('thematic API details are attached by source record ID and preserve value arrays', () => {
  const data = geoJson();
  for (const feature of data.features) {
    feature.properties.heurist = { recordId: Number(feature.properties.rec_ID) };
  }

  applyThematicAttributes(data, {
    records: [
      {
        rec_ID: '101',
        details: {
          '10:133': [{ value: 'A' }],
          '10:lt240:48:237': [
            { value: '10443', path: { id: '1', recordIDs: ['101', '501'] } },
            { value: '10444', path: { id: '1', recordIDs: ['101', '502'] } }
          ]
        }
      }
    ],
    meta: { paths: { '1': '10:lt240:48' } }
  });

  assert.deepEqual(data.features[0].properties.thematic, {
    '10:133': [{ value: 'A' }],
    '10:lt240:48:237': [
      { value: '10443', path: { id: '1', recordIDs: ['101', '501'] } },
      { value: '10444', path: { id: '1', recordIDs: ['101', '502'] } }
    ]
  });
  assert.deepEqual(data.features[1].properties.thematic, data.features[0].properties.thematic);
  assert.deepEqual(data.features[2].properties.thematic, {});
});

test('linked thematic values match only features sharing the configured record-chain prefix', () => {
  const data = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          rec_ID: 101,
          _path: { id: '7', recordIDs: ['101', '501', '701'] }
        },
        geometry: null
      },
      {
        type: 'Feature',
        properties: {
          rec_ID: 101,
          _path: { id: '7', recordIDs: ['101', '502', '702'] }
        },
        geometry: null
      }
    ],
    meta: { paths: { '7': '10:lt240:48:lt134:12' } }
  };
  applyThematicAttributes(data, {
    records: [{
      rec_ID: '101',
      details: {
        '10:133': [{ value: 'top' }],
        '10:lt240:48:237': [
          { value: 'event-a', path: { id: '1', recordIDs: ['101', '501'] } },
          { value: 'event-b', path: { id: '1', recordIDs: ['101', '502'] } }
        ]
      }
    }],
    meta: { paths: { '1': '10:lt240:48' } }
  });

  assert.deepEqual(
    data.features[0].properties.thematic['10:lt240:48:237'].map((item) => item.value),
    ['event-a']
  );
  assert.deepEqual(
    data.features[1].properties.thematic['10:lt240:48:237'].map((item) => item.value),
    ['event-b']
  );
  assert.equal(data.features[0].properties.thematic['10:133'][0].value, 'top');
  assert.equal(pathOccurrencesMatch(
    '10:lt240:48:lt134:12', ['101','501','701'],
    '10:lt240:48', ['101','502']
  ), false);
});

test('GeoJsonLayerLoader enriches a thematic query layer before creating the runtime layer', async () => {
  let attributeRequest;
  const loader = new GeoJsonLayerLoader({
    queryGeoData: { async searchAll() { return geoJson(); } },
    thematicAttributes: {
      async load(request) {
        attributeRequest = request;
        return {
          records: [
            { rec_ID: '101', details: { '10:133': { '1': 'one' } } },
            { rec_ID: '102', details: { '10:133': { '2': 'two' } } }
          ]
        };
      }
    }
  });

  const runtime = await loader.load(queryLayer(), {
    reference: { id: 'thematic', recordId: 20, order: 1 },
    signal: new AbortController().signal,
    application: { dispatch() {} }
  });

  assert.deepEqual(attributeRequest.recordIds, [101, 102]);
  assert.deepEqual(attributeRequest.fieldCodes, ['10:999', '10:133', '10:lt240:48:237']);
  assert.deepEqual(runtime.data.features[0].properties.thematic['10:133'], { '1': 'one' });
  assert.deepEqual(runtime.data.features[2].properties.thematic['10:133'], { '2': 'two' });
});

test('thematic enrichment failure emits a warning but does not fail geometry loading', async () => {
  const warnings = [];
  const loader = new GeoJsonLayerLoader({
    queryGeoData: { async searchAll() { return geoJson(); } },
    thematicAttributes: { async load() { throw new Error('attribute API failed'); } }
  });

  const runtime = await loader.load(queryLayer(), {
    reference: { id: 'thematic', recordId: 20, order: 1 },
    application: { dispatch(type, detail) { warnings.push([type, detail]); } }
  });

  assert.equal(runtime.data.features.length, 3);
  assert.equal(runtime.data.features[0].properties.thematic, undefined);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], 'heurist-map-warning');
  assert.equal(warnings[0][1].code, 'thematic-attributes-unavailable');
});

test('thematic enrichment propagates AbortError so superseded viewport loads remain cancellable', async () => {
  const loader = new GeoJsonLayerLoader({
    queryGeoData: { async searchAll() { return geoJson(); } },
    thematicAttributes: {
      async load() { throw new DOMException('superseded', 'AbortError'); }
    }
  });

  await assert.rejects(
    loader.load(queryLayer(), {
      reference: { id: 'thematic', recordId: 20, order: 1 },
      signal: new AbortController().signal,
      application: { dispatch() {} }
    }),
    (error) => error.name === 'AbortError'
  );
});

test('simple and inline GeoJSON layers do not request thematic attributes', async () => {
  let calls = 0;
  const loader = new GeoJsonLayerLoader({
    queryGeoData: { async searchAll() { return geoJson(); } },
    thematicAttributes: { async load() { calls += 1; return { records: [] }; } }
  });

  await loader.load(queryLayer({ type: 'simple', symbol: {}, thematic: null }), {
    reference: { id: 'simple', recordId: 20, order: 1 },
    application: { dispatch() {} }
  });

  const inline = queryLayer(thematicStyle);
  inline.source = { type: 'inline-geojson', data: geoJson() };
  await loader.load(inline, {
    reference: { id: 'inline', recordId: 21, order: 1 },
    application: { dispatch() {} }
  });

  assert.equal(calls, 0);
});

test('all thematic field codes are collected so runtime theme switching needs no data reload', async () => {
  const { getAllThematicFieldCodes } = await import('../../src/thematic/thematicAttributes.js');
  const style = {
    thematic: [
      { active: false, fields: [{ code: '12:133' }, { code: 'rec_GeoField' }] },
      { active: true, fields: [{ code: '12:1160' }, { code: '12:133' }] }
    ]
  };
  assert.deepEqual(getAllThematicFieldCodes(style), ['12:133', '12:1160']);
});

test('activateThematicMap selects one theme or restores default symbology', async () => {
  const { activateThematicMap } = await import('../../src/thematic/thematicAttributes.js');
  const style = {
    symbol: { color: '#123456' },
    thematic: [
      { title: 'One', active: true },
      { title: 'Two', active: false }
    ]
  };
  const second = activateThematicMap(style, 1);
  assert.deepEqual(second.thematic.map((item) => item.active), [false, true]);
  assert.deepEqual(style.thematic.map((item) => item.active), [true, false]);
  const normal = activateThematicMap(second, null);
  assert.deepEqual(normal.thematic.map((item) => item.active), [false, false]);
  assert.throws(() => activateThematicMap(style, 5), RangeError);
});
