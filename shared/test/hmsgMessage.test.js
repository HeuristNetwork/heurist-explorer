/**
 * @file hmsgMessage.test.js
 * @brief HMsg.showMsgDlg (2026-11-03): messages (a text, or an element with `message: true`) get the message style
 *        `h-dialog-message` on the dialog body; forms do not, also when the body is reused after a message.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

installFakeDom();
const { HMsg } = await import('../src/ui/HMsg.js');
// HMsg uses appendChild; the fake DOM has append
const proto = Object.getPrototypeOf(document.createElement('div'));
proto.appendChild ||= function appendChild(node) { this.append(node); return node; };

// one dialog element as HMsg.getMsgDlg builds it (the fake DOM has no getElementById)
const dialog = document.createElement('dialog');
for (const [tag, className] of [['header', 'h-dialog-header'], ['div', 'h-dialog-body'], ['footer', 'h-dialog-footer']]) {
  dialog.append(document.createElement(tag));
  dialog.children.at(-1).className = className;
}
const title = document.createElement('h2');
title.className = 'h-dialog-title';
const close = document.createElement('button');
close.setAttribute('data-role', 'close');
dialog.children[0].append(title, close);
dialog.dataset ||= {};
dialog.showModal = () => { dialog.open = true; };
dialog.close = () => { dialog.open = false; };
HMsg.getMsgDlg = () => dialog;

const body = (shown) => shown.querySelector('.h-dialog-body');

test('h-dialog-message: texts and message elements only', () => {
  const text = HMsg.showMsgDlg('Saved', { title: 'Note' });
  assert.equal(body(text).classList.contains('h-dialog-message'), true, 'a text');
  const form = document.createElement('form');
  const shown = HMsg.showMsgDlg(form, { title: 'Form' });
  assert.equal(shown, text, 'the same dialog element');
  assert.equal(body(shown).classList.contains('h-dialog-message'), false, 'a form: not a message (the body is reused)');
  const notice = document.createElement('p');
  notice.textContent = 'Remove?';
  assert.equal(body(HMsg.showMsgDlg(notice, { message: true })).classList.contains('h-dialog-message'), true, 'message: true');
  assert.equal(body(HMsg.showMsgErr('Failed')).classList.contains('h-dialog-message'), true, 'an error');
  HMsg.closeMsgDlg();
});
