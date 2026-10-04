/**
 * @file explorerTourSteps.js
 * @brief Steps and topics of the Explorer getting-started tour (ExplorerTour).
 *        Step texts are in user-manual/explorerGettingStarted{Lang}.htm, one
 *        <section id="step-id"> each; manual anchors are in explorerUserManual{Lang}.htm.
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

/** @returns {Array<{id: string, title: string}>} Tour topics, in order. */
export function explorerTourTopics() {
  return [
    { id: 'qse', title: 'Filter builder and source editor' },
    { id: 'toolbar', title: 'Saved filters and sources on the toolbar' },
    { id: 'modules', title: 'Presentation modules' },
    { id: 'tools', title: 'Tools' },
    { id: 'publication', title: 'Publication' }
  ];
}

/**
 * Tour steps over the Explorer interface.
 *
 * @param {object} app ExplorerApplication.
 * @returns {Array<object>} Steps; see ExplorerTour's TourStep.
 */
export function explorerTourSteps(app) {
  const editor = () => app.querySourcePanel?.editor?.container || null;
  const inEditor = (selector) => () => editor()?.querySelector(selector) || null;
  // while a Filter Form is open the editor is hidden and its steps are skipped
  // (closing the form would lose the user's values)
  const openEditor = () => { app.showQuerySourcePanel?.(); };
  const showSettings = () => { openEditor(); app.querySourcePanel?.editor?.setExpanded(true); };
  const rail = (side, id) => () => app.controlPanel?.[side]?.getButtonElement(id) || null;
  // a visible module's pane, otherwise its toolbar button
  const module = (id) => () => {
    const region = app.layout?.getRegionForModule?.(id);
    const pane = region ? app.layout?.cardinal?.getRegionElement?.(region) : null;
    const rect = pane && !pane.hidden ? pane.getBoundingClientRect() : null;
    return rect && rect.width > 0 && rect.height > 0 ? pane : rail('rightRail', id)();
  };

  const step = (topic, id, title, target, extra = {}) => ({ topic, id, title, target, ...extra });
  return [
    step('qse', 'qse-intro', 'Query Source editor', editor, { before: openEditor, manualAnchor: 'query-source-editor' }),
    step('qse', 'qse-query', 'Inline query helper', inEditor('.h-qse-query'), { before: openEditor, manualAnchor: 'inline-query-helper' }),
    step('qse', 'qse-builder', 'Filter Builder', inEditor('.h-qse-builder'), { before: openEditor, manualAnchor: 'filter-builder' }),
    step('qse', 'qse-parameters', 'Parameterized filter and Filter Form', inEditor('.h-qse-builder'), { before: openEditor, manualAnchor: 'parameterized-filter' }),
    step('qse', 'qse-settings', 'Geographic, time and column fields', inEditor('.h-qse-advanced'), { before: showSettings, manualAnchor: 'presentation-fields' }),
    step('qse', 'qse-rules', 'Expansion rules', inEditor('.h-qse-config-edit'), { before: showSettings, manualAnchor: 'expansion-rules' }),
    step('qse', 'qse-save', 'Save and Add', inEditor('.h-dsa-save'), { before: openEditor, manualAnchor: 'query-source-editor' }),
    step('qse', 'qse-layout', 'Layout and more options', inEditor('.h-qse-layout'), { before: openEditor, manualAnchor: 'query-source-editor' }),

    step('toolbar', 'toolbar-search', 'Search', rail('leftRail', 'search'), { manualAnchor: 'query-source-editor' }),
    step('toolbar', 'toolbar-lists', 'Filters, Entities and Sources', rail('leftRail', 'saved-filters'), { manualAnchor: 'toolbar-lists' }),
    step('toolbar', 'toolbar-favorites', 'Favorites', rail('leftRail', 'favorites'), { manualAnchor: 'favorites' }),
    step('toolbar', 'toolbar-history', 'History', rail('leftRail', 'history'), { manualAnchor: 'toolbar-lists' }),
    step('toolbar', 'toolbar-workspace', 'Workspace', rail('leftRail', 'workspace'), { manualAnchor: 'workspace' }),
    step('toolbar', 'toolbar-subsets', 'Subsets', rail('leftRail', 'subsets'), { manualAnchor: 'subsets' }),

    step('modules', 'module-data', 'Result', module('data'), { manualAnchor: 'presentation-modules' }),
    step('modules', 'module-map', 'Map', module('map'), { manualAnchor: 'presentation-modules' }),
    step('modules', 'module-graph', 'Graph', module('graph'), { manualAnchor: 'presentation-modules' }),
    step('modules', 'module-timeline', 'Timeline', module('timeline'), { manualAnchor: 'presentation-modules' }),
    step('modules', 'module-recordview', 'Record view', module('recordview'), { manualAnchor: 'presentation-modules' }),
    step('modules', 'module-layout', 'Layout configuration', rail('rightRail', 'options'), { manualAnchor: 'layout-configuration' }),

    step('tools', 'tools', 'Tools', rail('rightRail', 'report'), { manualAnchor: 'tools' }),
    step('publication', 'publication', 'Publication', rail('rightRail', 'publish'), { manualAnchor: 'publication' })
  ];
}
