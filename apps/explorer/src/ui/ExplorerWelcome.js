/**
 * @file ExplorerWelcome.js
 * @brief Welcome popup shown on the very first visit to Explorer, or on demand
 *        (Getting started in the Explorer configuration dialog).
 *        See docs/development/11 Getting-Started-Plan.md.
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

import { $HR, HMsg, getAssetBaseUrl } from '#shared/ui';
import './ExplorerWelcome.css';

/** localStorage key: the welcome was shown in this browser (for any database). */
export const WELCOME_SHOWN_KEY = 'heurist.explorer.welcomeShown';
const DIALOG_ID = 'h-explorer-welcome';

/** Welcome popup: logo, what Explorer is, and the Getting started entry point. */
export class ExplorerWelcome {
  /**
   * @param {object} [options]
   * @param {Function|null} [options.onGettingStarted] Called when the user presses Getting started.
   * @param {Storage|null} [options.storage] Storage backend; defaults to `localStorage`.
   */
  constructor({ onGettingStarted = null, storage = null } = {}) {
    this.onGettingStarted = typeof onGettingStarted === 'function' ? onGettingStarted : null;
    this.storage = storage ?? defaultStorage();
  }

  /** @returns {boolean} Whether this browser has never shown the welcome popup. */
  isFirstVisit() {
    try { return this.storage?.getItem?.(WELCOME_SHOWN_KEY) !== '1'; } catch { return false; }
  }

  /** Remember that the welcome popup was shown. */
  markShown() {
    try { this.storage?.setItem?.(WELCOME_SHOWN_KEY, '1'); } catch { /* storage may be unavailable */ }
  }

  /**
   * Show the popup and remember that it was shown.
   *
   * @returns {HTMLDialogElement|null} The dialog element.
   */
  open() {
    this.markShown();
    const close = () => HMsg.closeMsgDlg?.(DIALOG_ID);
    return HMsg.showMsgDlg(this._content(), {
      dialogId: DIALOG_ID,
      title: $HR('Welcome to Heurist Explorer'),
      buttons: [
        ...(this.onGettingStarted ? [{
          label: $HR('Getting started'), class: 'h-btn h-btn-primary',
          onClick: () => { close(); this.onGettingStarted(); }
        }] : []),
        { label: $HR('Close'), class: 'h-btn', onClick: close }
      ]
    });
  }

  /** @private @returns {HTMLElement} The popup body. */
  _content() {
    const root = document.createElement('div');
    root.className = 'h-explorer-welcome';

    const logo = document.createElement('img');
    logo.className = 'h-explorer-welcome-logo';
    logo.alt = 'Heurist';
    logo.src = `${String(getAssetBaseUrl() || '').replace(/\/+$/, '')}/assets/branding/h6logo.png`;

    const lead = document.createElement('p');
    lead.className = 'h-explorer-welcome-lead';
    lead.textContent = $HR('Explorer is the module that allows filtering, analysing, visualising and publishing data in your database.');

    const list = document.createElement('ul');
    list.className = 'h-explorer-welcome-points';
    for (const [title, text] of POINTS) {
      const item = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = $HR(title);
      item.append(strong, ' ', $HR(text));
      list.append(item);
    }

    root.append(logo, lead, list);
    return root;
  }
}

/** Short description of Explorer: its three main ideas. */
const POINTS = [
  ['Query sources.', 'A query - fixed, or with parameters shown as a Filter Form - together with its geographic, time and column fields and expansion rules. Build them with Search (the Query Source editor) and save them for reuse.'],
  ['Presentation modules.', 'Data, Map, Graph, Timeline and Record view show the same result and selection. Each module is independent: arrange, hide or show it as you need.'],
  ['Publication.', 'Publish a module or a set of modules with your query sources as a standalone page or a website.']
];

/** Return `localStorage` when accessible, otherwise `null`. */
function defaultStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
