/**
 * @file initRecordEditorShell.js
 * @brief Start of Explorer in editor mode (plan 21 §2.4): create the shell, expose
 *        its API as `window.heuristExplorer` at once (a host polls for it) and
 *        initialize it.
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

import './RecordEditorShell.css';
import { RecordEditorShell, RecordEditorShellApi } from './RecordEditorShell.js';

/**
 * @param {object} config Normalized Explorer configuration (`mode: 'editor'`, `editor`).
 * @param {{before?: Promise<*>|null}} [options] Work to finish first (the locale).
 * @returns {Promise<RecordEditorShellApi>} Resolves once the shell has initialized.
 * @throws {Error} When `config.containerId` does not match an element in the document.
 */
export async function initRecordEditorShell(config, { before = null } = {}) {
  const container = document.getElementById(config.containerId);
  if (!container) throw new Error(`#${config.containerId} was not found`);
  const shell = new RecordEditorShell({ container, config });
  const api = new RecordEditorShellApi(shell);
  container.classList.add('h-explorer-booting');
  const ready = Promise.resolve(before).then(() => shell.initialize()).then(() => api)
    .finally(() => container.classList.remove('h-explorer-booting'));
  api.setReadyPromise(ready);
  globalThis.heuristExplorer = api;
  return ready;
}
