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
const { captionValue, cardTemplateTerms, presentationSettings, fieldDetails, fileFieldTerms, fieldSnapshot, fieldTerms, manualIds, manualQuery, mediaActionSettings, mediaActionValues, mediaFormFields, mediaSizeValue, parseCardsQuery, parseFieldReference, readCaption, reportFiles, reportNotPublic, teamReportBody, visibleToGuests } = await import('../src/designer/widgetForms.js');
const { CmsRecordDocument, cmsPageStarter } = await import('#shared/site/cmsEdit.js');
const { buildCmsGalleryItem } = await import('#shared/site/cmsMedia.js');
const { recordActionFields, recordActionIssues, recordActionSettings, recordActionValues, recordPageTerms } = await import('../src/designer/recordPageField.js');
const { changedDetails } = await import('../src/designer/designerData.js');
const { CmsDesigner } = await import('../src/designer/CmsDesigner.js');
const { cutReport, needsSlider, reportBody, reportOutput } = await import('../src/siteWidgets.js');

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
  assert.deepEqual(reportFiles({ eng: '12', fre: '' }), { eng: 12 });
});

test('Team member report: fields by local ids of the database', () => {
  const body = teamReportBody({ localId: (kind, code) => ({ '1252-619': 1045, '2-3': 3 })[code] });
  assert.match(body, /border-radius:50%/);
  assert.match(body, /\$r\.f1045s/);
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
  // plan 27g §6: Any record has its own action with the links of the record and the Record page
  assert.deepEqual(names(gallery), ['mode', 'records', 'files', 'anyRecords', 'fileField', 'caption', 'width', 'height', 'action', 'recordAction',
    'recordPage', 'presentation', 'duration', 'fade', 'navigation', 'fit']);
  assert.deepEqual(names(single), ['mode', 'records', 'files', 'anyRecords', 'fileField', 'captionText', 'width', 'height', 'action', 'recordAction', 'recordPage']);
  const recordAction = single.find((field) => field.name === 'recordAction');
  assert.deepEqual(recordAction.terms.map((term) => term.id), ['none', 'viewer', 'url', 'recordPage', 'savedFilter']);
  assert.equal(recordAction.terms.at(-1).disabled, true, 'Saved filter: disabled for now');
  assert.deepEqual(recordAction.showWhen, { mode: 'record' });
  assert.deepEqual(single.find((field) => field.name === 'recordPage').showWhen, { mode: 'record', recordAction: 'recordPage' });
  assert.deepEqual(single[0].terms.map((term) => term.id), ['media', 'files', 'record']);
  for (const [fields, max] of [[gallery, 0], [single, 1]]) {
    for (const field of fields.filter((item) => item.type === 'resource')) {
      assert.equal(field.max, max);
      assert.equal(field.pointerMode, 'addorbrowse');
    }
  }
});

test('media form: Any record offers only file fields, a field of several record types once', () => {
  const fields = { 1: [{ id: 2, name: 'Name', type: 'freetext' }, { id: 38, name: 'Image', type: 'file' }],
    2: [{ id: 38, name: 'Image', type: 'file' }, { id: 40, name: 'Scan', type: 'file' }, { id: 41, name: 'Link', type: 'resource' }] };
  const dbdefs = { fields: (type) => fields[type] };
  assert.deepEqual(fileFieldTerms(dbdefs, [1]), [{ id: 38, label: 'Image' }]);
  assert.deepEqual(fileFieldTerms(dbdefs, [1, 2, 1]).map((term) => term.id), [38, 40]);
  assert.deepEqual(fileFieldTerms(dbdefs, []), []);
});

