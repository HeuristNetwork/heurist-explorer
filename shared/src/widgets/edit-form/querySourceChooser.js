/**
 * @file querySourceChooser.js
 * @brief The one picker of query sources and saved filters (review 7 of plan 27q2, docs/development/query-choice-picker.md):
 *        an HValuePicker in a popover under a button — the ▾ of a query field (its query copied by value), the Saved
 *        filter of the CMS, the query of a report. Items from queryChoiceItems: names, `[filter]` / `[parametrized]`
 *        marks, parameterized ones left out where no Filter Form is possible, a search box from more than 10 entries.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-shared
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { showPopover } from '../popover/popover.js';
import { HValuePicker } from '../picker/HValuePicker.js';
import { StaticSource } from '../../data/valueSources/localSources.js';
import { queryChoiceItems } from '../../data/queryChoices.js';
import './querySourceChooser.css';

/** The search box of the list from this number of entries on (rule e of review 7: more than 10). */
export const QUERY_CHOICE_SEARCH_FROM = 10;

/**
 * Show the picker under an anchor; resolves with the `choice` of the item picked (a query choice, or a fixed item such
 * as Current result), or null (closed).
 *
 * @param {HTMLElement} anchor The button.
 * @param {Array<object>} items Picker items (queryChoiceItems).
 * @param {{value?: string}} [options] `value`: the item marked as chosen.
 * @returns {Promise<object|null>}
 */
export function chooseQuerySource(anchor, items, { value = null } = {}) {
  return new Promise((resolve) => {
    let chosen = null;
    const content = document.createElement('div');
    content.className = 'h-query-source-chooser';
    const picker = new HValuePicker().attach(content, {
      source: new StaticSource(items),
      value,
      loadOnRender: true,
      filterThreshold: QUERY_CHOICE_SEARCH_FROM,
      placeholder: 'Search',
      onPick: (item) => {
        chosen = item.choice ?? item;
        popover.close();
      }
    }).render();
    const popover = showPopover(anchor, content, {
      className: 'h-query-source-chooser-popover',
      align: 'right',
      onClose: () => {
        void picker.destroy();
        resolve(chosen);
      }
    });
    void picker.open();
  });
}

/**
 * The ▾ action of a special query field (HEditField `special.actions`): choose a query source or saved filter, copy its
 * query (and Filter Form).
 *
 * @param {object} options
 * @param {() => Promise<Array<object>>} options.list Query choices (listQueryChoices).
 * @param {(choice: object) => Promise<{query: *, filterForm?: object|null}|null>} options.definition The query of a
 *        choice (queryChoiceDefinition; also gets the fixed items).
 * @param {'any'|'without'|function(): string} [options.parameters='without'] `without`: parameterized ones left out (no
 *        Filter Form field); a function is asked at the click.
 * @param {Array<{value: string, label: string}>} [options.first] Fixed items above the list (Current result, plan 27q2
 *        §17).
 * @param {(definition: object, context: object) => (string|undefined)} options.apply The new value of the field (and other
 *        fields set through the context, e.g. a filter form); undefined: nothing changes.
 * @returns {{label: string, icon: string, title: string, iconOnly: boolean, run: Function}}
 */
export function querySourceAction({ list, definition, parameters = 'without', apply, first = [] }) {
  return {
    label: '',
    icon: 'fa-caret-down',
    iconOnly: true,
    title: 'Copy the query of a query source or saved filter',
    run: async (value, context, anchor) => {
      const rule = typeof parameters === 'function' ? parameters() : parameters;
      const choice = await chooseQuerySource(anchor, queryChoiceItems(await list(), { parameters: rule, first }));
      if (!choice) return undefined;
      const found = await definition(choice);
      return found ? apply(found, context) : undefined;
    }
  };
}
