/**
 * @file WebsiteDetails.js
 * @brief Details pane of the Website manager (plan 27b §3): name, version, languages, live URL,
 *        menu tree of a website, problems of the format (Check) and the builds (Generate).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HBaseWidget } from '#shared/widgets';
import { HJobMonitor } from '#shared/widgets/job/HJobMonitor.js';
import { isJobFinished } from '#shared/api';
import { $HR, HMsg } from '#shared/ui';

/** Kind of a record as shown. */
const KIND_TEXT = { website: 'Website', standalone: 'Standalone page', page: 'Menu page' };

/** Details of the selected website or page. */
export class WebsiteDetails extends HBaseWidget {
  /**
   * @param {HTMLElement} container Pane host.
   * @param {object} options
   * @param {import('./WebsiteApplication.js').WebsiteApplication} options.application Controller.
   * @param {Function} options.onEditRecord `(id)` - edit a page of the menu.
   * @param {Function} options.onRemoveFromMenu `(pageId)` - take a page out of the menu.
   * @returns {WebsiteDetails}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this.app = options.application;
    this.issues = null;
    this.monitor = null;
    this.render();
    return this;
  }

  /** Show the problems found by Check (null: hide). */
  setIssues(issues) {
    this.issues = issues;
    this.render();
  }

  /** Render the selected record. */
  render() {
    this.monitor?.destroy();
    this.monitor = null;
    const root = el('div', 'h-website-details');
    const app = this.app;
    if (!app.selectedId) {
      el('p', 'h-muted', root).textContent = $HR('Select a website or a published page in the list.');
    } else if (app.summaryError) {
      el('p', 'h-website-error', root).textContent = app.summaryError;
    } else if (!app.summary) {
      el('p', 'h-muted', root).textContent = $HR('Loading...');
    } else {
      this._renderSummary(root, app.summary);
    }
    this.container.replaceChildren(root);
  }

  _renderSummary(root, summary) {
    el('h2', 'h-website-details-title', root).textContent = summary.title || `#${summary.id}`;
    const facts = el('div', 'h-website-details-facts', root);
    fact(facts, 'Kind', $HR(KIND_TEXT[summary.kind] || summary.kind));
    fact(facts, 'Version', summary.v4 ? '4' : `${summary.version || '1-3'} (${$HR('legacy')})`);
    if (summary.languages?.length) fact(facts, 'Languages', summary.languages.map((code) => code.toUpperCase()).join(', '));
    fact(facts, 'Record', `#${summary.id}`);

    if (!summary.v4) {
      el('p', 'h-website-note', root).textContent = $HR('A website of an earlier format. Edit it in the legacy website editor (Heurist main menu > Publish > Websites). Conversion to format 4 comes later.');
    }
    if (summary.kind === 'page') {
      el('p', 'h-website-note', root).textContent = $HR('A page of a website menu. Select its website to see the menu.');
    }
    if (summary.url) this._renderUrl(root, summary.url);
    if (summary.kind === 'website') this._renderPages(root, summary);
    if (Array.isArray(this.issues)) this._renderIssues(root);
    if (summary.v4 && summary.kind !== 'page') this._renderBuilds(root);
  }

  _renderUrl(root, url) {
    const section = el('section', 'h-website-details-section', root);
    el('h3', '', section).textContent = $HR('Address');
    const row = el('div', 'h-website-url', section);
    const input = el('input', 'h-input', row);
    input.readOnly = true;
    input.value = url;
    input.setAttribute('aria-label', $HR('Address'));
    iconButton(row, 'fa-copy', 'Copy the address', async () => {
      await navigator.clipboard?.writeText?.(url);
      HMsg.showMsgFlash($HR('Copied'), { showDelay: 1200 });
    });
    iconButton(row, 'fa-up-right-from-square', 'Open in a new tab', () => globalThis.open?.(url, '_blank', 'noopener'));
  }

