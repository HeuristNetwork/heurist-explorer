/**
 * @file storyMapForm.js
 * @brief Settings form of the Story map tool (plan 27q1 §15): the HEditForm JSON in three sections Source /
 *        Presentation / Mapping, made only of existing inputs and special editors, and the conversion between the
 *        story map settings (storyMapModel.js) and the values of the form.
 *
 * The story topics query and the expansion rule are named by their field ids (DT_QUERY_STRING, DT_EXPANSION_RULES):
 * the special editors of the Query source record (RecordEditorHost.specialEditors) work on them unchanged.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { STORY_LIMIT, normalizeStoryMapSettings } from '#shared/widgets/storymap/storyMapModel.js';

/** Help texts of the form (Artem's texts, corrected, review 1 2026-11-20). */
export const HELP = Object.freeze({
  topicType: 'Record type of the records whose stories are told, e.g. Person or Expedition. Show for offers the records of this type.',
  topics: 'Optional: the records whose stories are told, e.g. the persons of a project. Show for offers them as "Story topics"; a website page offers them as its choice.',
  elements: 'Records that tell the story of a topic in time and on the map, e.g. the life events of a person or the campsites of an expedition. They are found by an expansion rule from the topic. All story elements must be of one record type.',
  order: 'Order of the story elements: by the first date of the element, by a date field, as found by the rule, or set by hand for each story.',
  manual: 'The order of the elements of the story shown now. Drag the elements; the order is kept for this story topic.',
  limit: 'Most story elements read for one story topic.',
  start: 'Shown before the first element: a text ({title} = the title of the story topic) or a template run on the story topic.',
  end: 'Shown after the last element: a text ({title} = the title of the story topic) or a template run on the story topic.',
  template: 'Template of one story element.',
  layout: 'Vertical: the elements one below the other; Horizontal: side by side; Carousel: one element with Previous / Next; Tabs: a tab per element.',
  position: 'Where the start and end info is shown.',
  distinct: 'How the current element is marked in a vertical or horizontal story.',
  intro: 'Shown until a story topic is selected.',
  empty: 'Shown when a story topic has no story elements (they may exist but not be public).',
  background: 'Map document shown under the story, e.g. all places of all topics or a historical base map.',
  timeFilter: 'Show only the features of the background map whose time overlaps the time of the current element.',
  begin: 'Geographic fields of the story element or of the records it points to: the place where the element begins, or its only place.',
  transition: 'Places on the way, in their order.',
  endPlaces: 'Places where the element ends. Several end places give a star.',
  connect: 'Draw a line begin → transition → end.',
  keep: 'Keep the places of all elements on the map; otherwise only the current element is shown.',
  duration: 'Duration of the smooth move of the map to the current element, in milliseconds. 0 = jump.',
  elementSymbology: 'Symbols of the places of the current element.',
  lineSymbology: 'Line between the places of the current element.'
});

/** Names of the fields whose change needs Apply (a query is run, or a map document loaded). */
export const MANUAL_APPLY = Object.freeze({ query: 'query', rules: 'rules', background: 'background' });

/**
 * Texts by language → values of a multilingual field (`["text", "fre:texte"]`).
 *
 * @param {object} texts `{def, fre, …}`.
 * @returns {string[]}
 */
export function textValues(texts) {
  const list = [];
  if (texts?.def) list.push(texts.def);
  for (const [language, text] of Object.entries(texts || {})) {
    if (language !== 'def' && text) list.push(`${language}:${text}`);
  }
  return list;
}

/**
 * Values of a multilingual field → texts by language.
 *
 * @param {string[]|string|null} values
 * @returns {object} `{def, fre, …}`.
 */
export function valueTexts(values) {
  const texts = {};
  for (const value of [values ?? []].flat()) {
    const text = String(value ?? '');
    const match = /^([a-z]{3}):([\s\S]*)$/.exec(text);
    if (match) texts[match[1]] = match[2];
    else if (text.trim()) texts.def = text;
  }
  return texts;
}

/**
 * The form JSON.
 *
 * @param {object} context
 * @param {{query: number, rules: number, mapDocument: number}} context.ids Field ids of the query and the rule, the
 *        record type Map document.
 * @param {Array<{id: number, title: string, card: boolean}>} context.templates Report templates.
 * @param {Array<{id: number, label: string}>} context.dateFields Date fields of the story element type.
 * @returns {object} heurist-edit-form/1.
 */
