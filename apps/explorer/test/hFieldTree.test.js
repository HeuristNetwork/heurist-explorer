import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stand-in: HFieldTree._renderBody only builds buttons/divs.
function fakeElement(tag) {
  return {
    tag, children: [], textContent: '', className: '', disabled: false,
    classList: { add() {} },
    append(...nodes) {
      for (const node of nodes) {
        if (typeof node === 'string') this.textContent += node;
        else this.children.push(node);
      }
    },
    replaceChildren() { this.children = []; },
    addEventListener() {}
  };
}
globalThis.document ??= { createElement: fakeElement };

const { HFieldTree } = await import('../src/widgets/filter-builder/HFieldTree.js');

/** Top-level labels rendered for a scope (leaf text is set before its type badge is appended). */
function labelsFor(scope) {
  const tree = new HFieldTree({ dbdefs: { rectypeName: () => '' } });
  Object.assign(tree, {
    _body: fakeElement('div'),
    _rtyId: scope.rtyId,
    _builderMode: scope.builderMode === true,
    _includeHeaders: scope.includeHeaders !== false,
    _excludedFields: new Set()
  });
  tree._renderBody();
  return tree._body.children.map((node) => node.textContent);
}

test('no record type in the Filter Builder -> any field + title + metadata', () => {
  const labels = labelsFor({ rtyId: '', builderMode: true });
  assert.equal(labels[0], 'Any field');
  for (const label of ['Title', 'ID', 'Added', 'Modified', 'Creator', 'URL', 'Owner', 'Visibility']) {
    assert.ok(labels.includes(label), `missing ${label}`);
  }
});

test('no record type outside the Filter Builder still asks for one', () => {
  assert.deepEqual(labelsFor({ rtyId: '' }), ['Choose a record type first']);
});
