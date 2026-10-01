import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { GraphApplication } = await import('../src/core/GraphApplication.js');

function application(popupTemplate, extra = {}) {
  return new GraphApplication({
    config: { selection: [], limits: {}, database: 'db1', engineOptions: { popupTemplate } },
    provider: {},
    engine: {},
    host: {},
    heuristBaseUrl: 'http://localhost/heurist/',
    recordViewLoader: { vocabularyProvider: { getRecordTypeNames: async () => new Map([[12, 'Place']]) } },
    ...extra,
  });
}

const find = (root, className) => root.querySelectorAll(`.${className}`);

test('the None popup mode shows no node popup', () => {
  assert.equal(application('none').createPopupContent({ recordId: 7, node: { recordTypeId: 12 } }), null);
});

test('the default (empty) mode is Built-in (vis basic), with the record type name instead of its ID', async () => {
  const content = application(null).createPopupContent({ recordId: 7, node: { recordTypeId: 12, title: 'Athens' } });
  await flush();
  assert.equal(find(content, 'h-record-popup-basic-meta')[0].textContent, 'Record 7 · Type: Place');
});

test('Built-in is the shared record view, compact with More...', async () => {
  const loads = [];
  const app = application('builtin', {
    recordViewLoader: {
      load: async (id, { full }) => {
        loads.push([id, full]);
        return { record: { rec_ID: id, rec_RecTypeID: 12, rec_Title: 'Athens' }, sections: [], recordTypeName: 'Place' };
      },
    },
  });
  let layouts = 0;
  const content = app.createPopupContent({ recordId: 7, node: { recordTypeId: 12 }, onLayout: () => { layouts += 1; } });
  await flush();
  assert.deepEqual(loads, [[7, false]]);
  find(content, 'heurist-recordview-more')[0].children[0].click();
  await flush();
  assert.deepEqual(loads, [[7, false], [7, true]], '"More..." loads the full record');
  assert.ok(layouts >= 2, 'the popup re-positions after its content changed');
});

test('a Smarty template is loaded through the record content provider', async () => {
  const app = application('Graph popup.tpl', {
    recordContentProvider: { load: async ({ template }) => new Map([[7, `<b>${template}</b>`]]) },
  });
  const content = app.createPopupContent({ recordId: 7, node: {} });
  await flush();
  assert.equal(find(content, 'h-record-popup-html')[0].innerHTML, '<b>Graph popup.tpl</b>');
});
