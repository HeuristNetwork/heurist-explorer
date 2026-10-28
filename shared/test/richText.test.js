/**
 * @file richText.test.js
 * @brief Rich editors of blocktext values (plan 25): one live editor at a time, the value of
 *        the HTML editor, the Media tag, and the mode links of HInputText. The editors
 *        themselves (TinyMCE, CodeMirror) are checked in a browser.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
const { activateRichEditor, activeRichEditorOwner, releaseRichEditor, hasHtml, editorValue } = await import('../src/widgets/rich-text/richTextEditors.js');
const { mediaTag, embedUrl } = await import('../src/widgets/rich-text/mediaTag.js');
const { createHInput } = await import('../src/widgets/form/inputs/createHInput.js');

test('one live editor: opening another closes the previous one', async () => {
  const closed = [];
  const first = { name: 'first' };
  const second = { name: 'second' };
  await activateRichEditor({ owner: first, close: () => closed.push('first') });
  assert.equal(activeRichEditorOwner(), first);
  await activateRichEditor({ owner: second, close: () => closed.push('second') });
  assert.deepEqual(closed, ['first']);
  assert.equal(activeRichEditorOwner(), second);
  releaseRichEditor(first);
  assert.equal(activeRichEditorOwner(), second, 'only its owner releases it');
  releaseRichEditor(second);
  assert.equal(activeRichEditorOwner(), null);
});

test('HTML detection and the value of the HTML editor (one plain paragraph is its text)', () => {
  assert.equal(hasHtml('a < b'), false);
  assert.equal(hasHtml('<b>x</b>'), true);
  assert.equal(editorValue('<p>Hello <b>you</b></p>'), 'Hello <b>you</b>');
  assert.equal(editorValue('<p>one</p>\n<p>two</p>'), '<p>one</p>\n<p>two</p>');
  assert.equal(editorValue('<h2>T</h2>'), '<h2>T</h2>');
});

test('Media tag: local image with the legacy relative URL, players, external pages, a caption', () => {
  assert.equal(mediaTag({ key: 'abc', mime: 'image/jpeg', name: 'a.jpg' }, { database: 'db' }),
    '<img width="300" src="./?db=db&amp;file=abc&amp;fancybox=1" alt="a.jpg">');
  assert.match(mediaTag({ key: 'v1', mime: 'video/mp4' }, { database: 'db' }), /^<video controls width="640"><source src="\.\/\?db=db&amp;file=v1" type="video\/mp4"><\/video>$/);
  assert.match(mediaTag({ key: 's1', mime: 'audio/mpeg' }, { database: 'db' }), /^<audio controls>/);
  assert.match(mediaTag({ url: 'https://www.youtube.com/watch?v=abcdef12', mime: 'video/youtube' }, { database: 'db' }),
    /<iframe src="https:\/\/www\.youtube\.com\/embed\/abcdef12"/);
  assert.equal(embedUrl('https://vimeo.com/12345'), 'https://player.vimeo.com/video/12345');
  assert.match(embedUrl('https://soundcloud.com/x/y'), /^https:\/\/w\.soundcloud\.com\/player\/\?url=/);
  // more page forms (mediaEmbed.js, 2026-10-28)
  assert.equal(embedUrl('https://youtu.be/abcdef12?t=5'), 'https://www.youtube.com/embed/abcdef12');
  assert.equal(embedUrl('https://www.youtube.com/live/abcdef12'), 'https://www.youtube.com/embed/abcdef12');
  assert.equal(embedUrl('https://www.youtube.com/watch?list=x&v=abcdef12', '', { autoplay: true }), 'https://www.youtube.com/embed/abcdef12?autoplay=1');
  assert.equal(embedUrl('https://vimeo.com/channels/staffpicks/123456'), 'https://player.vimeo.com/video/123456');
  assert.equal(embedUrl('https://vimeo.com/123456/abcdef1234'), 'https://player.vimeo.com/video/123456?h=abcdef1234');
  assert.equal(embedUrl('https://player.vimeo.com/video/123456?h=abc123', '', { autoplay: true }), 'https://player.vimeo.com/video/123456?h=abc123&autoplay=1');
  assert.equal(embedUrl('https://example.org/video.mp4', 'video/mp4'), '');
  assert.equal(mediaTag({ key: 'd1', mime: 'application/pdf', name: 'Doc <1>' }, { database: 'db' }),
    '<a href="./?db=db&amp;file=d1" target="_blank">Doc &lt;1&gt;</a>');
  assert.equal(mediaTag({ key: 'abc', mime: 'image/png', caption: 'A & B' }, { database: 'db' }),
    '<figure><img width="300" src="./?db=db&amp;file=abc&amp;fancybox=1" alt=""><figcaption>A &amp; B</figcaption></figure>');
  assert.equal(mediaTag({}, { database: 'db' }), '');
});

test('HInputText with richText: the mode links under the text area; code fields: text and code editor only', () => {
  const host = document.createElement('div');
  const input = createHInput('freetext', host, { multiline: true, value: 'x', richText: { baseUrl: 'http://h/' } });
  assert.deepEqual([...input.modeLinks.keys()], ['text', 'wysiwyg', 'codeeditor']);
  assert.ok(input.modeLinks.get('text').classList.contains('is-active'));
  assert.equal(input.textMode, 'text');
  const code = createHInput('freetext', document.createElement('div'), { multiline: true, richText: { codeOnly: true, codeLanguage: 'css' } });
  assert.deepEqual([...code.modeLinks.keys()], ['text', 'codeeditor']);
  const plain = createHInput('freetext', document.createElement('div'), { multiline: true });
  assert.equal(plain.modeLinks, undefined, 'no links without richText');
  input.setReadOnly(true);
  assert.equal(input.modesBar.hidden, true);
});
