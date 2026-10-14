import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

installFakeDom();
const { InlineHelp, useHostHelp } = await import('../src/ui/InlineHelp.js');

test('a module in Explorer\'s iframe asks the host to show its manual', () => {
  const requests = [];
  useHostHelp({ openHelp: (request) => requests.push(request) });
  new InlineHelp({ moduleName: 'timeline', baseUrl: 'https://h/bundles/heurist-timeline/' }).open('layers');
  assert.deepEqual(requests, [{
    moduleName: 'timeline', url: 'https://h/bundles/heurist-timeline/timelineUserManualEng.htm', anchor: 'layers'
  }]);
  useHostHelp(null);
});

test('the host shows the manual from the URL the module gave', () => {
  assert.equal(new InlineHelp({ moduleName: 'map', url: 'https://h/m/mapUserManualFre.htm' }).manualUrl(),
    'https://h/m/mapUserManualFre.htm');
  assert.equal(new InlineHelp({ moduleName: 'map', baseUrl: '/b/' }).manualUrl(), '/b/mapUserManualEng.htm');
});
