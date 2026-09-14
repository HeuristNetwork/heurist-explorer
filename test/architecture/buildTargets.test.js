import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const targets = ["explorer", "data", "graph", "map", "timeline"];

test("each application owns its entry, style, tests and localization", async () => {
  for (const target of targets) {
    const root = path.resolve("apps", target);
    for (const relativePath of [
      "index.html",
      "src/main.js",
      "src/style.css",
      "test",
      "public/assets/localization/localization_eng.txt",
      "public/assets/localization/localization_fre.txt",
    ]) {
      await assert.doesNotReject(access(path.join(root, relativePath)));
    }
  }
});

test("root package exposes independent build and test commands", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  for (const target of targets) {
    assert.equal(packageJson.scripts[`build:${target}`], `vite build --mode ${target}`);
    assert.ok(packageJson.scripts[`test:${target}`]);
  }
});

test("build-all launches Vite through Node on every platform", async () => {
  const source = await readFile("scripts/build-all.mjs", "utf8");
  assert.match(source, /process\.execPath/);
  assert.match(source, /node_modules\/vite\/bin\/vite\.js/);
  assert.doesNotMatch(source, /npm\.cmd/);
});
