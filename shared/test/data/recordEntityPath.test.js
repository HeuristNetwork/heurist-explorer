/**
 * @file recordEntityPath.test.js
 * @brief A record of an entity is read and written at the URL of its entity (plan 28a); other
 *        records in the same editor stay on /records.
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordEditClient } from '../../src/data/RecordEditClient.js';
import { RECORD_ENTITIES, recordEntityPath, recordTypesDomain } from '../../src/data/recordDomains.js';

const CODES = { RT_CMS_HOME: 51, RT_CMS_PAGE: 52, RT_REPORT_TEMPLATE: 60, RT_REPORT_OUTPUT: 61 };
const dbdefs = { dbconst: (code) => CODES[code] };

/** Client that records the path of each call. */
function recordingClient(options = {}) {
  const paths = [];
  const api = {
    request: async (path, request) => {
      paths.push(`${request?.method || 'GET'} ${path}`);
      return { records: [{ rec_ID: '5' }], meta: {} };
    }
  };
  return { client: new RecordEditClient({ apiClient: api, ...options }), paths };
}

test('recordEntityPath: the entity of a record type, nothing for other types', () => {
  assert.equal(recordEntityPath(dbdefs, 51), '/website');
  assert.equal(recordEntityPath(dbdefs, '61'), '/output');
  assert.equal(recordEntityPath(dbdefs, 10), null);
  assert.equal(recordEntityPath(dbdefs, 0), null);
  assert.equal(recordEntityPath(null, 51), null);
  assert.equal(Object.keys(RECORD_ENTITIES).length, 4);
});

test('RecordEditClient: entity records use their URL, relationship records and unknown types stay on /records', async () => {
  const { client, paths } = recordingClient({ entityPath: (type) => recordEntityPath(dbdefs, type) });
  await client.load(5, { recordType: 60 });
  await client.insert({ rec_ID: '0', rec_RecTypeID: '61' });
  await client.update({ rec_ID: '5', rec_RecTypeID: 51, rec_Modified: 'x' });
  await client.duplicate(5, { recordType: 52 });
  await client.validate({ rec_ID: '5', rec_RecTypeID: 60 });
  // the editor of a website also writes its relationship records and steps through other records
  await client.insert({ rec_ID: '0', rec_RecTypeID: 1 });
  await client.load(7);
  await client.remove(8);
  assert.deepEqual(paths, [
    'GET /report/5',
    'POST /output/0',
    'PUT /website/5',
    'POST /page/5/duplicate',
    'POST /report/5/validate',
    'POST /records/0',
    'GET /records/7',
    'DELETE /records/8'
  ]);
});

test('RecordEditClient: another domain ignores entityPath; a /sys client is on its entity', async () => {
  const files = recordingClient({ domain: 'files', entityPath: () => '/website' });
  await files.client.load(5, { recordType: 51 });
  const tags = recordingClient({ domain: 'sys', type: 'tag' });
  await tags.client.load(5);
  assert.deepEqual([...files.paths, ...tags.paths], ['GET /files/5', 'GET /tag/5']);
});

test('recordTypesDomain: a list of entity types is one /records search', () => {
  assert.equal(recordTypesDomain(dbdefs, [51, 52]).path, '/records');
});
