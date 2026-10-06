import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGexf, escapeXml } from '../src/core/gexfWriter.js';
import { GraphDocument } from '../src/core/GraphDocument.js';

const graph = new GraphDocument({
  records: [
    { id: 1, recordTypeId: 10, title: 'Smith & Sons' },
    { id: 2, recordTypeId: 12, title: 'Rome' },
    { id: 3, recordTypeId: 10, title: 'Doe' }
  ],
  edges: [
    { from: 1, to: 2, field: 134 },
    { from: 1, to: 2, field: 134, relationship: 5 },
    { from: 3, to: 1, field: 6, relationship: 101 },
    { from: 3, to: 99, field: 6 }
  ]
});

test('GEXF has the server attribute layout, nodes and one edge per pair', () => {
  const text = buildGexf(graph, {
    fields: new Map([[134, 'Place of birth']]),
    relationTypes: new Map([[101, 'Parent of']]),
    baseUrl: 'https://example.org/heurist/',
    database: 'demo',
    date: new Date('2026-10-06T00:00:00Z')
  });
  assert.match(text, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(text, /<gexf xmlns="http:\/\/www.gexf.net\/1.2draft"/);
  assert.match(text, /<meta lastmodifieddate="2026-10-06">/);
  for (const title of ['name', 'image', 'rectype', 'count', 'url']) assert.ok(text.includes(`title="${title}"`), title);
  for (const title of ['relation-id', 'relation-name', 'relation-image', 'relation-count', 'relation-start', 'relation-end']) {
    assert.ok(text.includes(`title="${title}"`), title);
  }
  assert.equal((text.match(/<node /g) || []).length, 3);
  assert.ok(text.includes('label="Smith &amp; Sons"'), 'titles are escaped');
  assert.ok(text.includes('value="https://example.org/heurist/?db=demo&amp;recID=2"'), 'record URL');
  assert.ok(text.includes('value="https://example.org/heurist/?db=demo&amp;icon=12"'), 'icon URL');
  const edges = text.match(/<edge [^>]+>/g) || [];
  assert.equal(edges.length, 2, 'duplicate pair and edge to a missing node are left out');
  assert.match(edges[0], /source="1" target="2".*label="Place of birth"/);
  assert.match(edges[1], /source="3" target="1".*label="Parent of"/);
  assert.ok(text.includes('<attvalue for="0" value="101"/>'), 'relation-id is the relationship type');
});

test('XML escaping removes control characters', () => {
  assert.equal(escapeXml('a<b>"c"\u0001'), 'a&lt;b&gt;&quot;c&quot; ');
});
