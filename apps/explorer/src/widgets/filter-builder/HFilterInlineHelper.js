/**
 * @file HFilterInlineHelper.js
 * @brief Inline query helper: context token hints while typing, human sentence after.
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer.widgets.filter
 * @link        https://HeuristNetwork.org
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 *
 * Binds to any <input>/<textarea> carrying a Heurist keyword query (plan §8 / D6):
 *   - while typing  -> a token-hint dropdown only (record type -> field ->
 *     operator -> value -> repeat). No prose while typing.
 *   - after a pause / on blur -> parse the text and, if it yields a query, show
 *     the `queryDescribe()` sentence below the input for the user to confirm.
 *   - an optional "open builder" affordance hands the parsed query to
 *     `HFilterBuilder`.
 *
 * `parseText` / `describe` are injectable so a host can swap in the canonical
 * server implementations later; the defaults are the client-min ones.
 */

import { HBaseWidget } from '#shared/widgets/HBaseWidget.js';
import { $HR } from '#shared/ui';
import { parseTextQuery } from '../../utils/parseTextQuery.js';
import { queryDescribe } from '../../utils/queryDescribe.js';
import { queryToArray } from '../../utils/queryModel.js';
import { canonicalPredicate } from '../../utils/queryPredicates.js';
import { kindFor, operatorsFor, str } from '../../utils/vocabHelpers.js';
import './HFilterInlineHelper.css';

const HEADER_BASES = new Set([
  'title', 'url', 'notes', 'added', 'modified', 'ids', 'owner', 'addedby', 'access', 'tag', 'user'
]);
const IDLE_MS = 700;
const HINT_DEBOUNCE_MS = 120;
const MAX_HINTS = 12;

export class HFilterInlineHelper extends HBaseWidget {
  /**
   * @param {{vocabulary:object, lang?:string, dbdefs?:object,
   *          parseText?:Function, describe?:Function,
   *          onOpenBuilder?:Function, onNeedDbDefs?:Function,
   *          onChange?:Function}} deps
   */
  constructor({
    vocabulary, lang = 'eng', dbdefs = null,
    parseText, describe, onOpenBuilder = null, onNeedDbDefs = null, onChange = null
  } = {}) {
    super();
    if (!vocabulary) throw new TypeError('HFilterInlineHelper requires vocabulary');
    this.vocab = vocabulary;
    this.lang = lang;
    this.dbdefs = dbdefs;
    this._parseText = parseText || ((t) => parseTextQuery(t, { dbdefs: this.dbdefs }));
    this._describe = describe
      || ((q) => queryDescribe(q, { dbdefs: this.dbdefs, vocabulary: this.vocab, lang: this.lang }));
    this._onOpenBuilder = onOpenBuilder;
    this._onNeedDbDefs = onNeedDbDefs;
    this._onChange = onChange || (() => {});

    this.input = null;
    this._hintItems = [];
    this._activeHint = -1;
    this._idleTimer = null;
    this._hintTimer = null;
  }

  /** @param {HTMLInputElement|HTMLTextAreaElement} input */
  attach(input, options = {}) {
    if (!(input instanceof HTMLElement)) throw new TypeError('HFilterInlineHelper needs an input element');
    this.input = input;
    this.options = { showBuilderButton: true, ...options };
    this.state = 'attached';
    return this;
  }