export function storyMapForm({ ids, templates = [], dateFields = [] }) {
  const templateTerms = templates.map((item) => ({ id: String(item.id), label: item.card ? item.title : `${item.title} (not a card)` }));
  const template = (name, label, help) => ({ name, type: 'enum', mode: 'select', label, help, terms: templateTerms, emptyLabel: '(none)' });
  return {
    format: 'heurist-edit-form/1',
    groups: [
      {
        id: 'source', type: 'accordion', label: 'Source', open: true,
        children: [
          { name: 'title', type: 'freetext', label: 'Name', req: 'required' },
          // the record type of the topics, required; the query is optional (27q3 Story map review, 2026-11-25)
          // the shared record type picker (27q3 §17.4): grouped, hide without records
          { name: 'topicType', type: 'enum', mode: 'select', label: 'Story topic record type', help: HELP.topicType, req: 'required',
            source: 'rectypes', hideEmpty: true },
          { name: String(ids.query || MANUAL_APPLY.query), type: 'special', special: 'query', label: 'Story topics', help: HELP.topics },
          { name: String(ids.rules || MANUAL_APPLY.rules), type: 'special', special: 'rules', label: 'Story elements', help: HELP.elements, req: 'required' },
          { name: 'order', type: 'enum', mode: 'select', label: 'Order', help: HELP.order, clearable: false, terms: orderTerms(dateFields) },
          { name: 'dir', type: 'enum', mode: 'radio', label: 'Direction', clearable: false,
            terms: [{ id: 'asc', label: 'Ascending' }, { id: 'desc', label: 'Descending' }], showWhen: directionShown(dateFields) },
          { name: 'manual', type: 'special', special: 'manualOrder', label: 'Manual order', help: HELP.manual, showWhen: { order: 'manual' } },
          { name: 'limit', type: 'integer', label: 'Limit', help: HELP.limit, minValue: 1, maxValue: STORY_LIMIT.max, clearable: false }
        ]
      },
      { id: 'start', type: 'group', inner: true, label: 'Start info', help: HELP.start,
        children: [
          { name: 'startText', type: 'blocktext', label: 'Content', rows: 3, multilang: true },
          template('startTemplate', 'Template', '')
        ] },
      { id: 'end', type: 'group', inner: true, label: 'End info', help: HELP.end,
        children: [
          { name: 'endText', type: 'blocktext', label: 'Content', rows: 3, multilang: true },
          template('endTemplate', 'Template', '')
        ] },
      {
        id: 'presentation', type: 'accordion', label: 'Presentation', open: true,
        children: [
          { ...template('template', 'Story element template', HELP.template), req: 'required' },
          { name: 'layout', type: 'enum', mode: 'select', label: 'Show as', help: HELP.layout, clearable: false, req: 'recommended',
            terms: [{ id: 'list', label: 'Vertical' }, { id: 'horizontal', label: 'Horizontal' }, { id: 'carousel', label: 'Carousel' }, { id: 'tabs', label: 'Tabs' }] },
          { name: 'startMode', type: 'enum', mode: 'select', label: 'Start info', help: HELP.position, clearable: false,
            terms: [{ id: 'none', label: 'None' }, { id: 'inline', label: 'As the first element' }, { id: 'header', label: 'Above the story' }] },
          { name: 'endMode', type: 'enum', mode: 'select', label: 'End info', clearable: false,
            terms: [{ id: 'none', label: 'None' }, { id: 'inline', label: 'As the last element' }, { id: 'footer', label: 'Below the story' }] },
          { name: 'distinct', type: 'enum', mode: 'select', label: 'Current element', help: HELP.distinct, clearable: false, showWhen: { layout: ['list', 'horizontal'] },
            terms: [{ id: 'highlight', label: 'Highlight' }, { id: 'veil', label: 'Veil the others' }, { id: 'none', label: 'None' }] },
          { name: 'intro', type: 'blocktext', label: 'Introduction', help: HELP.intro, rows: 2, multilang: true },
          { name: 'empty', type: 'blocktext', label: 'No story found', help: HELP.empty, rows: 2, multilang: true }
        ]
      },
      {
        id: 'mapping', type: 'accordion', label: 'Mapping', open: false,
        children: [
          { name: MANUAL_APPLY.background, type: 'resource', label: 'Background map', help: HELP.background, targetTypes: ids.mapDocument ? [ids.mapDocument] : [],
            pointerMode: 'browseonly' },
          { name: 'timeFilter', type: 'boolean', mode: 'checkbox', label: 'Apply time filter on the background map', help: HELP.timeFilter },
          { name: 'begin', type: 'special', special: 'geoFields', max: 0, label: 'Begin or main', help: HELP.begin, req: 'recommended' },
          { name: 'transition', type: 'special', special: 'geoFields', max: 0, label: 'Transition', help: HELP.transition },
          { name: 'end', type: 'special', special: 'geoFields', max: 0, label: 'End', help: HELP.endPlaces },
          { name: 'connect', type: 'boolean', mode: 'checkbox', label: 'Connect the places: begin → transition → end', help: HELP.connect },
          { name: 'keep', type: 'boolean', mode: 'checkbox', label: 'Keep the places of the whole story on the map', help: HELP.keep },
          { name: 'duration', type: 'integer', label: 'Flight (ms)', help: HELP.duration, minValue: 0, maxValue: 20000, step: 100, clearable: false },
          { name: 'elementSymbology', type: 'special', special: 'symbology', label: 'Element symbology', help: HELP.elementSymbology, req: 'recommended' },
          { name: 'lineSymbology', type: 'special', special: 'symbology', label: 'Line symbology', help: HELP.lineSymbology }
        ]
      }
    ]
  };
}

