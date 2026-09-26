/**
 * @file HFilterFormDesigner.js
 * @brief Layout editor for parameters defined in HFilterBuilder.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '#shared/widgets';
import { HFilterForm, defaultLayout, FILTER_FORM_LIST_DEFAULTS } from '#shared/widgets/filter/HFilterForm.js';
import flatpickr from 'flatpickr';
import './HFilterFormDesigner.css';

const LIST_MODES = ['select', 'radio', 'checkbox'];
/** Choices of the form-wide list size (radio/checkbox items shown before the "more" picker). */
const LIST_SIZES = [5, 10, 20, 50];
/** Header predicates whose values can be listed (detail=values). */
const TEXT_LIST_PREDICATES = new Set(['tag', 'access']);
/** Presentation choices of one input: value → label. */
const PRESENTATIONS = {
  direct: 'direct',
  slider: 'slider',
  select: 'select',
  'list-column': 'list (column)',
  'list-inline': 'list (wrapped)'
};
const DATE_GROUPS = ['month', 'year', 'decade', 'century'];
const DEFAULT_DATE_GROUP = 'year';
const MAX_NUMBER_RANGES = 20;
const DEFAULT_NUMBER_RANGES = 10;

/**
 * Whether a parameter is a text value that may be presented as a list of the
 * field's values (plan §3 B): a text field, or a listable header property.
 * Owner/creator/bookmarked-by always use the users/groups picker instead.
 *
 * @param {object} parameter Parameter description.
 * @returns {boolean} True for a text parameter with a listable field.
 */
function isTextList(parameter) {
  return parameter?.type === 'text' && !parameter.range
    && (Boolean(parameter.fieldId) || TEXT_LIST_PREDICATES.has(parameter.predicate));
}

/** @returns {boolean} True for a date or numeric parameter. */
function isScalar(parameter) {
  return parameter?.type === 'date' || parameter?.type === 'number';
}

/** @returns {string[]} Presentation choices offered for a parameter (empty: none). */
function presentationsFor(parameter) {
  if (parameter?.type === 'enum') return ['select', 'list-column', 'list-inline'];
  if (isTextList(parameter)) return ['direct', 'select', 'list-column', 'list-inline'];
  if (isScalar(parameter)) {
    // select/list: ranges of the field (detail=ranges); a picked range is searched as that range
    return ['direct', ...(parameter.range ? ['slider'] : []), 'select', 'list-column', 'list-inline'];
  }
  return [];
}

/**
 * The presentation a layout child describes.
 *
 * @param {object} config Layout child.
 * @param {object} parameter Parameter description.
 * @returns {string} A `PRESENTATIONS` key.
 */
function presentationOf(config, parameter) {
  if (config.widget?.control === 'slider') return 'slider';
  if (config.mode === 'radio' || config.mode === 'checkbox') {
    return config.orientation === 'inline' ? 'list-inline' : 'list-column';
  }
  if (config.mode === 'select' || config.mode === 'direct') return config.mode;
  return parameter.type === 'enum' ? 'select' : 'direct';
}

/** @returns {boolean} True when the presentation picks from a value list. */
function isListPresentation(presentation) {
  return presentation === 'select' || presentation.startsWith('list-');
}

/** Whether a layout child shows the date grouping / number of ranges row. */
function hasGrouping(config, parameter) {
  return isScalar(parameter) && isListPresentation(presentationOf(config, parameter));
}

/**
 * Write a presentation (and multiple selection) into a layout child.
 *
 * @param {object} config Layout child (mutated).
 * @param {object} parameter Parameter description.
 * @param {string} presentation A `PRESENTATIONS` key.
 * @param {boolean} multiple Multiple selection (select and list only).
 * @returns {void}
 */
function applyPresentation(config, parameter, presentation, multiple) {
  if (parameter.range) {
    config.widget = { ...(config.widget || {}), type: 'range', control: presentation === 'slider' ? 'slider' : 'direct' };
  }
  delete config.orientation;
  delete config.multiple;
  if (presentation === 'direct' || presentation === 'slider') {
    config.mode = 'direct';
    return;
  }
  if (presentation === 'select') config.mode = 'select';
  else {
    config.mode = multiple ? 'checkbox' : 'radio';
    config.orientation = presentation === 'list-inline' ? 'inline' : 'column';
  }
  if (multiple) config.multiple = true;
}

