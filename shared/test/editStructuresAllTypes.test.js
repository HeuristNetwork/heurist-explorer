/**
 * The record edit form of every record type of a real database (plan 21 §6a):
 * fixture `fixtures/editStructures.json` (scripts/editStructureFixture.mjs, from
 * osmak_mapping). For each record type: the edit structure is built, the form is
 * rendered with one value in every field, and the values come back unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
// HCardinalLayout (tabs of big forms) checks content with `instanceof Node`
globalThis.Node ??= globalThis.HTMLElement;
const { HDbDefs } = await import('../src/data/HDbDefs.js');
const { buildEditStructure, structureFields, POINTER_MODES } = await import('../src/data/recordEditStructure.js');
const { HEditForm } = await import('../src/widgets/edit-form/HEditForm.js');

const fixture = JSON.parse(await readFile(new URL('./fixtures/editStructures.json', import.meta.url), 'utf8'));
const dbdefs = new HDbDefs(fixture.snapshot);
const rowsOf = (rty) => fixture.structures[rty].map((row) => Object.fromEntries(fixture.columns.map((column, index) => [column, row[index]])));
const rectypeIds = Object.keys(fixture.structures).map(Number);
const apiClient = { get: async () => ({ records: [] }), post: async () => ({ records: [] }), request: async () => ({}) };

/**
 * Field types whose value is set and read back; the others (geo, file, date...) are
 * rendered empty. Dates: the calendar needs a real DOM - covered by temporalValues.test.js.
 */
const VALUE_TYPES = new Set(['freetext', 'blocktext', 'integer', 'year', 'float', 'enum', 'relationtype', 'resource', 'url', 'boolean']);

/** One test value of a field (null: none for this type / vocabulary). */
function testValue(field) {
  switch (field.type) {
    case 'freetext': case 'blocktext': return `Test ${field.dty}`;
    case 'integer': case 'year': return 5;
    case 'float': return 1.5;
    case 'url': return 'https://example.org/test';
    case 'boolean': return 'true';
    case 'resource': return 42;
    case 'enum': case 'relationtype': {
      const tree = field.vocabulary ? dbdefs.termTree?.(field.vocabulary) : null;
      const first = tree?.children?.[0]?.id ?? null;
      return first ? Number(first) : null;
    }
    default: return null;
  }
}

/**
 * Date fields as text inputs: the calendar (flatpickr) of HInputDate does not run in the
 * fake DOM. Dates are covered by temporalValues.test.js and the browser check list.
 */
function withoutCalendars(structure) {
  return {
    ...structure,
    groups: structure.groups.map((group) => ({
      ...group,
      children: group.children.map((field) => (field.type === 'date' ? { ...field, type: 'freetext' } : field))
    }))
  };
}

/** The value of a state as a comparable string. */
function comparable(value) {
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value == null ? null : String(value);
}

test('the fixture has every record type of the database', () => {
  assert.ok(rectypeIds.length > 50, `${rectypeIds.length} record types`);
  assert.equal(rectypeIds.length, Object.keys(fixture.snapshot.rectypes).length);
});

test('edit structure of every record type: known field types, base-field pointer types, a pointer mode', () => {
  const known = new Set(['freetext', 'blocktext', 'integer', 'year', 'float', 'date', 'enum', 'relationtype', 'resource',
    'relmarker', 'file', 'geo', 'url', 'urlinclude', 'boolean', 'calculated', 'fieldsetmarker']);
  for (const rty of rectypeIds) {
    const structure = buildEditStructure(rowsOf(rty), { rty, dbdefs });
    for (const field of structureFields(structure)) {
      assert.ok(known.has(field.type), `#${rty} field ${field.dty}: type ${field.type}`);
      if (field.type === 'resource') {
        assert.ok(POINTER_MODES.includes(field.pointerMode), `#${rty} field ${field.dty}: pointer mode ${field.pointerMode}`);
        for (const target of field.targetTypes) assert.ok(fixture.snapshot.rectypes[target], `#${rty} field ${field.dty}: target ${target}`);
      }
    }
  }
});

test('the edit form of every record type renders, and its values come back unchanged', async () => {
  let checkedFields = 0;
  for (const rty of rectypeIds) {
    const structure = withoutCalendars(buildEditStructure(rowsOf(rty), { rty, dbdefs }));
    const fields = structureFields(structure);
    const states = new Map();
    const expected = new Map();
    for (const field of fields) {
      if (!VALUE_TYPES.has(field.type)) continue;
      const value = testValue(field);
      if (value == null) continue;
      states.set(String(field.dty), { values: [{ value, hidden: false }], translations: [] });
      expected.set(String(field.dty), { type: field.type, value });
    }
    const host = document.createElement('div');
    document.body.append(host);
    const form = new HEditForm().attach(host, {
      form: { localized: true, groups: structure.groups },
      states,
      allowHidden: true,
      apiClient,
      dbdefs,
      browseRecords: async () => null,
      addRecord: async () => ({ saved: false })
    }).render();
    const back = new Map(form.getStates());
    for (const [name, { type, value }] of expected) {
      const values = back.get(name)?.values || [];
      const actual = comparable(values[0]?.value);
      const sent = comparable(value);
      assert.ok(actual === sent, `#${rty} field ${name} (${type}): sent ${sent}, back ${actual}`);
      checkedFields++;
    }
    await form.destroy();
    host.remove?.();
  }
  assert.ok(checkedFields > 300, `${checkedFields} field values checked`);
});
