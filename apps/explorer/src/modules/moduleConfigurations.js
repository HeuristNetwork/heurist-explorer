/**
 * @file moduleConfigurations.js
 * @brief The configuration forms of the presentation modules in Explorer's window (plan 29):
 *        the modules' configuration entries (lazy chunks) and the host action that opens
 *        a module's form for a module in an iframe or mounted directly. In publication
 *        mode Explorer also publishes: the module gives its settings and state only.
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

import { ReportTemplateProvider } from '#shared/data/ReportTemplateProvider.js';
import { configurationFormMode, patchFormFields, smartyTemplateTerms } from '#shared/data/moduleConfigurationForm.js';
import { WebsiteClient } from '#shared/api/WebsiteClient.js';
import { lastPublishedPageId, newPageTitle, publishModuleTo } from '#shared/site/modulePublisher.js';
import { termsOf } from '#shared/ui/config/moduleConfigurationDialogFactory.js';
import { describeSymbology } from '../core/RecordEditorHost.js';

/** The configuration entries of the modules by module type (lazy chunks). */
export const MODULE_CONFIGURATIONS = Object.freeze({
  map: async () => (await import('../../../map/src/configuration.js')).mapConfiguration,
  timeline: async () => (await import('../../../timeline/src/configuration.js')).timelineConfiguration,
  graph: async () => (await import('../../../graph/src/configuration.js')).graphConfiguration,
  data: async () => (await import('../../../data/src/configuration.js')).dataConfiguration,
  recordview: async () => (await import('../../../recordview/src/configuration.js')).recordViewConfiguration
});

/**
 * Open the configuration form of a module in Explorer's window (host action
 * `openConfiguration`).
 * - `configuration` / `website`: gives the settings back; the module applies them.
 * - `publication`: Explorer publishes the page itself (title and page, then the result
 *   with the URL); the module gave its settings (prepared for a page) and its state.
 *
 * @param {object} request
 * @param {string} request.moduleType Module type (`map`, `timeline`, `graph`, `data`, `recordview`).
 * @param {string} [request.mode='configuration'] `configuration`, `website` or `publication`.
 * @param {object} [request.value] The module's settings envelope (for a page in publication mode).
 * @param {object|null} [request.state] The module's state for the page (publication mode).
 * @param {object|null} [request.publication] More module data for its `preparePublication` (publication mode).
 * @param {Object<string, Array<{id: *, label: string}>>|null} [request.terms] Lists of the module (`termsSource`),
 *        e.g. the map documents and base maps of the map.
 * @param {Object<string, object>|null} [request.fields] Field properties of the module by field name
 *        (`patchFormFields`), e.g. the record type of the map documents.
 * @param {string} [request.title] Dialog title.
 * @param {boolean} [request.simplified=false] Explorer's simplified interface.
 * @param {object} [context] Explorer: `baseUrl`, `database` (the Smarty template list), `formServices()`
 *        (input services of the form), `editSymbology(value, options)`; for publication `apiClient`,
 *        `language` (the page language for "auto") and `openWebsiteManager`.
 * @returns {Promise<object|null>} The normalized settings (configuration), the publication `{id, url, ...}`
 *          (publication), or null when cancelled.
 */
export async function openModuleConfiguration(request = {}, context = {}) {
  const mode = configurationFormMode(request.mode);
  const load = MODULE_CONFIGURATIONS[request.moduleType];
  if (!load) throw new Error(`No configuration form for module "${request.moduleType}"`);
  const [configuration, { ModuleConfigurationDialog }] = await Promise.all([
    load(),
    import('#shared/ui/config/ModuleConfigurationDialog.js')
  ]);
  const templates = new ReportTemplateProvider({ baseUrl: context.baseUrl, database: context.database });
  const client = mode === 'publication' ? new WebsiteClient({ apiClient: context.apiClient }) : null;
  const target = client ? await publishTarget(client, configuration.type, context) : null;
  let publication = null;
  const services = (await context.formServices?.().catch?.(() => null)) || {};
  const settings = await new ModuleConfigurationDialog({
    form: patchFormFields(target ? { ...configuration.form, groups: [...configuration.form.groups, ...target.groups] }
      : configuration.form, request.fields),
    formId: configuration.type,
    mode,
    title: request.title,
    value: request.value || null,
    defaults: configuration.defaults,
    normalize: configuration.normalize,
    simplified: request.simplified === true,
    termsProviders: { smartyTemplates: smartyTemplateTerms(templates), ...termsOf(request.terms) },
    formOptions: {
      ...services,
      specialEditors: specialEditors(context),
      ...(target ? { onChange: target.onChange } : {})
    },
    // publication: the page is written here, to the page chosen in "Publish to"
    onSave: target
      ? async (value, { form }) => {
        publication = await publishPage(configuration, value, request, form.getValues().publish || {},
          { ...context, client });
        return Boolean(publication);
      }
      : null
  }).open();
  if (mode !== 'publication' || !settings) return settings;
  if (publication) await showPublication(publication, context);
  return publication;
}

