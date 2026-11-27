/**
 * @file storyMapConfiguration.js
 * @brief Configuration entry of the story map element (plan 29 shape; 27q3 §12, §13): its publication from Explorer and
 *        the fields of the CMS element form. Settings of the website element Story map (siteStoryMap.js):
 *
 *        `{preset, topic, topicSelect, topicRange, query, map, timeline, ui}`
 *        - `topic`: the story shown first; `topicSelect`: visitors choose the topic from `topicRange`:
 *          `story` (the Story topics query), `any` (all records of the topic type), `current` (the query of Explorer's
 *          result kept in `query`, publication only), `links` (Saved filter by Action, website only);
 *        - `map`, `timeline`: a Map / Timeline element of the page (its instance) or `none` (27q3 review 7: the own map
 *          and timeline of the element are gone; older `own` / `ownMap: true` are `none`). Publish adds the elements
 *          (`companions` of preparePublication, written by the server with the page);
 *        - `ui`: `showSourceHeader` (the name of the story map above it), `language` (published page).
 *
 * Lists of the form (`termsSource`): `storyMapPresets` (the story maps), `topicRanges`, `storyTopic` (the topic chosen
 * in Explorer, publication).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { modeFormFields } from '../../data/moduleConfigurationForm.js';
import { PUBLICATION_LANGUAGE_TERMS } from '../presentation/presentationKinds.js';

/** The ranges of the topic a visitor chooses from. */
export const STORYMAP_TOPIC_RANGES = Object.freeze(['story', 'any', 'current', 'links']);

/** Where the story is drawn: nowhere, or (any other value) an element of the page; `own` of older pages is none. */
const GEO_OWN = 'own';
const GEO_NONE = 'none';

/** The page elements a publication adds beside the story map (27q3 review 7). */
const COMPANIONS = Object.freeze([['map', 'showMap'], ['timeline', 'showTimeline']]);

/**
 * The terms of Topics range of a mode (27q3 §13): publication Story topics | All <type> | Current result; website
 * Story topics | All <type> | Saved filter by Action. Story topics only when the story map has a query.
 *
 * @param {string} mode `publication` or `website`.
 * @param {{typeName?: string, hasQuery?: boolean}} [options]
 * @returns {Array<{id: string, label: string}>}
 */
export function storyMapTopicRangeTerms(mode, { typeName = '', hasQuery = true } = {}) {
  return [
    ...(hasQuery ? [{ id: 'story', label: 'Story topics' }] : []),
    { id: 'any', label: typeName ? `All ${typeName}` : 'All records of the topic type' },
    mode === 'publication' ? { id: 'current', label: 'Current result' } : { id: 'links', label: 'Saved filter by Action' }
  ];
}

const form = Object.freeze({
  format: 'heurist-edit-form/1',
  groups: [
    {
      id: 'source',
      label: 'Source',
      children: [
        { name: 'preset', type: 'enum', label: 'Story map', mode: 'select', max: 1, req: 'required', termsSource: 'storyMapPresets',
          help: 'Public story maps can be seen by visitors' },
        { name: 'topicSelect', type: 'boolean', label: 'Allow selecting the topic', mode: 'checkbox', clearable: false, default: false,
          req: 'recommended', help: 'Visitors choose the story topic in a list above the story' },
        { name: 'topicRange', type: 'enum', label: 'Topics range', mode: 'select', max: 1, clearable: false, termsSource: 'topicRanges',
          default: 'story', req: 'recommended', showWhen: { topicSelect: true }, help: 'The records visitors choose from' },
        { name: 'topic', type: 'enum', label: 'Selected topic', mode: 'select', max: 1, readOnly: true, termsSource: 'storyTopic',
          req: 'recommended', modes: ['publication'], help: 'The story shown first: the topic chosen in Show for' }
      ]
    },
    {
      id: 'geo',
      label: 'Map and timeline',
      modes: ['publication'],
      children: [
        { name: 'showMap', type: 'boolean', label: 'Add a Map element', mode: 'checkbox', clearable: false, default: true, req: 'recommended',
          help: 'The story is shown on a Map element of the page; it can be configured in the CMS editor' },
        { name: 'showTimeline', type: 'boolean', label: 'Add a Timeline element', mode: 'checkbox', clearable: false, default: true,
          req: 'recommended', help: 'The elements of the story on a Timeline element of the page; it can be configured in the CMS editor' }
      ]
    },
    {
      // the header and the language of the page (27q3 §13, 2026-11-27); the CMS puts the header in Presentation
      id: 'interface',
      label: 'Interface',
      children: [
        { name: 'ui.showSourceHeader', req: 'recommended', type: 'boolean', label: 'Show header', mode: 'checkbox', clearable: false,
          default: false, help: 'The name of the story map above it' },
        { name: 'ui.language', req: 'recommended', type: 'enum', label: 'Language', mode: 'select', clearable: false,
          terms: PUBLICATION_LANGUAGE_TERMS, default: 'auto', modes: ['publication'],
          help: 'Language of the published page; Automatic follows the browser of the visitor' }
      ]
    }
  ]
});

/** @returns {object} Settings of a new publication. */
function defaults() {
  return { preset: null, topicSelect: false, topicRange: 'story', map: GEO_NONE, timeline: GEO_NONE, showMap: true, showTimeline: true };
}