test('media items of Any record: the first file for one element, all values in a row for a gallery; a record without a file is reported', async () => {
  const value = (key) => ({ file: { ulf_ObfuscatedFileID: key } });
  const records = [{ rec_ID: '7', rec_Title: 'Second', details: { 38: [value('c')] } }, { rec_ID: '5', rec_Title: 'First', details: { 38: [value('a'), value('b')] } },
    { rec_ID: '9', rec_Title: 'Empty', details: {} }];
  const asked = [];
  const designer = {
    apiClient: { get: async (path, { query }) => { asked.push([path, query.fields]); return { records }; } },
    options: { dbdefs: { dbconst: () => 1 } },
    _mediaFile: async (key) => ({ key, name: key })
  };
  const items = (settings) => CmsDesigner.prototype._mediaItems.call(designer, { mode: 'record', field: 38, ...settings });
  const keys = (list) => list.map((item) => item.file?.key ?? null);
  assert.deepEqual(keys(await items({ ids: [5], single: true })), ['a']);
  const row = await items({ ids: [5, 7], single: false });
  assert.deepEqual(keys(row), ['a', 'b', 'c'], 'in the chosen order, all values in a row');
  assert.deepEqual(row.map((item) => item.caption), ['First', 'First', 'Second']);
  assert.deepEqual(asked[0], ['/records', 'rec_ID,rec_Title,38']);
  const empty = await items({ ids: [9], single: false });
  assert.deepEqual(keys(empty), [null]);
  assert.equal(empty[0].label, 'Empty');
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

test('Generated Report: the output of a page language falls back as a text does (plan 27e §28)', () => {
  assert.equal(reportOutput({ eng: 101 }, 'fre'), 101, 'only English: shown on a French page');
  assert.equal(reportOutput({ eng: 101, def: 103 }, 'fre'), 103, 'def before another language');
  assert.equal(reportOutput({ ger: 104, eng: 101 }, 'fre', ['eng', 'fre']), 101, 'default language of the website');
  assert.equal(reportOutput({ fre: 102, eng: 101 }, 'FRE'), 102, 'the language of the page');
  assert.equal(reportOutput({ fre: '', eng: 0 }, 'fre'), 0, 'nothing chosen');
});

test('Generated Report: body of a document and the cut of the preview', () => {
  assert.equal(reportBody('<html><head><style>x</style></head><body class="r"><p>a</p></body></html>'), '<p>a</p>');
  assert.equal(reportBody('<p>a</p>'), '<p>a</p>');
  assert.equal(cutReport('<p>abc</p><p>def</p>', 14), '<p>abc</p>', 'before the last tag that starts before the limit');
  assert.equal(cutReport('<p>a</p>', 100), '<p>a</p>');
});

test('Generated Report: a warning for any display when a chosen output is not public', () => {
  assert.equal(reportNotPublic([{ visibility: 'hidden' }]), true);
  assert.equal(reportNotPublic([{ visibility: 'public' }, { visibility: 'viewable' }]), true);
  assert.equal(reportNotPublic([{ visibility: 'public' }, { visibility: 'pending' }]), false);
});

test('HSlider only for a slider or an action', () => {
  assert.equal(needsSlider({ presentation: 'slider' }), true);
  assert.equal(needsSlider({ presentation: 'list', action: 'url' }), true);
  assert.equal(needsSlider({ presentation: 'list', action: 'viewer' }), false, 'the viewer is HMediaViewer');
  assert.equal(needsSlider({ presentation: 'list', action: 'none' }), false);
});

test('presentation: list, carousel (no timing) and slideshow (plan 27e §29)', () => {
  assert.deepEqual(presentationSettings({ presentation: 'carousel', action: 'none', duration: 9000 }), { presentation: 'carousel', action: 'none' });
  assert.equal(presentationSettings({ presentation: 'slider', duration: 3000, fade: 0, navigation: false }).slider.duration, 3000);
  assert.equal(presentationSettings({ presentation: 'other' }).presentation, 'list');
});

test('Record cards: card templates by report id; a stored file name finds its report or stays a term', () => {
  const reports = [{ id: 7, title: 'Team member', file: 'Team_member.tpl' }, { id: 8, title: 'Card' }];
  assert.deepEqual(cardTemplateTerms(reports, 'Team_member.tpl').value, '7');
  assert.deepEqual(cardTemplateTerms(reports, 8).value, '8');
  const kept = cardTemplateTerms(reports, 'Old.tpl');
  assert.equal(kept.value, 'Old.tpl');
  assert.equal(kept.terms.at(-1).label, 'Old.tpl');
  assert.equal(cardTemplateTerms(reports).value, null);
});

test('media form actions (plan 27g §6): the links of a record only for Any record; old player settings', () => {
  assert.deepEqual(mediaActionValues({ action: 'recordPage', recordPage: 9 }, 'record'), { action: 'none', recordAction: 'recordPage', recordPage: 9 });
  assert.deepEqual(mediaActionValues({ player: true }, 'media'), { action: 'viewer', recordAction: 'none', recordPage: null });
  assert.deepEqual(mediaActionSettings({ mode: 'record', recordAction: 'recordPage', recordPage: '9' }), { action: 'recordPage', recordPage: 9 });
  assert.deepEqual(mediaActionSettings({ mode: 'record', recordAction: 'recordPage' }), { action: 'none' }, 'no page: no link');
  assert.deepEqual(mediaActionSettings({ mode: 'files', action: 'viewer', recordAction: 'url' }), { action: 'viewer' });
  assert.deepEqual(mediaActionSettings({ mode: 'record', recordAction: 'url' }), { action: 'url' });
});

test('record pages (plan 27g §6): terms of the record pages with their template, all levels', () => {
  const pages = [{ id: 7, title: 'About', children: [{ id: 8, title: 'Person', record: true, template: '12', children: [] }] },
    { id: 9, title: 'Places', record: true, template: 'place.tpl' }];
  assert.deepEqual(recordPageTerms(pages, [{ id: '12', label: 'Person card' }]), [{ id: 8, label: 'Person · Person card' }, { id: 9, label: 'Places' }]);
  assert.deepEqual(recordPageTerms([]), []);
});

test('record actions (plan 27g §6): fields, values, settings and issues', () => {
  const [action, page] = recordActionFields({ pageTerms: [{ id: 8, label: 'Person' }], showWhen: { source: 'record' } });
  assert.deepEqual(action.terms.map((term) => term.id), ['none', 'url', 'recordPage', 'savedFilter'], 'no Player / Viewer outside media');
  assert.equal(action.mode, 'radio');
  assert.deepEqual(page.showWhen, { source: 'record', action: 'recordPage' });
  assert.deepEqual(recordActionValues({ action: 'viewer' }), { action: 'none', recordPage: null });
  assert.deepEqual(recordActionValues({ action: 'recordPage', recordPage: '8' }), { action: 'recordPage', recordPage: 8 });
  assert.deepEqual(recordActionSettings({ action: 'recordPage', recordPage: 8 }), { action: 'recordPage', recordPage: 8 });
  assert.deepEqual(recordActionSettings({ action: 'url', recordPage: 8 }), { action: 'url' });
  assert.deepEqual(recordActionSettings({ action: 'savedFilter' }), { action: 'none' }, 'Saved filter is not stored yet');
  assert.deepEqual(recordActionSettings({ action: 'url' }, { allowed: false }), { action: 'none' });
  assert.equal(recordActionIssues({ action: 'recordPage' })[0].field, 'recordPage');
  assert.deepEqual(recordActionIssues({ action: 'recordPage', recordPage: 8 }), []);
});

test('record page preset (plan 27g §6): one Record cards widget of the record of the URL', () => {
  const { content, configuration } = cmsPageStarter('record', 'Person card', { template: 12 });
  const config = JSON.parse(configuration);
  const instances = Object.values(config.instances);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].type, 'cards');
  assert.deepEqual(instances[0].settings, { mode: 'url', query: null, template: 12, presentation: 'list', action: 'none' });
  assert.doesNotMatch(content, /<h1/, 'no heading: the card shows the record');
  assert.match(content, /data-h-instance=/);
});