  render() {
    if (!this.input) throw new Error('HFilterInlineHelper must be attached before render');
    const input = this.input;
    this._row = input.parentElement || input;
    if (this._row) this._row.style.position = this._row.style.position || 'relative';

    // hint dropdown - kept inside the row so the surrounding flyout's
    // outside-pointer close logic does not treat it as "outside"
    this._hintBox = el('div', 'h-fih-hints');
    this._hintBox.hidden = true;
    this._row.append(this._hintBox);

    // sentence panel - normal flow, right after the input's section
    this._sentence = el('div', 'h-fih-sentence');
    this._sentence.hidden = true;
    (input.closest('.h-filter-direct') || this._row).after(this._sentence);

    if (this.options.showBuilderButton && typeof this._onOpenBuilder === 'function') {
      this._builderBtn = el('button', 'h-btn h-btn-small h-fih-builder');
      this._builderBtn.type = 'button';
      this._builderBtn.textContent = $HR('Builder');
      this._builderBtn.title = $HR('Open the Filter Builder');
      this.listen(this._builderBtn, 'click', () => this._openBuilder());
      input.after(this._builderBtn);
    }

    this.listen(input, 'input', () => this._onInput());
    this.listen(input, 'keydown', (e) => this._onKeyDown(e));
    this.listen(input, 'focus', () => { this._requestDbDefs(); this._scheduleHints(); });
    this.listen(input, 'click', () => this._scheduleHints());
    this.listen(input, 'blur', () => {
      // let a hint click land first
      setTimeout(() => this._closeHints(), 120);
      this._updateSentence();
    });

    this.state = 'rendered';
    return this;
  }

  /** Supply (or replace) the database definitions once loaded. */
  setDbDefs(dbdefs) {
    this.dbdefs = dbdefs || null;
    if (this.isRendered && document.activeElement === this.input) this._scheduleHints();
    return this;
  }

  /** Force the post-parse sentence now (e.g. after the builder writes back). */
  refreshSentence() {
    this._updateSentence();
    return this;
  }

  // ---------------------------------------------------------------- lifecycle ---

