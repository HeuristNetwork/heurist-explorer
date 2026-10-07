/**
 * @file HJobMonitor.js
 * @brief Progress of one background job: title, status, progress bar, elapsed
 *        time, Stop button and, when done, a link to the result.
 *
 * Used by the reports manager for test runs and generation; meant for the
 * later batch actions and exports as well.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '../HBaseWidget.js';
import { $HR } from '../../ui/i18n/HResource.js';
import { isJobFinished } from '../../api/JobClient.js';
import './HJobMonitor.css';

/** Text of each job status. */
const STATUS_TEXT = {
  queued: 'Waiting to start',
  running: 'Running',
  done: 'Finished',
  failed: 'Failed',
  cancelled: 'Stopped',
  timeout: 'Stopped: time limit reached',
  lost: 'Stopped: the server process ended'
};

/** Shows and controls one background job. */
export class HJobMonitor extends HBaseWidget {
  /**
   * @param {HTMLElement} container Widget host.
   * @param {object} options Widget options.
   * @param {import('../../api/JobClient.js').JobClient} options.jobClient Job client.
   * @param {function(object): void} [options.onFinish] Called once with the final job state.
   * @param {boolean} [options.compact=false] One-line layout.
   * @returns {HJobMonitor} This widget.
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.job = null;
    this._abort = null;
    this._timer = null;
    this._startedAt = 0;
    this.render();
    return this;
  }

  /** Build the widget elements. */
  render() {
    const element = (tag, className, parent) => {
      const node = document.createElement(tag);
      node.className = className;
      parent.append(node);
      return node;
    };
    const root = document.createElement('div');
    root.className = `h-job-monitor${this.options.compact ? ' h-job-monitor-compact' : ''}`;
    root.setAttribute('role', 'status');
    const head = element('div', 'h-job-monitor-head', root);
    element('span', 'h-job-monitor-title', head);
    element('span', 'h-job-monitor-status', head);
    element('span', 'h-job-monitor-elapsed h-muted', head);
    const stop = element('button', 'h-btn h-btn-small h-job-monitor-stop', head);
    stop.type = 'button';
    element('div', 'h-job-monitor-fill', element('div', 'h-job-monitor-bar', root));
    element('div', 'h-job-monitor-message h-muted', root);
    element('div', 'h-job-monitor-result', root);
    stop.textContent = $HR('Stop');
    stop.title = $HR('Stop this job');
    this.listen(stop, 'click', () => this.stop());
    this.container.replaceChildren(root);
    this.root = root;
    root.hidden = true;
  }

  /**
   * Follow a started job until it finishes.
   *
   * @param {object} job Job as returned by `JobClient.start()`.
   * @returns {Promise<object>} Final job state.
   */
  async follow(job) {
    this._abort?.abort();
    this._abort = new AbortController();
    this._finished = false;
    this._startedAt = Date.now();
    this.root.hidden = false;
    this.update(job);
    clearInterval(this._timer);
    this._timer = setInterval(() => this._showElapsed(), 1000);
    try {
      const final = await this.options.jobClient.wait(job, {
        signal: this._abort.signal,
        onUpdate: (state) => this.update(state)
      });
      this._finish(final);
      return final;
    } catch (error) {
      clearInterval(this._timer);
      if (error?.name === 'AbortError') throw error;
      this._setMessage(error?.message || String(error), true);
      throw error;
    }
  }

