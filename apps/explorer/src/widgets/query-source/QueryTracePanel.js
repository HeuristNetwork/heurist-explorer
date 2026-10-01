/**
 * @file QueryTracePanel.js
 * @brief Log of data API requests (records, graph, map, time) with server timings.
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

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR } from '#shared/ui';
import './QueryTracePanel.css';

/** localStorage key of the collapsed state. */
const COLLAPSED_KEY = 'heurist-explorer-query-trace-collapsed';

/** Number of log lines rendered; the monitor keeps more. */
const MAX_LINES = 100;

/**
 * Collapsible "Query trace" pane under the DataSource actions. While tracing is
 * on, every data request asks the server for a `debug` section (SQL timings);
 * the pane lists finished requests, newest first. Running requests are counted
 * in the header.
 */
export class QueryTracePanel extends HBaseWidget {
  /**
   * @param {object} options Widget configuration.
   * @param {import('#shared/api').RequestMonitor} options.monitor Explorer's request monitor.
   */
  constructor({ monitor } = {}) {
    super();
    this.monitor = monitor;
    this.expanded = new Set();
    this._renderQueued = false;
  }

  /** @returns {QueryTracePanel} this, for chaining. */
  render() {
    if (!this.container) throw new Error('QueryTracePanel must be attached before render');
    this.container.className = 'h-qtrace';
    this.container.classList.toggle('is-collapsed', readCollapsed());

    const header = document.createElement('div');
    header.className = 'h-qtrace-header';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'h-qtrace-toggle';
    toggle.innerHTML = '<span class="fa-solid fa-chevron-down" aria-hidden="true"></span>';
    const title = document.createElement('span');
    title.className = 'h-qtrace-title h-i18n';
    title.textContent = $HR('Query trace');
    toggle.append(title);
    toggle.title = $HR('Show or hide the query trace');

    const enable = document.createElement('label');
    enable.className = 'h-qtrace-enable';
    enable.title = $HR('Ask the server for SQL timings of every request');
    this._enable = document.createElement('input');
    this._enable.type = 'checkbox';
    const enableText = document.createElement('span');
    enableText.className = 'h-i18n';
    enableText.textContent = $HR('Debug');
    enable.append(this._enable, enableText);

    this._running = document.createElement('span');
    this._running.className = 'h-qtrace-running';

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'h-btn h-btn-small h-qtrace-clear';
    clear.textContent = $HR('Clear');

    header.append(toggle, this._running, enable, clear);
    this._log = document.createElement('div');
    this._log.className = 'h-qtrace-log';
    this.container.replaceChildren(header, this._log);

    this.listen(toggle, 'click', () => {
      const collapsed = !this.container.classList.contains('is-collapsed');
      this.container.classList.toggle('is-collapsed', collapsed);
      writeCollapsed(collapsed);
    });
    this.listen(this._enable, 'change', () => { this.monitor.traceEnabled = this._enable.checked; });
    this.listen(clear, 'click', () => { this.expanded.clear(); this.monitor.clear(); });
    this.listen(this.monitor, 'change', () => this._queueRender());
    this.listen(this.monitor, 'tracechange', () => this._queueRender());
    this.delegate(this._log, 'click', '.h-qtrace-line', (event, line) => {
      // details stay open while SQL is selected or copied
      if (event.target.closest('.h-qtrace-details')) return;
      this._toggleLine(line.dataset.rid);
    });
    this.delegate(this._log, 'click', '.h-qtrace-copy', (event, button) => {
      event.stopPropagation();
      void this._copy(button.dataset.rid);
    });

    this.state = 'rendered';
    this._renderLog();
    return this;
  }

