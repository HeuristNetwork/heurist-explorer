/**
 * @file querySourceChooser.js
 * @brief The ▾ button of a query field (plan 27n1 §4): a list of query sources (and saved filters) under the button;
 *        the chosen one's query is copied into the field (by value: no id is kept).
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
import { $HR } from '../../ui/i18n/HResource.js';
import './querySourceChooser.css';

/** A search box above the list from this number of items. */
const SEARCH_FROM = 10;

/**
 * The items offered for a parameter rule: `with` only query sources with parameters, `without` only those without,
 * `any` all of them.
 *
 * @param {Array<{id: number|string, title?: string, kind?: string, parameterized?: boolean}>} items
 * @param {'any'|'with'|'without'} [parameters='without']
 * @returns {Array<object>}
 */
export function querySourceChoices(items = [], parameters = 'without') {
  return (items || []).filter((item) => item && Number(item.id) > 0
    && (parameters === 'any' || (parameters === 'with' ? Boolean(item.parameterized) : !item.parameterized)));
}

/**
 * Show the list under an anchor; resolves with the chosen item, or null (closed).
 *
 * @param {HTMLElement} anchor The ▾ button.
 * @param {Array<{id: number|string, title?: string, kind?: string}>} items Items to offer (`kind: 'filter'` gets a mark).
 * @returns {Promise<object|null>}
 */
export function chooseQuerySource(anchor, items) {
  return new Promise((resolve) => {
    let chosen = null;
    const content = document.createElement('div');
    content.className = 'h-query-source-chooser';
    const menu = document.createElement('div');
    menu.className = 'h-menu h-query-source-chooser-list';
    const show = (text = '') => {
      const needle = text.trim().toLowerCase();
      menu.replaceChildren();
      const shown = items.filter((item) => !needle || String(item.title || '').toLowerCase().includes(needle));
      for (const item of shown) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'h-menu-item';
        button.textContent = item.title || `#${item.id}`;
        if (item.kind === 'filter') {
          const mark = document.createElement('span');
          mark.className = 'h-query-source-chooser-kind';
          mark.textContent = $HR('filter');
          button.append(mark);
        }
        button.addEventListener('click', () => {
          chosen = item;
          popover.close();
        });
        menu.append(button);
      }
      if (!shown.length) {
        const empty = document.createElement('div');
        empty.className = 'h-query-source-chooser-empty';
        empty.textContent = $HR(items.length ? 'Nothing found' : 'There is no query source to copy');
        menu.append(empty);
      }
    };
    if (items.length >= SEARCH_FROM) {
      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'h-input h-query-source-chooser-search';
      search.placeholder = $HR('Search');
      search.addEventListener('input', () => show(search.value));
      content.append(search);
      setTimeout(() => search.focus(), 0);
    }
    content.append(menu);
    show();
    const popover = showPopover(anchor, content, { className: 'h-query-source-chooser-popover', align: 'right',
      onClose: () => resolve(chosen) });
  });
}

/**
 * The ▾ action of a special query field (HEditField `special.actions`): choose a query source, copy its query.
 *
 * @param {object} options
 * @param {() => Promise<Array<object>>} options.list Query sources (and saved filters): `[{id, title, kind, parameterized}]`.
 * @param {(item: object) => Promise<{query: *, filterForm?: object|null}|null>} options.definition The query of an item.
 * @param {'any'|'with'|'without'} [options.parameters='without'] Which ones are offered.
 * @param {(definition: object, context: object) => (string|undefined)} options.apply The new value of the field (and other
 *        fields set through the context, e.g. a filter form); undefined: nothing changes.
 * @returns {{label: string, icon: string, title: string, iconOnly: boolean, run: Function}}
 */
export function querySourceAction({ list, definition, parameters = 'without', apply }) {
  return {
    label: '',
    icon: 'fa-caret-down',
    iconOnly: true,
    title: 'Copy the query of a query source',
    run: async (value, context, anchor) => {
      const items = querySourceChoices(await list(), parameters);
      const item = await chooseQuerySource(anchor, items);
      if (!item) return undefined;
      const found = await definition(item);
      return found ? apply(found, context) : undefined;
    }
  };
}
