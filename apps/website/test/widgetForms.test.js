/**
 * @file widgetForms.test.js
 * @brief Pure helpers of the forms of semi-static content (plan 27e).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { captionValue, fieldDetails, fieldSnapshot, fieldTerms, generatedFileTerms, manualIds, manualQuery, mediaFormFields, mediaSizeValue, parseCardsQuery, parseFieldReference, readCaption, reportFiles, teamReportBody, visibleToGuests } = await import('../src/designer/widgetForms.js');
const { CmsRecordDocument } = await import('#shared/site/cmsEdit.js');
const { changedDetails } = await import('../src/designer/designerData.js');
const { needsSlider } = await import('../src/siteWidgets.js');

test('field reference: a record, the website, the page', () => {
  assert.deepEqual(parseFieldReference('207439.2-1'), { source: 'record', record: 207439, code: '2-1' });
  assert.deepEqual(parseFieldReference('website.2-38'), { source: 'website', record: 0, code: '2-38' });
  assert.deepEqual(parseFieldReference('page.15'), { source: 'page', record: 0, code: '15' });
  assert.equal(parseFieldReference('x.2-1'), null);
  assert.equal(parseFieldReference(null), null);
});

test('field list: date, numbers, text, terms and files; no pointers', () => {
  const dbdefs = { fields: () => [{ id: 1, name: 'Name', type: 'freetext' }, { id: 2, name: 'Link', type: 'resource' },
    { id: 3, name: 'Date', type: 'date' }, { id: 4, name: 'Term', type: 'enum' }, { id: 5, name: 'Rel', type: 'relmarker' }] };
  assert.deepEqual(fieldTerms(dbdefs, 10).map((term) => term.id), [1, 3, 4]);
  assert.deepEqual(fieldTerms(dbdefs, 10, [3]).map((term) => term.id), [1, 4], 'the fields that hold the page are not offered');
});

test('Record field: the warning only for records guests can not see; Save writes this field only', () => {
  assert.equal(visibleToGuests('public'), true);
  assert.equal(visibleToGuests('pending'), true, 'guests see pending records');
  assert.equal(visibleToGuests('viewable'), false);
  assert.equal(visibleToGuests('hidden'), false);
  const field = { dty: 1, type: 'freetext', multilang: true };
  const state = { values: [{ value: 'Name', hidden: false }], translations: [{ lang: 'FRE', value: 'Nom', hidden: false }] };
  assert.deepEqual(fieldDetails(field, state), { 1: ['Name', 'FRE:Nom'] });
});

test('snapshot of a field: text escaped, translations left out, terms, file', () => {
  assert.equal(fieldSnapshot(['A & B', 'fre:C'], 'freetext'), 'A &amp; B');
  assert.equal(fieldSnapshot(['fre:C'], 'freetext'), 'C');
  assert.equal(fieldSnapshot(['<b>x</b>', '<i>y</i>'], 'blocktext'), '<b>x</b><i>y</i>');
  assert.equal(fieldSnapshot([{ value: '4', trm_Label: 'Yes' }], 'enum'), 'Yes');
  assert.equal(fieldSnapshot([{ value: '1', file: { ulf_ObfuscatedFileID: 'abc' } }], 'file', { fileUrl: (key) => `f?${key}` }), '<img src="f?abc" alt="">');
  assert.equal(fieldSnapshot(undefined, 'freetext'), '');
});

test('manual cards keep the picked order', () => {
  const query = manualQuery(['3', 1, 2]);
  assert.deepEqual(query, [{ ids: '3,1,2' }, { sortby: 'set' }]);
  assert.deepEqual(manualIds(query), [3, 1, 2]);
  assert.deepEqual(manualIds(null), []);
});

test('a query of cards: JSON without parameters', () => {
  assert.deepEqual(parseCardsQuery('[{"t":"10"}]'), [{ t: '10' }]);
  assert.deepEqual(parseCardsQuery('{"t":"10"}'), [{ t: '10' }]);
  assert.equal(parseCardsQuery('[{"title":"$X$"}]'), null);
  assert.equal(parseCardsQuery('t:10'), null);
  assert.equal(parseCardsQuery('[]'), null);
});

test('report files: only the languages with a file', () => {
  assert.deepEqual(reportFiles({ eng: 'Team.html', fre: '' }), { eng: 'Team.html' });
});

test('Team member report: fields by local ids of the database', () => {
  const body = teamReportBody({ localId: (kind, code) => ({ '2-38': 38, '2-3': 3 })[code] });
  assert.match(body, /\$r\.f38/);
  assert.match(body, /\$r\.f3\}/);
  assert.doesNotMatch(teamReportBody({ localId: () => 0 }), /\$r\.f0/);
});

test('media form: 190px only for a new gallery; saved sizes and a single element keep theirs', () => {
  assert.equal(mediaSizeValue(undefined, false), '190px');
  assert.equal(mediaSizeValue(undefined, true), '');
  assert.equal(mediaSizeValue('auto', false), '', 'a saved auto stays auto');
  assert.equal(mediaSizeValue('300px', true), '300px');
});

test('media form: a single element has one source, a typed caption and no presentation; sources can be added', () => {
  const names = (fields) => fields.map((field) => field.name);
  const gallery = mediaFormFields({ mediaType: 5, fileType: 6 });
  const single = mediaFormFields({ single: true, mediaType: 5, fileType: 6 });
  assert.deepEqual(names(gallery), ['mode', 'records', 'files', 'caption', 'width', 'height', 'action', 'presentation', 'duration', 'fade', 'navigation', 'fit']);
  assert.deepEqual(names(single), ['mode', 'records', 'files', 'captionText', 'width', 'height', 'action']);
  for (const [fields, max] of [[gallery, 0], [single, 1]]) {
    for (const field of fields.filter((item) => item.type === 'resource')) {
      assert.equal(field.max, max);
      assert.equal(field.pointerMode, 'addorbrowse');
    }
  }
});

test('media form: the caption is the multilingual field of the form', () => {
  assert.equal(mediaFormFields({ single: true, multilang: true }).find((field) => field.name === 'captionText').multilang, true);
  assert.equal(mediaFormFields({ single: true }).find((field) => field.name === 'captionText').multilang, false);
  const value = captionValue('Fun cats', { fre: 'Chats', ger: '' });
  assert.deepEqual(value, ['Fun cats', 'FRE:Chats']);
  assert.deepEqual(readCaption(value, ['eng', 'fre', 'ger']), { caption: 'Fun cats', translations: { fre: 'Chats', ger: '' } });
  assert.deepEqual(readCaption(['Map: north'], ['eng', 'fre']), { caption: 'Map: north', translations: { fre: '' } }, 'not a language of the website');
  assert.deepEqual(readCaption('Plain', []), { caption: 'Plain', translations: {} });
  assert.deepEqual(readCaption(null, ['eng']), { caption: '', translations: {} });
});

test('a translation changed in the document goes into the PATCH', () => {
  const content = '<figure data-h-node="a" data-h-media="m1" data-h-text=""><img src="x" alt="" /></figure>';
  const config = JSON.stringify({ schema: 'heurist-cms/4', instances: {}, styles: {}, media: { m1: { file: 'k1' } } });
  const doc = new CmsRecordDocument({ parts: { content }, config, translations: { fre: { a: 'old' } } });
  const saved = doc.serialize();
  doc.setTranslation('fre', 'a', 'new');
  const details = changedDetails(doc.serialize(), saved, { translations: 1199, configuration: 1180 });
  assert.deepEqual(details, { 1199: ['fre:{"a":"new"}'] });
});

test('Generated Report: HTML files of the report; a file of the Generate button is offered and labelled', () => {
  const terms = generatedFileTerms([{ file: 'Team.html' }, { file: 'Team_u2.html' }, { file: 'Team.pdf' }]);
  assert.deepEqual(terms.map((term) => term.id), ['Team.html', 'Team_u2.html']);
  assert.equal(terms[0].label, 'Team.html');
  assert.match(terms[1].label, /not scheduled/);
  assert.deepEqual(generatedFileTerms([], ['Old.html', '']).map((term) => term.id), ['Old.html'], 'a stored file stays');
});

test('HSlider only for a slider or an action', () => {
  assert.equal(needsSlider({ presentation: 'slider' }), true);
  assert.equal(needsSlider({ presentation: 'list', action: 'url' }), true);
  assert.equal(needsSlider({ presentation: 'list', action: 'viewer' }), false, 'the viewer is HMediaViewer');
  assert.equal(needsSlider({ presentation: 'list', action: 'none' }), false);
});
