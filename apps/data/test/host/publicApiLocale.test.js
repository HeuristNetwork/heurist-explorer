/**
 * @file publicApiLocale.test.js
 * @brief Tests public API locale behavior.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { HeuristDataPublicApi } from "../../src/host/HeuristDataPublicApi.js";

test("publish mode materializes the active runtime language when settings use auto", () => {
  let dialogOptions;
  const application = {
    config: {
      language: "fre",
      persistedSettings: { options: { ui: { language: "auto" } } },
    },
    host: {},
    getState: () => ({}),
    addEventListener() {},
    removeEventListener() {},
  };
  const api = new HeuristDataPublicApi(application);
  api.setConfigurationDialogFactory((options) => {
    dialogOptions = options;
    return {};
  });
  api.openPublishDialog();
  assert.equal(dialogOptions.value.options.ui.language, "fre");
  assert.equal(
    application.config.persistedSettings.options.ui.language,
    "auto",
  );
});