/**
 * The choices of the order: the first date, the date fields of the element type, as found, manual.
 *
 * @param {Array<{id: number, label: string}>} dateFields
 * @returns {Array<{id: string|number, label: string}>}
 */
export function orderTerms(dateFields) {
  return [
    { id: 'date', label: 'Date (the first date of the element)' },
    ...dateFields.map((field) => ({ id: Number(field.id), label: field.label })),
    { id: 'rule', label: 'As found' },
    { id: 'manual', label: 'Manual' }
  ];
}

/**
 * When Ascending / Descending is shown: an order by a date, not As found or Manual (review 3, 2026-11-20).
 *
 * @param {Array<{id: number, label: string}>} dateFields
 * @returns {object} showWhen of the direction.
 */
export function directionShown(dateFields) {
  return { order: orderTerms(dateFields).map((term) => term.id).filter((id) => id !== 'rule' && id !== 'manual') };
}

/**
 * The values of the form for a story map.
 *
 * @param {{title: string, query: string, settings: object}} values Name, query text and normalised settings.
 * @param {{query: number, rules: number}} ids
 * @returns {object} Form values.
 */
export function formValues({ title, query, settings }, ids) {
  const { story, element, start, end, presentation, map } = settings;
  const json = (value) => (value ? JSON.stringify(value) : '');
  return {
    title,
    topicType: story.topicType ? String(story.topicType) : null,
    [String(ids.query || MANUAL_APPLY.query)]: query || '',
    [String(ids.rules || MANUAL_APPLY.rules)]: story.rule ? JSON.stringify([story.rule]) : '',
    order: story.order.by,
    dir: story.order.dir,
    manual: json(Object.keys(story.order.manual).length ? story.order.manual : null),
    limit: story.limit,
    startText: textValues(start.text),
    startTemplate: start.template ? String(start.template) : null,
    endText: textValues(end.text),
    endTemplate: end.template ? String(end.template) : null,
    template: element.template ? String(element.template) : null,
    layout: presentation.layout,
    startMode: start.mode,
    endMode: end.mode,
    distinct: presentation.distinct,
    intro: textValues(presentation.messages.intro),
    empty: textValues(presentation.messages.empty),
    [MANUAL_APPLY.background]: map.background?.mapDocument || null,
    timeFilter: map.background?.timeFilter === true,
    begin: [...map.places.begin],
    transition: [...map.places.transition],
    end: [...map.places.end],
    connect: map.places.connect,
    keep: map.keep,
    duration: map.duration,
    elementSymbology: json(map.elementSymbology),
    lineSymbology: json(map.lineSymbology)
  };
}

/**
 * Name, query and settings from the values of the form.
 *
 * @param {object} values Form values (getValues, with the hidden fields).
 * @param {{query: number, rules: number}} ids
 * @param {object} [previous] Settings before (what the form does not show: `actions`).
 * @returns {{title: string, query: string, settings: object}}
 */
export function valuesSettings(values, ids, previous = null) {
  const parse = (text) => {
    if (text == null || text === '') return null;
    if (typeof text === 'object') return text;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const one = (value) => (Array.isArray(value) ? value[0] : value);
  const list = (value) => [value ?? []].flat().map(String).filter(Boolean);
  const rules = parse(one(values[String(ids.rules || MANUAL_APPLY.rules)]));
  const mapDocument = Number(one(values[MANUAL_APPLY.background])) || 0;
  const settings = normalizeStoryMapSettings({
    story: {
      topicType: Number(one(values.topicType)) || null,
      rule: Array.isArray(rules) ? rules[0] || null : rules,
      order: { by: one(values.order), dir: one(values.dir), manual: parse(one(values.manual)) || {} },
      limit: Number(one(values.limit)) || STORY_LIMIT.default
    },
    element: { template: Number(one(values.template)) || null },
    start: { mode: one(values.startMode), template: Number(one(values.startTemplate)) || null, text: valueTexts(values.startText) },
    end: { mode: one(values.endMode), template: Number(one(values.endTemplate)) || null, text: valueTexts(values.endText) },
    presentation: {
      layout: one(values.layout),
      distinct: one(values.distinct),
      messages: { intro: valueTexts(values.intro), empty: valueTexts(values.empty) }
    },
    map: {
      background: mapDocument ? { mapDocument, timeFilter: one(values.timeFilter) === true } : null,
      places: { begin: list(values.begin), transition: list(values.transition), end: list(values.end), connect: one(values.connect) === true },
      elementSymbology: parse(one(values.elementSymbology)),
      lineSymbology: parse(one(values.lineSymbology)),
      duration: Number(one(values.duration)),
      keep: one(values.keep) === true
    },
    actions: previous?.actions ?? null
  });
  return {
    title: String(one(values.title) ?? '').trim(),
    query: String(one(values[String(ids.query || MANUAL_APPLY.query)]) ?? '').trim(),
    settings
  };
}
