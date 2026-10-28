import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appsRoot = path.resolve("apps");
const appNames = ["explorer", "data", "graph", "map", "timeline", "recordview", "reports", "website"];
// Explorer's `direct` module mode dynamically imports each direct-capable
// application's public direct-bootstrap entry point (architecture.md: "Explorer
// may import only a presentation application's explicit direct-bootstrap entry
// point"). List every app that exposes one here. The website runtime (plan 27a)
// mounts the modules of a page through the same entries; Explorer mounts the
// Website manager through apps/website's direct entry (plan 27b).
const directEntryApps = ["data", "recordview", "reports", "map", "timeline", "graph", "explorer", "website"];
const directEntryHosts = ["explorer", "website"];
// The configuration entry (plan 29): the form JSON, defaults and normalizer of a
// presentation module, without the module itself (configuration dialogs and the test popup).
const configurationEntryApps = ["data", "recordview", "map", "timeline", "graph"];

test("applications do not import sibling applications", async () => {
  for (const appName of appNames) {
    const files = await sourceFiles(path.join(appsRoot, appName, "src"));
    for (const filename of files) {
      const source = await readFile(filename, "utf8");
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith(".")) continue;
        const target = path.resolve(path.dirname(filename), specifier);
        const sibling = appNames.find((name) =>
          target.startsWith(path.join(appsRoot, name, path.sep))
        );
        if (!sibling || sibling === appName) continue;
        const allowedDirectEntry = directEntryHosts.includes(appName) && (
          (directEntryApps.includes(sibling) && target === path.join(appsRoot, sibling, "src", "direct.js"))
          || (configurationEntryApps.includes(sibling) && target === path.join(appsRoot, sibling, "src", "configuration.js")));
        assert.equal(
          allowedDirectEntry,
          true,
          `${path.relative(process.cwd(), filename)} imports apps/${sibling} outside its public direct entry`,
        );
      }
    }
  }
});

test("configuration entries import only the module's configuration files", async () => {
  for (const appName of configurationEntryApps) {
    const filename = path.join(appsRoot, appName, "src", "configuration.js");
    for (const specifier of importSpecifiers(await readFile(filename, "utf8"))) {
      assert.match(specifier, /^\.\/ui\/config\//, `${path.relative(process.cwd(), filename)} imports ${specifier}`);
    }
  }
});

test("shared code does not import applications", async () => {
  for (const filename of await sourceFiles(path.resolve("shared", "src"))) {
    const source = await readFile(filename, "utf8");
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()?['\"][^'\"]*apps\//);
  }
});

test("Explorer's editor mode does not load the workspace (plan 21 §2.4)", async () => {
  const explorerSrc = path.join(appsRoot, "explorer", "src");
  // the workspace: application, layout, authoring dock, Query Source panel, its start
  const forbidden = [
    "core/ExplorerApplication.js",
    "core/LayoutManager.js",
    "initHeuristExplorer.js",
    "ui/ExplorerAuthoringDock.js",
    "widgets/query-source/QuerySourcePanel.js",
  ].map((file) => path.join(explorerSrc, file));
  const seen = new Set();
  const queue = await sourceFiles(path.join(explorerSrc, "editor"));
  while (queue.length) {
    const filename = queue.shift();
    if (seen.has(filename)) continue;
    seen.add(filename);
    assert.equal(forbidden.includes(filename), false,
      `the editor mode reaches ${path.relative(process.cwd(), filename)}`);
    const source = await readFile(filename, "utf8");
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith(".") || !/\.(?:js|mjs)$/.test(specifier)) continue;
      queue.push(path.resolve(path.dirname(filename), specifier));
    }
  }
  assert.ok(seen.size > 5, `${seen.size} files reached from apps/explorer/src/editor`);
});

test("counts, values and bounds go through /{domain}/aggregate (plan 20 §9)", async () => {
  // search keeps detail=records|ids; the other detail values were removed from the server
  const removed = /\bdetail\s*:\s*["'](?:count|rectypes|values|minmax|ranges)["']|[?&]detail=(?:count|rectypes|values|minmax|ranges)\b/;
  const roots = [path.resolve("shared", "src"), ...appNames.map((name) => path.join(appsRoot, name, "src"))];
  for (const root of roots) {
    for (const filename of await sourceFiles(root)) {
      const source = await readFile(filename, "utf8");
      assert.doesNotMatch(source, removed,
        `${path.relative(process.cwd(), filename)} sends a removed detail value; use shared/src/data/aggregate.js`);
    }
  }
});

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceFiles(filename)));
    else if (/\.(?:js|mjs)$/.test(entry.name)) result.push(filename);
  }
  return result;
}

function importSpecifiers(source) {
  return [...source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)]
    .map((match) => match[1]);
}
