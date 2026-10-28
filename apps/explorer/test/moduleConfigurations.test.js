/**
 * @file moduleConfigurations.test.js
 * @brief The "Publish to" section of the publication form in Explorer (plan 29 §10).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { publishTarget } from '../src/modules/moduleConfigurations.js';

const PAGES = [{ id: 5, title: 'Old' }, { id: 8, title: 'Newest' }];

/** A form double: values and setValue. */
function fakeForm(values) {
  return { getValue: (name) => values[name], setValue: async (name, value) => { values[name] = value; } };
}

test('Publish to: New page | Update the page, the last published page first, its title', async () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ id: 8 }), setItem() {} };
  try {
    const target = await publishTarget({ pages: async () => PAGES }, 'timeline', { database: 'db' });
    const [group] = target.groups;
    assert.deepEqual(group.modes, ['publication']);
    const field = (name) => group.children.find((item) => item.name === name);
    assert.equal(field('publish.target').default, 'update');
    assert.equal(field('publish.pageId').default, 8, 'the page published last');
    assert.equal(field('publish.title').default, 'Newest');
    const values = { 'publish.target': 'update', 'publish.pageId': 5 };
    target.onChange(fakeForm(values), { name: 'publish.pageId' });
    assert.equal(values['publish.title'], 'Old');
    values['publish.target'] = 'new';
    target.onChange(fakeForm(values), { name: 'publish.target' });
    assert.match(values['publish.title'], /^Timeline – /);
  } finally {
    delete globalThis.localStorage;
  }
});

test('Publish to: no page of the module yet - only the title of a new page', async () => {
  const target = await publishTarget({ pages: async () => { throw new Error('older server'); } }, 'map', { database: 'db' });
  assert.deepEqual(target.groups[0].children.map((item) => item.name), ['publish.title']);
});
