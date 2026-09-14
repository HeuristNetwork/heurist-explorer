import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appsRoot = path.resolve("apps");
const appNames = ["explorer", "data", "graph", "map", "timeline"];

test("applications do not import sibling applications", async () => {
  for (const appName of appNames) {
    const files = await sourceFiles(path.join(appsRoot, appName, "src"));
    for (const filename of files) {
      const source = await readFile(filename, "utf8");
      for (const sibling of appNames) {
        if (sibling === appName) continue;
        assert.doesNotMatch(
          source,
          new RegExp(`(?:from\\s+|import\\s*\\()?['\"](?:[^'\"]*/)?apps/${sibling}/`),
          `${path.relative(process.cwd(), filename)} imports apps/${sibling}`,
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

