import test from "node:test";
import assert from "node:assert/strict";
import { RecordContentProvider } from "../../src/recordview/RecordContentProvider.js";
import { buildReportRenderUrl } from "../../src/data/reportRenderUrl.js";

test("RecordContentProvider batches lazy Smarty presentation requests", async () => {
  const urls = [];
  const provider = new RecordContentProvider({
    baseUrl: "https://example.test/heurist/",
    database: "demo",
    fetchImpl: async (url) => {
      urls.push(String(url));
      return { ok: true, text: async () => "<p>record</p>" };
    },
  });
  const result = await provider.load({
    records: [{ rec_ID: 3 }, { rec_ID: 4 }],
    template: "cards.tpl",
  });
  assert.equal(result.get(3), "<p>record</p>");
  assert.equal(urls.length, 2);
  assert.equal(urls[0], "https://example.test/heurist/api/demo/reports/cards.tpl/render?rec=3");
});

test("RecordContentProvider preserves successful content when one request fails", async () => {
  const provider = new RecordContentProvider({
    baseUrl: "https://example.test/heurist/",
    database: "demo",
    fetchImpl: async (url) => {
      if (String(url).includes("rec=4")) {
        throw new Error("temporary failure");
      }
      return { ok: true, text: async () => "<p>record 3</p>" };
    },
  });
  const result = await provider.load({
    records: [{ rec_ID: 3 }, { rec_ID: 4 }],
    template: "cards.tpl",
  });
  assert.deepEqual([...result], [[3, "<p>record 3</p>"]]);
});

test("RecordContentProvider uses the standard renderer for 'standard'", () => {
  const provider = new RecordContentProvider({ baseUrl: "https://example.test/heurist", database: "demo" });
  assert.equal(String(provider.buildUrl(7, "standard")),
    "https://example.test/heurist/viewers/record/renderRecordData.php?recID=7&db=demo");
});

test("buildReportRenderUrl adds .tpl, encodes the name and keeps def/ templates on the legacy URL", () => {
  assert.equal(String(buildReportRenderUrl("https://x.test/h/", "db 1", "Basic (initial)", 5)),
    "https://x.test/h/api/db%201/reports/Basic%20(initial).tpl/render?rec=5");
  const legacy = buildReportRenderUrl("https://x.test/h/", "demo", "def/cards", 5);
  assert.equal(legacy.searchParams.get("template"), "def/cards");
  assert.equal(legacy.searchParams.get("q"), "ids:5");
});
