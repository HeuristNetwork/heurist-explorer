/**
 * @file templateForms.js
 * @brief The form of a new page (plan 27i §9, rework 2026-11-13 / 2026-11-14): shown in the Add page popup beside the
 *        list of templates, made again when another template is chosen. Two parts: the prominent fields of the page
 *        record (name, description, menu icon, menu item; websiteFields.js), then the elements the template proposes
 *        (checkboxes) and a few options; the hide header / footer flags at the end (Cover only). The page is built from
 *        the answer (shared/src/site/cmsPageTemplates.js) and then changed in the page editor.
 *
 *   const session = createTemplateForm(host, 'cover', { title: 'Cover', codes, dbdefs, apiClient, services });
 *   const answer = await session.read(); // {details, values, layout} or null (issues shown)
 *   await session.destroy();
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import {
  CMS_ABOUT_TOPICS, CMS_FEATURES_MAX, CMS_FEATURES_MIN, CMS_TEAM_TEMPLATE, CMS_TEMPLATE_ELEMENTS, CMS_TEMPLATE_PAGES
} from '#shared/site/cmsPageTemplates.js';
import { HEditForm } from '#shared/widgets/edit-form/HEditForm.js';
import { createWebsiteFieldsForm, PAGE_FIELD_KEYS } from '../manager/websiteFields.js';

/** Labels of the elements of the templates (About: its topics). */
const ELEMENT_LABELS = Object.freeze({
  title: 'Title', subtitle: 'Subtitle', logo: 'Logo', text: 'Introduction', enter: 'Enter button', background: 'Background',
  banner: 'Banner', image: 'Image (logo)', slideshow: 'Slideshow', buttons: 'Buttons', features: 'Features', news: 'News',
  map: 'Map', timeline: 'Timeline', address: 'Address', contact: 'Contact', email: 'Email form', follow: 'Follow us',
  origins: 'Origins of the project / history', description: 'Description of the project', aims: 'Aims and methodology',
  sources: 'Sources of data', acknowledgements: 'Acknowledgements', heurist: 'Heurist'
});

/** About: the topics ticked at first. */
const ABOUT_TICKED = Object.freeze(['description', 'aims', 'sources', 'acknowledgements', 'heurist']);

/** Templates whose page hides the header and footer of the website at first (the flags are offered for them only). */
const HIDE_FLAG_TEMPLATES = Object.freeze(['cover']);

/** Whether a template builds its page from CMS_TEMPLATE_PAGES (others: the presets of cmsEdit.js). */
export function hasTemplateForm(template) {
  return CMS_TEMPLATE_PAGES.includes(template);
}

/**
 * Fields and first values of the second part of the form: the elements of a template, its options and, at the end, the
 * hide flags (Cover).
 *
 * @param {string} template A page template of Add page.
 * @param {{cardTerms?: Array<{id: number|string, label: string}>, cardValue?: number|string|null}} [options] Team:
 *        the card templates (cardTemplateTerms) and the one chosen at first (Team member).
 * @returns {{fields: Array<object>, values: object}}
 */
export function templateFormFields(template, { cardTerms = [], cardValue = null } = {}) {
  const fields = [];
  const values = {};
  const offered = hasTemplateForm(template) ? CMS_TEMPLATE_ELEMENTS[template] : [];
  if (offered.length) {
    fields.push({ name: 'elements', type: 'enum', label: template === 'about' ? 'Sections' : 'Elements', mode: 'checkbox', max: 0,
      terms: offered.map((id) => ({ id, label: ELEMENT_LABELS[id] || id })) });
    values.elements = template === 'about' ? [...ABOUT_TICKED] : [...offered];
  }
  const count = (label, showWhen = null) => ({
    name: 'count', type: 'enum', label, mode: 'select', max: 1, ...(showWhen ? { showWhen } : {}),
    terms: Array.from({ length: CMS_FEATURES_MAX - CMS_FEATURES_MIN + 1 }, (unused, index) => {
      const number = String(index + CMS_FEATURES_MIN);
      return { id: number, label: number };
    })
  });
  const orientation = { name: 'orientation', type: 'enum', label: 'Orientation', mode: 'radio', max: 1,
    terms: [{ id: 'list', label: 'List' }, { id: 'columns', label: 'Columns' }] };
  if (template === 'features') {
    fields.push(count('Number of features'), orientation);
    Object.assign(values, { count: '3', orientation: 'columns' });
  }
  if (template === 'team') {
    // the orientation of the cards from the database and of the cards to fill in (review 2026-11-14)
    fields.push(
      { name: 'fromDatabase', type: 'boolean', label: 'Take data from database', mode: 'checkbox', max: 1 },
      { name: 'records', type: 'resource', label: 'Records', max: 0, targetTypes: [], pointerMode: 'browseonly',
        help: 'The persons of the team; they can be chosen later', showWhen: { fromDatabase: true } },
      { name: 'cardTemplate', type: 'enum', label: 'Template', mode: 'select', max: 1, terms: cardTerms, showWhen: { fromDatabase: true } },
      count('Number of members', { fromDatabase: [false, ''] }),
      orientation
    );
    Object.assign(values, { fromDatabase: false, cardTemplate: cardValue, count: '3', orientation: 'columns' });
  }
  if (HIDE_FLAG_TEMPLATES.includes(template)) {
    fields.push(
      { name: 'hideHeader', type: 'boolean', label: 'Hide header', mode: 'checkbox', max: 1 },
      { name: 'hideFooter', type: 'boolean', label: 'Hide footer', mode: 'checkbox', max: 1 }
    );
    Object.assign(values, { hideHeader: true, hideFooter: true });
  }
  return { fields, values };
}

