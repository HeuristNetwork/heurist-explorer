/**
 * @file oneAtATime.js
 * @brief One run of an action at a time: a repeated click while a dialog is loading does not open
 *        a second copy of it (2026-11-06).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * A shared guard for several actions: while one of them runs, a call of any of them does nothing and
 * gives the running one's promise (they open modal dialogs, only one can be used at a time).
 *
 * @returns {function(Function): Function} Wraps an async function.
 */
export function oneAtATime() {
  let running = null;
  return (action) => function guarded(...args) {
    if (running) return running;
    const started = (async () => action.apply(this, args))();
    running = started.finally(() => { running = null; });
    return running;
  };
}
