/**
 * @file localizationAssets.test.js
 * @brief Tests localization asset completeness of heurist-reports.
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseLocale } from '#shared/ui';

const assets = fileURLToPath(new URL('../../public/assets/localization/', import.meta.url));
const appSource = fileURLToPath(new URL('../../src/', import.meta.url));
const sharedSource = fileURLToPath(new URL('../../../../shared/src/', import.meta.url));

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceFiles(filename)));
    else if (entry.name.endsWith('.js')) result.push(filename);
  }
  return result;
}

test('English and French dictionaries contain the same non-empty resources', async () => {
  const [english, french] = await Promise.all([
    readFile(`${assets}localization_eng.txt`, 'utf8').then(parseLocale),
    readFile(`${assets}localization_fre.txt`, 'utf8').then(parseLocale)
  ]);
  assert.deepEqual(Object.keys(french).sort(), Object.keys(english).sort());
  assert.equal(Object.values(english).every(Boolean), true);
  assert.equal(Object.values(french).every(Boolean), true);
});

test('every direct $HR string of the reports app and the shared widgets it uses is in the dictionary', async () => {
  const english = parseLocale(await readFile(`${assets}localization_eng.txt`, 'utf8'));
  const files = [
    ...(await sourceFiles(appSource)),
    `${sharedSource}widgets/job/HJobMonitor.js`,
    `${sharedSource}utils/ownerSections.js`
  ];
  const keys = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    keys.push(...[...source.matchAll(/\$HR\(\s*'([^']+)'/g)].map((match) => match[1]));
  }
  assert.deepEqual([...new Set(keys.filter((key) => !(key in english)))], []);
});
