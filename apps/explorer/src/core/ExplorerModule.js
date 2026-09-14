/** Engine-neutral Explorer module contract. */
export class ExplorerModule extends EventTarget {
  constructor({ id, type, container, context = null }) {
    super();
    this.id = id;
    this.type = type;
    this.container = container;
    this.context = context ? clone(context) : {};
    this.dataSource = null;
    this.selection = [];
  }

  async mount() { return this; }
  async setDataSource(source) { this.dataSource = clone(source); return source; }
  async setSelection(ids) { this.selection = normalizeIds(ids); return this.selection; }
  async getState() { return { dataSource: clone(this.dataSource), selection: [...this.selection], context: clone(this.context) }; }
  async resize() { return true; }
  async destroy() {}
}

export function normalizeIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

export function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
