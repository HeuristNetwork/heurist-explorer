/**
 * Minimal DOM stand-in for widget tests (node --test has no DOM).
 * Covers what the shared widgets use: element tree, classes, attributes,
 * events with bubbling, `querySelector(All)` by one class or tag, `closest`.
 */

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.detail = init.detail;
    this.key = init.key;
    this.shiftKey = Boolean(init.shiftKey);
    this.defaultPrevented = false;
    this._stopped = false;
  }

  preventDefault() { this.defaultPrevented = true; }

  stopPropagation() { this._stopped = true; }
}

class FakeClassList {
  constructor(element) { this.element = element; }

  _set() { return new Set(String(this.element.className || '').split(/\s+/).filter(Boolean)); }

  _write(set) { this.element.className = [...set].join(' '); }

  add(...names) { const set = this._set(); for (const name of names) set.add(name); this._write(set); }

  remove(...names) { const set = this._set(); for (const name of names) set.delete(name); this._write(set); }

  contains(name) { return this._set().has(name); }

  toggle(name, force) {
    const set = this._set();
    const on = force === undefined ? !set.has(name) : Boolean(force);
    if (on) set.add(name); else set.delete(name);
    this._write(set);
    return on;
  }
}

export class FakeElement {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.classList = new FakeClassList(this);
    this.attributes = {};
    this.dataset = {};
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.checked = false;
    this.type = '';
    this.id = '';
    this._text = '';
    this._listeners = {};
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.children = [];
    this._text = String(value ?? '');
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node == null) continue;
      if (typeof node === 'string') { this._text += node; continue; }
      node.parentElement?.removeChild(node);
      node.parentElement = this;
      this.children.push(node);
    }
  }

  prepend(...nodes) {
    const rest = this.children;
    this.children = [];
    this.append(...nodes);
    this.children.push(...rest);
  }

  after(...nodes) {
    const parent = this.parentElement;
    if (!parent) return;
    const index = parent.children.indexOf(this);
    for (const node of nodes) { node.parentElement?.removeChild(node); node.parentElement = parent; }
    parent.children.splice(index + 1, 0, ...nodes);
  }

  removeChild(node) {
    this.children = this.children.filter((child) => child !== node);
    node.parentElement = null;
  }

  remove() { this.parentElement?.removeChild(this); }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = '';
    this.append(...nodes);
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }

  getAttribute(name) { return this.attributes[name] ?? null; }

  removeAttribute(name) { delete this.attributes[name]; }

  hasAttribute(name) { return name in this.attributes; }

  addEventListener(type, handler) { (this._listeners[type] ||= []).push(handler); }

  removeEventListener(type, handler) {
    this._listeners[type] = (this._listeners[type] || []).filter((item) => item !== handler);
  }

  dispatchEvent(event) {
    // real (Custom)Event objects expose a read-only target getter: shadow it
    if (!event.target) Object.defineProperty(event, 'target', { value: this, configurable: true });
    let stopped = false;
    const stop = event.stopPropagation;
    event.stopPropagation = function () { stopped = true; this._stopped = true; stop?.call(this); };
    for (let node = this; node; node = event.bubbles ? node.parentElement : null) {
      for (const handler of [...(node._listeners[event.type] || [])]) handler.call(node, event);
      if (stopped) break;
    }
    return !event.defaultPrevented;
  }

  /** Dispatch a simple event of `type` with extra fields (key, detail...). */
  fire(type, init = {}) {
    const event = new FakeEvent(type, { bubbles: true, ...init });
    Object.assign(event, init);
    return this.dispatchEvent(event);
  }

  click() { this.fire('click'); }

  focus() { globalThis.document.activeElement = this; }

  blur() {}

  scrollIntoView() {}

  getBoundingClientRect() { return { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }; }

  contains(node) {
    for (let current = node; current; current = current.parentElement) if (current === this) return true;
    return false;
  }

  matches(selector) {
    return String(selector).split(',').some((part) => matchesOne(this, part.trim()));
  }

  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }

  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

/** Match `tag`, `.class`, `tag.class` or `[name="value"]`. */
function matchesOne(element, selector) {
  const attr = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (attr) return attr[2] === undefined ? element.hasAttribute(attr[1]) : element.getAttribute(attr[1]) === attr[2];
  const [tag, ...classes] = selector.split('.');
  if (tag && element.tagName !== tag.toUpperCase()) return false;
  return classes.every((name) => element.classList.contains(name));
}

/** Install the fake DOM globals once; returns the fake document. */
export function installFakeDom() {
  if (globalThis.document?.__fake) return globalThis.document;
  const body = new FakeElement('body');
  const listeners = new FakeElement('document');
  globalThis.Element = FakeElement;
  globalThis.HTMLElement = FakeElement;
  globalThis.document = {
    __fake: true,
    body,
    activeElement: null,
    createElement: (tag) => new FakeElement(tag),
    addEventListener: (...args) => listeners.addEventListener(...args),
    removeEventListener: (...args) => listeners.removeEventListener(...args)
  };
  globalThis.window ??= {
    innerHeight: 800,
    innerWidth: 1200,
    navigator: globalThis.navigator ?? { userAgent: 'node' },
    addEventListener() {},
    removeEventListener() {}
  };
  return globalThis.document;
}

/** Wait for pending promises and timers of `ms`. */
export function flush(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