test('Record field action (plan 27g §6): data-h-link set, removed, and gone with the field', () => {
  const doc = new CmsRecordDocument({ parts: { content: '<div data-h-node="f" data-h-text="" data-h-field="5.2-1">x</div><div data-h-node="t" data-h-text="">y</div>' } });
  assert.equal(doc.setFieldLink('f', 'page:9'), true);
  assert.equal(doc.fieldLink('f'), 'page:9');
  assert.match(doc.serialize().parts.content, /data-h-field="5\.2-1" data-h-link="page:9"/);
  assert.equal(doc.setFieldLink('f', 'javascript:x'), true);
  assert.equal(doc.fieldLink('f'), null, 'not a valid link: removed');
  doc.setFieldLink('f', 'url');
  doc.setField('f', null);
  assert.equal(doc.fieldLink('f'), null, 'typed text again: no link');
  assert.equal(doc.setFieldLink('t', 'url'), false, 'only a Record field element');
});

test('gallery figure of a record (plan 27g §6): data-h-rec for the link of the server', () => {
  const urls = { thumb: (key) => `/t/${key}`, file: (key) => `/f/${key}`, osd: () => '', mirador: () => '' };
  const file = { key: 'k1', name: 'a.png', ext: 'png', mime: 'image/png' };
  assert.match(buildCmsGalleryItem(file, { width: 'auto', height: 'auto' }, { urls, record: 42 }), /^<figure class="h-site-card" data-h-media="" data-h-rec="42">/);
  assert.doesNotMatch(buildCmsGalleryItem(file, {}, { urls }), /data-h-rec/);
});