  /**
   * Ask the server to stop the job.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.job || isJobFinished(this.job)) return;
    const button = this.root.querySelector('.h-job-monitor-stop');
    button.disabled = true;
    button.textContent = $HR('Stopping...');
    try {
      await this.options.jobClient.cancel(this.job.id);
    } catch (error) {
      button.disabled = false;
      button.textContent = $HR('Stop');
      this._setMessage(error?.message || String(error), true);
    }
  }

  /**
   * Show a job state.
   *
   * @param {object} job Job state.
   * @returns {void}
   */
  update(job) {
    if (!job) return;
    this.job = job;
    const finished = isJobFinished(job);
    const progress = job.progress || {};
    const total = Number(progress.total) || 0;
    const done = Math.min(Number(progress.done) || 0, total || Infinity);

    this.root.querySelector('.h-job-monitor-title').textContent = job.title || job.type || '';
    const status = this.root.querySelector('.h-job-monitor-status');
    status.textContent = $HR(STATUS_TEXT[job.status] || job.status);
    this.root.dataset.status = job.status;

    const bar = this.root.querySelector('.h-job-monitor-bar');
    const fill = this.root.querySelector('.h-job-monitor-fill');
    // a finished, stopped or failed job: status and message only
    bar.hidden = finished;
    bar.classList.toggle('h-job-monitor-bar-indeterminate', !finished && total === 0);
    fill.style.width = finished ? (job.status === 'done' ? '100%' : fill.style.width)
      : total > 0 ? `${Math.round((done / total) * 100)}%` : '';

    const counts = total > 0 ? `${done} / ${total}` : '';
    const phase = progress.message && !['started', 'done'].includes(progress.message) ? $HR(progress.message) : '';
    this._setMessage(job.error || [phase, counts].filter(Boolean).join(' · '), Boolean(job.error));

    const stop = this.root.querySelector('.h-job-monitor-stop');
    stop.hidden = finished;
    if (!finished && !job.cancelRequested) {
      stop.disabled = false;
      stop.textContent = $HR('Stop');
    }
    this._showElapsed();
  }

  /** Stop polling (the job keeps running on the server) and clear timers. */
  async destroy() {
    this._abort?.abort();
    clearInterval(this._timer);
    await super.destroy();
  }

  /** Show the final state and the result link. */
  _finish(job) {
    clearInterval(this._timer);
    this.update(job);
    const result = this.root.querySelector('.h-job-monitor-result');
    result.replaceChildren();
    if (job.status === 'done' && job.result?.download && this.options.jobClient) {
      // a result file kept with the job (e.g. an export): only its owner can download it
      const link = document.createElement('a');
      link.href = this.options.jobClient.resultUrl(job.id);
      link.download = job.result.file || '';
      link.className = 'h-job-monitor-download';
      link.innerHTML = '<span class="fa-solid fa-download" aria-hidden="true"></span> ';
      link.append(document.createTextNode(job.result.file || $HR('Download')));
      result.append(link);
      if (Number(job.result.size) > 0) {
        const size = document.createElement('span');
        size.className = 'h-job-monitor-size';
        size.textContent = ` (${formatSize(Number(job.result.size))})`;
        result.append(size);
      }
      // shown in the browser (?inline=1); a zip can only be downloaded
      if (!/\.zip$/i.test(job.result.file || '')) {
        const url = link.href;
        const open = document.createElement('a');
        open.className = 'heurist-icon-button h-job-monitor-open';
        open.href = `${url}${url.includes('?') ? '&' : '?'}inline=1`;
        open.target = '_blank';
        open.rel = 'noopener';
        open.title = $HR('Open in a new tab');
        open.setAttribute('aria-label', open.title);
        const icon = document.createElement('span');
        icon.className = 'fa-solid fa-up-right-from-square';
        icon.setAttribute('aria-hidden', 'true');
        open.append(icon);
        result.append(' ', open);
      }
    } else if (job.status === 'done' && job.result?.url) {
      const link = document.createElement('a');
      link.href = job.result.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = job.result.file || job.result.url;
      result.append(link);
    }
    if (!this._finished) {
      this._finished = true;
      this.options.onFinish?.(job);
    }
  }

  /** Elapsed time from the server, or since follow() while queued. */
  _showElapsed() {
    const job = this.job;
    if (!job) return;
    const seconds = isJobFinished(job) || job.elapsedSeconds
      ? Number(job.elapsedSeconds) || 0
      : Math.round((Date.now() - this._startedAt) / 1000);
    const live = !isJobFinished(job) && job.status === 'running'
      ? Math.max(seconds, Math.round((Date.now() - this._startedAt) / 1000)) : seconds;
    this.root.querySelector('.h-job-monitor-elapsed').textContent = formatSeconds(live);
  }

  /** Show a progress or error text. */
  _setMessage(text, error = false) {
    const message = this.root.querySelector('.h-job-monitor-message');
    message.textContent = text || '';
    message.classList.toggle('h-job-monitor-error', error);
  }
}

/** "42 s" or "3 min 05 s". */
export function formatSeconds(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (value < 60) return `${value} s`;
  return `${Math.floor(value / 60)} min ${String(value % 60).padStart(2, '0')} s`;
}

/** "850 B", "12.4 KB" or "3.1 MB". */
export function formatSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
