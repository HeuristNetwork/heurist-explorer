/**
 * @file MapDocumentSelector.js
 * @brief Renders mutually exclusive MapDocument choices.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR } from '#shared/ui';

/** Renders the list of MapDocuments available to the current map, with selection and edit controls. */
export class MapDocumentSelector {
  /**
   * @param {{api: object, container: HTMLElement}} options `api` is the map's public API;
   *        `container` is the element the document list renders into.
   */
  constructor({ api, container }) {
    this.api = api;
    this.container = container;
  }

  /**
   * Render the MapDocument list, with the active document's content inline.
   *
   * @param {Array<object>} documents Map documents available to the current map.
   * @param {*} activeId Id of the currently active document.
   * @param {Function} [createActiveContent] Returns extra content to render for the active document.
   * @param {{editingEnabled?: boolean, onEditDocument?: Function|null, onActivateDocument?: Function|null}} [options]
   * @returns {void}
   */
  render(documents, activeId, createActiveContent, { editingEnabled = false, onEditDocument = null, onActivateDocument = null } = {}) {
    this.container.replaceChildren();
    for (const item of documents) {
      const active = String(item.id) === String(activeId);
      const block = document.createElement('div');
      block.className = `heurist-map-document-block${active ? ' active' : ''}`;
      block.append(createRow(item, active, this.api, { editingEnabled, onEditDocument, onActivateDocument }));
      if (active && createActiveContent) {
        const content = createActiveContent(item);
        if (content) block.append(content);
      }
      this.container.append(block);
    }
    if (!documents.length) this.container.append(createEmpty('No map documents'));
  }
}

/**
 * Build one MapDocument row (selection control, status, title, and actions).
 *
 * @param {object} item MapDocument list entry.
 * @param {boolean} active Whether this document is currently active.
 * @param {object} api Map's public API.
 * @param {{editingEnabled?: boolean, onEditDocument?: Function|null, onActivateDocument?: Function|null}} [options]
 * @returns {HTMLElement} The row element.
 */
function createRow(item, active, api, { editingEnabled = false, onEditDocument = null, onActivateDocument = null } = {}) {
  const row = document.createElement('div');
  row.className = 'heurist-map-document-row';

  const label = document.createElement('label');
  label.className = 'heurist-map-row-main';
  const isLoading = item.activating === true || item.loadState === 'loading';
  let selector;
  if (isLoading) {
    selector = document.createElement('span');
    selector.className = 'heurist-map-document-selector-spinner';
    selector.innerHTML = '<span class="heurist-map-spinner" aria-hidden="true"></span>';
    selector.title = $HR('Loading map document');
    selector.setAttribute('aria-label', $HR('Loading map document'));
  } else {
    selector = document.createElement('input');
    selector.type = 'radio';
    selector.classList.add('h-checkbox');
    selector.name = 'heurist-map-document';
    selector.checked = active;
    selector.setAttribute('aria-label', `${$HR('Activate')} ${item.title}`);
    selector.addEventListener('change', () => {
      if (selector.checked) {
        onActivateDocument?.(item.id);
        api.activateMapDocument(item.id).catch(() => {});
      }
    });
  }

  const status = createDocumentStatus(item);
  const title = document.createElement('span');
  title.className = 'heurist-map-document-title';
  title.textContent = item.title;
  title.title = item.error?.message || item.title;
  label.append(selector, status, title);

  const actions = document.createElement('span');
  actions.className = 'heurist-map-row-actions';
  actions.append(iconButton('fa-solid fa-magnifying-glass-plus', 'Zoom to map document extent', () => api.zoomToMapDocument(item.id)));
  if (active) actions.append(iconButton('fa-solid fa-rotate', 'Reload map document', () => api.reloadMapDocument(item.id).catch(() => {})));
  if (editingEnabled && item.persistent !== false && typeof onEditDocument === 'function') {
    actions.append(iconButton('fa-solid fa-pencil', 'Edit map document', () => onEditDocument(item.id)));
  }
  row.append(label, actions);
  return row;
}

/**
 * Build a document's loading/error status indicator.
 *
 * @param {object} item MapDocument list entry.
 * @returns {HTMLElement} The status element.
 */
function createDocumentStatus(item) {
  const status = document.createElement('span');
  status.className = 'heurist-map-document-status';
  if (item.loadState === 'error') {
    status.innerHTML = '<span class="fa-solid fa-triangle-exclamation" aria-hidden="true"></span>';
    status.classList.add('state-error');
    status.title = item.error?.message || $HR('Map document loading failed');
  }
  return status;
}

/**
 * Build a small icon-only action button.
 *
 * @param {string} icon Font Awesome icon class.
 * @param {string} title Localizable tooltip/aria-label text.
 * @param {Function} handler Click handler.
 * @returns {HTMLButtonElement} The button element.
 */
function iconButton(icon, title, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'heurist-icon-button';
  button.title = $HR(title);
  button.setAttribute('aria-label', $HR(title));
  button.innerHTML = `<span class="${icon}" aria-hidden="true"></span>`;
  button.addEventListener('click', (event) => { event.stopPropagation(); handler(event); });
  return button;
}

/**
 * Build the "no documents" empty-state element.
 *
 * @param {string} text Localizable empty-state text.
 * @returns {HTMLElement} The empty-state element.
 */
function createEmpty(text) {
  const element = document.createElement('div');
  element.className = 'heurist-map-empty h-i18n';
  element.textContent = $HR(text);
  return element;
}
