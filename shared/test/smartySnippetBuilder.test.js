import test from 'node:test';
import assert from 'node:assert/strict';
import {
  segmentsFromPath, buildFieldSnippet, buildGroupedSnippet, buildWrapExpression,
  headerSmartyName, branchKey, escapeSmartyText
} from '../src/smarty/smartySnippetBuilder.js';

// fields 99 (text) and 77 (pointer) of record type 10 are repeatable
const context = {
  rootRectypeId: '10',
  isRepeatable: (rty, dty) => rty === '10' && (dty === '99' || dty === '77'),
  rectypeName: (id) => ({ 10: 'Person', 12: 'Place' }[id] || '')
};
const snippet = (path, options = {}, label = 'Name') =>
  buildFieldSnippet({ segments: segmentsFromPath(path), label }, options, context);

test('segmentsFromPath converts field tree paths to the legacy segments', () => {
  assert.deepEqual(segmentsFromPath([{ dty: 1, fieldType: 'freetext' }]), [{ kind: 'field', fieldId: '1', type: 'freetext' }]);
  assert.deepEqual(segmentsFromPath([{ dty: 20, fieldType: 'enum', term: 'code' }]), [{ kind: 'term', fieldId: '20', subfield: 'code', type: 'enum' }]);
  assert.deepEqual(segmentsFromPath([{ dty: 'title', fieldType: 'freetext' }]), [{ kind: 'header', headerKey: 'rec_Title', type: 'freetext' }]);
  assert.deepEqual(segmentsFromPath([{ via: { link: 'lt', dty: 77, targetRty: 12 } }, { dty: 1 }]).map((seg) => seg.kind), ['resource', 'field']);
  assert.deepEqual(segmentsFromPath([{ via: { link: 'lf', dty: 5, targetRty: 30 } }, { dty: 1 }])[0], { kind: 'linked_from', fieldId: '5', sourceRectypeId: '30' });
  assert.equal(segmentsFromPath([{ dty: 'anyfield', fieldType: 'freetext' }]), null);
  assert.equal(segmentsFromPath([]), null);
});

test('a single field with caption and line break (legacy defaults)', () => {
  assert.equal(snippet([{ dty: 1, fieldType: 'freetext' }]), '<br> Name: {$r.f1}\n');
});

test('a repeatable field gets a value loop with commas', () => {
  assert.equal(snippet([{ dty: 99, fieldType: 'freetext' }], { insLineBreak: false }), [
    '{foreach $r.f99s as $f99 name=valueloop}',
    '    {if $smarty.foreach.valueloop.first} Name: {/if}',
    '        {$f99}',
    '        {if !$smarty.foreach.valueloop.last}, {/if}',
    '{/foreach}',
    ''
  ].join('\n'));
});

test('"Test if value exists" wraps the value in {if}', () => {
  assert.equal(snippet([{ dty: 20, fieldType: 'enum', term: 'label' }], { ifnull: true }), [
    '<br>',
    '{if $r.f20.label}',
    '    Name: {$r.f20.label}',
    '{/if}',
    ''
  ].join('\n'));
});

test('a field of a pointed record: loop over a repeatable pointer and getRecord', () => {
  assert.equal(snippet([{ via: { link: 'lt', dty: 77, targetRty: 12 } }, { dty: 1, fieldType: 'freetext' }],
    { addCaption: false, insLineBreak: false, addRemark: true }), [
    '{foreach $r.f77s as $f77 name=valueloop} {* Place *}',
    '    {$f77=$heurist->getRecord($f77)} {* get record by record id *}',
    '    {$f77.f1} {* Name *}',
    '{/foreach}',
    ''
  ].join('\n'));
});

test('records pointing to this one use getLinkedFromRecords', () => {
  const text = snippet([{ via: { link: 'lf', dty: 5, targetRty: 30 } }, { dty: 'title' }], { addCaption: false, insLineBreak: false });
  assert.equal(text, [
    '{$lf_t30_f5s = $heurist->getLinkedFromRecords($r, 30, 5)}',
    '{foreach $lf_t30_f5s as $lf_t30_f5 name=valueloop}',
    '    {$lf_t30_f5=$heurist->getRecord($lf_t30_f5)}',
    '    {$lf_t30_f5.recTitle}',
    '{/foreach}',
    ''
  ].join('\n'));
});

test('related records are filtered by record type', () => {
  const text = snippet([{ via: { link: 'r', dty: 235, targetRty: 12 } }, { dty: 'title' }], { insLineBreak: false });
  assert.equal(text, [
    '{$rel_t12_f235s = $heurist->getRelatedRecords($r)}',
    '{foreach $rel_t12_f235s as $rel_t12_f235 name=valueloop}',
    '    {if $rel_t12_f235.recTypeID==12}',
    '        Name: {$rel_t12_f235.recTitle}',
    '    {/if}',
    '{/foreach}',
    ''
  ].join('\n'));
});