/**
 * The values of the second part as the options of buildTemplatePage and the page layout flags.
 *
 * @param {object} values Values of the form.
 * @returns {{values: object, layout: {hideHeader?: boolean, hideFooter?: boolean}}}
 */
export function templateValues(values) {
  const result = { ...values };
  delete result.hideHeader;
  delete result.hideFooter;
  if ('elements' in values) result.elements = [values.elements].flat().filter(Boolean).map(String);
  if ('count' in values) result.count = Number(values.count) || 3;
  if ('records' in values) result.records = [values.records].flat().map(Number).filter((id) => id > 0);
  if ('fromDatabase' in values) result.fromDatabase = values.fromDatabase === true;
  if (result.cardTemplate != null) result.cardTemplate = /^\d+$/.test(String(result.cardTemplate)) ? Number(result.cardTemplate) : String(result.cardTemplate);
  const layout = {};
  if (values.hideHeader === true) layout.hideHeader = true;
  if (values.hideFooter === true) layout.hideFooter = true;
  return { values: result, layout };
}

/**
 * The card templates of Team with *Team member* chosen: its report, or the file name when the report is not made yet
 * (CmsDesigner._ensureTeamReport makes it when the page is added).
 *
 * @param {Array<{id: number|string, title?: string, file?: string}>} reports Card reports.
 * @param {(reports: object[]) => Array<{id: number|string, label: string}>} terms cardTemplateTerms(...).terms.
 * @returns {{cardTerms: Array<object>, cardValue: number|string}}
 */
export function teamTemplateTerms(reports, terms) {
  const team = reports.find((report) => report.file === CMS_TEAM_TEMPLATE);
  const list = terms(reports);
  if (team) return { cardTerms: list, cardValue: team.id };
  return { cardTerms: [{ id: CMS_TEAM_TEMPLATE, label: 'Team member' }, ...list], cardValue: CMS_TEAM_TEMPLATE };
}

/**
 * First values of the page fields of a template: its name; Cover is hidden in the main menu (review 2026-11-14).
 *
 * @param {string} template
 * @param {string} title Default title of the template.
 * @param {Object<string, number>} codes Local ids of the website codes (`menuHidden`: the term).
 * @returns {Object<string, *>} By key of the codes.
 */
export function templateInitialFields(template, title, codes = {}) {
  const initial = { name: title };
  if (template === 'cover' && Number(codes.menuHidden) > 0) initial.menuFormat = Number(codes.menuHidden);
  return initial;
}

/**
 * The form of a new page in `host` (the Add page popup): the page fields, then the elements of the template.
 *
 * @param {HTMLElement} host
 * @param {string} template A page template of Add page (not `record`).
 * @param {object} options
 * @param {string} options.title Default title of the template: the first name of the page.
 * @param {Object<string, number>} options.codes Local ids of the website codes.
 * @param {string[]} [options.languages] Languages of the website (translations of name and description).
 * @param {object} options.dbdefs HDbDefs.
 * @param {object} options.apiClient
 * @param {object} options.services The services of the designer forms (`browseRecords`, `cardTemplates`, `templateTerms`,
 *        `translator`, `recordField` ...).
 * @returns {{ready: Promise<void>, read: () => Promise<{details: Object<string, Array>, values: object, layout: object}|null>,
 *          destroy: () => Promise<void>}} `read`: null while a field has an issue (shown in the form).
 */
export function createTemplateForm(host, template, { title = '', codes, languages = [], dbdefs, apiClient, services = {} }) {
  const pageHost = document.createElement('div');
  pageHost.className = 'h-cms-page-fields';
  const elementsHost = document.createElement('div');
  elementsHost.className = 'h-cms-template-elements';
  host.append(pageHost, elementsHost);
  let destroyed = false;
  const forms = (async () => {
    let teamTerms = {};
    if (template === 'team') {
      const reports = await services.cardTemplates?.().catch(() => []) ?? [];
      teamTerms = teamTemplateTerms(reports, (list) => services.templateTerms?.(list) || []);
    }
    const page = await createWebsiteFieldsForm(pageHost, {
      dbdefs, apiClient, codes, type: 'page', keys: PAGE_FIELD_KEYS, record: null,
      initial: templateInitialFields(template, title, codes), languages, services
    });
    const { fields, values } = templateFormFields(template, teamTerms);
    let edit = null;
    if (fields.length && !destroyed) {
      edit = new HEditForm().attach(elementsHost, {
        form: { groups: [{ id: 'main', children: fields }] },
        values,
        labelPos: 'auto',
        apiClient,
        dbdefs,
        valueLimit: services.valueLimit,
        browseRecords: services.browseRecords,
        createRecordBrowser: services.createRecordBrowser
      });
      await edit.render();
    }
    return { page, edit };
  })();
  const destroyForms = async () => {
    const made = await forms.catch(() => null);
    await made?.page?.destroy();
    await made?.edit?.destroy();
  };
  return {
    ready: forms.then(() => undefined),
    async read() {
      const { page, edit } = await forms;
      const issues = [...page.validate(), ...(edit ? edit.validate() : [])];
      if (issues.length) return null;
      return { details: page.details(), ...templateValues(edit ? edit.getValues() : {}) };
    },
    async destroy() {
      destroyed = true;
      await destroyForms();
      host.replaceChildren();
    }
  };
}
