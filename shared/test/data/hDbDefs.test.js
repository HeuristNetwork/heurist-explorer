import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HDbDefs } from '../../src/data/HDbDefs.js';

// Minimal fixture with the exact /api/{db}/def/snapshot shape.
const SNAPSHOT = JSON.parse(
  readFileSync(new URL('../fixtures/snapshot.json', import.meta.url), 'utf8')
);

const defs = () => new HDbDefs(SNAPSHOT);

test('constructor rejects a payload without meta', () => {
  assert.throws(() => new HDbDefs({}), TypeError);
  assert.throws(() => new HDbDefs(null), TypeError);
});

test('constructor accepts a {data:{...}} envelope', () => {
  const wrapped = new HDbDefs({ data: SNAPSHOT });
  assert.equal(wrapped.dbId(), Number(SNAPSHOT.meta.dbId) || 0);
});

test('load() fetches, honours lang, and parses', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => SNAPSHOT };
  };
  const loaded = await HDbDefs.load('http://h.test/api/db/def/snapshot', { lang: 'fre', fetchFn });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /[?&]lang=fre\b/);
  assert.equal(loaded.version(), String(SNAPSHOT.meta.version));
});

test('load() throws on a non-ok response', async () => {
  const fetchFn = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(HDbDefs.load('http://h.test/x', { fetchFn }), /request failed \(404\)/);
});

test('meta accessors', () => {
  const d = defs();
  assert.equal(d.dbId(), 0); // osmak_mapping is unregistered in the fixture
  assert.equal(d.version(), '1789037284');
  assert.equal(d.language(), 'eng');
  assert.equal(d.dbconst('RT_RELATION'), 1);
  assert.equal(d.dbconst('DT_TARGET_RESOURCE'), 5);
  assert.equal(d.dbconst('NOT_A_CONST'), null);
});

test('rectype() / rectypeName()', () => {
  const d = defs();
  const rt = d.rectype(1);
  assert.equal(rt.name, 'Record relationship');
  assert.equal(rt.plural, 'Record relationships');
  assert.equal(rt.concept, '2-1');
  assert.equal(rt.showInLists, true);
  assert.equal(d.rectype(999999), null);
  assert.equal(d.rectypeName(10), 'Person');
  assert.equal(d.rectypeName(3, { plural: true }), 'Notes');
  assert.equal(d.rectypeName(999999), '');
});

test('rectypes() is group-ordered then name-ordered', () => {
  const d = defs();
  const list = d.rectypes();
  assert.equal(list.length, Object.keys(SNAPSHOT.rectypes).length);
  const groups = d.rectypeGroups();
  const groupRank = new Map(groups.map((g, i) => [g.id, i]));
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1];
    const cur = list[i];
    const pr = groupRank.get(prev.group) ?? Infinity;
    const cr = groupRank.get(cur.group) ?? Infinity;
    assert.ok(pr < cr || (pr === cr && prev.name.localeCompare(cur.name) <= 0),
      `out of order at ${i}: ${prev.name} then ${cur.name}`);
  }
});

test('rectypeIdByName(): exact, plural, partial, ambiguous, miss', () => {
  const d = defs();
  assert.equal(d.rectypeIdByName('Person'), 10);
  assert.equal(d.rectypeIdByName('  notes '), 3); // case + whitespace insensitive
  assert.equal(d.rectypeIdByName('Organisation'), 4);
  assert.equal(d.rectypeIdByName('no such rectype here'), null);
  const ambiguous = d.rectypeIdByName('record');
  assert.ok(Array.isArray(ambiguous) && ambiguous.length > 1);
});

test('fields() merges structure, excludes forbidden and separators, order-sorts', () => {
  const d = defs();
  const fields = d.fields(1);
  const ids = fields.map((f) => f.id);
  assert.deepEqual(ids.slice(0, 3), [7, 6, 5]); // structure order 1,2,3
  for (let i = 1; i < fields.length; i++) {
    assert.ok(fields[i - 1].order <= fields[i].order);
  }
  assert.ok(fields.every((f) => f.req !== 'forbidden'));
  assert.ok(fields.every((f) => SNAPSHOT.fields[f.id]));

  // dty 16 is forbidden on rectype 2 in the fixture
  assert.ok(!d.fields(2).some((f) => f.id === 16));
});

test('field() uses rst_DisplayName and adds vocabulary / targetTypes', () => {
  const d = defs();
  const src = d.field(1, 7);
  assert.equal(src.name, 'Source record'); // rst_DisplayName, not dty_Name
  assert.equal(src.type, 'resource');
  assert.equal(src.req, 'required');

  const honorific = d.field(10, 19);
  assert.equal(honorific.type, 'enum');
  assert.equal(honorific.vocabulary, 507);

  assert.equal(d.field(2, 16), null); // forbidden
  assert.equal(d.field(1, 999999), null);
});