  _renderPages(root, summary) {
    const section = el('section', 'h-website-details-section', root);
    el('h3', '', section).textContent = $HR('Menu');
    if (!summary.pages?.length) {
      el('p', 'h-muted', section).textContent = $HR('No pages in the menu');
      return;
    }
    const list = el('ul', 'h-website-pages', section);
    const add = (parent, pages) => {
      for (const page of pages) {
        const item = el('li', '', parent);
        const line = el('div', 'h-website-page', item);
        el('span', 'h-website-page-title', line).textContent = page.title || `#${page.id}`;
        if (summary.v4 && this.app.canEditRecords()) {
          iconButton(line, 'fa-pen', 'Edit the page', () => this.options.onEditRecord?.(page.id));
        }
        if (summary.v4) iconButton(line, 'fa-up-right-from-square', 'Open the page', () => globalThis.open?.(`${summary.url}/${page.id}`, '_blank', 'noopener'));
        if (summary.v4 && summary.canEdit) {
          iconButton(line, 'fa-xmark', 'Take the page out of the menu (the page is kept)', () => this.options.onRemoveFromMenu?.(page.id));
        }
        if (page.children?.length) add(el('ul', '', item), page.children);
      }
    };
    add(list, summary.pages);
  }

  _renderIssues(root) {
    const section = el('section', 'h-website-details-section', root);
    el('h3', '', section).textContent = $HR('Check');
    if (!this.issues.length) {
      el('p', 'h-website-ok', section).textContent = $HR('No problems found');
      return;
    }
    const list = el('ul', 'h-website-issues', section);
    for (const issue of this.issues) {
      const item = el('li', `h-website-issue h-website-issue-${issue.level || 'warning'}`, list);
      item.textContent = `${issue.message}${issue.node ? ` (${issue.node})` : ''}`;
    }
  }

  _renderBuilds(root) {
    const builds = this.app.builds || [];
    if (!builds.length) return;
    const section = el('section', 'h-website-details-section', root);
    el('h3', '', section).textContent = $HR('Generated files');
    const running = builds.find((job) => !isJobFinished(job));
    if (running) {
      // progress with Stop; the list is read again when it ends
      const host = el('div', 'h-website-build', section);
      this.monitor = new HJobMonitor().attach(host, { jobClient: this.app.jobs, compact: true });
      this.monitor.follow(running).then(() => this.app.reloadSummary()).catch(() => {});
    }
    const finished = builds.filter((job) => isJobFinished(job));
    if (finished.length) {
      const list = el('ul', 'h-website-builds', section);
      for (const job of finished) {
        const item = el('li', '', list);
        // Unix seconds of the job state
        const seconds = Number(job.finishedAt || job.createdAt) || 0;
        const when = seconds ? new Date(seconds * 1000).toLocaleString() : '';
        if (job.status === 'done' && job.result?.download) {
          const link = el('a', '', item);
          link.href = this.app.jobs.resultUrl(job.id);
          link.download = job.result.file || '';
          link.textContent = `${job.result.file || $HR('Download')} ${when}`;
        } else {
          item.className = 'h-website-issue-warning';
          item.textContent = `${$HR(job.status)} ${when}${job.error ? `: ${job.error}` : ''}`;
        }
      }
    }
  }

  /** @inheritdoc */
  async destroy() {
    await this.monitor?.destroy();
    this.monitor = null;
    await super.destroy();
  }
}

/** One "label: value" fact. */
function fact(parent, label, value) {
  const row = el('div', 'h-website-fact', parent);
  el('span', 'h-website-fact-label', row).textContent = $HR(label);
  el('span', 'h-website-fact-value', row).textContent = value;
}

/** An icon button with a tooltip. */
function iconButton(parent, icon, title, onClick) {
  const button = el('button', 'heurist-icon-button', parent);
  button.type = 'button';
  button.title = $HR(title);
  button.setAttribute('aria-label', button.title);
  el('i', `fa-solid ${icon}`, button).setAttribute('aria-hidden', 'true');
  button.addEventListener('click', () => Promise.resolve(onClick()).catch((error) => HMsg.showMsgErr(error?.message || String(error))));
  return button;
}

/** Create an element with a class, optionally appended to a parent. */
export function el(tag, className, parent = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  parent?.append(element);
  return element;
}