  _onInput() {
    this._hideSentence();               // D6: no prose while typing
    this._scheduleHints();
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => this._updateSentence(), IDLE_MS);
  }

  _onKeyDown(event) {
    if (this._hintBox?.hidden) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); this._moveHint(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); this._moveHint(-1); }
    else if (event.key === 'Escape') { event.preventDefault(); this._closeHints(); }
    else if ((event.key === 'Enter' || event.key === 'Tab') && this._activeHint >= 0) {
      event.preventDefault();
      this._applyHint(this._hintItems[this._activeHint]);
    }
  }

  _requestDbDefs() {
    if (this.dbdefs || this._dbDefsRequested) return;
    this._dbDefsRequested = true;
    Promise.resolve(this._onNeedDbDefs?.())
      .then((d) => { if (d) this.setDbDefs(d); })
      .catch(() => { this._dbDefsRequested = false; });
  }

  _scheduleHints() {
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this._updateHints(), HINT_DEBOUNCE_MS);
  }

  // ------------------------------------------------------------------- hints ---

  _updateHints() {
    if (!this.isRendered || document.activeElement !== this.input) return;
    if (!this.dbdefs) { this._closeHints(); return; }

    const caret = this.input.selectionStart ?? this.input.value.length;
    const plan = this._computeHints(this.input.value, caret);
    if (!plan || !plan.items.length) { this._closeHints(); return; }

    this._tokenStart = plan.tokenStart;
    this._hintItems = plan.items.slice(0, MAX_HINTS);
    this._activeHint = 0;
    this._renderHints();
  }

  _renderHints() {
    this._hintBox.replaceChildren();
    this._hintItems.forEach((item, i) => {
      const b = el('button', 'h-menu-item h-fih-hint');
      b.type = 'button';
      if (i === this._activeHint) b.classList.add('is-active');
      const label = el('span', 'h-fih-hint-label');
      label.textContent = item.label;
      b.append(label);
      if (item.sub) {
        const sub = el('span', 'h-fih-hint-sub');
        sub.textContent = item.sub;
        b.append(sub);
      }
      // mousedown (not click) so it fires before the input's blur
      b.addEventListener('mousedown', (e) => { e.preventDefault(); this._applyHint(item); });
      this._hintBox.append(b);
    });
    this._hintBox.hidden = false;
  }

  _moveHint(delta) {
    const n = this._hintItems.length;
    if (!n) return;
    this._activeHint = (this._activeHint + delta + n) % n;
    this._renderHints();
  }

  _applyHint(item) {
    if (!item) return;
    const value = this.input.value;
    const caret = this.input.selectionStart ?? value.length;
    const head = value.slice(0, this._tokenStart);
    const tail = value.slice(caret);
    const insert = item.insert;
    this.input.value = head + insert + tail;
    const pos = head.length + insert.length;
    this.input.setSelectionRange(pos, pos);
    this.input.focus();
    this._closeHints();
    this._scheduleHints();
    this._onChange?.(this.input.value);
  }

  _closeHints() {
    if (this._hintBox) this._hintBox.hidden = true;
    this._hintItems = [];
    this._activeHint = -1;
  }

  /**
   * @returns {{tokenStart:number, items:{label:string,sub?:string,insert:string}[]}|null}
   */
  _computeHints(value, caret) {
    if (!this.dbdefs) return null;
    const before = value.slice(0, caret);
    const tokenStart = Math.max(0, before.search(/\S*$/));
    const curr = before.slice(tokenStart);
    const priorTokens = before.slice(0, tokenStart).trim().split(/\s+/).filter(Boolean);
    const rtyCtx = this._rtyContext(priorTokens);

    const ci = curr.indexOf(':');

    // ---- key stage: still typing the predicate key ----
    if (ci < 0) {
      const q = curr.toLowerCase();
      const items = [];

      if (priorTokens.length === 0) {
        for (const rt of this.dbdefs.rectypes()) {
          items.push({ label: rt.name, sub: $HR('record type'), insert: `t:${rt.id} ` });
        }
      } else if (rtyCtx) {
        for (const f of this.dbdefs.fields(rtyCtx)) {
          items.push({ label: f.name, sub: f.type, insert: `f:${f.id}:` });
        }
      }
      for (const base of HEADER_BASES) {
        items.push({ label: base, sub: $HR('record property'), insert: `${base}:` });
      }
      return { tokenStart, items: filterByLabel(items, q) };
    }

    // ---- value stage: key is typed, now operator / value ----
    const keyPart = curr.slice(0, ci).toLowerCase();
    const valSoFar = curr.slice(ci + 1);
    const base = canonicalPredicate(keyPart) || keyPart;

    if (base === 't') {
      const items = this.dbdefs.rectypes().map((rt) => ({
        label: rt.name, sub: $HR('record type'), insert: `t:${rt.id} `
      }));
      return { tokenStart, items: filterByLabel(items, valSoFar.toLowerCase()) };
    }

    // resolve to a concrete field id + kind
    let dtyId = null;
    let keyPrefix = `${keyPart}:`;
    if (base === 'f') {
      const m = /^(\d+)(?::)?(.*)$/.exec(valSoFar);
      if (m) { dtyId = Number(m[1]); keyPrefix = `f:${m[1]}:`; }
    } else if (!HEADER_BASES.has(base)) {
      const hit = this.dbdefs.fieldIdByName?.(rtyCtx || '', keyPart);
      const one = Array.isArray(hit) ? hit[0] : hit;
      if (one) { dtyId = one; keyPrefix = `f:${one}:`; }
    }

    const kind = HEADER_BASES.has(base)
      ? kindFor(this.vocab, null, base)
      : (dtyId != null
        ? kindFor(this.vocab, this.dbdefs.fieldType?.('', dtyId) || 'freetext')
        : null);
    if (!kind) return null;

    const valTail = valSoFar.replace(/^\d+:?/, '');
    const items = [];

    // operators (only while the value part is still empty-ish)
    if (valTail === '' || /^[<>=@~!-]+$/.test(valTail)) {
      for (const op of operatorsFor(this.vocab, kind)) {
        const sym = op.whole ? op.token : (op.token || '=');
        items.push({
          label: `${sym}  ${str(this.vocab, this.lang, op.i18nKey)}`,
          sub: $HR('operator'),
          insert: `${keyPrefix}${op.token}`
        });
      }
    }

    // enum term values
    if (kind === 'enum' && dtyId != null) {
      const root = this.dbdefs.vocabRoot?.(dtyId) || 0;
      const terms = root ? this.dbdefs.termTree(root, { flat: true }) : [];
      for (const t of terms) {
        if (!t || t.id === root) continue;
        items.push({ label: t.label, sub: $HR('term'), insert: `${keyPrefix}${t.label} ` });
      }
    }

    return { tokenStart, items: filterByLabel(items, valTail.toLowerCase()) };
  }

  _rtyContext(tokens) {
    let ctx = '';
    for (const tok of tokens) {
      const ci = tok.indexOf(':');
      if (ci > -1 && (canonicalPredicate(tok.slice(0, ci).toLowerCase()) === 't')) {
        ctx = this._resolveRty(tok.slice(ci + 1));
      } else if (!ctx && tokens.indexOf(tok) === 0) {
        ctx = this._resolveRty(tok);
      }
    }
    return ctx;
  }

  _resolveRty(text) {
    const raw = String(text ?? '').trim();
    if (/^\d+$/.test(raw)) return Number(raw);
    const hit = this.dbdefs?.rectypeIdByName?.(raw);
    return (Array.isArray(hit) ? hit[0] : hit) || '';
  }

  // ---------------------------------------------------------------- sentence ---

  /** Current input text -> `q`-array (accepts keyword syntax OR pasted JSON). */
  _toQuery(text) {
    const t = String(text ?? '').trim();
    if (!t) return [];
    if (t[0] === '[' || t[0] === '{') {
      const arr = queryToArray(t);
      if (arr.length) return arr;
    }
    const q = this._parseText(t) || [];
    return Array.isArray(q) ? q : (Array.isArray(q?.q) ? q.q : []);
  }

  _updateSentence() {
    if (!this.isRendered) return;
    const text = this.input.value.trim();
    let sentence = '';
    if (text) {
      try {
        const arr = this._toQuery(text);
        if (arr.length) sentence = this._describe(arr) || '';
      } catch { sentence = ''; }
    }
    this._lastSentence = sentence;
    if (!sentence) { this._hideSentence(); return; }

    this._sentence.replaceChildren();
    const txt = el('span', 'h-fih-sentence-text');
    txt.textContent = sentence;
    this._sentence.append(txt);
    if (typeof this._onOpenBuilder === 'function') {
      const link = el('button', 'h-btn h-btn-small h-fih-edit');
      link.type = 'button';
      link.textContent = $HR('Edit in builder');
      this.listen(link, 'click', () => this._openBuilder());
      this._sentence.append(link);
    }
    this._sentence.hidden = false;
    this._onChange?.(this.input.value, sentence);
  }

  _hideSentence() {
    if (this._sentence) this._sentence.hidden = true;
  }

  _openBuilder() {
    if (typeof this._onOpenBuilder !== 'function') return;
    let seed = [];
    try { seed = this._toQuery(this.input.value); } catch { seed = []; }
    this._onOpenBuilder({ query: seed, rawText: this.input.value, input: this.input });
  }

  async destroy() {
    clearTimeout(this._idleTimer);
    clearTimeout(this._hintTimer);
    this.clearListeners();
    this._hintBox?.remove();
    this._sentence?.remove();
    this._builderBtn?.remove();
    this.input = null;
    this.state = 'destroyed';
  }
}

// --------------------------------------------------------------------- helpers ---

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function filterByLabel(items, q) {
  if (!q) return items;
  const starts = [];
  const contains = [];
  for (const it of items) {
    const l = it.label.toLowerCase();
    if (l.startsWith(q)) starts.push(it);
    else if (l.includes(q)) contains.push(it);
  }
  return [...starts, ...contains];
}
