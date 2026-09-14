/**
 * @file HeuristDataConfigurationApi.js
 * @brief Public API for configuration-editor-only operation.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { DataConfigurationDialog } from "../ui/config/DataConfigurationDialog.js";
import { createDataConfigurationDefaults } from "../ui/config/dataConfigurationDefaults.js";
import {
  normalizeDataConfigurationSettings,
  serializeDataConfigurationSettings,
} from "../ui/config/dataConfigurationSchema.js";

/** Exposes configuration editing without starting the data application. */
export class HeuristDataConfigurationApi {
  constructor({ providers = {}, hostBridge = null } = {}) {
    this.providers = providers;
    this.hostBridge = hostBridge;
    this.configurationDialog = null;
  }
  /** Resolve when the configuration API is ready for use. */
  ready() {
    return Promise.resolve(this);
  }
  /** Open the configuration editor dialog. */
  openConfigurationDialog(options = {}) {
    this.configurationDialog?.close?.();
    this.configurationDialog = new DataConfigurationDialog({
      ...options,
      datasetListProvider:
        options.datasetListProvider || this.providers.datasetList,
      filterListProvider:
        options.filterListProvider || this.providers.filterList,
      reportTemplateProvider:
        options.reportTemplateProvider || this.providers.reportTemplates,
      widgetListProvider:
        options.widgetListProvider || this.providers.widgetList,
    }).open();
    return this.configurationDialog;
  }
  /** Normalize a persisted configuration value. */
  normalizeConfiguration(value = {}) {
    return normalizeDataConfigurationSettings(value);
  }
  /** Serialize a configuration value for persistence. */
  serializeConfiguration(value = {}) {
    return serializeDataConfigurationSettings(value);
  }
  /** Return a fresh configuration-defaults object. */
  getConfigurationDefaults() {
    return createDataConfigurationDefaults();
  }
  destroy() {
    this.configurationDialog?.close?.();
    this.configurationDialog = null;
  }
}
