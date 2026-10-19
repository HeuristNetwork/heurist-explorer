/**
 * @file editStructureFixture.mjs
 * @brief Writes the test fixture of the record edit forms of every record type
 *        (plan 21 §6a): the `/rst` rows of each record type (EDIT_STRUCTURE_DETAILS,
 *        as arrays of `columns`) and a small definitions snapshot (record types,
 *        fields, the constants, and of each vocabulary only its root and first terms;
 *        no structure list).
 *
 * Usage (local Heurist API):
 *   node scripts/editStructureFixture.mjs [--api=http://127.0.0.1/api] [--db=osmak_mapping]
 * Output: shared/test/fixtures/editStructures.json
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

import { writeFile } from 'node:fs/promises';
import { EDIT_STRUCTURE_DETAILS } from '../shared/src/data/recordEditStructure.js';

/** Terms kept below each vocabulary root. */
const TERMS_PER_VOCABULARY = 3;

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
const api = (args.api || 'http://127.0.0.1/api').replace(/\/$/, '');
const db = args.db || 'osmak_mapping';

/** GET a JSON resource of the API. */
async function get(path) {
  const response = await fetch(`${api}/${db}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const snapshot = await get('/def/snapshot');
const structures = {};
for (const rty of Object.keys(snapshot.rectypes)) {
  const payload = await get(`/rst/${rty}?details=${encodeURIComponent(EDIT_STRUCTURE_DETAILS)}`);
  structures[rty] = (payload.items || []).map(compactRow);
}

// vocabularies of the enum / relation type fields, and a few terms of each
const roots = new Set();
for (const rows of Object.values(structures)) {
  for (const row of rows) {
    const root = Number(String(row.dty_JsonTermIDTree ?? '').match(/\d+/)?.[0]);
    if (root > 0) roots.add(root);
  }
}
const keep = new Set(roots);
const links = [];
for (const root of roots) {
  const children = snapshot.termlinks.filter((link) => Number(link.parent) === root).slice(0, TERMS_PER_VOCABULARY);
  for (const link of children) {
    keep.add(Number(link.term));
    links.push(link);
  }
}
const terms = Object.fromEntries(Object.entries(snapshot.terms).filter(([id]) => keep.has(Number(id))));

const columns = EDIT_STRUCTURE_DETAILS.split(',');
const fixture = {
  source: `${db} ${snapshot.meta?.generated || ''}`.trim(),
  snapshot: { ...snapshot, structure: [], terms, termlinks: links },
  columns,
  structures: Object.fromEntries(Object.entries(structures)
    .map(([rty, rows]) => [rty, rows.map((row) => columns.map((column) => row[column] ?? null))]))
};
const target = new URL('../shared/test/fixtures/editStructures.json', import.meta.url);
await writeFile(target, `${JSON.stringify(fixture)}\n`);
console.log(`${Object.keys(structures).length} record types, ${Object.keys(terms).length} terms -> ${target.pathname}`);

/**
 * A structure row for a smaller fixture: no empty columns, no help text, dty_Name only
 * without a display name, long names cut.
 */
function compactRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'rst_ID' || key === 'rst_DisplayHelpText' || value == null || value === '') continue;
    if (key === 'dty_Name' && row.rst_DisplayName) continue;
    out[key] = typeof value === 'string' && value.length > 40 && /Name/.test(key) ? `${value.slice(0, 40)}…` : value;
  }
  return out;
}
