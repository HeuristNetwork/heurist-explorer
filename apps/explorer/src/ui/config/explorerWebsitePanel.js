/**
 * @file explorerWebsitePanel.js
 * @brief The configuration of an Explorer instance of a website page, inline in the CMS designer (review 2026-11-14):
 *        the filters of the page (saved filters of "Website filters" and public query sources, no current query) and the
 *        Layout of the presentation modules (no tools). The language is the language of the page (`auto`).
 *
 * A new instance has the website defaults (websiteExplorerSettings: every presentation module with the website
 * defaults of its form, e.g. Enable edit off), review 2026-11-15; Apply changes only the filters and the layout, so the
 * module settings edited in the designer stay. (The current view of Explorer is not taken any more.)
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
import { $HR } from '#shared/ui';
import { createModuleConfigurationForm } from '#shared/ui/config/ModuleConfigurationDialog.js';
import { ExplorerUiConfig, PRESENTATION_TYPES, UNUSED_REGION } from '../../core/ExplorerUiConfig.js';
import { createLayoutEditor } from './explorerLayoutEditor.js';
import { explorerPublicationForm, normalizePublicationValues, publicationFilterChoices, publicationSettings } from './explorerPublication.js';

/** Panes of the layout. */
const PANES = ['north', 'west', 'center', 'east', 'south'];

/**
 * Form values of a configured instance: the keys of its filters, the active one and the presentation.
 *
 * @param {object|null} settings `instance.settings` (heurist-explorer-settings).
 * @returns {object} Values of normalizePublicationValues.
 */
export function websiteFormValues(settings) {
  const filter = settings?.filter || {};
  return normalizePublicationValues({
    ui: { language: 'auto' },
    filter: { items: (filter.items || []).map((item) => item.key).filter(Boolean), active: filter.active || null, mode: filter.mode }
  });
}

/**
 * The layout value `{regions, order, panes}` of a configured instance (its `ui`), else the Explorer defaults; the
 * tools are left out of the panes.
 *
 * @param {object|null} settings `instance.settings`.
 * @returns {{regions: object, order: string[], panes: object}}
 */
export function websiteLayoutValue(settings) {
  const defaults = ExplorerUiConfig.defaults();
  const ui = settings?.ui || {};
  const regions = { ...defaults.regions, ...(ui.regions || {}) };
  for (const type of Object.keys(regions)) if (!PRESENTATION_TYPES.includes(type)) regions[type] = UNUSED_REGION;
  return {
    regions,
    order: Array.isArray(ui.order) && ui.order.length ? [...ui.order] : [...defaults.order],
    panes: { ...defaults.panes, ...(ui.panes || {}) }
  };
}

/**
 * The module list of the page (`settings.layout`): every presentation module placed in a pane, in the order of the
 * layout; an existing item keeps its id, settings, state and context, a new one gets the module settings of the
 * instance (`settings.modules`). Explorer makes only the modules of this list.
 *
 * @param {object} settings The settings the page has (or the current view).
 * @param {{regions: object, order: string[]}} layout Layout value.
 * @returns {Array<object>}
 */
export function websiteLayoutList(settings, layout) {
  const existing = Array.isArray(settings?.layout) ? settings.layout : [];
  const order = [...new Set([...(layout.order || []), ...PRESENTATION_TYPES])];
  const list = [];
  for (const type of order) {
    const region = layout.regions?.[type];
    if (!PRESENTATION_TYPES.includes(type) || !PANES.includes(region)) continue;
    const items = existing.filter((item) => item?.type === type);
    if (items.length) {
      for (const item of items) list.push({ ...item, region });
      continue;
    }
    list.push({ id: type, type, region, context: type === 'data' ? { role: 'current' } : null,
      settings: settings?.modules?.[type] ? JSON.parse(JSON.stringify(settings.modules[type])) : null, state: null });
  }
  return list;
}

/**
 * The settings of a new Explorer instance of a website page (review 2026-11-15): the layout of the Explorer defaults
 * without the tools, every placed presentation module with its website settings, no filters; the language of the page.
 *
 * @param {Object<string, object>} modules Website settings of the presentation modules by type.
 * @returns {object} heurist-explorer-settings.
 */
export function websiteExplorerSettings(modules = {}) {
  const layout = websiteLayoutValue(null);
  const base = { format: 'heurist-explorer-settings', version: 1, layout: [], modules: JSON.parse(JSON.stringify(modules || {})) };
  return {
    ...base,
    ui: { ...ExplorerUiConfig.defaults(), ...layout, language: 'auto' },
    layout: websiteLayoutList(base, layout),
    filter: { items: [], active: null, mode: 'buttons', placement: 'west' }
  };
}

/**
 * The inline panel.
 *
 * @param {object} options
 * @param {{settings?: object, state?: object}|null} [options.value] The instance (null: a new one).
 * @param {{filters: Array<object>, sources: Array<object>}} options.lists Public filters (`_publicFilterLists`).
 * @param {() => Promise<object>} options.defaults The settings of a new instance (websiteExplorerSettings).
 * @returns {Promise<{element: HTMLElement, read: () => Promise<{settings: object, state: object}|null>, reset: () => void,
 *          destroy: () => Promise<void>}>}
 */
export async function createExplorerWebsitePanel({ value = null, lists = {}, defaults } = {}) {
  const settings = value?.settings && typeof value.settings === 'object' && Object.keys(value.settings).length ? value.settings : null;
  // the query of an older page stays offered while it is one of its filters
  const published = (settings?.filter?.items || []).find((item) => item.kind === 'query');
  const choices = publicationFilterChoices({ ...lists, current: null });
  if (published) choices.push({ ...published, key: 'current', title: published.title || 'Current query', parameterized: false });
  const element = document.createElement('div');
  element.className = 'h-explorer-website-panel';
  const form = await createModuleConfigurationForm({
    form: explorerPublicationForm(choices),
    formId: 'explorer',
    mode: 'website',
    value: websiteFormValues(settings),
    defaults: () => normalizePublicationValues({}),
    normalize: normalizePublicationValues
  });
  element.append(form.element);
  const layoutSection = document.createElement('section');
  layoutSection.className = 'h-explorer-website-layout';
  const heading = document.createElement('div');
  heading.className = 'h-cms-form-section-title h-i18n';
  heading.textContent = $HR('Layout');
  layoutSection.append(heading);
  element.append(layoutSection);
  const layout = websiteLayoutValue(settings);
  const editor = createLayoutEditor(layoutSection, { value: layout, types: PRESENTATION_TYPES });
  return {
    element,
    async read() {
      if (form.validate().length) return null;
      const values = form.getValue();
      // a new instance (no settings yet): the website defaults
      const base = settings ? JSON.parse(JSON.stringify(settings)) : await defaults();
      const state = value?.state ?? null;
      const placed = editor.getValue();
      const ui = { ...(base.ui || {}), regions: { ...(base.ui?.regions || {}), ...placed.regions }, order: placed.order,
        panes: placed.panes, language: 'auto' };
      const result = publicationSettings({ ...base, ui }, values, choices);
      // the language of the page decides (publicationSettings writes the language of now for `auto`)
      result.ui = { ...result.ui, language: 'auto' };
      result.layout = websiteLayoutList(base, placed);
      return { settings: result, state };
    },
    reset() {
      form.reset(true);
    },
    async destroy() {
      editor.destroy();
      await form.destroy();
    }
  };
}
