import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportTemplateProvider } from '../../src/data/ReportTemplateProvider.js';

test('ReportTemplateProvider lists the card reports of /report by record id', async () => {
  const requested = [];
  const provider = new ReportTemplateProvider({
    baseUrl: 'http://localhost/heurist/', database: 'db1',
    fetchImpl: async (url) => {
      requested.push(new URL(url));
      return { ok: true, json: async () => ({ records: [{ rec_ID: '5' }, { rec_ID: '6' }, { rec_ID: '7' }], meta: { items: {
        5: { id: 5, title: 'Person card', file: 'person card.tpl', isCardView: true },
        6: { id: 6, title: 'No file', file: '', isCardView: true },
        7: { id: 7, title: 'A set', file: 'set.tpl', isCardView: false }
      } } }) };
    }
  });
  const templates = await provider.list();
  assert.equal(requested.length, 1);
  assert.equal(requested[0].pathname, '/heurist/api/db1/report');
  assert.deepEqual(templates, [{ value: '5', label: 'Person card', file: 'person card' }]);
});

test('ReportTemplateProvider falls back to the legacy list when report records are not installed', async () => {
  const requested = [];
  const provider = new ReportTemplateProvider({
    baseUrl: 'http://localhost/heurist/', database: 'db1',
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requested.push(parsed);
      if (parsed.pathname.includes('/api/')) {
        return { ok: false, status: 400, json: async () => ({}) };
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

test('ReportTemplateProvider falls back to the legacy list when /report is missing', async () => {
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
