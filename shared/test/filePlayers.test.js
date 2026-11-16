/**
 * @file filePlayers.test.js
 * @brief Players of registered files (plan 34): the client builders (buildCmsMedia of the CMS, mediaTag of the text
 *        editor) choose the element and the URL kind of fixtures/file-players.json, as the server player
 *        (heurist srv/Files/FilePlayerHtml, tests/FilePlayerHtmlTest.php).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFileUrl } from '../src/data/fileUrls.js';
import { buildCmsMedia } from '../src/site/cmsMedia.js';
import { mediaTag } from '../src/widgets/rich-text/mediaTag.js';
import { fileMediaUrls } from '../src/recordview/fileMediaItem.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/file-players.json', import.meta.url), 'utf8'));
const { database, baseUrl } = fixture;

/** The first media element of the HTML and the kind of its URL (asset, web, thumbnail, external). */
function classifyPlayer(html) {
  const element = /<(iframe|video|audio|img|embed|a)\b/i.exec(html)?.[1]?.toLowerCase() || '';
  const src = /\b(?:src|href)="([^"]*)"/i.exec(html)?.[1]?.replace(/&amp;/g, '&') || '';
  const parsed = parseFileUrl(src, { database, baseUrl });
  return { element, url: parsed ? parsed.kind : (src ? 'external' : '') };
}

for (const item of fixture.cases) {
  test(`players: ${item.name}`, () => {
    const cms = buildCmsMedia(item.file, {}, { urls: fileMediaUrls(baseUrl, database) });
    assert.deepEqual(classifyPlayer(cms), item.expect, `buildCmsMedia: ${cms}`);
    const tag = mediaTag(item.file, { database });
    assert.deepEqual(classifyPlayer(tag), item.expect, `mediaTag: ${tag}`);
  });
}
