import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

installFakeDom();
globalThis.Node ??= globalThis.HTMLElement;
globalThis.queueMicrotask ??= (fn) => Promise.resolve().then(fn);
const { HSymbolEditor } = await import('../src/widgets/symbology/HSymbolEditor.js');
const { HImageFilterEditor } = await import('../src/widgets/symbology/HImageFilterEditor.js');
const { HThematicMapEditor } = await import('../src/widgets/symbology/HThematicMapEditor.js');
const { effectiveSymbol, sparseSymbol } = await import('../src/symbology/symbology.js');

test('HSymbolEditor shows the effective symbol; unchanged it saves nothing new', async () => {
  const parent = effectiveSymbol({ color: '#0000ff' });
  const shown = effectiveSymbol({ weight: 7 }, parent);
  const editor = new HSymbolEditor().attach(document.createElement('div'), { mode: 'symbol', value: shown, parentSymbol: parent });
  editor.render();
  await flush();
  const value = editor.getValue();
  assert.equal(value.color, '#0000ff');
  assert.equal(value.weight, 7);
  assert.equal(value.stroke, true, 'Yes/No as a boolean');
  assert.deepEqual(sparseSymbol(value, parent), { weight: 7 });
  // the icon URL field is shown only for the Image icon source
  assert.equal(editor.rows.get('iconUrl').hidden, true);
  await editor.destroy();
});

test('HSymbolEditor range mode has the legend caption; gradient mode the from/to pairs', async () => {
  const range = new HSymbolEditor().attach(document.createElement('div'), { mode: 'range', value: { legendLabel: 'Small' } });
  range.render();
  assert.equal(range.getValue().legendLabel, 'Small');
  const gradient = new HSymbolEditor().attach(document.createElement('div'), { mode: 'gradient', value: { fillColor1: '#ff0000', iconSize2: 20 } });
  gradient.render();
  assert.deepEqual(gradient.getValue(), { fillColor1: '#ff0000', iconSize2: 20 });
  await range.destroy();
  await gradient.destroy();
});

test('HImageFilterEditor keeps the filters that differ from neutral, with units', async () => {
  const editor = new HImageFilterEditor().attach(document.createElement('div'), { value: { blur: '2px', brightness: '1' } });
  editor.render();
  assert.deepEqual(editor.getValue(), { blur: '2px' });
  assert.equal(editor.cssFilter(), 'blur(2px)');
  editor.reset();
  assert.deepEqual(editor.getValue(), {});
  await editor.destroy();
});

test('HThematicMapEditor keeps the layer symbol, drops empty ranges and fields, labels enum ranges', async () => {
  const dbdefs = {
    fieldGlobal: (dty) => ({ 1109: { type: 'integer', name: 'Population' }, 20: { type: 'enum', name: 'Gender', vocabulary: 500 } })[dty] || null,
    vocabRoot: (dty) => (Number(dty) === 20 ? 500 : 0),
    termLabel: (id) => ({ 414: 'Male', 415: 'Female' })[id] || '',
    termTree: () => ({ internalid: 500, children: [] }),
    rectypes: () => []
  };
  const value = {
    symbol: { color: '#111111' },
    thematic: [
      { title: 'Population', active: true, symbol: '', fields: [{ code: '10:1109', title: 'Population', ranges: [{ value: '1<>5', symbol: { color: '#00ff00' } }, { value: '', symbol: '' }] }] },
      { title: 'Gender', fields: [{ code: '10:20', title: 'Gender', ranges: [{ value: '414', symbol: '' }] }, { code: '10:1109', title: 'Empty', ranges: [] }] }
    ]
  };
  const editor = new HThematicMapEditor().attach(document.createElement('div'), { value, dbdefs });
  editor.render();
  await flush();
  assert.equal(editor.validate(), null);
  const result = editor.getValue();
  assert.deepEqual(result.symbol, { color: '#111111' });
  assert.deepEqual(result.thematic[0].fields[0].ranges, [{ value: '1<>5', symbol: { color: '#00ff00' } }]);
  assert.equal(result.thematic[1].fields.length, 1, 'a field without ranges is dropped');
  assert.deepEqual(result.thematic[1].fields[0].ranges, [{ value: '414', symbol: { legendLabel: 'Male' } }]);

  editor.renderers.push({ title: 'Nothing', active: false, symbol: '', fields: [] });
  assert.match(editor.validate(), /needs at least one field/);
  await editor.destroy();
});
