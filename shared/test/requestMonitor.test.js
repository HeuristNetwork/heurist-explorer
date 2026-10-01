/**
 * @file requestMonitor.test.js
 * @brief Request tracing, debug flag, request ids and stop of running data requests.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { HeuristApiClient, RequestMonitor, createModuleRequestMonitor } from '../src/api/index.js';

/** JSON response for a fake fetch. */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Fake fetch: records calls; `/records/cancel` and other paths answer immediately unless `hold` is set. */
function fakeFetch({ hold = false, reply = { records: [], pagination: { total: 3 } } } = {}) {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url: String(url), init });
    if (hold && !String(url).includes('/records/cancel')) {
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    return Promise.resolve(json(String(url).includes('/records/cancel') ? { cancel: {} } : reply));
  };
  return { calls, fetchImpl };
}

function client(fetchImpl, requestMonitor) {
  return new HeuristApiClient({ apiBaseUrl: 'http://h/heurist', database: 'db', fetchImpl, requestMonitor });
}

test('data requests get a request id and are logged with their total', async () => {
  const monitor = new RequestMonitor({ source: 'test' });
  const { calls, fetchImpl } = fakeFetch();
  await client(fetchImpl, monitor).get('/records', { query: { q: 't:10' } });
  assert.ok(calls[0].init.headers['X-Heurist-Request-Id']);
  assert.ok(!calls[0].url.includes('debug='), 'no debug parameter while tracing is off');
  const [entry] = monitor.entries();
  assert.equal(entry.status, 'ok');
  assert.equal(entry.total, 3);
  assert.equal(entry.source, 'test');
  assert.equal(entry.summary, 't:10');
  assert.equal(monitor.inFlightCount, 0);
});

test('tracing adds debug=1 and keeps the server debug section', async () => {
  const monitor = new RequestMonitor({ traceEnabled: true });
  const { calls, fetchImpl } = fakeFetch({ reply: { total: 1, debug: { mainMs: 2 } } });
  await client(fetchImpl, monitor).post('/graph', { body: { query: { ids: 1 } } });
  assert.match(calls[0].url, /debug=1/);
  assert.deepEqual(monitor.entries()[0].debug, { mainMs: 2 });
});

test('non-data endpoints are not traced', async () => {
  const monitor = new RequestMonitor();
  const { calls, fetchImpl } = fakeFetch({ reply: { ok: 1 } });
  await client(fetchImpl, monitor).get('/sys/filter');
  assert.equal(monitor.entries().length, 0);
  assert.equal(calls[0].init.headers['X-Heurist-Request-Id'], undefined);
});

test('abortAll stops running requests and asks the server to cancel them', async () => {
  const monitor = new RequestMonitor();
  const { calls, fetchImpl } = fakeFetch({ hold: true });
  const api = client(fetchImpl, monitor);
  const pending = api.get('/records');
  assert.equal(monitor.inFlightCount, 1);
  const stopped = monitor.abortAll();
  assert.equal(stopped.length, 1);
  await assert.rejects(pending, { name: 'AbortError' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const cancel = calls.find((call) => call.url.includes('/records/cancel'));
  assert.ok(cancel, 'cancel request sent');
  assert.deepEqual(JSON.parse(cancel.init.body), { rid: stopped });
  assert.equal(monitor.entries()[0].status, 'aborted');
  assert.equal(monitor.inFlightCount, 0);
});

test('a request aborted by its caller is cancelled on the server too', async () => {
  const { calls, fetchImpl } = fakeFetch({ hold: true });
  const api = client(fetchImpl, new RequestMonitor());
  const controller = new AbortController();
  const pending = api.get('/map', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(calls.some((call) => call.url.includes('/records/cancel')));
});

test('server timeout and cancel errors get their own status', async () => {
  const monitor = new RequestMonitor();
  const fetchImpl = () => Promise.resolve(json({ status: 503, error: 'query_timeout', message: 'slow' }, 503));
  await assert.rejects(client(fetchImpl, monitor).get('/records'));
  assert.equal(monitor.entries()[0].status, 'timeout');
});

test('module monitors report to the host monitor and inherit its trace switch', async () => {
  const host = new RequestMonitor({ traceEnabled: true });
  const bridge = { registerRequestMonitor: (monitor) => host.attachChild(monitor) };
  const module = createModuleRequestMonitor(bridge, 'data');
  assert.equal(module.traceEnabled, true);
  const { calls, fetchImpl } = fakeFetch({ hold: true });
  const pending = client(fetchImpl, module).get('/records');
  assert.equal(host.inFlightCount, 1);
  assert.match(calls[0].url, /debug=1/);
  host.abortAll();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(host.inFlightCount, 0);
  assert.equal(host.entries()[0].source, 'data');
});
