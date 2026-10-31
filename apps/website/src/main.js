/**
 * @file main.js
 * @brief Entry point of the website runtime: loaded by every v4 website page (plan 27a).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import '#shared/ui/heurist-ui.css';
import './style.css';
import { initLocale } from '#shared/ui';
import { designerHost, designerUrl, designHooks, isFramed, readSiteConfig, startSite } from './siteRuntime.js';

const config = readSiteConfig();
// the preview of the CMS designer (plan 27c §6): opened on its own (not in an iframe) it opens the designer
// in Explorer; in an iframe it does not leave (a designer of another origin can not reach it: a plain preview)
const designer = config?.runtime?.design ? designerHost(window) : null;
if (config?.runtime?.design && !designer && !isFramed(window)) {
  window.location.replace(designerUrl(config.runtime));
} else if (config) {
  initLocale(config.runtime?.language || 'eng', moduleBaseUrl())
    .catch((error) => console.warn('Unable to load heurist-website localization', error))
    .then(() => startSite({ root: document.body, config }))
    .then((mounted) => designer?.previewReady?.(window, designHooks({ config, mounted })))
    .catch((error) => console.error('Unable to start the website page', error));
}

/** Assets beside the deployed bundle, not beside the page. */
function moduleBaseUrl() {
  return import.meta.env.DEV
    ? new URL(import.meta.env.BASE_URL, window.location.href).href
    : new URL('./', import.meta.url).href;
}
