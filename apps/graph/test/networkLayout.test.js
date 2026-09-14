import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutOptions, NetworkMovement, fixedPositions } from '../src/engine/visnetwork/NetworkLayout.js';
import { normalizeGraphConfigurationSettings, serializeGraphConfigurationSettings } from '../src/ui/config/graphConfigurationSchema.js';

test('layout presets select solver and reset hierarchy on switching back', () => {
  assert.equal(layoutOptions().physics.solver, 'barnesHut');
  assert.equal(layoutOptions({ layoutMode: 'forceAtlas2' }).physics.solver, 'forceAtlas2Based');
  for (const [mode, direction] of [['hierarchical-ud', 'UD'], ['hierarchical-lr', 'LR']]) {
    const options = layoutOptions({ layoutMode: mode });
    assert.equal(options.layout.hierarchical.enabled, true);
    assert.equal(options.layout.hierarchical.direction, direction);
    assert.equal(options.physics.solver, 'hierarchicalRepulsion');
  }
  assert.equal(layoutOptions({ layoutMode: 'automatic' }).layout.hierarchical.enabled, false);
  assert.equal(layoutOptions({ gravity: 'loose' }).physics.barnesHut.gravitationalConstant, -4000);
  assert.equal(layoutOptions({ layoutMode: 'forceAtlas2', gravity: 'tight' }).physics.forceAtlas2Based.gravitationalConstant, -20);
});

test('arrange once freezes after bounded stabilization and can run again', () => {
  const handlers = new Map(), changes = [], runs = [];
  const network = { on: (name, fn) => handlers.set(name, fn), off: name => handlers.delete(name),
    setOptions: value => changes.push(value), stabilize: count => runs.push(count), startSimulation: () => runs.push('continuous') };
  const movement = new NetworkMovement(network);
  movement.arrange({ movement: 'once' });
  assert.equal(changes.at(-1).physics.enabled, true);
  assert.deepEqual(runs, [500]);
  handlers.get('stabilizationIterationsDone')();
  assert.equal(changes.at(-1).physics.enabled, false);
  movement.arrange({ movement: 'once' });
  handlers.get('stabilized')();
  assert.equal(changes.at(-1).physics.enabled, false);
  movement.arrange({ movement: 'continuous' });
  handlers.get('stabilized')();
  assert.equal(changes.at(-1).physics.enabled, true);
  assert.equal(runs.at(-1), 'continuous');
  movement.arrange({ movement: 'once', physics: false });
  assert.equal(movement.pending, false);
  movement.destroy();
  assert.equal(handlers.size, 0);
});

test('layout, movement and independent Rearrange visibility survive settings serialization', () => {
  const settings = { config: { defaults: { layoutMode: 'forceAtlas2', movement: 'once' } },
    options: { nativeControls: { zoom: false, rearrange: true } } };
  const result = normalizeGraphConfigurationSettings(serializeGraphConfigurationSettings(settings));
  assert.equal(result.config.defaults.layoutMode, 'forceAtlas2');
  assert.equal(result.config.defaults.movement, 'once');
  assert.equal(result.options.nativeControls.zoom, false);
  assert.equal(result.options.nativeControls.rearrange, true);
  assert.equal(normalizeGraphConfigurationSettings({}).config.defaults.movement, 'once');
  assert.equal(normalizeGraphConfigurationSettings({ config: { defaults: { movement: 'continuous' } } }).config.defaults.movement, 'continuous');
});

 test('fixed layouts are stable, separated and keep physics disabled', () => {
   const nodes = Array.from({ length: 17 }, (_, index) => ({ id: index + 1, recordTypeId: index < 10 ? 1 : 2, label: 'Record ' + index }));
   for (const mode of ['grid', 'record-types']) {
     const positions = fixedPositions(nodes, mode);
     assert.equal(positions.length, nodes.length);
     assert.equal(new Set(positions.map(n => n.x + ',' + n.y)).size, nodes.length);
     assert.deepEqual(fixedPositions([...nodes].reverse(), mode), positions);
     assert.equal(layoutOptions({ layoutMode: mode, movement: 'continuous', physics: { enabled: true } }).physics, false);
     assert.equal(layoutOptions({ layoutMode: mode }).layout.improvedLayout, false);
     assert.equal(normalizeGraphConfigurationSettings({ config: { defaults: { layoutMode: mode } } }).config.defaults.layoutMode, mode);
   }
   const groups = fixedPositions(nodes, 'record-types');
   const first = groups.filter(n => n.id <= 10), second = groups.filter(n => n.id > 10);
   assert.ok(Math.max(...first.map(n => n.x)) < Math.min(...second.map(n => n.x)));
   assert.deepEqual(fixedPositions([], 'grid'), []);
   assert.deepEqual(fixedPositions(nodes, 'automatic'), []);
   assert.deepEqual(fixedPositions([{ id: 1 }], 'grid'), [{ id: 1, x: 0, y: 0 }]);
 });
