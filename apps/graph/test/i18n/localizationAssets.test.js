/**
 * @file localizationAssets.test.js
 * @brief Tests localization asset completeness.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseLocale } from "#shared/ui";

const assets = fileURLToPath(
  new URL("../../public/assets/localization/", import.meta.url),
);

test("English and French module dictionaries contain the same non-empty resources", async () => {
  const [english, french] = await Promise.all([
    readFile(`${assets}localization_eng.txt`, "utf8").then(parseLocale),
    readFile(`${assets}localization_fre.txt`, "utf8").then(parseLocale),
  ]);
  assert.deepEqual(Object.keys(french).sort(), Object.keys(english).sort());
  assert.equal(Object.values(english).every(Boolean), true);
  assert.equal(Object.values(french).every(Boolean), true);
});

test("every direct $HR string in runtime source is present in module dictionaries", async () => {
  const english = parseLocale(
    await readFile(`${assets}localization_eng.txt`, "utf8"),
  );
  const sourceFiles = [
    "../../src/ui/config/GraphConfigurationDialog.js",
    "../../src/ui/GraphLegend.js",
  ];
  const sources = await Promise.all(
    sourceFiles.map((file) =>
      readFile(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
    ),
  );
  const keys = sources.flatMap((source) =>
    [...source.matchAll(/\$HR\('([^']+)'/g)].map((match) => match[1]),
  );
  assert.deepEqual(
    keys.filter((key) => !(key in english)),
    [],
  );
});
