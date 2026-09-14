import { TemporalAdapter } from "./TemporalAdapter.js";

export class TimelineApplication extends EventTarget {
  constructor({ container, config, engine, host, provider }) {
    super(); this.container = container; this.config = config; this.engine = engine; this.host = host; this.provider = provider;
    this.contexts = []; this.selection = []; this.abortControllers = new Map(); this.generation = 0;
  }
  async initialize() {
    await this.host.initialize({ config: this.config });
    await this.engine.initialize({
      container: this.container,
      settings: {
        ...this.config.settings,
        iconBaseUrl: this.config.baseUrl || this.config.host?.baseUrl || "",
        database: this.config.database || this.config.host?.database || ""
      },
      onSelectionChange: ids => this._selectionFromEngine(ids),
      onRangeChange: range => this.dispatch("heurist-timeline-range-changed", range)
    });
    await this.setContexts(this.config.source.contexts || []);
    if (this.config.source.selection?.length) await this.setSelection(this.config.source.selection);
    this.dispatch("heurist-timeline-ready", {}); return this;
  }
  async setQuery(query, options = {}) {
    if (query == null || query === "") return this.setContexts([]);
    const current = this.contexts.find(c => c.id === "current");
    const context = { ...(current || {}), id: "current", title: options.title || current?.title || "Current result", query, timefields: options.timefields ?? current?.timefields ?? null, fields: options.fields ?? current?.fields ?? [], options: { ...(current?.options || {}), ...(options.contextOptions || {}) } };
    const others = this.contexts.filter(c => c.id !== "current");
    return this.setContexts([context, ...others], { preserveSelection: true });
  }
  async setContexts(contexts, options = {}) {
    const normalized = normalizeContexts(contexts);
    const generation = ++this.generation;
    for (const controller of this.abortControllers.values()) controller.abort("Superseded timeline request");
    this.abortControllers.clear();
    this.dispatch("heurist-timeline-loading", { contexts: normalized.map(publicContext) });
    const loaded = await Promise.all(normalized.map(async context => {
      const controller = new AbortController(); this.abortControllers.set(context.id, controller);
      try {
        const response = await this.provider.load({ ...context, signal: controller.signal });
        return { ...context, response, items: TemporalAdapter.convertContext(context, response) };
      } finally { this.abortControllers.delete(context.id); }
    }));
    if (generation !== this.generation) return this.getState();
    this.contexts = loaded;
    await this.engine.setData({
      groups: loaded.filter(c => c.visible !== false).map(c => ({ id: c.id, content: c.title, className: `heurist-band-${safeClass(c.id)}` })),
      items: loaded.filter(c => c.visible !== false).flatMap(c => c.items)
    });
    if (!options.preserveSelection) this.selection = [];
    if (this.selection.length) await this.engine.setSelection(this.selection);
    this.dispatch("heurist-timeline-loaded", { contexts: loaded.map(publicContext), itemCount: loaded.reduce((n,c)=>n+c.items.length,0) });
    return this.getState();
  }
  async addContext(context) { return this.setContexts([...this.contexts.map(publicContext), context], { preserveSelection: true }); }
  async removeContext(id) { return this.setContexts(this.contexts.filter(c => c.id !== String(id)).map(publicContext), { preserveSelection: true }); }
  async setSelection(ids, options = {}) { this.selection = normalizeIds(ids); await this.engine.setSelection(this.selection, options); return [...this.selection]; }
  clearSelection() { return this.setSelection([]); }
  async zoomToSelection() { return this.engine.zoomToSelection(); }
  async zoomToAll() { return this.engine.zoomToAll(); }
  async refresh() { return this.setContexts(this.contexts.map(publicContext), { preserveSelection: true }); }
  resize() { return this.engine.resize(); }
  getState() { return { contexts: this.contexts.map(publicContext), selection: [...this.selection] }; }
  dispatch(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  _selectionFromEngine(ids) { this.selection = normalizeIds(ids); this.dispatch("heurist-timeline-selection-changed", { recordIds: [...this.selection] }); }
  async destroy() { for (const c of this.abortControllers.values()) c.abort(); this.abortControllers.clear(); await this.engine.destroy(); await this.host.destroy?.(); }
}
function normalizeContexts(value) { return (Array.isArray(value)?value:[]).map((c,i)=>({ id:String(c.id ?? `context-${i+1}`), title:String(c.title||`Band ${i+1}`), query:c.query??null, ids:Array.isArray(c.ids)?normalizeIds(c.ids):null, timefields:c.timefields??null, fields:Array.isArray(c.fields)?[...c.fields]:[], visible:c.visible!==false, options:{...(c.options||{})} })).filter(c=>c.query || c.ids?.length); }
function publicContext(c) { return { id:c.id,title:c.title,query:c.query,ids:c.ids,timefields:c.timefields,fields:c.fields,visible:c.visible,options:{...(c.options||{})} }; }
function normalizeIds(value){ return [...new Set((Array.isArray(value)?value:[]).map(Number).filter(id=>Number.isInteger(id)&&id>0))]; }
function safeClass(v){ return String(v).replace(/[^a-z0-9_-]/gi,"-"); }
