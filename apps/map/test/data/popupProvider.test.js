import test from 'node:test';
import assert from 'node:assert/strict';
import { PopupProvider } from '../../src/data/PopupProvider.js';
import { MapApplication } from '../../src/core/MapApplication.js';

test('PopupProvider builds legacy built-in and Smarty popup URLs', () => {
  const provider = new PopupProvider({ baseUrl: 'http://127.0.0.1/heurist/', database: 'osmak_mapping', fetchImpl: async () => null });
  const builtin = new URL(provider.buildUrl(123, 'standard'));
  assert.equal(builtin.pathname, '/heurist/viewers/record/renderRecordData.php');
  assert.equal(builtin.searchParams.get('mapPopup'), '1');
  assert.equal(builtin.searchParams.get('recID'), '123');
  assert.equal(builtin.searchParams.get('db'), 'osmak_mapping');

  const smarty = new URL(provider.buildUrl(123, 'Map popup.tpl'));
  assert.equal(smarty.pathname, '/heurist/api/osmak_mapping/reports/Map%20popup.tpl/render');
  assert.equal(smarty.searchParams.get('rec'), '123');
});

test('PopupProvider fetches HTML lazily with same-origin credentials', async () => {
  let request = null;
  const provider = new PopupProvider({
    baseUrl: 'http://localhost/heurist/', database: 'db1',
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, text: async () => '<div>popup</div>' };
    }
  });
  const html = await provider.load(7, { template: 'x.tpl' });
  assert.equal(html, '<div>popup</div>');
  assert.equal(request.init.credentials, 'same-origin');
  assert.equal(new URL(request.url).pathname, '/heurist/api/db1/reports/x.tpl/render');
});

test('PopupProvider supports none, minimal, standard and named-template modes', async () => {
  let requests = 0;
  const provider = new PopupProvider({
    baseUrl: 'http://localhost/heurist/', database: 'db1',
    fetchImpl: async () => { requests += 1; return { ok: true, text: async () => '<p>server</p>' }; }
  });

  assert.equal(await provider.load(7, { template: 'none' }), null);
  assert.equal(requests, 0);

  const minimal = await provider.load(7, {
    template: 'minimal',
    properties: { rec_ID: 7, rec_Title: 'Record seven' }
  });
  assert.match(minimal, /Record seven/);
  assert.match(minimal, /ID: 7/);
  assert.equal(requests, 0);

  const standard = new URL(provider.buildUrl(7, 'standard'));
  assert.equal(standard.pathname, '/heurist/viewers/record/renderRecordData.php');
  assert.equal(standard.searchParams.get('recID'), '7');

  const named = new URL(provider.buildUrl(7, 'My template.tpl'));
  assert.equal(named.pathname, '/heurist/api/db1/reports/My%20template.tpl/render');
  assert.equal(named.searchParams.get('rec'), '7');
});

test('minimal popup supports non-Heurist file features without a record ID', async () => {
  const provider = new PopupProvider({});
  const html = await provider.load(null, {
    template: 'minimal',
    properties: { id: 'road-4', description: 'Main road' }
  });
  assert.match(html, /<strong>id<\/strong> road-4/);
  assert.match(html, /<strong>description<\/strong> Main road/);
});

test('none suppresses popup and minimal can open for an external feature', async () => {
  const opened = [];
  const application = Object.create(MapApplication.prototype);
  application.config = { interaction: { selectionEnabled: false } };
  application.mapEngine = {
    openFeaturePopup: async (_layerId, _featureId, html) => {
      if (html) opened.push(html);
      return false;
    }
  };
  application.providers = { popup: new PopupProvider({}) };
  application.selectedFeatures = new Map();
  application.selectionLayerId = null;
  application.dispatch = () => {};
  application.layers = new Map([['L1', {
    id: 'L1', selectable: true, visible: true, loadState: 'loaded',
    popup: { enabled: true, template: 'none' }
  }]]);

  const detail = {
    layerId: 'L1', featureId: 'f1', recordId: null, selectable: true,
    popupProperties: { id: 'feature-1', description: 'External feature' }
  };
  await application.handleFeatureClick(detail);
  assert.equal(opened.length, 0);

  application.layers.get('L1').popup.template = 'minimal';
  await application.handleFeatureClick(detail);
  assert.equal(opened.length, 1);
  assert.match(opened[0], /feature-1/);
  assert.match(opened[0], /External feature/);
});


