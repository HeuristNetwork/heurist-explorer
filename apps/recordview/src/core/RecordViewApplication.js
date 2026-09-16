/**
 * @file RecordViewApplication.js
 * @brief Coordinates single-record loading, selection-following, and rendering.
 *
 * RecordView never owns a DataSource and never runs a search: it only ever
 * fetches the one record it is currently asked to display (`RecordDataProvider#load`
 * issues a single `ids:<id>` query), and it only ever consumes the shared
 * selection — it does not receive DataSource pushes (see `IframeModuleAdapter`).
 *
 * Selection sync is one-way by default: `setSelection()` (the path driven by
 * `SyncEngine` when another module's selection changes) never dispatches this
 * module's own selection-changed event. `navigateToRecord()` is the one
 * deliberate escape hatch, for a future "follow a linked record" interaction
 * inside the rendered content — it both updates the display and echoes the
 * new selection outward, exactly like clicking a record elsewhere would.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import { $HR } from "#shared/ui";
import { normalizeRecordViewConfigurationSettings } from "../ui/config/recordViewConfigurationSchema.js";

const SETTABLE_DEFAULTS = [
  "engine",
  "template",
  "selectionMode",
  "showHeader",
  "headerTitle",
  "emptyMessage",
];

/** Coordinates single-record loading, selection-following, and rendering. */
export class RecordViewApplication extends EventTarget {
  /**
   * @param {object} options Application configuration.
   * @param {object} options.config Normalized Record View configuration; see `recordViewConfig.js`.
   * @param {object} options.recordDataProvider Fetches one fully-resolved record, for the `builtin` engine.
   * @param {object} options.vocabularyProvider Resolves field/record-type display names, for the `builtin` engine.
   * @param {object} options.recordContentProvider Builds the `legacy`/`smarty` renderer URL.
   * @param {object} options.renderer `RecordViewRenderer` instance the application renders into.
   * @param {object} options.host Host adapter.
   */
  constructor({
    config,
    recordDataProvider,
    vocabularyProvider,
    recordContentProvider,
    renderer,
    host,
  }) {
    super();
    this.config = config;
    this.recordDataProvider = recordDataProvider;
    this.vocabularyProvider = vocabularyProvider;
    this.recordContentProvider = recordContentProvider;
    this.renderer = renderer;
    this.host = host;
    this.settings = config.persistedSettings;
    this.selection = normalizeIds(config.selection);
    this.recordId = config.recordId || null;
    // Only ever populated by the `builtin` engine, which fetches the record;
    // `legacy`/`smarty` render an iframe and never see the record's fields.
    this.recordTitle = null;
    this.generation = 0;
    this.abortController = null;
  }

  /** Current render-engine selection (`'builtin'|'legacy'|'smarty'`). */
  get engineName() {
    return this.settings.config.defaults.engine;
  }

  /** Current selection-following policy (`'first'|'last'|'single-only'`). */
  get selectionMode() {
    return this.settings.config.defaults.selectionMode;
  }

