import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function fixture() {
  let dialog;
  const types = { 10:'Person',48:'Events',12:'Places',4:'Organization' };
  const fields = { 240:'Life Events',134:'Location',241:'Place of death' };
  const hWin = { HAPI4:{baseURL:'/heurist/',database:'test'}, HEURIST4:{
    dbs:{ rty:id => types[id], dty:id => fields[id] },
    msg:{ showDialog:(url, options) => { dialog = { url, options }; } },
  } };
  const context = vm.createContext({ window:{hWin}, setTimeout, $:{ widget:() => {}, ui:{selectmenu:{}}, fn:{} } });
  const source = readFileSync(new URL('./fixtures/legacy/utils_ui.txt', import.meta.url), 'utf8');
  vm.runInContext(source, context);
  return { ui:hWin.HEURIST4.ui, dialog:() => dialog };
}
const root = {query:{t:48,'lf:240':[{t:10}]},levels:[{query:{t:12,'lf:134':[{t:48}],'f:133':'10443'}}]};

test('rule labels preserve directions, forks and executable filters', () => {
  const { ui } = fixture();
  const before = JSON.stringify(root);
  const labels = ui.describeExpansionRule(root);
  assert.equal(labels.name, 'Person → Events → Places');
  assert.equal(labels.description, 'Person → Life Events → Events → Location → Places');
  assert.equal(JSON.stringify(root), before);
  const fork = structuredClone(root);
  fork.levels[0].levels = [{query:{t:4,'lt:134':[{t:12}]}},{query:{t:10,'lt:241':[{t:12}]}}];
  const forkLabels = ui.describeExpansionRule(fork);
  assert.equal(forkLabels.name, 'Person → Events → Places ← (Organization, Person)');
  assert.equal(forkLabels.description.split('\n').length, 2);
  assert.match(forkLabels.description, /Places ← Place of death ← Person/);
});

test('dialog keeps Apply/Save result, accepts empty rules, and resolves titlebar cancellation', async () => {
  const { ui, dialog } = fixture();
  const pending = ui.showRulesBuilderDialog([root]);
  assert.match(dialog().url, /allowEmpty=1/);
  const result = { mode:'apply', rules:[] };
  dialog().options.callback(result);
  dialog().options.afterclose();
  assert.equal(await pending, result);
  const cancelled = ui.showRulesBuilderDialog([]);
  dialog().options.afterclose();
  assert.equal(await cancelled, null);
});