test('external vector layers force standard and named template modes to minimal', async () => {
  let requests = 0;
  const opened = [];
  const application = Object.create(MapApplication.prototype);
  application.config = { interaction: { selectionEnabled: false } };
  application.mapEngine = {
    openFeaturePopup: async (_layerId, _featureId, html) => {
      if (html) opened.push(html);
      return false;
    }
  };
  application.providers = {
    popup: new PopupProvider({
      baseUrl: 'http://localhost/heurist/', database: 'db1',
      fetchImpl: async () => { requests += 1; return { ok: true, text: async () => '<p>server</p>' }; }
    })
  };
  application.selectedFeatures = new Map();
  application.selectionLayerId = null;
  application.dispatch = () => {};
  application.layers = new Map([['L1', {
    id: 'L1', selectable: true, visible: true, loadState: 'loaded',
    source: { type: 'remote-geojson' },
    popup: { enabled: true, template: 'standard' }
  }]]);

  const detail = {
    layerId: 'L1', featureId: '17', recordId: 17, selectable: true,
    popupProperties: { rec_ID: 'shp-17', NAME: 'DBF feature' }
  };

  await application.handleFeatureClick(detail);
  assert.equal(requests, 0);
  assert.equal(opened.length, 1);
  assert.match(opened[0], /<strong>rec_ID<\/strong> shp-17/);
  assert.match(opened[0], /<strong>NAME<\/strong> DBF feature/);

  opened.length = 0;
  application.layers.get('L1').popup.template = 'My template.tpl';
  await application.handleFeatureClick(detail);
  assert.equal(requests, 0);
  assert.equal(opened.length, 1);
  assert.match(opened[0], /<strong>rec_ID<\/strong> shp-17/);
});

test('minimal popup renders first 10 external feature properties', async () => {
  const provider = new PopupProvider({});
  const properties = {
    ISO_3166_3: 'USA',
    OFFICIAL_C: "['50']",
    OFFICIAL_N: "['Vermont']",
    TYPE: 'state',
    YEAR: '2023',
    A: 1,
    B: true,
    C: ['x', 'y'],
    D: { value: 4 },
    E: null,
    OMITTED: 'eleventh'
  };
  const html = await provider.load(null, {
    template: 'minimal',
    properties
  });
  assert.match(html, /<strong>ISO_3166_3<\/strong> USA/);
  assert.match(html, /<strong>OFFICIAL_C<\/strong> \[&#39;50&#39;\]/);
  assert.match(html, /<strong>YEAR<\/strong> 2023/);
  assert.match(html, /\[&quot;x&quot;,&quot;y&quot;\]/);
  assert.match(html, /\{&quot;value&quot;:4\}/);
  assert.doesNotMatch(html, /OMITTED/);
});


test('minimal popup prioritizes rec_ID and rec_Title over generic property table', async () => {
  const provider = new PopupProvider({});
  const html = await provider.load(null, {
    template: 'minimal',
    properties: { rec_ID: '123', rec_Title: 'Mapped place', OTHER: 'ignored in compact view' }
  });
  assert.match(html, /<strong>Mapped place<\/strong>/);
  assert.match(html, /ID: 123/);
  assert.doesNotMatch(html, /OTHER/);
});

test('minimal popup ignores runtime heurist and thematic metadata in generic properties', async () => {
  const provider = new PopupProvider({});
  const html = await provider.load(null, {
    template: 'minimal',
    properties: {
      heurist: { featureId: 'x' },
      thematic: { '10:1': { 1: 'x' } },
      NAME: 'Visible field'
    }
  });
  assert.doesNotMatch(html, /<strong>heurist<\/strong>/);
  assert.doesNotMatch(html, /<strong>thematic<\/strong>/);
  assert.match(html, /<strong>NAME<\/strong> Visible field/);
});
