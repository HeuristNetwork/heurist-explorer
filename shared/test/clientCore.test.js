import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HeuristApiClient,
  HostAdapter,
  StandaloneHostAdapter,
  normalizeModuleBootstrap
} from '../src/index.js';

test('package exposes independent API, host and bootstrap primitives', () => {
  assert.equal(new HeuristApiClient().isConfigured(), false);
  assert.ok(new StandaloneHostAdapter() instanceof HostAdapter);
  assert.deepEqual(normalizeModuleBootstrap({ runtime: { database: 'demo' } }), {
    format: 'heurist-module-bootstrap',
    version: 1,
    runtime: { database: 'demo' },
    settings: {},
    state: null,
    source: {}
  });
});
