/** BaseMapSelector.js - Render mutually exclusive configured base maps. */
export class BaseMapSelector {
  constructor({ api, container }) { this.api = api; this.container = container; }
  render(items, activeId) {
    this.container.replaceChildren();
    for (const item of items) {
      const label = document.createElement('label');
      label.className = 'heurist-map-basemap-row';
      const radio = document.createElement('input');
      radio.type = 'radio';
    radio.classList.add('h-checkbox');
      radio.name = 'heurist-map-basemap';
      radio.checked = String(item.id) === String(activeId);
      radio.addEventListener('change', () => radio.checked && this.api.setBaseMap(item.id).catch(() => {}));
      const title = document.createElement('span');
      title.textContent = item.title;
      label.append(radio, title);
      this.container.append(label);
    }
  }
}
