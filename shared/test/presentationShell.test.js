/**
 * @file presentationShell.test.js
 * @brief The common toolbar and header of the presentations (plan 27q3 §3, review 3): slots in their order, a slot that
 *        keeps its place hidden, the badge of the selector, the icon buttons at the right end, the header buttons and
 *        note.
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
import { installFakeDom } from './helpers/fakeDom.js';

const document = installFakeDom();
const { createSourceHeader, renderHeaderActions, renderPresentationToolbar } = await import('../src/widgets/presentation/presentationShell.js');

test('a placeholder slot keeps its place hidden; the selector ends with its badge; tools at the right end', () => {
  const bar = document.createElement('div');
  const clicked = [];
  const made = renderPresentationToolbar(bar, {
    new: { run: () => clicked.push('new') },
    selector: { label: 'Monthly', badge: 'list', placeholder: true, run: () => {} },
    edit: { placeholder: true, run: () => {} },
    refresh: { icon: 'fa-flask', label: 'Test', caption: true },
    tools: [{ icon: 'fa-file-import', label: 'Import', run: () => clicked.push('import') }, null]
  });
  assert.ok(made.selector.classList.contains('is-placeholder'));
  assert.ok(made.edit.classList.contains('is-placeholder'));
  assert.equal(made.selector.getAttribute('aria-hidden'), 'true');
  assert.equal(made.selector.querySelector('.h-presentation-badge').textContent, 'list');
  assert.ok(!made.new.classList.contains('is-placeholder'));
  assert.equal(made.tools.length, 1);
  const end = bar.querySelector('.h-presentation-toolbar-end');
  assert.ok(end, 'the groups after the first are right aligned (review 4)');
  assert.equal(made.refresh.parentElement, end);
  assert.equal(made.tools[0].parentElement, end);
  assert.equal(made.new.parentElement, bar);
  made.tools[0].click();
  made.new.click();
  assert.deepEqual(clicked, ['import', 'new']);
});

test('header: the note, the buttons and Close last', () => {
  const header = createSourceHeader({
    title: 'Report editor', onClose: () => {}, note: 'CSS and Javascript are disabled',
    actions: [{ icon: 'fa-circle-question', label: 'Help' }]
  });
  const note = header.element.querySelector('.h-presentation-header-note');
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /Javascript/);
  assert.equal(header.element.querySelector('.h-presentation-header-actions').querySelectorAll('button').length, 1);
  header.setNote('');
  assert.equal(note.hidden, true);
  const host = document.createElement('span');
  const buttons = renderHeaderActions(host, [null, { icon: 'fa-list-ul', label: 'List', active: true }]);
  assert.equal(buttons.length, 1);
  assert.ok(buttons[0].classList.contains('is-active'));
  renderHeaderActions(host, []);
  assert.equal(host.querySelectorAll('button').length, 0);
});
