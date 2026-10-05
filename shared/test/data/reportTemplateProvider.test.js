import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportTemplateProvider } from '../../src/data/ReportTemplateProvider.js';

test('ReportTemplateProvider lists card reports from /reports?scope=card', async () => {
  const requested = [];
  const provider = new ReportTemplateProvider({
    baseUrl: 'http://localhost/heurist/', database: 'db1',
    fetchImpl: async (url) => {
      requested.push(new URL(url));
      return { ok: true, json: async () => ({ status: 0, data: { installed: true, reports: [
        { id: 5, title: 'Person card', file: 'person card.tpl', isCardView: true },
        { id: 6, title: 'No file', file: '' }
      ] } }) };
    }
  });
  const templates = await provider.list();
  assert.equal(requested.length, 1);
  assert.equal(requested[0].pathname, '/heurist/api/db1/reports');
  assert.equal(requested[0].searchParams.get('scope'), 'card');
  assert.deepEqual(templates, [{ value: 'person card', label: 'Person card' }]);
});

test('ReportTemplateProvider falls back to the legacy list when report records are not installed', async () => {
  const requested = [];
  const provider = new ReportTemplateProvider({
    baseUrl: 'http://localhost/heurist/', database: 'db1',
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requested.push(parsed);
      if (parsed.pathname.includes('/api/')) {
        return { ok: true, json: async () => ({ status: 0, data: { installed: false, reports: [] } }) };
      }
      return { ok: true, json: async () => ({ data: ['A.tpl', { name: 'B.tpl', title: 'Template B' }] }) };
    }
  });
  const templates = await provider.list();
  assert.equal(requested[1].searchParams.get('controller'), 'ReportController');
  assert.equal(requested[1].searchParams.get('action'), 'list');
  assert.equal(requested[1].searchParams.get('db'), 'db1');
  assert.deepEqual(templates, [
    { value: 'A.tpl', label: 'A.tpl' },
    { value: 'B.tpl', label: 'Template B' }
  ]);
});

test('ReportTemplateProvider falls back to the legacy list when /reports is missing', async () => {
  const provider = new ReportTemplateProvider({
    baseUrl: 'http://localhost/heurist', database: 'db1',
    fetchImpl: async (url) => (String(url).includes('/api/')
      ? { ok: false, status: 404, json: async () => ({}) }
      : { ok: true, json: async () => ({ data: [{ filename: 'x.tpl', name: 'x' }] }) })
  });
  assert.deepEqual(await provider.list(), [{ value: 'x', label: 'x' }]);
});

test('ReportTemplateProvider is empty without base URL or database', async () => {
  assert.deepEqual(await new ReportTemplateProvider({ database: 'db1' }).list(), []);
});