/** Edits presentation of a fixed set of filter parameters. */
export class HFilterFormDesigner extends HBaseWidget {
  /**
   * Attach parameters and an optional existing layout.
   *
   * @param {HTMLElement} container Editor host.
   * @param {object} options Designer options.
   * @returns {HFilterFormDesigner} This designer.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.parameters = options.parameters || {};
    this.layout = structuredClone(options.layout || defaultLayout(this.parameters));
    this.query = options.query || [];
    this.dbdefs = options.dbdefs;
    this.apiClient = options.apiClient || null;
    this.selectExtent = options.selectExtent;
    this.preview = null;
    this._previewRevision = 0;
    this._previewScheduled = false;
    // sliders whose "auto" was unchecked while their bounds are still empty
    this._manualBounds = new Set();

    return this;
  }

  /**
   * Render order, labels and widget presentation choices.
   *
   * @returns {HFilterFormDesigner} This designer.
   */
  render() {
    if (!this.container) throw new Error('HFilterFormDesigner must be attached before render');
    this.container.className = 'h-widget h-filter-form-designer';
    this.container.replaceChildren();
    this._boundPickers = [];
    this.layout.settings ||= {};
    const settings = this.layout.settings;

    const orientation = this._select(['vertical', 'horizontal'], settings.orientation || 'vertical');

    const showPreview = document.createElement('input');
    showPreview.type = 'checkbox';
    showPreview.className = 'h-checkbox';
    showPreview.checked = true;
    const previewToggle = this._label('Show Form Preview', showPreview);

    const skipEmpty = this._settingCheckbox('skipEmptySearch');
    const showHierarchy = this._settingCheckbox('showHierarchy');
    const accordion = this._settingCheckbox('accordion');

    // form-wide size of explicit radio/checkbox lists; longer lists get a picker below (V14)
    const listSize = settings.listThreshold || FILTER_FORM_LIST_DEFAULTS.listThreshold;
    const listThreshold = this._select([...new Set([...LIST_SIZES, listSize])].sort((a, b) => a - b)
      .map(String), String(listSize));
    listThreshold.classList.add('h-filter-form-designer-threshold');
    listThreshold.title = 'Radio and checkbox lists longer than this show the rest in a picker';
    this.listen(listThreshold, 'change', () => {
      settings.listThreshold = Number(listThreshold.value);
      this._schedulePreview();
    });

    const countsAlign = this._radioGroup('countsAlign', [['right', 'right'], ['label', 'sticked to label']]);
    const countsMode = this._radioGroup('countsMode', [['badge', 'badge'], ['brackets', 'brackets'], ['none', 'none']]);

    const lists = document.createElement('fieldset');
    lists.className = 'h-filter-form-designer-lists';
    const legend = document.createElement('legend');
    legend.className = 'h-i18n';
    legend.textContent = 'Lists';
    const accordionLabel = this._label('Accordion view', accordion);
    accordionLabel.title = 'Each list collapses by a click on its label';
    // the two counts options wrap together
    const counts = document.createElement('div');
    counts.className = 'h-filter-form-designer-counts';
    counts.append(this._label('Counts alignment', countsAlign), this._label('Show counts as', countsMode));
    lists.append(legend, this._label('Size', listThreshold), accordionLabel, counts);

    const toolbar = document.createElement('div');
    toolbar.className = 'h-filter-form-designer-toolbar';
    const general = document.createElement('div');
    general.className = 'h-filter-form-designer-general';
    general.append(this._label('Orientation', orientation),
      this._label("Don't search when the form is empty", skipEmpty),
      this._label('Show entity hierarchy above field label', showHierarchy),
      previewToggle);
    toolbar.append(general, lists);
    this.container.append(toolbar);

    this.workspace = document.createElement('div');
    this.workspace.className = 'h-filter-form-designer-workspace';
    this.rows = document.createElement('div');
    this.rows.className = 'h-filter-form-designer-rows';

    this.previewPane = document.createElement('section');
    this.previewPane.className = 'h-filter-form-designer-preview-pane';
    const previewTitle = document.createElement('h3');
    previewTitle.className = 'h-filter-form-designer-preview-title h-i18n';
    previewTitle.textContent = 'Filter Form preview';
    this.previewHost = document.createElement('div');
    this.previewHost.className = 'h-filter-form-designer-preview';
    this.previewPane.append(previewTitle, this.previewHost);
    this.workspace.append(this.rows, this.previewPane);
    this.container.append(this.workspace);

    // floating jumps between the field list and a preview wrapped below it
    const jumps = document.createElement('div');
    jumps.className = 'h-filter-form-designer-jumps';
    this.jumpUp = this._jumpButton('↑', 'Scroll to top',
      () => scrollParent(this.container)?.scrollTo({ top: 0, behavior: 'smooth' }));
    this.jumpDown = this._jumpButton('↓', 'Scroll to Filter Form preview',
      () => this.previewPane.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    jumps.append(this.jumpUp, this.jumpDown);
    this.container.append(jumps);
    // element scroll events do not bubble: capture them at the document
    this.listen(document, 'scroll', (event) => {
      if (event.target?.contains?.(this.container)) this._scheduleJumpSync();
    }, true);
    if (typeof window !== 'undefined') this.listen(window, 'resize', () => this._scheduleJumpSync());

    const applyWorkspaceOrientation = () => {
      const vertical = orientation.value === 'vertical';
      this.workspace.classList.toggle('is-preview-side', vertical);
      this.workspace.classList.toggle('is-preview-below', !vertical);
      this._scheduleJumpSync();
    };
    applyWorkspaceOrientation();
    this.listen(orientation, 'change', () => {
      settings.orientation = orientation.value;
      applyWorkspaceOrientation();
      this._schedulePreview();
    });
    this.listen(showPreview, 'change', () => {
      this.previewPane.hidden = !showPreview.checked;
      if (showPreview.checked) this._schedulePreview();
      this._scheduleJumpSync();
    });
    this._renderRows();
    this.state = 'rendered';
    return this;
  }

  /** @returns {object} Edited, detached layout definition. */
  getLayout() {
    for (const config of this.layout.groups.flatMap((group) => group.children || [])) {
      const id = config.input;
      if (config.widget?.control !== 'slider') continue;
      const { min, max } = config.widget;
      // no bounds: "auto", the Filter Form requests the field's bounds (detail=minmax)
      if (isBlank(min) && isBlank(max)) continue;
      const type = this.parameters[id]?.type;
      const valid = type === 'date'
        ? /^\d{4}-\d{2}-\d{2}$/.test(min || '') && /^\d{4}-\d{2}-\d{2}$/.test(max || '') && min < max
        : min !== '' && max !== '' && Number.isFinite(Number(min)) && Number.isFinite(Number(max))
          && Number(min) < Number(max);
      if (!valid) throw new Error(`Slider for ${id} requires both bounds (minimum below maximum), or auto`);
    }

    const layout = structuredClone(this.layout);
    for (const child of layout.groups.flatMap((group) => group.children || [])) {
      const parameter = this.parameters[child.input];
      if (child.label === parameter?.label) delete child.label;
      if (isTextList(parameter)) {
        // text: direct input is the default; a list mode picks exact values (V12).
        // Tag/visibility values are IDs/keywords the predicate already matches exactly.
        if (LIST_MODES.includes(child.mode)) {
          if (parameter.fieldId) child.exact = true;
          else delete child.exact;
        } else { delete child.mode; delete child.exact; delete child.orientation; delete child.multiple; }
      } else if (isScalar(parameter)) {
        if (!LIST_MODES.includes(child.mode)) {
          delete child.mode; delete child.orientation; delete child.multiple;
        }
      } else if (child.mode === 'select') delete child.mode;
      if (hasGrouping(child, parameter ?? {})) {
        if (parameter.type === 'date') child.groupBy = DATE_GROUPS.includes(child.groupBy) ? child.groupBy : DEFAULT_DATE_GROUP;
        else child.ranges = clampRanges(child.ranges);
      } else { delete child.groupBy; delete child.ranges; }
      if (child.facets !== true) delete child.facets;
      if (child.orientation === 'column') delete child.orientation;
      if (child.multiple === false) delete child.multiple;
      if (child.widget?.control === 'direct') delete child.widget;
      for (const bound of ['min', 'max']) if (child.widget && isBlank(child.widget[bound])) delete child.widget[bound];
      if (!String(child.help ?? '').trim()) delete child.help;
    }
    const settings = layout.settings || {};
    if (settings.orientation === 'vertical') delete settings.orientation;
    for (const flag of ['skipEmptySearch', 'showHierarchy', 'accordion']) if (!settings[flag]) delete settings[flag];
    for (const [key, value] of Object.entries(FILTER_FORM_LIST_DEFAULTS)) {
      if ((settings[key] || value) === value) delete settings[key];
    }
    if (Object.keys(settings).length) layout.settings = settings;
    else delete layout.settings;
    return layout;
  }

  /** Render one editable item per available parameter. */
  _renderRows() {
    for (const picker of this._boundPickers || []) picker.destroy();
    this._boundPickers = [];
    this.rows.replaceChildren();
    const group = this.layout.groups?.[0];
    if (!group) throw new Error('Filter form layout requires a root group');
    const companionInputs = new Set(Object.values(this.parameters)
      .map((parameter) => parameter.endInput).filter(Boolean));
    group.children = group.children.filter((child) => !companionInputs.has(child.input));
    const ordered = group.children.map((child) => child.input);
    for (const id of Object.keys(this.parameters)) {
      if (!companionInputs.has(id) && !ordered.includes(id)) ordered.push(id);
    }

    for (const id of ordered) {
      const parameter = this.parameters[id];
      if (!parameter) continue;
      const config = group.children.find((child) => child.input === id) || { input: id };
      this.rows.append(this._renderItem(id, parameter, config, group));
    }
    this._schedulePreview();
  }

  /**
   * One bordered item, a grid whose lines align on the label: visibility and
   * label; presentation with its options (multiple, facets, slider bounds,
   * grouping); help text; the read-only field name. Lines wrap as needed.
   *
   * @returns {HTMLElement} The item.
   */
  _renderItem(id, parameter, config, group) {
    const row = document.createElement('div');
    row.className = 'h-filter-form-designer-row';
    row.dataset.input = id;
    const drag = document.createElement('span');
    drag.className = 'h-filter-form-designer-drag';
    drag.textContent = '⠿';
    drag.title = 'Drag to reorder';
    drag.setAttribute('aria-label', 'Drag to reorder');
    this.listen(drag, 'dragstart', (event) => {
      this._draggedInput = id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      row.classList.add('is-dragging');
    });
    this.listen(drag, 'dragend', () => {
      this._draggedInput = null;
      row.classList.remove('is-dragging');
    });
    this.listen(row, 'dragover', (event) => {
      if (!this._draggedInput || this._draggedInput === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    this.listen(row, 'drop', (event) => {
      event.preventDefault();
      this._moveBefore(this._draggedInput, id);
    });
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = group.children.some((child) => child.input === id);
    drag.draggable = enabled.checked;
    row.classList.toggle('is-hidden-input', !enabled.checked);
    enabled.setAttribute('aria-label', `Show ${id}`);
    enabled.title = 'Show this input in the Filter Form';
    this.listen(enabled, 'change', () => {
      group.children = group.children.filter((child) => child.input !== id);
      if (enabled.checked) group.children.push(config);
      this._renderRows();
    });

    // 1. visibility and label
    const label = document.createElement('input');
    label.className = 'h-input h-filter-form-designer-label';
    label.value = config.label || parameter.label || id;
    label.setAttribute('aria-label', `Label for ${id}`);
    this.listen(label, 'input', () => { config.label = label.value; this._schedulePreview(); });
    row.append(drag, enabled, this._line('h-filter-form-designer-main', label));

    // 2. presentation and the options it depends on
    const options = this._line('h-filter-form-designer-options');
    const presentations = presentationsFor(parameter);
    if (presentations.length) {
      const current = presentationOf(config, parameter);
      const presentation = this._select(presentations, presentations.includes(current) ? current : presentations[0], PRESENTATIONS);
      presentation.classList.add('h-filter-form-designer-presentation');
      presentation.setAttribute('aria-label', `Presentation of ${id}`);
      const multiple = document.createElement('input');
      multiple.type = 'checkbox';
      multiple.className = 'h-checkbox';
      multiple.checked = config.multiple === true || config.mode === 'checkbox';
      const multipleLabel = this._label('multi selection', multiple);
      multipleLabel.hidden = !isListPresentation(presentation.value);
      // a change of presentation may add or remove the slider bounds and grouping
      const update = () => {
        applyPresentation(config, parameter, presentation.value, multiple.checked);
        this._renderRows();
      };
      this.listen(presentation, 'change', update);
      this.listen(multiple, 'change', update);
      options.append(presentation, multipleLabel);
    }

    if (parameter.type === 'enum') {
      // facets: list only the terms that occur in the result, with counts
      const facets = document.createElement('input');
      facets.type = 'checkbox';
      facets.className = 'h-checkbox';
      facets.checked = config.facets === true;
      facets.disabled = !this.apiClient;
      this.listen(facets, 'change', () => { config.facets = facets.checked; this._schedulePreview(); });
      const facetsLabel = this._label('Facets', facets);
      facetsLabel.title = 'Show only values present in the result, with counts';
      options.append(facetsLabel);
    }

    if (config.widget?.control === 'slider' && parameter.range) {
      // auto: no bounds stored; the Filter Form asks the server for the field's range
      const auto = document.createElement('input');
      auto.type = 'checkbox';
      auto.className = 'h-checkbox';
      auto.checked = !this._manualBounds.has(id) && isBlank(config.widget.min) && isBlank(config.widget.max);
      const autoLabel = this._label('auto', auto);
      autoLabel.title = 'Take minimum and maximum from the values of the field';
      const bounds = ['min', 'max'].map((bound) => this._sliderBound(id, parameter, config, bound));
      for (const input of bounds) input.hidden = auto.checked;
      this.listen(auto, 'change', () => {
        if (auto.checked) {
          this._manualBounds.delete(id);
          delete config.widget.min;
          delete config.widget.max;
          for (const input of bounds) input.value = '';
        } else this._manualBounds.add(id);
        for (const input of bounds) input.hidden = auto.checked;
        this._schedulePreview();
      });
      options.append(autoLabel, ...bounds);
    }

    // grouping of a date or numeric range picked from a list
    if (hasGrouping(config, parameter)) {
      if (parameter.type === 'date') {
        config.groupBy = DATE_GROUPS.includes(config.groupBy) ? config.groupBy : DEFAULT_DATE_GROUP;
        const groupBy = this._select(DATE_GROUPS, config.groupBy);
        groupBy.setAttribute('aria-label', `Group ${id} by`);
        this.listen(groupBy, 'change', () => { config.groupBy = groupBy.value; this._schedulePreview(); });
        options.append(this._label('Group by', groupBy));
      } else {
        config.ranges = clampRanges(config.ranges);
        const ranges = document.createElement('input');
        ranges.type = 'number';
        ranges.min = '1';
        ranges.max = String(MAX_NUMBER_RANGES);
        ranges.className = 'h-input h-filter-form-designer-ranges';
        ranges.value = String(config.ranges);
        ranges.setAttribute('aria-label', `Number of ranges for ${id}`);
        this.listen(ranges, 'change', () => {
          config.ranges = clampRanges(ranges.value);
          ranges.value = String(config.ranges);
          this._schedulePreview();
        });
        options.append(this._label('Number of ranges', ranges));
      }
    }
    if (options.children.length) row.append(options);

    // 3. help text
    const help = document.createElement('input');
    help.className = 'h-input h-filter-form-designer-help';
    help.value = config.help || '';
    help.placeholder = 'Help text';
    help.setAttribute('aria-label', `Help text for ${id}`);
    this.listen(help, 'input', () => { config.help = help.value; this._schedulePreview(); });
    row.append(this._line('h-filter-form-designer-help-line', help));

    // 4. the field this input edits (read-only)
    const name = document.createElement('div');
    name.className = 'h-filter-form-designer-name';
    name.textContent = parameter.pathLabel || parameter.label || id;
    name.title = id;
    row.append(name);
    return row;
  }

  /** @returns {HTMLInputElement} A slider bound input (min or max). */
  _sliderBound(id, parameter, config, bound) {
    const input = document.createElement('input');
    input.className = 'h-input h-filter-form-designer-bound';
    input.type = parameter.type === 'number' ? 'number' : 'text';
    input.placeholder = bound;
    input.setAttribute('aria-label', `${bound} for ${id}`);
    input.value = config.widget?.[bound] ?? '';
    this.listen(input, 'change', () => {
      config.widget = { ...(config.widget || {}), type: 'range', control: 'slider' };
      config.widget[bound] = input.value || undefined;
      this._schedulePreview();
    });
    if (parameter.type === 'date') {
      this._boundPickers.push(flatpickr(input, {
        dateFormat: 'Y-m-d',
        allowInput: true,
        onOpen: (_dates, _text, picker) => positionDesignerCalendar(input, picker),
        onChange: () => input.dispatchEvent(new Event('change', { bubbles: true }))
      }));
    }
    return input;
  }

  /** Schedule one live preview refresh after the current designer update. */
  _schedulePreview() {
    this._previewRevision++;
    if (this._previewScheduled || !this.previewHost) return;
    this._previewScheduled = true;
    queueMicrotask(() => void this._refreshPreview());
  }

  /** Rebuild the runtime Filter Form preview from the latest layout. */
  async _refreshPreview() {
    const revision = this._previewRevision;
    this._previewScheduled = false;
    const previous = this.preview;
    this.preview = null;
    if (previous) await previous.destroy();
    if (revision !== this._previewRevision) {
      this._schedulePreview();
      return;
    }
    const preview = new HFilterForm();
    preview.attach(this.previewHost, {
      definition: { query: this.query, filterForm: this._previewLayout() },
      dbdefs: this.dbdefs,
      apiClient: this.apiClient,
      selectExtent: this.selectExtent,
      preview: true
    }).render();
    this.preview = preview;
    this._scheduleJumpSync();
  }

  /** @returns {object} Working layout with the `exact` flags getLayout() would write. */
  _previewLayout() {
    const layout = structuredClone(this.layout);
    for (const child of layout.groups.flatMap((group) => group.children || [])) {
      const parameter = this.parameters[child.input];
      if (isTextList(parameter)) child.exact = Boolean(parameter.fieldId) && LIST_MODES.includes(child.mode);
    }
    return layout;
  }

  /** Update the jump button once per frame after scrolling or a layout change. */
  _scheduleJumpSync() {
    if (this._jumpSyncPending || !this.jumpUp) return;
    this._jumpSyncPending = true;
    const frame = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
    frame(() => {
      this._jumpSyncPending = false;
      if (this.state !== 'destroyed') this._syncJump();
    });
  }

  /**
   * While the preview is wrapped below the fields and the content scrolls:
   * "up" shows once the top of the field list is scrolled out of view; "down"
   * shows while the preview can still be scrolled up to the top.
   */
  _syncJump() {
    const scroller = scrollParent(this.container);
    const pane = this.previewPane;
    const stacked = pane && !pane.hidden
      && pane.getBoundingClientRect().top >= this.rows.getBoundingClientRect().bottom - 1;
    if (!scroller || !stacked || scroller.scrollHeight <= scroller.clientHeight + 1) {
      this.jumpUp.hidden = true;
      this.jumpDown.hidden = true;
      return;
    }
    const view = scroller.getBoundingClientRect();
    const canScrollDown = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
    this.jumpUp.hidden = this.rows.getBoundingClientRect().top >= view.top - 1;
    this.jumpDown.hidden = !canScrollDown || pane.getBoundingClientRect().top <= view.top + 1;
  }

  /** Dispose calendar widgets and DOM listeners. */
  async destroy() {
    for (const picker of this._boundPickers || []) picker.destroy();
    this._boundPickers = [];
    this._previewRevision++;
    await this.preview?.destroy?.();
    this.preview = null;
    await super.destroy();
  }

  /** @returns {HTMLElement} A labeled control. */
  _label(text, control) {
    const label = document.createElement('label');
    label.className = 'h-filter-form-designer-setting';
    const caption = document.createElement('span');
    caption.className = 'h-i18n';
    caption.textContent = text;
    label.append(caption, control);
    return label;
  }

  /** @returns {HTMLButtonElement} A hidden floating jump button. */
  _jumpButton(text, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'h-btn h-filter-form-designer-jump';
    button.textContent = text;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.hidden = true;
    this.listen(button, 'click', onClick);
    return button;
  }

  /** @returns {HTMLElement} A wrapping line of an item. */
  _line(className, ...children) {
    const line = document.createElement('div');
    line.className = `h-filter-form-designer-line ${className}`;
    line.append(...children);
    return line;
  }

  /** @returns {HTMLInputElement} A checkbox bound to a boolean form setting. */
  _settingCheckbox(key) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'h-checkbox';
    checkbox.checked = Boolean(this.layout.settings[key]);
    this.listen(checkbox, 'change', () => {
      this.layout.settings[key] = checkbox.checked;
      this._schedulePreview();
    });
    return checkbox;
  }

  /**
   * @param {string} key Form setting.
   * @param {Array<[string, string]>} choices Value and label pairs.
   * @returns {HTMLElement} Radio buttons bound to a form setting.
   */
  _radioGroup(key, choices) {
    const group = document.createElement('span');
    group.className = 'h-filter-form-designer-radios';
    group.setAttribute('role', 'radiogroup');
    const name = `h-ffd-${key}-${Math.random().toString(36).slice(2)}`;
    const current = this.layout.settings[key] || FILTER_FORM_LIST_DEFAULTS[key];
    for (const [value, text] of choices) {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = value;
      radio.checked = value === current;
      this.listen(radio, 'change', () => {
        if (!radio.checked) return;
        this.layout.settings[key] = value;
        this._schedulePreview();
      });
      const label = document.createElement('label');
      const caption = document.createElement('span');
      caption.className = 'h-i18n';
      caption.textContent = text;
      label.append(radio, caption);
      group.append(label);
    }
    return group;
  }

  /** @returns {HTMLSelectElement} A select for presentation values. */
  _select(values, selected, labels = {}) {
    const select = document.createElement('select');
    select.className = 'h-select';
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = labels[value] || value;
      option.className = 'h-i18n';
      select.append(option);
    }
    select.value = selected;
    return select;
  }

  /** Move one visible input before another after a drag operation. */
  _moveBefore(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    const children = this.layout.groups[0].children;
    const source = children.findIndex((child) => child.input === sourceId);
    const target = children.findIndex((child) => child.input === targetId);
    if (source < 0 || target < 0) return;
    const [item] = children.splice(source, 1);
    children.splice(children.findIndex((child) => child.input === targetId), 0, item);
    this._renderRows();
  }
}

/** @returns {boolean} True for a missing or empty bound. */
function isBlank(value) {
  return value == null || String(value).trim() === '';
}

/** @returns {number} Number of numeric ranges, 1…MAX_NUMBER_RANGES. */
function clampRanges(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 1 ? Math.min(MAX_NUMBER_RANGES, number) : DEFAULT_NUMBER_RANGES;
}

/** @returns {HTMLElement|null} Nearest ancestor that scrolls vertically. */
function scrollParent(element) {
  if (typeof getComputedStyle !== 'function') return null;
  for (let node = element?.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return document.scrollingElement || null;
}

/** Keep a slider-bound calendar within the visible designer dialog. */
function positionDesignerCalendar(input, picker) {
  const calendar = picker.calendarContainer;
  const dialog = input.closest('dialog');
  const parent = dialog || document.body;
  if (calendar.parentElement !== parent) parent.append(calendar);
  const rect = input.getBoundingClientRect();
  const bounds = dialog?.getBoundingClientRect();
  const top = Math.max(8, bounds?.top ?? 8);
  const bottom = Math.min(window.innerHeight - 8, bounds?.bottom ?? window.innerHeight - 8);
  const height = Math.max(80, Math.min(calendar.offsetHeight || 320, bottom - top - 16));
  const below = bottom - rect.bottom;
  const openBelow = below >= height || below >= rect.top - top;
  calendar.style.position = 'fixed';
  calendar.style.maxHeight = `${height}px`;
  calendar.style.overflowY = 'auto';
  calendar.style.top = `${Math.max(top, openBelow ? rect.bottom + 2 : rect.top - height - 2)}px`;
  calendar.style.left = `${Math.max(8, Math.min(rect.left,
    window.innerWidth - calendar.offsetWidth - 8))}px`;
}
