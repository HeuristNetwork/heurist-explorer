/**
 * @file templateForms.test.js
 * @brief The form of a new page (plan 27i §9): elements and options, hide flags (Cover), values for the builders, Team templates.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { hasTemplateForm, teamTemplateTerms, templateFormFields, templateInitialFields, templateValues } = await import('../src/designer/templateForms.js');
const { CMS_TEAM_TEMPLATE, CMS_TEMPLATE_ELEMENTS, CMS_TEMPLATE_PAGES } = await import('#shared/site/cmsPageTemplates.js');
const { normalizeEditForm } = await import('#shared/data/editFormSchema.js');
const { PAGE_FIELD_KEYS } = await import('../src/manager/websiteFields.js');

test('every page template has its elements (all ticked) and options; hide flags at the end for Cover only; a valid form', () => {
  for (const template of [...CMS_TEMPLATE_PAGES, 'blank', 'blog']) {
    const { fields, values } = templateFormFields(template);
    const names = fields.map((field) => field.name);
    if (template === 'cover') assert.deepEqual(names.slice(-2), ['hideHeader', 'hideFooter'], 'hide flags at the end');
    else assert.ok(!names.includes('hideHeader') && !names.includes('hideFooter'), `${template}: no hide flags`);
    for (const field of fields.filter((item) => item.type === 'boolean')) assert.equal(field.mode, 'checkbox', `${template}: ${field.name}`);
    for (const name of Object.keys(values)) assert.ok(names.includes(name), `${template}: ${name} is a field`);
    assert.deepEqual(normalizeEditForm({ groups: [{ id: 'main', children: fields }] }).warnings, [], `${template}: valid form`);
    const offered = CMS_TEMPLATE_ELEMENTS[template] || [];
    if (offered.length && template !== 'about') assert.deepEqual(values.elements, [...offered], `${template}: all ticked`);
  }
  for (const template of ['blog', 'record', 'blank']) assert.equal(hasTemplateForm(template), false);
  assert.deepEqual(templateFormFields('blank').fields, []);
  assert.deepEqual([templateFormFields('cover').values.hideHeader, templateFormFields('cover').values.hideFooter], [true, true]);
  assert.deepEqual(templateFormFields('about').values.elements, ['description', 'aims', 'sources', 'acknowledgements', 'heurist']);
  const features = templateFormFields('features');
  assert.deepEqual([features.values.count, features.values.orientation], ['3', 'columns']);
  assert.deepEqual(features.fields.find((field) => field.name === 'count').terms.map((term) => term.id), ['2', '3', '4', '5', '6']);
  const team = templateFormFields('team', { cardTerms: [{ id: 4, label: 'Card' }], cardValue: 4 }).fields;
  assert.deepEqual(team.find((field) => field.name === 'records').showWhen, { fromDatabase: true });
  assert.deepEqual(team.find((field) => field.name === 'count').showWhen, { fromDatabase: [false, ''] });
  assert.equal(team.find((field) => field.name === 'orientation').showWhen, undefined, 'orientation for both kinds of cards');
  assert.deepEqual(PAGE_FIELD_KEYS, ['name', 'shortSummary', 'thumbnail', 'menuFormat']);
  // the first page fields: the name; Cover hidden in the main menu
  assert.deepEqual(templateInitialFields('cover', 'Cover', { menuHidden: 77 }), { name: 'Cover', menuFormat: 77 });
  assert.deepEqual(templateInitialFields('about', 'About', { menuHidden: 77 }), { name: 'About' });
});

test('values for the builders: elements, numbers, records; the hide flags as the page layout', () => {
  const answer = templateValues({ hideHeader: true, hideFooter: false, elements: ['title', 'logo'], count: '5', records: ['3', 4],
    fromDatabase: true, cardTemplate: '12' });
  assert.deepEqual(answer.layout, { hideHeader: true });
  assert.deepEqual(answer.values, { elements: ['title', 'logo'], count: 5, records: [3, 4], fromDatabase: true, cardTemplate: 12 });
  assert.equal(templateValues({ cardTemplate: CMS_TEAM_TEMPLATE }).values.cardTemplate, CMS_TEAM_TEMPLATE);
  assert.deepEqual(templateValues({ elements: [] }).values.elements, []);
});

test('Team: the Team member report chosen, or its file name until the report is made', () => {
  const terms = (list) => list.map((report) => ({ id: report.id, label: report.title }));
  const made = teamTemplateTerms([{ id: 3, title: 'Card' }, { id: 8, title: 'Team member', file: CMS_TEAM_TEMPLATE }], terms);
  assert.equal(made.cardValue, 8);
  assert.equal(made.cardTerms.length, 2);
  const missing = teamTemplateTerms([{ id: 3, title: 'Card' }], terms);
  assert.equal(missing.cardValue, CMS_TEAM_TEMPLATE);
  assert.deepEqual(missing.cardTerms[0], { id: CMS_TEAM_TEMPLATE, label: 'Team member' });
});
