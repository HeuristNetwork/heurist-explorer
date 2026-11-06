/**
 * @file reportRenderUrl.js
 * @brief URL that renders one record with a Smarty report template.
 *
 * A report record: `/api/{db}/report/{id}/execute?recordId=N` (plan 30). Templates of the legacy
 * default folder (`def/...`) and template names stored in older configurations use the legacy
 * `?template=..&q=ids:N` URL: the API takes record ids only.
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
  if (/^\d+$/.test(name)) {
    const url = new URL(`api/${encodeURIComponent(String(database))}/report/${name}/execute`, base);
    url.searchParams.set('recordId', String(recordId));
    return url;
  }
  // a built-in template, or the name stored in an older configuration: the legacy renderer knows names
  const url = new URL(base);
  url.searchParams.set('snippet', '1');
  url.searchParams.set('publish', '1');
  url.searchParams.set('debug', '0');
  url.searchParams.set('q', `ids:${recordId}`);
  url.searchParams.set('db', String(database));
  url.searchParams.set('template', name);
  return url;
}
