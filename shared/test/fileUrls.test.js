/**
 * @file fileUrls.test.js
 * @brief File URLs on the file endpoints (plan 34): the cases of fixtures/file-urls.json (also run by heurist
 *        tests/FileUrlsTest.php), fileUrl and parseFileUrl.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileUrl, parseFileUrl, resolveFileUrl, resolveFileUrls, upgradeFileUrls } from '../src/data/fileUrls.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/file-urls.json', import.meta.url), 'utf8'));
const options = { database: fixture.database, baseUrl: fixture.baseUrl };

for (const item of fixture.cases) {
  test(`file URLs: ${item.name}`, () => {
    assert.equal(upgradeFileUrls(item.input, options), item.upgraded, 'upgraded');
    assert.equal(resolveFileUrls(item.input, options), item.resolved, 'resolved');
  });
}

test('fileUrl: the relative form of each kind', () => {
  assert.equal(fileUrl('ab12', 'web', { database: 'db1' }), './api/db1/files/ab12/web');
  assert.equal(fileUrl('ab12', 'thumbnail', { database: 'db1' }), './api/db1/files/ab12/thumbnail');
  assert.equal(fileUrl('ab12', 'download', { database: 'db1' }), './api/db1/files/ab12/asset?download=1');
  assert.equal(fileUrl('ab12', 'wrong', { database: 'db1' }), './api/db1/files/ab12/asset');
  assert.equal(fileUrl('', 'web', { database: 'db1' }), '');
  assert.equal(resolveFileUrl('./api/db1/files/ab12/web', { baseUrl: 'http://h/heurist' }), 'http://h/heurist/api/db1/files/ab12/web');
  assert.equal(resolveFileUrl('https://x.org/a.png', { baseUrl: 'http://h/heurist/' }), 'https://x.org/a.png');
});

test('parseFileUrl: key and kind of every form', () => {
  const parse = (url) => parseFileUrl(url, options);
  const db1 = { database: 'db1' };
  assert.deepEqual(parse('./api/db1/files/ab12/web'), { key: 'ab12', kind: 'web', ...db1 });
  assert.deepEqual(parse('http://h/heurist/api/db1/files/ab12/asset'), { key: 'ab12', kind: 'asset', ...db1 });
  assert.deepEqual(parse('./api/db1/files/ab12/asset?download=1'), { key: 'ab12', kind: 'download', ...db1 });
  assert.deepEqual(parse('http://h/heurist/?db=db1&file=ab12&fullres=1'), { key: 'ab12', kind: 'asset', ...db1 });
  assert.deepEqual(parse('./?db=db1&amp;file=ab12'), { key: 'ab12', kind: 'web', ...db1 });
  assert.equal(parse('./api/other/files/ab12/web'), null);
  assert.equal(parse('https://x.org/a.png'), null);
});

test('without a database: every database of this installation (the text editor)', () => {
  const html = '<img src="./?db=other&amp;file=ab12"><img src="https://x.org/?db=other&amp;file=ab12">';
  assert.equal(upgradeFileUrls(html, { baseUrl: 'http://h/heurist/' }),
    '<img src="./api/other/files/ab12/web"><img src="https://x.org/?db=other&amp;file=ab12">');
  assert.equal(resolveFileUrls('<img src="./api/other/files/ab12/web">', { baseUrl: 'http://h/heurist/' }),
    '<img src="http://h/heurist/api/other/files/ab12/web">');
});
