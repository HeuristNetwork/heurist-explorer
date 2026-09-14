import { $HR, applyI18n } from '#shared/ui';
import { dataSourceTitle as resolvedDataSourceTitle } from '../core/DataSource.js';

/**
 * Compact list of open heurist-data module instances in Explorer workspace.
 * It is a view only: module discovery/activation remain in LayoutManager.
 */
export class ExplorerDataViews {
  constructor({ application, onSelect = null } = {}) {
    this.application = application;
    this.onSelect = onSelect;
    this.element = null;
  }

  mount(parent) {
    this.element = document.createElement('div');
    this.element.className = 'h-explorer-data-view-list';
    parent.replaceChildren(this.element);
    this.render();
    return this.element;
  }

  render() {
    if (!this.element) return this;
    this.element.replaceChildren();
    const views = this.application?.layout?.findDataModules?.() || [];

    if (!views.length) {
      const empty = document.createElement('div');
      empty.className = 'h-explorer-panel-empty h-i18n';
      empty.textContent = 'No data views are open';
      this.element.append(empty);
      applyI18n(this.element);
      return this;
    }

    for (const module of views) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'h-explorer-data-view-row';
      row.dataset.moduleId = module.id;

      const title = document.createElement('span');
      title.className = 'h-explorer-data-view-title';
      title.textContent = module.settings?.title || module.id;

      const source = document.createElement('span');
      source.className = 'h-explorer-data-view-source';
      source.textContent = dataSourceTitle(module.dataSource);

      row.append(title, source);
      row.addEventListener('click', async () => {
        this.application?.layout?.activateModule?.(module.id);
        await this.application?.focusModule?.(module.id);
        this.onSelect?.(module);
        this.element.dispatchEvent(new CustomEvent('dataviewselect', {
          bubbles: true,
          detail: { module }
        }));
      });
      this.element.append(row);
    }
    return this;
  }

  destroy() {
    this.element?.remove();
    this.element = null;
  }
}

function dataSourceTitle(source) {
  if (!source) return $HR('No source');
  const title = resolvedDataSourceTitle(source);
  if (title) return title;
  if (source.reference?.type === 'query' || source.reference?.type === 'recordtype') return $HR('Current result');
  if (source.reference?.type === 'filter') return $HR('Filter');
  if (source.reference?.type === 'source') return $HR('Source');
  return $HR('Data source');
}