  /**
   * Initialize the host, load persisted preferences, and render the initial record.
   *
   * @returns {Promise<RecordViewApplication>} This instance, once initialization completes.
   */
  async initialize() {
    await this.host?.initialize?.({ config: this.config });
    await this._loadInitialPreferences();
    if (this.recordId) {
      await this.#applyRecord(this.recordId);
    } else if (this.selection.length) {
      await this.setSelection(this.selection);
    } else {
      this.renderer.showEmpty(this.#emptyMessage());
    }
    return this;
  }

  /**
   * Load host-persisted settings before the first render, matching heurist-graph's
   * `GraphApplication#_loadInitialPreferences`. Only runs when the bootstrap didn't
   * already embed persisted settings.
   *
   * @private
   * @returns {Promise<void>}
   */
  async _loadInitialPreferences() {
    if (!this.config.loadPreferencesOnInit || typeof this.host?.loadPreferences !== "function") return;
    try {
      const saved = await this.host.loadPreferences();
      if (saved) this.settings = normalizeRecordViewConfigurationSettings(saved);
    } catch (error) {
      this.dispatch("heurist-recordview-error", { error, operation: "load-preferences" });
    }
  }

  /**
   * Apply a new shared selection, choosing the primary record per `selectionMode`.
   *
   * Never dispatches this module's own selection-changed event — this is the
   * passive/follower path driven by `SyncEngine`.
   *
   * @param {Array<number>} ids Shared selection, as pushed by the host.
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  async setSelection(ids) {
    this.selection = normalizeIds(ids);
    if (!this.selection.length) return this.clear();

    const mode = this.selectionMode;
    if (mode === "single-only" && this.selection.length > 1) {
      if (this.recordId == null) {
        this.renderer.setNotice(null);
        this.renderer.showEmpty($HR("multiple_selected_single_only", "Select a single record"));
      } else {
        this.#updateNotice(this.selection.length, { ignored: true });
      }
      return this.getState();
    }

    const picked = mode === "first" ? this.selection[0] : this.selection[this.selection.length - 1];
    this.#updateNotice(this.selection.length, { ignored: false });
    if (picked === this.recordId) return this.getState();
    await this.#applyRecord(picked);
    return this.getState();
  }

  /**
   * Directly display one record, bypassing the selection-array policy.
   *
   * Used for programmatic/standalone use; does not touch `this.selection` and
   * does not dispatch a selection-changed event.
   *
   * @param {number|string} id Record id to display.
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  async setRecord(id) {
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId < 1) return this.clear();
    await this.#applyRecord(recordId);
    return this.getState();
  }

  /**
   * Navigate to a different record the user explicitly followed a link to
   * inside the rendered content. Updates the display like `setRecord()` and
   * additionally echoes the new selection outward — the one deliberate
   * exception to one-way selection sync.
   *
   * @param {number|string} id Record id to navigate to.
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  async navigateToRecord(id) {
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId < 1) return this.getState();
    await this.#applyRecord(recordId);
    this.dispatch("heurist-recordview-selection-changed", { selection: [recordId] });
    this.host?.publishSelection?.([recordId]);
    return this.getState();
  }

  /**
   * Clear the current selection and displayed record.
   *
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  async clear() {
    this.generation += 1;
    this.abortController?.abort("Record View cleared");
    this.selection = [];
    this.recordId = null;
    this.recordTitle = null;
    this.renderer.setNotice(null);
    this.renderer.showEmpty(this.#emptyMessage());
    this.dispatch("heurist-recordview-cleared", {});
    return this.getState();
  }

  /**
   * Merge partial option overrides (engine/template/selectionMode/language/
   * showHeader/headerTitle/emptyMessage) and re-render.
   *
   * @param {object} [options] Partial option overrides.
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  async setOptions(options = {}) {
    const current = this.settings;
    const next = {
      options: {
        ui: {
          ...current.options.ui,
          ...(options.language !== undefined ? { language: options.language } : {}),
        },
        interaction: { ...current.options.interaction },
      },
      config: {
        defaults: {
          ...current.config.defaults,
          ...pickDefined(options, SETTABLE_DEFAULTS),
        },
      },
    };
    return this.applyConfiguration(next);
  }

  /**
   * Apply settings edited in the configuration dialog (or `setOptions`) to the running application.
   *
   * @param {object} value Raw settings value.
   * @returns {Promise<object>} Updated application state; see `getState`.
   */
  async applyConfiguration(value) {
    this.settings = normalizeRecordViewConfigurationSettings(value);
    if (this.recordId) await this.#render(this.recordId);
    else this.renderer.showEmpty(this.#emptyMessage());
    this.dispatch("heurist-recordview-configuration-changed", {
      options: this.settings.options,
      config: this.settings.config,
    });
    return this.getState();
  }

  /**
   * Return the host's optional capability flags.
   *
   * @returns {object} Capability flags, or `{}` when the host declares none.
   */
  getHostCapabilities() {
    return this.host?.getCapabilities?.() || {};
  }

  /**
   * Return the current serialized application state.
   *
   * @returns {object} Current application state.
   */
  getState() {
    return {
      recordId: this.recordId,
      recordTitle: this.recordTitle,
      selection: [...this.selection],
      selectionMode: this.selectionMode,
      engine: this.engineName,
      options: JSON.parse(JSON.stringify(this.settings.options)),
    };
  }

  /**
   * Dispatch a CustomEvent carrying `detail`.
   *
   * @param {string} name Event name.
   * @param {object} detail Event detail payload.
   * @returns {void}
   */
  dispatch(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /**
   * Abort in-flight requests and tear down the renderer and host.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    this.generation += 1;
    this.abortController?.abort("Record View destroyed");
    this.renderer?.destroy?.();
    await this.host?.destroy?.();
  }

  /** Set `this.recordId` and render it. */
  async #applyRecord(id) {
    this.recordId = id;
    await this.#render(id);
  }

  /**
   * Fetch (for `builtin`) or build the frame URL (for `legacy`/`smarty`) and render.
   *
   * @private
   * @param {number} id Record id to render.
   * @returns {Promise<void>}
   */
  async #render(id) {
    const generation = ++this.generation;
    this.abortController?.abort("Record View superseded");
    this.abortController = new AbortController();
    const engine = this.engineName;
    try {
      if (engine === "builtin") {
        const record = await this.recordDataProvider.load({ id, signal: this.abortController.signal });
        if (generation !== this.generation) return;
        if (!record) {
          this.recordTitle = null;
          this.renderer.showEmpty(this.#emptyMessage());
          return;
        }
        const detailIds = Object.keys(record.details || {}).map(Number);
        const recordTypeId = Number(record.rec_RecTypeID) || 0;
        const [fields, recordTypes] = await Promise.all([
          this.vocabularyProvider.getFieldNames(detailIds, { signal: this.abortController.signal }),
          this.vocabularyProvider.getRecordTypeNames([recordTypeId], { signal: this.abortController.signal }),
        ]);
        if (generation !== this.generation) return;
        this.recordTitle = record.rec_Title || recordTypes.get(recordTypeId) || null;
        this.renderer.showBuiltin(record, { fields, recordTypes });
      } else {
        this.recordTitle = null;
        const url = this.recordContentProvider?.buildUrl(id, engine, this.settings.config.defaults.template);
        if (!url) {
          this.renderer.showEmpty($HR("record_viewer_unconfigured", "Record viewer is not configured"));
          return;
        }
        this.renderer.showFrame(url);
      }
      this.dispatch("heurist-recordview-loaded", { recordId: id, title: this.recordTitle });
    } catch (error) {
      if (error?.name === "AbortError") return;
      this.dispatch("heurist-recordview-error", { error, operation: "load" });
    }
  }

  /** Current configured empty-state message. */
  #emptyMessage() {
    return this.settings.config.defaults.emptyMessage;
  }

  /** Show (or hide) the multi-selection notice above the rendered record. */
  #updateNotice(count, { ignored = false } = {}) {
    if (count <= 1) {
      this.renderer.setNotice(null);
      return;
    }
    const text = ignored
      ? $HR("selected_ignored_notice", "{n} selected — showing previous selection")
      : $HR("selected_showing_notice", "{n} selected — showing this record");
    this.renderer.setNotice(text.replace("{n}", String(count)));
  }
}

/** Normalize a value into a de-duplicated array of positive integer IDs. */
function normalizeIds(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

/** Return a copy of `source` containing only the listed keys whose value is not `undefined`. */
function pickDefined(source, keys) {
  const result = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}