  /** @private Batch updates: many requests can end in the same frame. */
  _queueRender() {
    if (this._renderQueued) return;
    this._renderQueued = true;
    const run = () => { this._renderQueued = false; if (this.isRendered) this._renderLog(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  /** @private */
  _renderLog() {
    this._enable.checked = this.monitor.traceEnabled;
    const running = this.monitor.inFlightCount;
    this._running.textContent = running ? `${$HR('running')}: ${running}` : '';
    this._running.classList.toggle('is-active', running > 0);

    const entries = this.monitor.entries().slice(0, MAX_LINES);
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'h-qtrace-empty h-i18n';
      empty.textContent = this.monitor.traceEnabled
        ? $HR('No requests yet')
        : $HR('Switch on Debug to see server timings');
      this._log.replaceChildren(empty);
      return;
    }
    this._log.replaceChildren(...entries.map((entry) => this._line(entry)));
  }

  /** @private */
  _line(entry) {
    const line = document.createElement('div');
    line.className = `h-qtrace-line is-${entry.status}`;
    line.dataset.rid = entry.rid;
    const debug = entry.debug || null;

    const head = document.createElement('div');
    head.className = 'h-qtrace-head';
    head.append(
      cell('h-qtrace-time', formatClock(entry.startedAt)),
      cell('h-qtrace-source', entry.source || ''),
      cell('h-qtrace-path', `${entry.method} ${entry.path}`),
      cell('h-qtrace-ms', timing(entry, debug)),
      cell('h-qtrace-total', entry.total != null ? `n=${entry.total}` : ''),
      cell('h-qtrace-status', entry.status === 'ok' ? '' : entry.status)
    );
    head.title = timingTitle();
    line.append(head);
    const summary = cell('h-qtrace-summary', entry.summary || '');
    line.append(summary);

    if (this.expanded.has(entry.rid)) line.append(this._details(entry, debug));
    return line;
  }

  /** @private */
  _details(entry, debug) {
    const box = document.createElement('div');
    box.className = 'h-qtrace-details';
    const rows = [];
    if (entry.error) rows.push(['error', entry.error]);
    if (debug) {
      rows.push(['path', debug.path ?? '']);
      rows.push(['sql', `${debug.sqlMs} ms in ${debug.statements} statements`]);
      rows.push(['boot', `${debug.bootMs ?? ''} ms`]);
      rows.push(['memory', `${debug.peakMemoryMb} MB`]);
      if (debug.shape) rows.push(['shape', Object.entries(debug.shape).map(([k, v]) => `${k} ${v}`).join(', ')]);
      for (const phase of debug.phases || []) {
        rows.push([`· ${phase.name}`, `${phase.ms} ms, ${phase.statements} sql${phase.calls > 1 ? `, ${phase.calls}×` : ''}${phase.rows != null ? `, ${phase.rows} rows` : ''}`]);
      }
      for (const note of debug.notes || []) rows.push(['note', note]);
    } else if (entry.status !== 'aborted') {
      rows.push(['', $HR('No server timings: switch on Debug')]);
    }
    for (const [name, value] of rows) {
      const row = document.createElement('div');
      row.className = 'h-qtrace-row';
      row.append(cell('h-qtrace-key', name), cell('h-qtrace-value', String(value)));
      box.append(row);
    }
    if (debug?.mainSql) {
      const sql = document.createElement('pre');
      sql.className = 'h-qtrace-sql';
      sql.textContent = debug.mainSql + (debug.mainParams?.length ? `\n-- ${JSON.stringify(debug.mainParams)}` : '');
      box.append(sql);
    }
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'h-btn h-btn-small h-qtrace-copy';
    copy.dataset.rid = entry.rid;
    copy.textContent = $HR('Copy');
    copy.title = $HR('Copy this request and its debug data');
    box.append(copy);
    return box;
  }

  /** @private */
  _toggleLine(rid) {
    if (!rid) return;
    if (this.expanded.has(rid)) this.expanded.delete(rid);
    else this.expanded.add(rid);
    this._renderLog();
  }

  /** @private */
  async _copy(rid) {
    const entry = this.monitor.entries().find((item) => item.rid === rid);
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    } catch (error) {
      console.warn('Copy failed', error);
    }
  }
}

/** @returns {HTMLSpanElement} Span with a class and text. */
function cell(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

/** Timing column: main SQL / all SQL / server total / browser time. */
function timing(entry, debug) {
  const client = `${entry.clientMs ?? '?'}`;
  if (!debug) return `${client} ms`;
  const main = debug.mainMs != null ? `${round(debug.mainMs)}` : '–';
  return `${main} / ${round(debug.sqlMs)} / ${round(debug.totalMs)} / ${client} ms`;
}

/** @returns {string} Tooltip explaining the timing column. */
function timingTitle() {
  return $HR('main SQL / all SQL / server total / browser (ms)');
}

function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '–';
  return number >= 100 ? String(Math.round(number)) : String(Math.round(number * 10) / 10);
}

function formatClock(time) {
  const date = new Date(time || Date.now());
  return date.toTimeString().slice(0, 8);
}

function readCollapsed() {
  try {
    return globalThis.localStorage?.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed) {
  try {
    globalThis.localStorage?.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // storage blocked: the state is not remembered
  }
}
