import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { ownerSections } = await import('../src/ui/ExplorerControlPanel.js');

const USER = {
  currentUserId: 2,
  users: [{ id: 2, name: 'osmakov' }],
  groups: [{ id: 6, name: 'Test group', role: 'admin' }, { id: 1, name: 'Database Managers', role: 'admin' },
    { id: 4, name: 'Website filters', role: 'member' }]
};

test('sections: mine, my groups by name, website filters, everyone; items by title', () => {
  const items = [
    { id: 1, title: 'b', ownerGroupId: 0 }, { id: 2, title: 'z', ownerGroupId: 6 }, { id: 3, title: 'a', ownerGroupId: 6 },
    { id: 4, title: 'w', ownerGroupId: 4 }, { id: 5, title: 'm', ownerGroupId: 2 }, { id: 6, title: 'd', ownerGroupId: 1 }
  ];
  const sections = ownerSections(items, USER);
  assert.deepEqual(sections.map((section) => section.label),
    ['Mine (osmakov)', 'Database Managers', 'Test group', 'Website filters', 'Everyone']);
  assert.deepEqual(sections[2].items.map((item) => item.title), ['a', 'z']);
});

test('sections for a guest: names fall back to the fixed groups', () => {
  const sections = ownerSections([{ id: 1, title: 'x', ownerGroupId: 4 }, { id: 2, title: 'y', ownerGroupId: 0 }], null);
  assert.deepEqual(sections.map((section) => [section.key, section.label]), [['4', 'Website filters'], ['0', 'Everyone']]);
});
