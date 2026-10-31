import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  checkCmsDocument, cmsInstanceProblem, cmsNodes, compileCmsStyles, isSafeCssValue, parseCmsConfig
} from '../src/site/cmsDocument.js';

// The cases are shared with the server (heurist tests/CmsFormatTest.php): both sides
// must give the same problems and the same CSS (plan 27a §6).
const fixtures = path.resolve('shared/test/fixtures/cms-v4');

for (const file of (await readdir(fixtures)).filter((name) => name.endsWith('.json')).sort()) {
  const fixture = JSON.parse(await readFile(path.join(fixtures, file), 'utf8'));
  test(`cms-v4 ${file}: ${fixture.name}`, () => {
    const text = Object.hasOwn(fixture, 'configText') ? fixture.configText : JSON.stringify(fixture.config ?? {});
    const baseUrl = fixture.baseUrl ?? '';
    const parsed = parseCmsConfig(text);
    const issues = [...parsed.issues,
      ...checkCmsDocument(parsed.config, fixture.html ?? [], fixture.translations ?? {}, baseUrl)];
    assert.deepEqual(issues.map((issue) => `${issue.level}:${issue.code}`).sort(), [...fixture.expect.issues].sort());
    const styles = parsed.config.styles ?? {};
    const { css } = compileCmsStyles(styles.base ?? {}, [styles.nodes ?? {}], baseUrl,
      { kinds: [styles.kinds ?? {}], presets: [styles.presets ?? {}] });
    assert.equal(css, fixture.expect.css ?? '');
  });
}

test('cmsNodes reads hosts, text blocks and controls in document order', () => {
  const nodes = cmsNodes('<div data-h-node="a" data-h-control="tabs"><section data-h-node="b"><p data-h-node=\'c\' data-h-text>'
    + 'x</p></section></div><nav data-h-node="m" data-h-instance="menu1"></nav><!-- <div data-h-node="no"> -->'
    + '<script>var t = "<div data-h-node=\\"no2\\">";</script>');
  assert.deepEqual(nodes.map((node) => node.node), ['a', 'b', 'c', 'm']);
  assert.equal(nodes[0].control, 'tabs');
  assert.equal(nodes[2].text, true);
  assert.equal(nodes[3].instance, 'menu1');
  assert.equal(nodes[3].tag, 'nav');
});

test('instance problems: kinds, types, versions and mount', () => {
  assert.equal(cmsInstanceProblem({ kind: 'module', type: 'map' }), null);
  assert.equal(cmsInstanceProblem({ kind: 'widget', type: 'menu', mount: 'direct' }), null);
  assert.equal(cmsInstanceProblem({ kind: 'widget', type: 'map' })[0], 'unknown_type');
  assert.equal(cmsInstanceProblem({ kind: 'module', type: 'data', configVersion: 5 })[0], 'config_version');
  assert.equal(cmsInstanceProblem({ kind: 'module', type: 'data', mount: 'popup' })[0], 'mount');
});

test('CSS values: escapes, URLs and separators', () => {
  for (const value of ['repeat(3, minmax(0, 1fr))', 'var(--h-color-primary)', '1px solid #ccc', 'url(img/a.png)',
    'url(data:image/png,AAA=)']) assert.equal(isSafeCssValue(value), true, value);
  // a value never has ";" (also not in a data URL): one value, one declaration
  for (const value of ['red; color: blue', 'url(data:image/png;base64,AAA=)', 'expression(alert(1))', '\\65 xpression(1)', 'url(javascript:alert(1))',
    'u\\72l(javascript:x)', 'url(data:text/html,x)', 'a</style>', 'a/* x */']) assert.equal(isSafeCssValue(value), false, value);
});
