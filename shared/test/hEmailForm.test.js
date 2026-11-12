import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from './helpers/fakeDom.js';

const document = installFakeDom();
const { HEmailForm, emailFormHtml } = await import('../src/widgets/site/HEmailForm.js');

/** The form as EmailFormHtml::render writes it (the fake DOM does not parse HTML). */
function serverForm(site = 10) {
  const host = document.createElement('div');
  const form = document.createElement('form');
  form.className = 'h-site-email-form';
  form.setAttribute('data-site', String(site));
  for (const name of ['name', 'email', 'message', 'captcha']) {
    const input = document.createElement(name === 'message' ? 'textarea' : 'input');
    input.setAttribute('name', name);
    form.append(input);
  }
  for (const className of ['h-site-email-question', 'h-site-email-send', 'h-site-email-status']) {
    const node = document.createElement(className === 'h-site-email-send' ? 'button' : 'span');
    node.className = className;
    form.append(node);
  }
  host.append(form);
  return { host, form, field: (name) => form.querySelector(`[name="${name}"]`) };
}

/** fetch answering in turn; the calls are kept. */
function fakeFetch(answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    const [status, body] = answers.shift() || [200, {}];
    return { ok: status < 400, status, json: async () => body };
  };
  return { fetch, calls };
}

test('email form markup: inline form, or a button with a dialog; caption of the language, escaped', () => {
  const inline = emailFormHtml({}, { site: 5 });
  assert.match(inline, /^<form class="h-site-email-form" data-site="5" novalidate>/);
  for (const name of ['name', 'email', 'message', 'captcha']) assert.match(inline, new RegExp(`name="${name}"`));
  assert.doesNotMatch(inline, /<dialog/);
  const button = emailFormHtml({ display: 'button', label: 'Write <us>', labels: { fre: 'Écrivez-nous' } }, { site: 5, language: 'FRE' });
  assert.match(button, /^<button type="button" class="h-site-email-open">Écrivez-nous<\/button><dialog/);
  assert.match(emailFormHtml({ display: 'button', label: 'Write <us>' }), />Write &lt;us&gt;<\/button>/);
  assert.match(emailFormHtml({ display: 'button' }), />Email us<\/button>/);
});

test('email form: the question on first use, checks, send, new question after an error', async () => {
  const { host, field } = serverForm(10);
  const { fetch, calls } = fakeFetch([
    [200, { question: '1 + 2 + 1 =' }],
    [403, { message: 'Are you a bot? Please enter the correct answer to the challenge question' }],
    [200, { question: '3 + 3 + 1 =' }],
    [200, { sent: true }]
  ]);
  const widget = new HEmailForm().attach(host, { url: '/api/db/external/email', fetch }).render();
  assert.equal(calls.length, 0, 'nothing asked before the form is used');
  host.querySelector('.h-site-email-form').dispatchEvent(new Event('focusin'));
  await flush();
  assert.equal(host.querySelector('.h-site-email-question').textContent, '1 + 2 + 1 =');
  assert.deepEqual(calls.map((call) => call.method), ['GET']);

  // missing fields and a bad address: nothing sent
  assert.equal(await widget.send(), false);
  assert.equal(field('name').getAttribute('aria-invalid'), 'true');
  field('name').value = 'Jane';
  field('email').value = 'not an address';
  field('message').value = 'Hello';
  field('captcha').value = '5';
  assert.equal(await widget.send(), false);
  assert.match(host.querySelector('.h-site-email-status').textContent, /Email does not appear to be valid/);
  assert.equal(calls.length, 1);

  // wrong answer: the server's message, a new question
  field('email').value = 'jane@example.org';
  assert.equal(await widget.send(), false);
  assert.deepEqual(calls[1].body, { site: 10, name: 'Jane', email: 'jane@example.org', message: 'Hello', captcha: '5', url: '' });
  assert.match(host.querySelector('.h-site-email-status').textContent, /Are you a bot/);
  assert.equal(host.querySelector('.h-site-email-question').textContent, '3 + 3 + 1 =');
  assert.equal(field('captcha').value, '', 'the answer field is cleared for the new question');

  // sent: fields cleared, the next use asks again
  field('captcha').value = ' 7 ';
  assert.equal(await widget.send(), true);
  assert.equal(calls[3].body.captcha, '7');
  assert.equal(field('message').value, '');
  assert.match(host.querySelector('.h-site-email-status').textContent, /has been sent/);
  assert.equal(host.querySelector('.h-site-email-status').classList.contains('is-error'), false);
});

test('email form: too many messages does not ask again; design mode asks and sends nothing', async () => {
  const { host, field } = serverForm(3);
  const { fetch, calls } = fakeFetch([[200, { question: '1 + 1 + 1 =' }], [429, { message: 'Too many messages: please try again later' }]]);
  const widget = new HEmailForm().attach(host, { url: '/x', fetch }).render();
  await widget.ask();
  for (const [name, value] of [['name', 'A'], ['email', 'a@b.org'], ['message', 'm'], ['captcha', '3']]) field(name).value = value;
  assert.equal(await widget.send(), false);
  assert.equal(calls.length, 2, 'no new question after 429');

  const design = serverForm(3);
  const { fetch: none, calls: nothing } = fakeFetch([]);
  new HEmailForm().attach(design.host, { url: '/x', fetch: none, design: true }).render();
  design.host.querySelector('.h-site-email-form').dispatchEvent(new Event('focusin'));
  await flush();
  assert.equal(nothing.length, 0);
  assert.equal(design.host.querySelector('.h-site-email-send').disabled, true);
});
