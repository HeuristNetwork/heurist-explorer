import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../../shared/test/helpers/fakeDom.js';
import { MapApplication } from '../../src/core/MapApplication.js';
import { recordTree, uniqueEntries } from '../../src/ui/popup/MapPopupController.js';
import { normalizePopupMode } from '../../src/data/PopupProvider.js';

installFakeDom();

/** A MapApplication shell with a stub engine and popup provider. */
function createApplication({ template = 'x.tpl', features = null, layerExtra = {} } = {}) {
  const calls = [];
  const opened = [];
  const application = Object.create(MapApplication.prototype);
  application.config = { interaction: { selectionEnabled: true, zoomOnSelection: false }, database: 'db1' };
  application.mapEngine = {
    openFeaturePopup: (_layerId, _featureId, content) => {
      opened.push(content);
      return { update() {}, close() {}, isOpen: () => true };
    },
    getCoincidentFeatures: () => features || [],
    setFeatureSelection: async () => { calls.push('select'); },
    getFeatureRecordId: () => 55,
    getFeatureIdsByRecord: () => ['f1']
  };
  application.providers = {
    popup: {
      baseUrl: 'http://localhost/heurist/',
      isConfigured: () => true,
      load: async (id, { template: used }) => {
        calls.push(`load ${id} ${used}`);
        return `<b>${id}</b>`;
      }
    }
  };
  application.layers = new Map([['L1', {
    id: 'L1', selectable: true, visible: true, loadState: 'loaded',
    source: { type: 'heurist-query' },
    popup: { enabled: true, template },
    ...layerExtra
  }]]);
  application.selectedFeatures = new Map();
  application.selectionLayerId = null;
  application.dispatch = () => {};
  application.zoomToSelection = async () => {};
  return { application, calls, opened };
}

/** All descendants of a fake element with a class. */
function findAll(root, className) {
  return root.querySelectorAll(`.${className}`);
}

test('popup content is built fresh on every click with the template in effect at click time', async () => {
  const { application, calls, opened } = createApplication();
  const click = { layerId: 'L1', featureId: 'f1', recordId: 55, selectable: true };

  await application.handleFeatureClick(click);
  await flush();
  assert.deepEqual(calls, ['select', 'load 55 x.tpl']);

  calls.length = 0;
  application.layers.get('L1').popup.template = 'standard';
  await application.handleFeatureClick(click);
  await flush();
  assert.deepEqual(calls, ['select', 'load 55 standard']);
  assert.equal(opened.length, 2);
});

test('a layer inheriting the popup template uses the current global default', async () => {
  const { application, calls } = createApplication({ template: 'old.tpl' });
  const mapLayer = { options: { popupTemplate: 'old.tpl' } };
  Object.defineProperty(mapLayer, '_defaulted', { value: { popupTemplate: true } });
  application.activeMapDocumentId = 'D1';
  application.mapDocuments = new Map([['D1', { id: 'D1', layerDefinitions: [{ reference: { id: 'L1' }, mapLayer }] }]]);
  application.config.defaults = { popupTemplate: 'new.tpl' };

  await application.handleFeatureClick({ layerId: 'L1', featureId: 'f1', recordId: 55, selectable: true });
  await flush();
  assert.deepEqual(calls, ['select', 'load 55 new.tpl']);
});

test('popupEnabled=false in the interaction settings suppresses the popup', async () => {
  const { application, opened } = createApplication();
  application.config.interaction.popupEnabled = false;
  await application.handleFeatureClick({ layerId: 'L1', featureId: 'f1', recordId: 55, selectable: true });
  assert.equal(opened.length, 0);
});

test('several features at one spot show a selector list; a line opens that record with Back', async () => {
  const features = [
    { layerId: 'L1', featureId: 'f1', recordId: 55, properties: { heurist: { recordId: 55, recordTypeId: 12, title: 'Athens' } } },
    { layerId: 'L1', featureId: 'f2', recordId: 56, properties: { heurist: { recordId: 56, recordTypeId: 10, title: 'Smith' } } }
  ];
  const { application, calls, opened } = createApplication({ features });
  await application.handleFeatureClick({ layerId: 'L1', featureId: 'f1', recordId: 55, selectable: true });
  await flush();

  const root = opened[0];
  const items = findAll(root, 'heurist-map-popup-item');
  assert.equal(items.length, 2);
  assert.equal(findAll(root, 'heurist-map-popup-item-icon')[0].src, 'http://localhost/heurist/?db=db1&icon=12');
  assert.deepEqual(calls, ['select']);

  items[1].click();
  await flush();
  assert.deepEqual(calls, ['select', 'load 56 x.tpl']);
  const back = findAll(root, 'h-record-popup-back');
  assert.equal(back.length, 1);

  back[0].click();
  assert.equal(findAll(root, 'heurist-map-popup-item').length, 2);
});