/**
 * The "Publish to" section of the publication form (plan 29 §10): New page | Update the page
 * (the module's standalone pages the user may change; the last published one first), and
 * the page title. Its values (`publish.*`) are not settings.
 *
 * @param {WebsiteClient} client Website API client.
 * @param {string} type Module type.
 * @param {object} context Explorer context (`database`).
 * @returns {Promise<{groups: Array<object>, onChange: Function}>}
 */
export async function publishTarget(client, type, context) {
  let pages = [];
  try {
    pages = await client.pages(type);
  } catch {
    pages = []; // no list (older server): a new page only
  }
  const last = lastPublishedPageId(context.database, type);
  const initial = pages.find((page) => page.id === last) || pages[0] || null;
  const titleOf = (target, pageId) => (target === 'update'
    ? pages.find((page) => String(page.id) === String(pageId))?.title || ''
    : newPageTitle(type));
  // no page of this module yet: a new page, only its title is asked
  const choice = pages.length ? [
    {
      name: 'publish.target', type: 'enum', label: 'Publish to', mode: 'radio', clearable: false, req: 'recommended',
      terms: [{ id: 'new', label: 'New page' }, { id: 'update', label: 'Update the page' }],
      default: 'update'
    },
    {
      name: 'publish.pageId', type: 'enum', label: 'Page', mode: 'select', clearable: false, req: 'recommended',
      terms: pages.map((page) => ({ id: page.id, label: `${page.title} (${page.id})` })),
      default: initial.id,
      showWhen: { 'publish.target': 'update' }
    }
  ] : [];
  const children = [
    ...choice,
    {
      name: 'publish.title', type: 'freetext', label: 'Page title', req: 'required',
      default: initial ? initial.title : newPageTitle(type)
    }
  ];
  return {
    groups: [{ id: 'publishTo', label: 'Publish to', modes: ['publication'], children }],
    // another target or page: its title (the title of a new page is the default one)
    onChange: (form, change) => {
      if (change.name !== 'publish.target' && change.name !== 'publish.pageId') return;
      void form.setValue('publish.title', titleOf(form.getValue('publish.target'), form.getValue('publish.pageId')));
    }
  };
}

/**
 * Special editors of the module forms in Explorer: the symbology editors of Explorer's window.
 *
 * @param {object} context Explorer context (`editSymbology`).
 * @returns {Object<string, object>}
 */
function specialEditors(context) {
  if (typeof context.editSymbology !== 'function') return {};
  const parse = (value) => {
    try { return value ? JSON.parse(value) : null; } catch { return null; }
  };
  return {
    symbology: {
      json: true,
      icon: 'fa-palette',
      title: 'Open symbology editor',
      describe: (value) => describeSymbology(parse(value)),
      // a complete symbol (a default of the module, not a part of a layer)
      edit: async (value) => {
        const result = await context.editSymbology(parse(value), { complete: true });
        return result == null ? undefined : (Object.keys(result).length ? JSON.stringify(result) : '');
      }
    }
  };
}

/**
 * Write the standalone page chosen in "Publish to".
 *
 * @param {object} configuration The module's configuration entry (with `preparePublication` when the module
 *        has publication options).
 * @param {object} settings Normalized settings from the form.
 * @param {object} request The module's request (`state`, `publication`).
 * @param {{target?: string, pageId?: number, title?: string, preserveState?: boolean}} publish Values of `publish.*`.
 * @param {object} context Explorer context (`client`, `database`, `language`).
 * @returns {Promise<object>} The publication.
 */
async function publishPage(configuration, settings, request, publish, context) {
  const prepared = typeof configuration.preparePublication === 'function'
    ? configuration.preparePublication({ settings: configuration.serialize(settings), state: request.state ?? null,
      publish, publication: request.publication ?? null })
    : { settings: configuration.serialize(settings), state: request.state ?? null };
  const envelope = prepared.settings;
  const state = prepared.state;
  const target = publish;
  // "auto" in a page: the language of now (as the modules did in their own publish)
  if (!envelope.options.ui?.language || envelope.options.ui.language === 'auto') {
    envelope.options.ui = { ...(envelope.options.ui || {}), language: context.language || 'eng' };
  }
  return publishModuleTo({
    client: context.client,
    database: context.database,
    type: configuration.type,
    settings: envelope,
    state,
    title: target.title,
    pageId: target.target === 'update' ? Number(target.pageId) || 0 : 0
  });
}

/** The URL and embed code of a publication, with the Website manager button. */
async function showPublication(publication, context) {
  const { PublishedDialog } = await import('#shared/ui/PublishedDialog.js');
  const actions = typeof context.openWebsiteManager === 'function'
    ? [{ label: 'Website manager', run: () => context.openWebsiteManager({ recordId: publication.id }) }]
    : [];
  new PublishedDialog({ publication: { ...publication, actions } }).open();
}
