/**
 * @file reportRenderUrl.js
 * @brief URL that renders one record with a Smarty report template.
 *
 * Uses `/api/{db}/reports/{template}/render?rec=N` (plan 12). Templates of the
 * legacy default folder (`def/...`) keep the old `?template=..&q=ids:N` URL.
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
 * Build the render URL of one record.
 *
 * @param {string} baseUrl Heurist base URL, ending in `/`.
 * @param {string} database Database name.
 * @param {string} template Template name, with or without ".tpl".
 * @param {number} recordId Record id.
 * @returns {URL} Render URL.
 */
export function buildReportRenderUrl(baseUrl, database, template, recordId) {
  const base = new URL(baseUrl, globalThis.location?.href || 'http://localhost/');
  const name = String(template || '').trim();
  if (name.startsWith('def/')) {
    const url = new URL(base);
    url.searchParams.set('snippet', '1');
    url.searchParams.set('publish', '1');
    url.searchParams.set('debug', '0');
    url.searchParams.set('q', `ids:${recordId}`);
    url.searchParams.set('db', String(database));
    url.searchParams.set('template', name);
    return url;
  }
  const file = /\.tpl$/i.test(name) ? name : `${name}.tpl`;
  const url = new URL(`api/${encodeURIComponent(String(database))}/reports/${encodeURIComponent(file)}/render`, base);
  url.searchParams.set('rec', String(recordId));
  return url;
}