test('a linked-feature path shows the records from the mapped record to the geometry record', async () => {
  const features = [{
    layerId: 'L1', featureId: '153:1:96:28:1', recordId: 153,
    properties: {
      heurist: { recordId: 153, recordTypeId: 10, title: 'Matumba' },
      _path: { id: '1', recordIDs: ['153', '204874', '96'] }
    }
  }];
  const linkedRecords = new Map([
    [204874, { rec_RecTypeID: '48', rec_Title: 'Lived at' }],
    [96, { rec_RecTypeID: '12', rec_Title: 'Athens' }]
  ]);
  const { application, calls, opened } = createApplication({ features, layerExtra: { linkedRecords } });

  assert.deepEqual(application.popupEntries(features), [{ chain: [
    { id: 153, rty: 10, title: 'Matumba' },
    { id: 204874, rty: 48, title: 'Lived at' },
    { id: 96, rty: 12, title: 'Athens' }
  ] }]);

  await application.handleFeatureClick({ layerId: 'L1', featureId: '153:1:96:28:1', recordId: 153, selectable: true });
  await flush();
  const items = findAll(opened[0], 'heurist-map-popup-item');
  assert.deepEqual(items.map((item) => item.style.paddingLeft), ['6px', '22px', '38px']);

  items[1].click();
  await flush();
  assert.deepEqual(calls, ['select', 'load 204874 x.tpl']);
});

test('the basic mode shows title, record ID and record type name without a server request', async () => {
  const { application, calls, opened } = createApplication({ template: 'basic' });
  application.providers.recordView = {
    vocabularyProvider: { getRecordTypeNames: async () => new Map([[12, 'Place']]) }
  };
  await application.handleFeatureClick({
    layerId: 'L1', featureId: 'f1', recordId: 55, selectable: true,
    popupProperties: { heurist: { recordId: 55, recordTypeId: 12, title: 'Athens' } }
  });
  await flush();
  assert.deepEqual(calls, ['select']);
  assert.equal(findAll(opened[0], 'h-record-popup-basic-meta')[0].textContent, 'Record 55 · Type: Place');
});

test('popup entries are de-duplicated and paths sharing records are merged', () => {
  const entries = uniqueEntries([
    { chain: [{ id: 1 }, { id: 2 }, { id: 9 }] },
    { chain: [{ id: 1 }, { id: 2 }, { id: 9 }] },
    { chain: [{ id: 1 }, { id: 3 }, { id: 9 }] },
    { chain: [{ id: 0 }] }
  ]);
  assert.equal(entries.length, 2);
  const tree = recordTree(entries);
  assert.deepEqual([...tree.keys()], ['1']);
  assert.deepEqual([...tree.get('1').children.keys()], ['2', '3']);
});

test('the former minimal popup mode is read as basic', () => {
  assert.equal(normalizePopupMode('minimal'), 'basic');
  assert.equal(normalizePopupMode('Built-in'), 'Built-in');
  assert.equal(normalizePopupMode('builtin'), 'builtin');
  assert.equal(normalizePopupMode(null), 'basic', 'the default is Built-in (basic)');
  assert.equal(normalizePopupMode(''), 'basic');
});

test('in the basic mode the lines of several records are plain rows, not opening another view', async () => {
  const features = [
    { layerId: 'L1', featureId: 'f1', recordId: 55, properties: { heurist: { recordId: 55, recordTypeId: 12, title: 'Athens' } } },
    { layerId: 'L1', featureId: 'f2', recordId: 56, properties: { heurist: { recordId: 56, recordTypeId: 10, title: 'Smith' } } }
  ];
  const { application, opened } = createApplication({ template: '', features });
  await application.handleFeatureClick({ layerId: 'L1', featureId: 'f1', recordId: 55, selectable: true });
  await flush();
  const items = findAll(opened[0], 'heurist-map-popup-item');
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => item.tagName === 'DIV' && item.classList.contains('heurist-map-popup-item-static')));
  items[0].click();
  assert.equal(findAll(opened[0], 'h-record-popup-back').length, 0, 'nothing opened');
});

test('clicks inside the popup content do not reach the map (it would close the popup)', async () => {
  const { application, opened } = createApplication();
  await application.handleFeatureClick({ layerId: 'L1', featureId: 'f1', recordId: 55, selectable: true });
  const root = opened[0];
  let reachedMap = false;
  const map = document.createElement('div');
  map.addEventListener('click', () => { reachedMap = true; });
  map.append(root);
  root.fire('click');
  assert.equal(reachedMap, false);
});

test('the built-in record view shows the edit pencil only when the host can edit records', async () => {
  const { application, opened } = createApplication({ template: 'builtin' });
  application.providers.recordView = {
    load: async (id) => ({ record: { rec_ID: id, rec_RecTypeID: 12, rec_Title: 'Athens' }, sections: [], recordTypeName: 'Place' })
  };
  const edited = [];
  let canEdit = false;
  application.host = {
    supportsEditing: () => canEdit,
    editRecord: async (id) => { edited.push(id); return { saved: false }; }
  };
  const click = { layerId: 'L1', featureId: 'f1', recordId: 55, selectable: true };

  await application.handleFeatureClick(click);
  await flush();
  assert.equal(findAll(opened[0], 'heurist-recordview-edit-button').length, 0);

  canEdit = true;
  await application.handleFeatureClick(click);
  await flush();
  const pencil = findAll(opened[1], 'heurist-recordview-edit-button');
  assert.equal(pencil.length, 1);
  pencil[0].click();
  await flush();
  assert.deepEqual(edited, [55]);

  application.config.readonly = true;
  await application.handleFeatureClick(click);
  await flush();
  assert.equal(findAll(opened[2], 'heurist-recordview-edit-button').length, 0);
});