test('fieldGlobal() ignores rectype context', () => {
  const d = defs();
  const g = d.fieldGlobal(19);
  assert.equal(g.name, 'Honorific');
  assert.equal(g.type, 'enum');
  assert.equal(g.vocabulary, 507);
  assert.equal(g.concept, '2-19');
  assert.equal(d.fieldGlobal(999999), null);
});

test('fieldIdByName() is scoped to the given rectypes', () => {
  const d = defs();
  assert.equal(d.fieldIdByName(1, 'Source record'), 7); // rst_DisplayName
  assert.equal(d.fieldIdByName([1], 'Relationship type'), 6);
  assert.equal(d.fieldIdByName(1, 'Honorific'), null); // not on rectype 1
});

test('fieldName() / fieldType()', () => {
  const d = defs();
  assert.equal(d.fieldName(1, 7), 'Source record');
  assert.equal(d.fieldName(999999, 7), 'Source record pointer INTERNAL USE ONLY'); // falls back to global
  assert.equal(d.fieldType(1, 7), 'resource');
  assert.equal(d.fieldType(10, 19), 'enum');
});

test('vocabRoot()', () => {
  const d = defs();
  assert.equal(d.vocabRoot(19), 507);
  assert.equal(d.vocabRoot(1), 0); // freetext, no vocabulary
});

test('term() / termLabel()', () => {
  const d = defs();
  const t = d.term(460);
  assert.equal(t.label, 'English (EN, ENG)');
  assert.equal(t.code, 'ENG');
  assert.equal(t.concept, '2-460');
  assert.equal(d.termLabel(460), 'English (EN, ENG)');
  assert.equal(d.term(999999), null);
});

test('termChildren() / termTree() / termDescendants()', () => {
  const d = defs();
  const kids = d.termChildren(496);
  assert.ok(kids.includes(460) && kids.includes(461));

  const tree = d.termTree(496);
  assert.equal(tree.id, 496);
  assert.ok(Array.isArray(tree.children));
  assert.ok(tree.children.some((n) => n.id === 460));

  const flat = d.termTree(496, { flat: true });
  assert.ok(flat.some((n) => n.id === 460));

  const desc = d.termDescendants([496]);
  assert.ok(desc.includes(496) && desc.includes(460));
  assert.equal(new Set(desc).size, desc.length); // deduplicated
});

test('termIdByLabel(): label, code, dotted path, miss', () => {
  const d = defs();
  assert.equal(d.termIdByLabel(496, 'English (EN, ENG)'), 460);
  assert.equal(d.termIdByLabel(496, 'eng'), 460); // by code, case-insensitive
  assert.equal(d.termIdByLabel(496, 'Klingon'), null);
});

test('link graph: linkedRectypes() and pointerFieldsBetween() agree with the fixture', () => {
  const d = defs();

  // recompute the expected "to" set for rectype 2 straight from the snapshot
  const expected = new Set();
  for (const row of SNAPSHOT.structure) {
    if (row.rty !== 2 || row.req === 'forbidden') continue;
    const f = SNAPSHOT.fields[row.dty];
    if (!f || f.type !== 'resource') continue;
    for (const t of f.targetTypes || []) expected.add(t);
  }
  assert.ok(expected.size > 0, 'fixture sanity: rectype 2 points somewhere');
  assert.deepEqual(d.linkedRectypes(2, { direction: 'to' }), [...expected].sort((a, b) => a - b));

  // every "to" edge has a reverse "from" edge and at least one pointer field
  for (const target of expected) {
    assert.ok(d.linkedRectypes(target, { direction: 'from' }).includes(2));
    assert.ok(d.pointerFieldsBetween(2, target).length >= 1);
  }

  // relation vs plain resource are separate channels
  assert.deepEqual(d.linkedRectypes(1, { direction: 'to', relation: true }), []);
});

test('concept codes: localId() / conceptId() round-trip', () => {
  const d = defs();
  assert.equal(d.localId('rty', '2-1'), 1);
  assert.equal(d.localId('trm', '2-460'), 460);
  assert.equal(d.conceptId('rty', 1), '2-1');
  assert.equal(d.localId('rty', 'nonsense'), 0);

  // a purely local entity has a "<dbId>-<localId>" concept; dbId is 0 here
  const localRt = Object.entries(SNAPSHOT.rectypes).find(([, r]) => r.concept?.startsWith('0-'));
  if (localRt) {
    const [id, r] = localRt;
    assert.equal(d.localId('rty', r.concept), Number(id));
    assert.equal(d.conceptId('rty', Number(id)), r.concept);
  }
});
