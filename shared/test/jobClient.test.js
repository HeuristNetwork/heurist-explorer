import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
const { JobClient, isJobFinished, pollDelay } = await import('../src/api/JobClient.js');
const { HJobMonitor, formatSeconds } = await import('../src/widgets/job/HJobMonitor.js');

/** Fake HeuristApiClient: a scripted list of job states for GET /jobs/{id}. */
function fakeApi(states) {
  const calls = [];
  return {
    calls,
    headers: {},
    accessToken: null,
    buildUrl: (path) => `http://x/api/db${path}`,
    fetchImpl: async (url) => {
      calls.push(['FETCH', String(url)]);
      return { ok: true, text: async () => '<p>result</p>' };
    },
    async post(path, { body } = {}) {
      calls.push(['POST', path, body]);
      if (path === '/jobs') return { status: 0, data: { id: 'a'.repeat(32), status: 'queued', type: body.type, progress: { done: 0, total: 0 } } };
      return { status: 0, data: { id: 'a'.repeat(32), status: 'running', cancelRequested: true } };
    },
    async get(path) {
      calls.push(['GET', path]);
      return { status: 0, data: states.shift() };
    }
  };
}

const noSleep = async () => {};

test('JobClient starts a job and polls until it finishes', async () => {
  const api = fakeApi([
    { id: 'a'.repeat(32), status: 'running', progress: { done: 1, total: 4 } },
    { id: 'a'.repeat(32), status: 'done', progress: { done: 4, total: 4 }, result: { file: 'r.html' } }
  ]);
  const client = new JobClient({ apiClient: api, sleep: noSleep });
  const updates = [];
  const job = await client.run('report-generate', { schedule: 3 }, { onUpdate: (state) => updates.push(state.status) });
  assert.equal(job.status, 'done');
  assert.deepEqual(updates, ['queued', 'running', 'done']);
  assert.deepEqual(api.calls[0], ['POST', '/jobs', { type: 'report-generate', params: { schedule: 3 } }]);
  assert.equal(api.calls[1][1], `/jobs/${'a'.repeat(32)}`);
});

test('JobClient cancel, list and result use the jobs API', async () => {
  const api = fakeApi([[{ id: 'x' }]]);
  const client = new JobClient({ apiClient: api, sleep: noSleep });
  assert.equal((await client.cancel('a'.repeat(32))).cancelRequested, true);
  assert.equal(api.calls[0][1], `/jobs/${'a'.repeat(32)}/cancel`);
  assert.deepEqual(await client.list(), [{ id: 'x' }]);
  assert.equal(await client.result('a'.repeat(32)), '<p>result</p>');
  assert.match(api.calls.at(-1)[1], /\/jobs\/a+\/result$/);
});

test('job helpers', () => {
  assert.equal(isJobFinished({ status: 'running' }), false);
  assert.equal(isJobFinished({ status: 'timeout' }), true);
  assert.equal(isJobFinished(null), false);
  assert.deepEqual([0, 1, 2, 3, 9].map(pollDelay), [300, 600, 1000, 2000, 2000]);
  assert.equal(formatSeconds(42), '42 s');
  assert.equal(formatSeconds(185), '3 min 05 s');
});

test('HJobMonitor shows progress, offers Stop and reports the final state once', async () => {
  const api = fakeApi([
    { id: 'a'.repeat(32), title: 'Monthly', status: 'running', progress: { done: 1, total: 4, message: 'running report' } },
    { id: 'a'.repeat(32), title: 'Monthly', status: 'done', progress: { done: 4, total: 4 }, elapsedSeconds: 3,
      result: { file: 'monthly.html', url: 'http://x/monthly.html' } }
  ]);
  const client = new JobClient({ apiClient: api, sleep: noSleep });
  const host = document.createElement('div');
  document.body.append(host);
  const finished = [];
  const monitor = new HJobMonitor().attach(host, { jobClient: client, onFinish: (job) => finished.push(job.status) });
  const job = await monitor.follow({ id: 'a'.repeat(32), title: 'Monthly', status: 'queued', progress: { done: 0, total: 0 } });
  assert.equal(job.status, 'done');
  assert.deepEqual(finished, ['done']);
  assert.equal(host.querySelector('.h-job-monitor-title').textContent, 'Monthly');
  assert.equal(host.querySelector('.h-job-monitor-stop').hidden, true);
  assert.equal(host.querySelector('.h-job-monitor-fill').style.width, '100%');
  assert.equal(host.querySelector('.h-job-monitor-elapsed').textContent, '3 s');
  assert.equal(host.querySelector('.h-job-monitor-result').querySelectorAll('a').length, 1);
  await monitor.destroy();
});

test('HJobMonitor shows the error of a failed job', async () => {
  const api = fakeApi([{ id: 'a'.repeat(32), status: 'failed', error: 'The query finds no records', progress: {} }]);
  const host = document.createElement('div');
  const monitor = new HJobMonitor().attach(host, { jobClient: new JobClient({ apiClient: api, sleep: noSleep }) });
  await monitor.follow({ id: 'a'.repeat(32), status: 'queued' });
  const message = host.querySelector('.h-job-monitor-message');
  assert.equal(message.textContent, 'The query finds no records');
  assert.equal(message.classList.contains('h-job-monitor-error'), true);
  await monitor.destroy();
});
