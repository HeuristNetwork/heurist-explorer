import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appsRoot = path.resolve("apps");
const appNames = ["explorer", "data", "graph", "map", "timeline", "recordview"];

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
        const allowedDirectEntry = appName === "explorer" && sibling === "data"
          && target === path.join(appsRoot, "data", "src", "direct.js");
        assert.equal(
          allowedDirectEntry,
          true,
          `${path.relative(process.cwd(), filename)} imports apps/${sibling} outside its public direct entry`,
        );
      }
    }
  }
});

test("shared code does not import applications", async () => {
  for (const filename of await sourceFiles(path.resolve("shared", "src"))) {
    const source = await readFile(filename, "utf8");
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()?['\"][^'\"]*apps\//);
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
