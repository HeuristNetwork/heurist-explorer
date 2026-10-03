import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../../../shared/test/helpers/fakeDom.js';

installFakeDom();
const { ExplorerTour } = await import('../src/ui/ExplorerTour.js');

/** A visible target element. */
function target() {
  const el = document.createElement('div');
  el.isConnected = true;
  document.body.append(el);
  return el;
}

/** A tour-file section stand-in: a heading and one paragraph. */
function section(title, text) {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  return { cloneNode: () => ({ querySelector: () => ({ textContent: title, remove() {} }), childNodes: [paragraph] }) };
}

function steps(visible = [true, true, true]) {
  return visible.map((shown, i) => ({
    id: `s${i}`, topic: 't', title: `Step ${i}`,
    target: () => (shown ? target() : null)
  }));
}

test('the tour shows steps in order, skips a step without target, and finishes', async () => {
  let closed = 0;
  const tour = new ExplorerTour({ steps: steps([true, false, true]), topics: [{ id: 't', title: 'Topic' }], onClose: () => closed++ });
  assert.equal(await tour.start(), true);
  assert.equal(tour.index, 0);
  assert.equal(tour._title.textContent, 'Step 0', 'fallback title without a text section');
  assert.equal(tour._topic.textContent, '1. Topic');
  assert.equal(tour._back.disabled, true);
  await tour.next();
  assert.equal(tour.index, 2, 'step 1 has no target and is skipped');
  assert.equal(tour._next.textContent, 'Finish');
  await tour.back();
  assert.equal(tour.index, 0);
  await tour.show(2);
  await tour.next();
  assert.equal(tour.isOpen(), false, 'Next on the last step closes the tour');
  assert.equal(closed, 1);
});

test('step texts come from the tour file sections: heading = title', async () => {
  const tour = new ExplorerTour({
    steps: steps([true]),
    loadText: async () => new Map([['s0', section('From file', 'Body text')]])
  });
  await tour.start();
  assert.equal(tour._title.textContent, 'From file');
  assert.equal(tour._text.textContent, 'Body text');
  tour.close();
});

test('a step can prepare its target; Read more opens the manual anchor', async () => {
  let prepared = false;
  const anchors = [];
  const el = target();
  const tour = new ExplorerTour({
    steps: [{ id: 'a', topic: 't', title: 'A', manualAnchor: 'intro', before: () => { prepared = true; }, target: () => (prepared ? el : null) }],
    onReadMore: (anchor) => anchors.push(anchor)
  });
  assert.equal(await tour.start(), true);
  assert.equal(tour._more.hidden, false);
  tour._more.click();
  assert.deepEqual(anchors, ['intro']);
  tour.close();
});

test('no visible step: the tour does not open', async () => {
  const tour = new ExplorerTour({ steps: steps([false, false]) });
  assert.equal(await tour.start(), false);
  assert.equal(tour.isOpen(), false);
});
