/**
 * @file recordListBars.test.js
 * @brief HRecordList: the toolbar and the footer are hidden when none of their controls is shown (2026-10-31).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const list = await readFile(new URL('../src/widgets/record-list/HRecordList.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/widgets/record-list/HRecordList.css', import.meta.url), 'utf8');

test('toolbar and footer without a shown control are marked empty and hidden', () => {
  assert.match(list, /const shown = \(element\) => !element\.hidden && !element\.classList\.contains\("h-recordlist-hidden"\);/);
  assert.match(list, /bar\.classList\.toggle\("is-empty", !\[\.\.\.bar\.children\]\.some\(shown\)\)/);
  // again after the controls, the pagination and the source actions change
  assert.ok((list.match(/this\._syncBars\(\);/g) || []).length >= 4);
  assert.match(css, /\.h-recordlist-toolbar\.is-empty,\.h-recordlist-footer\.is-empty \{ display:none !important; \}/);
});
