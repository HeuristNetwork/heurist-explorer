import test from 'node:test';
import assert from 'node:assert/strict';

const { FileUploader, UPLOAD_CLIENT_HEADER } = await import('../../src/data/FileUploader.js');
const { HeuristApiClient } = await import('../../src/api/HeuristApiClient.js');

/** Fake server of the chunked upload: keeps the received bytes; `failOnce` makes one chunk fail (network). */
function fakeApi({ chunkSize = 4, failOnce = false, mismatchOnce = false } = {}) {
  const calls = [];
  let received = 0;
  let size = 0;
  let failed = false;
  let mismatched = false;
  return {
    calls,
    get received() { return received; },
    async request(path, { method = 'GET', body } = {}) {
      calls.push([method, path, body]);
      if (path === '/files/upload' && method === 'POST') {
        size = body.size;
        return { token: 't1', chunkSize, received: 0, size };
      }
      if (path === '/files/upload/t1' && method === 'GET') return { token: 't1', received, size, complete: received >= size };
      if (path === '/files/upload/t1' && method === 'DELETE') return { cancelled: 't1' };
      if (path === '/files/0') return { records: [{ rec_ID: '9', rec_Title: 'a.txt' }], meta: { issues: [] } };
      throw new Error('unexpected '.concat(method, ' ', path));
    },
    async upload(path, blob, { headers, onProgress }) {
      calls.push(['PUT', path, headers['Content-Range'], headers['X-Heurist-Client']]);
      const [, from, to] = /bytes (\d+)-(\d+)\//.exec(headers['Content-Range']).map(Number);
      if (failOnce && !failed && from > 0) { failed = true; received = from; throw new Error('network'); }
      if (mismatchOnce && !mismatched && from > 0) {
        mismatched = true;
        received = from - 2; // the server kept less than the client thinks
        const error = new Error('range'); error.status = 409; error.details = { received };
        throw error;
      }
      assert.equal(from, received, 'chunks continue at the received size');
      received = to + 1;
      onProgress?.(blob.size, blob.size);
      const complete = received >= size;
      return complete
        ? { token: 't1', received, size, complete, md5: 'abc', ext: 'txt', duplicates: [3] }
        : { token: 't1', received, size, complete };
    }
  };
}

const file = new Blob(['0123456789']);

test('FileUploader: chunks with Content-Range and the client header, progress, the finished upload', async () => {
  const api = fakeApi();
  const progress = [];
  const result = await new FileUploader(api).upload(file, { name: 'a.txt', onProgress: (sent) => progress.push(sent) });
  assert.deepEqual(api.calls.filter((call) => call[0] === 'PUT').map((call) => call[2]),
    ['bytes 0-3/10', 'bytes 4-7/10', 'bytes 8-9/10']);
  assert.equal(api.calls[1][3], UPLOAD_CLIENT_HEADER['X-Heurist-Client']);
  assert.deepEqual(api.calls[0][2], { name: 'a.txt', size: 10, type: '' });
  assert.equal(result.token, 't1');
  assert.deepEqual(result.duplicates, [3]);
  assert.equal(progress.at(-1), 10);
});

test('FileUploader: resumes after a network error at the size the server has', async () => {
  const api = fakeApi({ failOnce: true });
  const result = await new FileUploader(api, { wait: async () => {} }).upload(file, { name: 'a.txt' });
  assert.equal(result.complete, true);
  assert.ok(api.calls.some((call) => call[0] === 'GET' && call[1] === '/files/upload/t1'), 'asks the received size');
  assert.equal(api.received, 10);
});

test('FileUploader: a 409 continues at the received size given by the server', async () => {
  const api = fakeApi({ mismatchOnce: true });
  const result = await new FileUploader(api).upload(file, { name: 'a.txt' });
  assert.equal(result.complete, true);
  assert.ok(api.calls.some((call) => call[0] === 'PUT' && call[2] === 'bytes 2-5/10'), 'restarts at byte 2');
});

test('FileUploader: an aborted upload is cancelled on the server; register and registerUrl post /files/0', async () => {
  const api = fakeApi();
  const controller = new AbortController();
  api.upload = async () => { controller.abort(); const error = new Error('aborted'); error.name = 'AbortError'; throw error; };
  const uploader = new FileUploader(api);
  await assert.rejects(uploader.upload(file, { name: 'a.txt', signal: controller.signal }), { name: 'AbortError' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(api.calls.some((call) => call[0] === 'DELETE'), 'DELETE /files/upload/{token}');
  const record = await uploader.register('t1', { details: { 1: 'Caption' } });
  assert.equal(record.rec_ID, '9');
  assert.deepEqual(api.calls.at(-1), ['POST', '/files/0', { upload: 't1', details: { 1: 'Caption' } }]);
  await uploader.registerUrl('https://x.org/a.png');
  assert.deepEqual(api.calls.at(-1)[2], { rec_URL: 'https://x.org/a.png', details: {} });
});

test('HeuristApiClient.upload: XHR with headers and progress; errors with status and details', async () => {
  const sent = [];
  class FakeXhr {
    constructor() { this.headers = {}; this.upload = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      sent.push(this);
      this.upload.onprogress?.({ loaded: 3, total: 3, lengthComputable: true });
      const fail = this.headers['Content-Range'] === 'bad';
      this.status = fail ? 409 : 200;
      this.responseText = JSON.stringify(fail ? { error: 'range_mismatch', received: 5 } : { received: 3 });
      this.onload();
    }
    abort() { this.onabort(); }
  }
  const api = new HeuristApiClient({ apiBaseUrl: 'http://h/heurist', database: 'db', xhrImpl: () => new FakeXhr() });
  const progress = [];
  const result = await api.upload('/files/upload/t1', new Blob(['abc']), {
    headers: { 'Content-Range': 'bytes 0-2/3' }, onProgress: (loaded) => progress.push(loaded)
  });
  assert.deepEqual(result, { received: 3 });
  assert.equal(sent[0].method, 'PUT');
  assert.equal(sent[0].url, 'http://h/heurist/api/db/files/upload/t1');
  assert.equal(sent[0].headers['Content-Type'], 'application/octet-stream');
  assert.deepEqual(progress, [3]);
  await assert.rejects(api.upload('/files/upload/t1', new Blob(['abc']), { headers: { 'Content-Range': 'bad' } }),
    (error) => error.status === 409 && error.details.received === 5);
});
