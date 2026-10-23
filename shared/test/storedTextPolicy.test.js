import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsStoredCode, hasScriptOrStyle, isStoredCodeField } from '../src/data/storedTextPolicy.js';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
const { HEditForm } = await import('../src/widgets/edit-form/HEditForm.js');
const codes = { RT_CMS_HOME: 51, RT_CMS_PAGE: 52, DT_CMS_SCRIPT: 927, DT_CMS_CSS: 946,
  DT_CMS_HEADER: 929, DT_CMS_FOOTER: 940, DT_EXTENDED_DESCRIPTION: 4, DT_CMS_EXTFILES: 999 };
const dbdefs = { meta: { javaScriptAllowed: true }, dbconst: (name) => codes[name] };

test('CMS exceptions require authorization, record type and an explicit field', () => {
  for (const rty of [51, 52]) {
    for (const field of [927, 946, 929, 940, 4]) {
      assert.equal(allowsStoredCode(dbdefs, rty, field), true);
      assert.equal(allowsStoredCode({ ...dbdefs, meta: { javaScriptAllowed: false } }, rty, field), false);
      assert.equal(allowsStoredCode(dbdefs, 123, field), false);
    }
  }
  assert.equal(allowsStoredCode(dbdefs, 51, 999), false);
  assert.equal(allowsStoredCode(undefined, 0, 0), false);
  assert.equal(isStoredCodeField(dbdefs, 927), true);
  assert.equal(isStoredCodeField(dbdefs, 946), true);
  assert.equal(isStoredCodeField(dbdefs, 4), false);
});

test('advisory detection includes event handlers, CSS and encoded executable URLs', () => {
  for (const value of ['<script src=x>', '<STYLE>p{color:red}</STYLE>', '<p style="color:red">x</p>',
    '<img src=x onerror=alert(1)>', '<a href="java&#x73;cript:alert(1)">x</a>',
    '<a href="java&#10;script:alert(1)">x</a>', '<iframe srcdoc="x">',
    '<link href="a.css" rel="stylesheet">']) assert.equal(hasScriptOrStyle(value), true, value);
  for (const value of ['<p><strong>Text</strong></p>', '<a href="https://example.com">x</a>',
    'a < 5 & b > 2', '{"q":"t:1"}']) assert.equal(hasScriptOrStyle(value), false, value);
});

function form(options = {}) {
  const host = document.createElement('div'); document.body.append(host);
  return new HEditForm().attach(host, {
    form: { groups: [
      { id: 'first', type: 'tabs', label: 'First', children: [{ name: 'title', type: 'freetext' }] },
      { id: 'later', type: 'tabs', label: 'Later', children: [{ name: 'body', type: 'blocktext', multilang: true }] }
    ] }, lazyGroups: true, values: { title: 'title', body: '<p style="color:red">x</p>' }, ...options
  }).render();
}

test('warnings are non-blocking and cover values in unopened groups', async () => {
  const editor = form();
  assert.equal(editor.fields.has('body'), false);
  assert.deepEqual(editor.validate(), []);
  assert.equal(editor.validationIssues.length, 1);
  assert.equal(editor.validationIssues[0].severity, 'warning');
  assert.equal(editor.validationIssues[0].field, 'body');
  assert.equal(editor.fields.has('body'), true, 'warning reveals an unopened group');
  await editor.setValue('body', '<p>Safe text</p>');
  editor.validate();
  assert.deepEqual(editor.validationIssues, []);
});

test('authorized content has no warning; bare JS in an unauthorized code field does', () => {
  const authorized = form({ textPolicy: () => ({ allowCode: true }) });
  authorized.validate();
  assert.deepEqual(authorized.validationIssues, []);
  const denied = form({ values: { body: 'alert(1)' }, textPolicy: () => ({ codeField: true }) });
  denied.validate();
  assert.equal(denied.validationIssues[0].severity, 'warning');
});


test('translations and values beyond the rendered inputs are checked too', () => {
  const editor = form({ states: new Map([
    ['title', { values: [{ value: 'title' }], translations: [] }],
    ['body', { values: [{ value: '<p>safe</p>' }], translations: [{ lang: 'fre', value: '<p onclick="x()">texte</p>' }] }]
  ]), valueLimit: 1 });
  editor.validate();
  assert.equal(editor.validationIssues[0]?.field, 'body');
});
