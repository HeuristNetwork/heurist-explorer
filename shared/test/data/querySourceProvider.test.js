/**
 * @file querySourceProvider.test.js
 * @brief Tests the single Query Source fetch contract.
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { QuerySourceProvider } from "../../src/data/QuerySourceProvider.js";

test("QuerySourceProvider uses the unified record-presentation endpoint", async () => {
  let request;
  const provider = new QuerySourceProvider({
    apiClient: {
      get: async (path, options) => {
        request = { path, options };
        return { id: 12 };
      },
    },
  });
  await provider.load(12);
  assert.equal(request.path, "/records/querysource/12");
});

test("QuerySourceProvider unwraps a {querySource} envelope, falling back to the raw response", async () => {
  const wrapped = new QuerySourceProvider({
    apiClient: { get: async () => ({ querySource: { id: 12 } }) },
  });
  assert.deepEqual(await wrapped.load(12), { id: 12 });

  const unwrapped = new QuerySourceProvider({
    apiClient: { get: async () => ({ id: 12 }) },
  });
  assert.deepEqual(await unwrapped.load(12), { id: 12 });
});

test("QuerySourceProvider rejects a non-positive-integer ID", async () => {
  const provider = new QuerySourceProvider({ apiClient: { get: async () => ({}) } });
  await assert.rejects(() => provider.load("invalid"), { name: "TypeError" });
  await assert.rejects(() => provider.load(0), { name: "TypeError" });
});