/** @private Where the story is drawn: an element of the page or `none` (also for the `own` of older pages). */
function geoValue(value) {
  const text = String([value].flat()[0] ?? '').trim();
  return text && text !== GEO_OWN ? text : GEO_NONE;
}

/**
 * Settings of the website element from any input (stored settings or the values of the form).
 *
 * @param {object} value
 * @returns {object}
 */
function normalize(value) {
  const input = value && typeof value === 'object' ? value : {};
  const one = (item) => [item].flat()[0];
  const preset = Number(one(input.preset));
  const topic = Number(one(input.topic));
  const range = String(one(input.topicRange) ?? '');
  const map = geoValue(input.map);
  const timeline = geoValue(input.timeline);
  const settings = {
    preset: preset > 0 ? preset : null,
    ...(topic > 0 ? { topic } : {}),
    topicSelect: one(input.topicSelect) === true,
    topicRange: STORYMAP_TOPIC_RANGES.includes(range) ? range : 'story',
    map,
    timeline
  };
  if (input.query != null && input.query !== '') settings.query = input.query;
  // the checkboxes of the publication form (Add a Map / Timeline element): kept for preparePublication, not stored
  for (const [, flag] of COMPANIONS) if (input[flag] != null) settings[flag] = one(input[flag]) === true;
  const ui = {};
  if (input.ui?.showSourceHeader != null) ui.showSourceHeader = one(input.ui.showSourceHeader) === true;
  const language = String(one(input.ui?.language) ?? '');
  if (PUBLICATION_LANGUAGE_TERMS.some((term) => term.id === language)) ui.language = language;
  if (Object.keys(ui).length) settings.ui = ui;
  return settings;
}

/**
 * The settings stored in a page: without the defaults.
 *
 * @param {object} settings
 * @returns {object}
 */
function serialize(settings) {
  const value = normalize(settings);
  return {
    preset: value.preset,
    ...(value.topic ? { topic: value.topic } : {}),
    ...(value.topicSelect ? { topicSelect: true, topicRange: value.topicRange } : {}),
    ...(value.query != null ? { query: value.query } : {}),
    ...(value.map !== GEO_NONE ? { map: value.map } : {}),
    ...(value.timeline !== GEO_NONE ? { timeline: value.timeline } : {}),
    ...(value.ui?.showSourceHeader || (value.ui?.language && value.ui.language !== 'auto') ? {
      ui: {
        ...(value.ui.showSourceHeader ? { showSourceHeader: true } : {}),
        ...(value.ui.language && value.ui.language !== 'auto' ? { language: value.ui.language } : {})
      }
    } : {})
  };
}

/**
 * The page (27q3 §13, review 7): the story map, the topic chosen in Explorer (`publication.topic`), what visitors may
 * choose (with Current result: the query of Explorer's result, `publication.query`), the interface; and the Map and
 * Timeline elements added beside it (`companions`, with the website defaults `publication.companionDefaults[role]`):
 * the server links the story map to them (`settings.map`, `settings.timeline`) and keeps those already on the page.
 *
 * @param {{settings?: object, values?: object, publication?: {presetId?: number, topic?: number, query?: *,
 *   companionDefaults?: Object<string, {settings?: object, state?: object}|null>}|null}} options
 * @returns {{settings: object, state: null, companions: Array<{role: string, type: string, settings: object, state: *}>}}
 */
function preparePublication({ settings, values = null, publication = null }) {
  const value = normalize({ ...(settings || {}), ...(values || {}) });
  // the topic belongs to the story map it was chosen for: another story map in the form starts without one
  const same = !Number(publication?.presetId) || Number(publication.presetId) === value.preset;
  const topic = same ? Number(publication?.topic) || 0 : 0;
  const range = value.topicRange === 'links' ? 'story' : value.topicRange;
  const query = value.topicSelect && range === 'current' ? publication?.query ?? null : null;
  return {
    settings: {
      preset: value.preset,
      ...(topic > 0 ? { topic } : {}),
      ...(value.topicSelect ? { topicSelect: true, topicRange: range } : {}),
      ...(query != null && query !== '' ? { query } : {}),
      // the server puts the instances of the companions here
      map: GEO_NONE,
      timeline: GEO_NONE,
      ui: {
        ...(value.ui?.showSourceHeader ? { showSourceHeader: true } : {}),
        language: value.ui?.language || 'auto'
      }
    },
    state: null,
    // both are added unless their box is off
    companions: COMPANIONS.filter(([, flag]) => value[flag] !== false).map(([role]) => {
      const defaults = publication?.companionDefaults?.[role] || null;
      return { role, type: role, settings: defaults?.settings || {}, state: defaults?.state ?? null };
    })
  };
}

/**
 * The fields of a mode with their lists filled in (the CMS element form, built with HEditForm directly).
 *
 * @param {string} mode Form mode.
 * @param {Object<string, Array<{id: string, label: string}>>} [terms] Lists by `termsSource`.
 * @returns {Array<object>}
 */
export function storyMapFormFields(mode, terms = {}) {
  return modeFormFields(form, mode, terms);
}

/** The configuration of the story map element: form JSON, defaults, normalizer, serializer, publication. */
export const storyMapConfiguration = Object.freeze({
  type: 'storymap',
  form,
  defaults,
  normalize,
  serialize,
  preparePublication
});
