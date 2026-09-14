import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawGeometryService } from '../../src/draw/DrawGeometryService.js';
import { DrawController } from '../../src/draw/DrawController.js';

test('draw geometry service accepts legacy-prefixed WKT and preserves the caller contract', () => {
  const service = new DrawGeometryService();
  const geometry = service.parse('pl POLYGON ((0 0, 2 0, 2 2, 0 0))');
  const result = service.serialize(geometry);
  assert.equal(result.type, 'pl');
  assert.match(result.wkt, /^POLYGON/);
});

test('multiple features serialize as legacy multi type through a geometry collection', () => {
  const service = new DrawGeometryService();
  const result = service.serialize({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [3, 4] } }
    ]
  });
  assert.equal(result.type, 'm');
  assert.match(result.wkt, /^GEOMETRYCOLLECTION/);
});

test('rectangle mode converts two simple coordinate pairs into a polygon', () => {
  const service = new DrawGeometryService();
  const geometry = service.parse('10,20 30,40', { mode: 'rectangle' });
  assert.equal(geometry.type, 'Polygon');
  assert.deepEqual(geometry.coordinates[0][0], [10, 20]);
  assert.deepEqual(geometry.coordinates[0][2], [30, 40]);
});

test('draw controller normalizes legacy modes, loads initial WKT and returns the drawing', async () => {
  let drawing = null;
  const engine = {
    async beginDrawing(options) { this.options = options; },
    async setDrawingGeoJson(value) { drawing = value; },
    getDrawingGeoJson() { return drawing; },
    async zoomToDrawing() { return true; },
    async clearDrawing() { drawing = null; },
    async endDrawing() {}
  };
  const controller = new DrawController({ mapEngine: engine });
  const result = await controller.begin({ tool_option: 'rectangle', wkt: 'p POINT (10 20)' });
  assert.equal(engine.options.mode, 'rectangle');
  assert.equal(engine.options.allowMultiple, false);
  assert.equal(result.type, 'p');
  assert.equal(result.wkt, 'POINT (10 20)');
  await controller.clear();
  assert.equal(controller.get(), null);
});
