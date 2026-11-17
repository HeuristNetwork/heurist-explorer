/**
 * @file panelForms.test.js
 * @brief Forms of the CMS designer in the element panel (plan 27n §6): sections, applied after a pause when valid.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, flush } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();

const { APPLY_DELAY, sectionGroups, showDomForm, showEditForm, formChanged } = await import('../src/designer/panelForms.js');

test('sections of a configuration (plan 27n §6): named fields to their section, the others in Presentation', () => {
  const fields = ['mode', 'records', 'template', 'presentation', 'action', 'label'].map((name) => ({ name, type: 'freetext' }));
  const groups = sectionGroups(fields, { source: ['mode', 'records'], behaviour: ['action'], caption: ['label'] },
    { presentation: [{ name: '__reveal', type: 'enum' }], identification: [{ name: '__name', type: 'freetext' }] });
  assert.deepEqual(groups.map((group) => [group.label, group.children.map((field) => field.name)]), [
    ['Source', ['mode', 'records']],
    ['Presentation', ['template', 'presentation', '__reveal']],
    ['Caption', ['label']],
    ['Behaviour', ['action']],
    ['Identification', ['__name']]
  ]);
  assert.ok(groups.every((group) => group.type === 'group'), 'fieldsets with their legends');
  assert.deepEqual(sectionGroups([{ name: 'a' }]).map((group) => group.label), ['Presentation'], 'empty sections left out');
});

test('an HEditForm in the panel: a valid change is applied after the pause; the designer fields at once', async () => {
  const host = document.createElement('div');
  const results = [];
  const common = [];
  const cleanups = [];
  const form = showEditForm({
    form: { groups: [{ id: 'main', children: [{ name: 'mode', type: 'enum', max: 1, terms: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }] }] },
    values: { mode: 'a' }
  }, (values) => ({ mode: values.mode }), {
    inline: {
      host,
      onResult: (result) => results.push(result),
      register: (cleanup) => cleanups.push(cleanup),
      common: { fields: { identification: [{ name: '__name', type: 'freetext', max: 1 }] }, values: { __name: 'x' },
        onChange: (name, value) => common.push([name, value]) }
    }
  }, { sections: { source: ['mode'] } });
  await form.setValue('mode', 'b');
  form.options.onChange(form, { name: 'mode', value: 'b' });
  assert.deepEqual(results, [], 'not before the pause');
  await flush(APPLY_DELAY + 50);
  assert.deepEqual(results, [{ mode: 'b' }]);
  form.options.onChange(form, { name: '__name', value: 'intro' });
  assert.deepEqual(common, [['__name', 'intro']], 'a field of the designer: at once');
  await flush(APPLY_DELAY + 50);
  assert.equal(results.length, 1, 'a field of the designer is not a change of the settings');
  assert.equal(cleanups.length, 1);
  await cleanups[0]();
});

test('a form of elements in the panel: its result after an input or a change of its content', async () => {
  const host = document.createElement('div');
  const content = document.createElement('div');
  const results = [];
  let valid = false;
  showDomForm(content, 'Badges', () => (valid ? { ok: true } : null), { inline: { host, onResult: (result) => results.push(result) } });
  assert.equal(content.parentElement, host);
  formChanged(content);
  await flush(APPLY_DELAY + 50);
  assert.deepEqual(results, [], 'not valid: nothing');
  valid = true;
  formChanged(content);
  await flush(APPLY_DELAY + 50);
  assert.deepEqual(results, [{ ok: true }]);
});

test('element panel (review 27n §15.19): a later show stops an earlier one; Apply of a show in its title row only', async () => {
  const { createElementPanel } = await import('../src/designer/designerPanel.js');
  const panel = createElementPanel();
  let release = null;
  const slow = new Promise((resolve) => { release = resolve; });
  let cleaned = 0;
  const section = (label, wait = null) => ({ label, build: async (host, context) => {
    if (wait) await wait;
    const apply = document.createElement('button');
    apply.textContent = label;
    context.addHeadActions(apply);
    return () => { cleaned += 1; };
  } });
  const first = panel.show({ title: 'Map', tabs: [{ id: 'config', label: 'Configuration', sections: [section('first', slow)] }] });
  // the first show is building its section (it waits) when the second one starts
  await flush(0);
  const second = panel.show({ title: 'Data', tabs: [{ id: 'config', label: 'Configuration', sections: [section('second')] }] });
  await second;
  release();
  await first;
  const titles = panel.element.querySelectorAll('.h-cms-form-section-title').map((node) => node.textContent);
  assert.deepEqual(titles, ['second'], 'one form');
  const actions = panel.element.querySelectorAll('.h-cms-panel-head-actions');
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0].children.map((node) => node.textContent), ['second']);
  assert.equal(cleaned, 1, 'the section of the earlier show is cleaned up');
  panel.destroy();
});