test('files are always wrapped; wrapper option for dates and URLs', () => {
  assert.equal(snippet([{ dty: 30, fieldType: 'file' }], { insLineBreak: false, addCaption: false }),
    '{wrap var=$r.f30_originalvalue dt="file" width="300" height="auto" auto_play="0" show_artwork="0"}\n');
  assert.equal(snippet([{ dty: 9, fieldType: 'date' }], { insLineBreak: false, addCaption: false, addWrap: true }),
    '{wrap var=$r.f9_originalvalue dt="date" mode="0" calendar="native"}\n');
  assert.equal(snippet([{ dty: 'url', fieldType: 'freetext' }], { insLineBreak: false, addCaption: false, addWrap: true }),
    '{wrap var=$r.recURL dt="url"}\n');
  assert.equal(buildWrapExpression({ kind: 'field', type: 'geo' }, '$f5', true), '{wrap var=$f5 dt="geo"}');
});

test('fields sharing a pointer share one loop ("Insert all")', () => {
  const items = [
    { segments: segmentsFromPath([{ via: { link: 'lt', dty: 77, targetRty: 12 } }, { dty: 1 }]), label: 'A' },
    { segments: segmentsFromPath([{ via: { link: 'lt', dty: 77, targetRty: 12 } }, { dty: 2 }]), label: 'B' },
    { segments: segmentsFromPath([{ dty: 3 }]), label: 'C' }
  ];
  assert.equal(branchKey(items[0]), 'lt77:12');
  assert.equal(buildGroupedSnippet(items, { insLineBreak: false }, context), [
    '{foreach $r.f77s as $f77 name=valueloop}',
    '    {$f77=$heurist->getRecord($f77)}',
    '    A: {$f77.f1}',
    '    B: {$f77.f2}',
    '{/foreach}',
    '',
    'C: {$r.f3}',
    ''
  ].join('\n'));
});

test('header names and escaping', () => {
  assert.equal(headerSmartyName('rec_Title'), 'recTitle');
  assert.equal(headerSmartyName('rec_AddedByUGrpID'), 'recAddedByUGrpID');
  assert.equal(headerSmartyName('rec_NonOwnerVisibility'), 'recNonOwnerVisibility');
  assert.equal(escapeSmartyText('a {b}'), 'a &#123;b&#125;');
  assert.equal(snippet([{ dty: 1 }], { insLineBreak: false }, 'Size {cm}'), 'Size &#123;cm&#125;: {$r.f1}\n');
});

test('enum outputs of one field share the field (legacy Term, Code, Concept ID ...)', () => {
  const items = ['term', 'code', 'conceptid', 'desc', 'internalid'].map((term, index) => ({
    segments: segmentsFromPath([{ dty: 20, fieldType: 'enum', term }]),
    label: ['Term', 'Code', 'Concept ID', 'Description', 'Internal ID'][index]
  }));
  assert.equal(buildGroupedSnippet(items, {}, context), [
    '<br> Term: {$r.f20.term}',
    '<br> Code: {$r.f20.code}',
    '<br> Concept ID: {$r.f20.conceptid}',
    '<br> Description: {$r.f20.desc}',
    '<br> Internal ID: {$r.f20.internalid}',
    ''
  ].join('\n'));
});

test('relationships of $r: one loop over $r.Relationships (legacy _buildGroupedRelationshipSnippet)', () => {
  const type = { segments: segmentsFromPath([{ dty: 'recRelationType', fieldType: 'relationship', relationship: true }]), label: 'Relation Type' };
  const note = { segments: segmentsFromPath([{ dty: 3, fieldType: 'blocktext', relationship: true }]), label: 'Relation Note' };
  assert.deepEqual(type.segments, [{ kind: 'relationship', propName: 'recRelationType' }]);
  assert.deepEqual(note.segments, [{ kind: 'relationship', fieldId: '3' }]);
  assert.equal(branchKey(type), 'Relationship');
  const init = '{if !isset($r.Relationships)}\n{$r.Relationships = $heurist->getRelatedRecords($r)}\n{/if}\n';
  assert.equal(buildGroupedSnippet([type, note], {}, context), `${init}{foreach $r.Relationships as $Relationship name=relations}
    Relation Type: {$Relationship.recRelationType}
    Relation Note: {$Relationship.relationRecord.f3}
{/foreach}
`);
  assert.equal(buildFieldSnippet(type, { ifnull: true, addCaption: false }, context), `${init}{foreach $r.Relationships as $Relationship name=relations}
    {if $Relationship.recRelationType}
        {$Relationship.recRelationType}
    {/if}
{/foreach}
`);
  assert.equal(segmentsFromPath([{ via: { link: 'lt', dty: 77, targetRty: 12 } }, { dty: 3, relationship: true }]), null);
});

test('outputs of a repeatable enum: one loop each over $r.f<id>s, caption before the first value', () => {
  const repeating = { ...context, isRepeatable: (rty, dty) => dty === '19' };
  const items = [['term', 'Term'], ['conceptid', 'Concept ID']].map(([term, label]) => ({
    segments: segmentsFromPath([{ dty: 19, fieldType: 'enum', term }]), label
  }));
  const loop = (label, subfield) => [
    '<br>',
    '{foreach $r.f19s as $f19 name=valueloop}',
    `    {if $smarty.foreach.valueloop.first} ${label}: {/if}`,
    `        {$f19.${subfield}}`,
    '        {if !$smarty.foreach.valueloop.last}, {/if}',
    '{/foreach}'
  ].join('\n');
  assert.equal(buildGroupedSnippet(items, {}, repeating), `${loop('Term', 'term')}\n${loop('Concept ID', 'conceptid')}\n`);
  assert.ok(!buildGroupedSnippet(items, {}, repeating).includes('$f19.f19s'), 'no nested loop over the same field');
});
