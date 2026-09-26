/**
 * @file HFilterInlineHelper.js
 * @brief Inline query helper: context token hints while typing, human sentence after.
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
import { UserGroupSource } from '#shared/data/valueSources/index.js';
import { $HR } from '#shared/ui';
import { parseTextQuery } from '../../utils/parseTextQuery.js';
import { queryDescribe } from '../../utils/queryDescribe.js';
import { queryToArray } from '../../utils/queryModel.js';
import { canonicalPredicate } from '../../utils/queryPredicates.js';
import { kindFor, operatorsFor, str } from '../../utils/vocabHelpers.js';
import './HFilterInlineHelper.css';

const HEADER_BASES = new Set([
  'title', 'url', 'notes', 'added', 'modified', 'after', 'before', 'ids', 'owner', 'addedby', 'access', 'tag', 'user'
]);
const IDLE_MS = 700;
const HINT_DEBOUNCE_MS = 120;
const MAX_HINTS = 500;

/** Binds token-hint autocomplete and a post-parse sentence readout to a query input. */
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

  /**
   * Attach the helper to the query input it will augment.
   *
   * @param {HTMLInputElement|HTMLTextAreaElement} input Input to bind to.
   * @param {{showBuilderButton?: boolean}} [options] Attach options.
   * @returns {HFilterInlineHelper} This instance, for chaining.
   * @throws {TypeError} When `input` is not an `HTMLElement`.
   */
  attach(input, options = {}) {
    if (!(input instanceof HTMLElement)) throw new TypeError('HFilterInlineHelper needs an input element');
    this.input = input;
    this.options = { showBuilderButton: true, ...options };
    this.state = 'attached';
    return this;
  }

  /**
   * Build the hint dropdown and sentence panel, and wire up the input's event handlers.
   *
   * @returns {HFilterInlineHelper} This instance, for chaining.
   * @throws {Error} When the helper has not been attached yet.
   */
  render() {
    if (!this.input) throw new Error('HFilterInlineHelper must be attached before render');
    const input = this.input;
    this._row = input.parentElement || input;
    if (this._row) this._row.style.position = this._row.style.position || 'relative';

    // hint dropdown - kept inside the row so the surrounding flyout's
    // outside-pointer close logic does not treat it as "outside", but shown as
    // a manual popover (top layer, fixed position) so ancestor `overflow` and
    // the flyout's own bounds cannot clip it
    this._hintBox = el('div', 'h-fih-hints');
    this._hintBox.hidden = true;
    if (typeof this._hintBox.showPopover === 'function') this._hintBox.popover = 'manual';
    this._row.append(this._hintBox);
    const reposition = () => { if (!this._hintBox.hidden) this._positionHints(); };
    this.listen(window, 'resize', reposition);
    this.listen(window, 'scroll', reposition, true);

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

  /**
   * Hide the sentence, and (re)schedule hints and the idle-triggered sentence update.
   *
   * @private
   * @returns {void}
   */
  _onInput() {
    this._hideSentence();               // D6: no prose while typing
    this._scheduleHints();
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => this._updateSentence(), IDLE_MS);
  }

  /**
   * Handle hint-navigation keys (arrows, Escape, Tab to apply) while the hint dropdown is open.
   * Enter is left to the host (it starts the search) and only closes the dropdown.
   *
   * @private
   * @param {KeyboardEvent} event Originating keydown event.
   * @returns {void}
   */
  _onKeyDown(event) {
    if (this._hintBox?.hidden) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); this._moveHint(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); this._moveHint(-1); }
    else if (event.key === 'Escape') { event.preventDefault(); this._closeHints(); }
    else if (event.key === 'Enter') { clearTimeout(this._hintTimer); this._closeHints(); }
    else if (event.key === 'Tab' && !event.shiftKey && this._activeHint >= 0) {
      event.preventDefault();
      this._applyHint(this._hintItems[this._activeHint]);
    }
  }

  /**
   * Request database definitions from `onNeedDbDefs`, once, when not already available.
   *
   * @private
   * @returns {void}
   */
  _requestDbDefs() {
    if (this.dbdefs || this._dbDefsRequested) return;
    this._dbDefsRequested = true;
    Promise.resolve(this._onNeedDbDefs?.())
      .then((d) => { if (d) this.setDbDefs(d); })
      .catch(() => { this._dbDefsRequested = false; });
  }

  /**
   * Debounce a hint refresh.
   *
   * @private
   * @returns {void}
   */
  _scheduleHints() {
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this._updateHints(), HINT_DEBOUNCE_MS);
  }

  // ------------------------------------------------------------------- hints ---

  /**
   * Recompute and show (or close) the hint dropdown for the caret's current token.
   *
   * @private
   * @returns {void}
   */
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

  /**
   * Render the hint dropdown's current items, highlighting the active one.
   *
   * @private
   * @returns {void}
   */
  _renderHints() {
    this._hintBox.replaceChildren();
    this._hintItems.forEach((item, i) => {
      const b = el('button', 'h-menu-item h-fih-hint');
      b.type = 'button';
      if (i === this._activeHint) b.classList.add('is-active');
      const label = el('span', 'h-fih-hint-label');
      label.textContent = item.label;
      if (item.depth) label.style.paddingInlineStart = `${item.depth * 14}px`;
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
    if (this._hintBox.popover && !this._hintBox.matches(':popover-open')) {
      try { this._hintBox.showPopover(); } catch { /* detached or unsupported */ }
    }
    this._positionHints();
    this._hintBox.children[this._activeHint]?.scrollIntoView?.({ block: 'nearest' });
  }

  /**
   * Place the fixed-position hint dropdown under the input, or above it when
   * there is not enough room below, clamped to the viewport.
   *
   * @private
   * @returns {void}
   */
  _positionHints() {
    const box = this._hintBox;
    if (!box || !this.input) return;
    const r = this.input.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    box.style.minWidth = `${Math.min(Math.max(220, r.width), 420)}px`;
    const h = box.offsetHeight;
    const w = box.offsetWidth;
    const below = vh - r.bottom;
    const top = (below < h + 4 && r.top > below) ? Math.max(4, r.top - h - 2) : r.bottom + 2;
    box.style.top = `${top}px`;
    box.style.left = `${Math.max(4, Math.min(r.left, vw - w - 4))}px`;
  }

  /**
   * Move the active hint selection by `delta`, wrapping around.
   *
   * @private
   * @param {number} delta `1` for next, `-1` for previous.
   * @returns {void}
   */
  _moveHint(delta) {
    const n = this._hintItems.length;
    if (!n) return;
    this._activeHint = (this._activeHint + delta + n) % n;
    this._renderHints();
  }

  /**
   * Insert a chosen hint's text into the input at the current token, replacing it.
   *
   * @private
   * @param {{insert: string}} item Hint item; see `_computeHints`.
   * @returns {void}
   */
  _applyHint(item) {
    if (!item) return;
    const value = this.input.value;
    const caret = this.input.selectionStart ?? value.length;
    const head = value.slice(0, this._tokenStart);
    const tail = value.slice(caret);
    const insert = item.insert;
    this.input.value = head + insert + tail;
    const pos = head.length + insert.length - (item.caretBack || 0);
    this.input.setSelectionRange(pos, pos);
    this.input.focus();
    this._closeHints();
    // a programmatic value change fires no `input` event: raise one so the sentence
    // (and any host listener) follow the inserted text exactly as if it were typed
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    this._onChange?.(this.input.value);
  }

  /**
   * Hide the hint dropdown and clear its item list.
   *
   * @private
   * @returns {void}
   */
  _closeHints() {
    if (this._hintBox?.popover && this._hintBox.matches(':popover-open')) {
      try { this._hintBox.hidePopover(); } catch { /* already closed */ }
    }
    if (this._hintBox) this._hintBox.hidden = true;
    this._hintItems = [];
    this._activeHint = -1;
  }

  /**
   * Hints for the token at the caret. Context (prior tokens, scope record type)
   * comes from the innermost open `( … )` group, so `lt134(t:12 |)` offers the
   * fields of record type 12.
   *
   * @returns {{tokenStart:number, items:{label:string,sub?:string,insert:string,
   *           caretBack?:number,depth?:number}[]}|null}
   */
  _computeHints(value, caret) {
    if (!this.dbdefs) return null;
    const before = value.slice(0, caret);
    const stack = scopeStack(before);
    const scope = stack[stack.length - 1].text;
    const curr = scope.slice(Math.max(0, scope.search(/\S*$/)));
    const tokenStart = before.length - curr.length;
    const priorTokens = scope.slice(0, scope.length - curr.length).trim().split(/\s+/).filter(Boolean);
    const rtyCtx = this._rtyContext(priorTokens);
    // inside related( … ): the Relationship record's conditions are offered too
    const inRelation = stack.length > 1 && isRelationOpener(stack[stack.length - 1].opener);
    const outerRty = inRelation
      ? this._rtyContext(stack[stack.length - 2].text.trim().split(/\s+/).filter(Boolean)) : '';

    const ci = curr.indexOf(':');

    // ---- key stage: still typing the predicate key ----
    if (ci < 0) {
      const q = curr.toLowerCase();
      const items = [];

      if (priorTokens.length === 0) {
        for (const rt of this._usedRectypes()) {
          items.push({ label: rt.name, sub: $HR('record type'), insert: `t:${rt.id} ` });
        }
      } else if (rtyCtx) {
        if (inRelation) items.push({ label: $HR('Relation type'), sub: $HR('relationship'), insert: 'r:' });
        items.push(...this._fieldItems(rtyCtx));
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
      const items = this._usedRectypes().map((rt) => ({
        label: rt.name, sub: $HR('record type'), insert: `t:${rt.id} `
      }));
      return { tokenStart, items: filterByLabel(items, valSoFar.toLowerCase()) };
    }

    // r: inside related( … ) -> relation types (inserted as ids; the server needs ids)
    if (base === 'r' && inRelation && !/^\d+:/.test(valSoFar)) {
      const typed = valSoFar.split(',').pop();
      const done = valSoFar.slice(0, valSoFar.length - typed.length);
      const items = [];
      for (const root of this._relationVocabRoots(outerRty, rtyCtx)) {
        for (const { term, depth } of this._vocabTerms(root)) {
          items.push({ label: term.label, sub: $HR('relation type'), insert: `r:${done}${term.id} `, depth });
        }
      }
      return { tokenStart, items: filterByLabel(items, typed.toLowerCase()) };
    }

    // geo[:<id>] -> offer the match mode; once chosen, the value is free WKT
    if (base === 'geo') {
      const m = /^(?:(\d+):?)?([a-z]*)$/i.exec(valSoFar);
      if (!m) return null;
      const prefix = m[1] ? `geo:${m[1]}:` : 'geo:';
      const items = operatorsFor(this.vocab, 'geo').filter((op) => op.geoMode).map((op) => ({
        label: str(this.vocab, this.lang, op.i18nKey), sub: $HR('operator'), insert: `${prefix}${op.geoMode}:`
      }));
      return { tokenStart, items: filterByLabel(items, m[2].toLowerCase()) };
    }

    // resolve to a concrete field id + kind
    let dtyId = null;
    let keyPrefix = `${keyPart}:`;
    if (base === 'f') {
      const m = /^(\d+)(?::)?(.*)$/.exec(valSoFar);
      if (m) { dtyId = Number(m[1]); keyPrefix = `f:${m[1]}:`; }
      else if (rtyCtx) {
        // bare `f:` -> offer the scope record type's fields
        return { tokenStart, items: filterByLabel(this._fieldItems(rtyCtx), valSoFar.toLowerCase()) };
      }
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

    // enum term values - whole vocabulary, depth-first, indented by level
    if (kind === 'enum' && dtyId != null) {
      const root = this.dbdefs.vocabRoot?.(dtyId) || 0;
      for (const { term: t, depth } of root ? this._vocabTerms(root) : []) {
        const val = /[\s()]/.test(t.label) ? `"${t.label}"` : t.label;
        items.push({ label: t.label, sub: $HR('term'), insert: `${keyPrefix}${val} `, depth });
      }
    }

    // owner / creator / bookmarked-by values: the visible groups and users from
    // HDbDefs (V5, no server request); inserted as IDs after any typed "-" sign
    if (['owner', 'addedby', 'user'].includes(base) && this.dbdefs.hasUserGroups?.()) {
      const sign = /^-/.test(valTail) ? '-' : '';
      const typed = valTail.replace(/^-/, '');
      const people = new UserGroupSource(this.dbdefs, { groups: base === 'owner' }).items();
      // text operators do not apply: users and groups match by ID ("-" negates)
      items.length = 0;
      for (const person of people) {
        items.push({
          label: person.label,
          sub: person.group === 'groups' ? $HR('group') : $HR('user'),
          insert: `${keyPrefix}${sign}${person.value} `
        });
      }
      return { tokenStart, items: filterByLabel(items, typed.toLowerCase()) };
    }

    return { tokenStart, items: filterByLabel(items, valTail.toLowerCase()) };
  }

  /** Record types that have records (all of them while usage counts are unknown). */
  _usedRectypes() {
    return this.dbdefs.rectypes().filter((rt) => this.dbdefs.isRectypeUsed?.(rt.id) !== false);
  }

  /**
   * Field hints for a record type. Resource (pointer) fields insert a linked
   * sub-query `lt<dty>(t:<targets> )` with the caret left inside the parentheses.
   *
   * @private
   * @param {number|string} rtyId Scope record type.
   * @returns {{label:string,sub:string,insert:string,caretBack?:number}[]}
   */
  _fieldItems(rtyId) {
    const items = [];
    for (const f of this.dbdefs.fields(rtyId) || []) {
      if (f.type === 'relmarker') {
        // relationships are bidirectional: related(t:<targets> …), relation type via r:<id>
        const targets = (this.dbdefs.field?.(rtyId, f.id) || this.dbdefs.fieldGlobal?.(f.id))?.targetTypes || [];
        const inner = targets.length ? `t:${targets.join(',')} ` : '';
        items.push({ label: f.name, sub: f.type, insert: `related(${inner})`, caretBack: 1 });
      } else if (f.type === 'resource') {
        const def = this.dbdefs.field?.(rtyId, f.id) || this.dbdefs.fieldGlobal?.(f.id);
        const targets = def?.targetTypes || [];
        const inner = targets.length ? `t:${targets.join(',')} ` : '';
        items.push({ label: f.name, sub: f.type, insert: `lt${f.id}(${inner})`, caretBack: 1 });
      } else {
        // geo fields use the spatial predicate; its hints then offer the match mode
        items.push({ label: f.name, sub: f.type, insert: f.type === 'geo' ? `geo:${f.id}:` : `f:${f.id}:` });
      }
    }
    return items;
  }

  /**
   * Vocabulary roots for relation types: those of the outer record type's relmarkers
   * that reach the related record type; else of every relmarker in the database.
   *
   * @private
   * @param {number|string} outerRty Record type the related( … ) group hangs off.
   * @param {number|string} innerRty Related record type (`t:` inside the group).
   * @returns {number[]}
   */
  _relationVocabRoots(outerRty, innerRty) {
    const collect = (rtyIds) => {
      const roots = new Set();
      for (const rty of rtyIds) {
        for (const f of this.dbdefs.fields(rty) || []) {
          if (f.type !== 'relmarker') continue;
          const targets = (this.dbdefs.fieldGlobal?.(f.id)?.targetTypes || []).map(Number);
          if (Number(innerRty) > 0 && targets.length && !targets.includes(Number(innerRty))) continue;
          const root = this.dbdefs.vocabRoot?.(f.id);
          if (root) roots.add(root);
        }
      }
      return [...roots];
    };
    const own = Number(outerRty) > 0 ? collect([Number(outerRty)]) : [];
    return own.length ? own : collect((this.dbdefs.rectypes() || []).map((rt) => rt.id));
  }

  /**
   * Flatten a vocabulary depth-first (root excluded), keeping each term's level.
   *
   * @private
   * @param {number} root Vocabulary root term id.
   * @returns {{term:{id:number,label:string}, depth:number}[]}
   */
  _vocabTerms(root) {
    const tree = this.dbdefs.termTree(root);
    const out = [];
    const walk = (nodes, depth) => {
      for (const n of nodes || []) {
        if (!n || n.id === root) continue;
        if (n.label) out.push({ term: n, depth });
        walk(n.children, depth + 1);
      }
    };
    walk(Array.isArray(tree) ? tree : tree?.children, 0);
    return out;
  }

  /**
   * Resolve the scope record type implied by prior tokens (a leading bare name/id, or an explicit `t:`).
   *
   * @private
   * @param {string[]} tokens Whitespace-split tokens before the caret.
   * @returns {number|string} Resolved rectype id, or `''` when none.
   */
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

  /**
   * Resolve a `t:` token's text to a rectype id: numeric id, or a name lookup via `dbdefs`.
   *
   * @private
   * @param {string} text Rectype id or name.
   * @returns {number|string} Resolved rectype id, or `''` when unresolved.
   */
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

  /**
   * Parse and describe the current input text, showing or hiding the sentence panel accordingly.
   *
   * @private
   * @returns {void}
   */
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
    if (this.options.showBuilderButton && typeof this._onOpenBuilder === 'function') {
      const link = el('button', 'h-btn h-btn-small h-fih-edit');
      link.type = 'button';
      link.textContent = $HR('Edit in builder');
      this.listen(link, 'click', () => this._openBuilder());
      this._sentence.append(link);
    }
    this._sentence.hidden = false;
    this._onChange?.(this.input.value, sentence);
  }

  /**
   * Hide the sentence panel.
   *
   * @private
   * @returns {void}
   */
  _hideSentence() {
    if (this._sentence) this._sentence.hidden = true;
  }

  /**
   * Parse the current input text and hand it to `onOpenBuilder`.
   *
   * @private
   * @returns {void}
   */
  _openBuilder() {
    if (typeof this._onOpenBuilder !== 'function') return;
    let seed = [];
    try { seed = this._toQuery(this.input.value); } catch { seed = []; }
    this._onOpenBuilder({ query: seed, rawText: this.input.value, input: this.input });
  }

  /**
   * Detach listeners and remove the hint/sentence/builder-button DOM.
   *
   * @returns {Promise<void>}
   */
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

/** Create an element, optionally with a class name. */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Still-open `( … )` groups before the caret, outermost first. Each has the
 * keyword that opened it (`related`, `lt134` …; `''` at top level) and its text
 * so far, with closed groups collapsed out (double-quoted text is kept verbatim).
 *
 * @returns {{opener:string, text:string}[]}
 */
function scopeStack(before) {
  const stack = [{ opener: '', text: '' }];
  let quoted = false;
  for (const ch of before) {
    const top = stack[stack.length - 1];
    if (quoted) { top.text += ch; if (ch === '"') quoted = false; }
    else if (ch === '"') { quoted = true; top.text += ch; }
    else if (ch === '(') stack.push({ opener: (top.text.match(/\S*$/)?.[0] || '').toLowerCase(), text: '' });
    else if (ch === ')') { if (stack.length > 1) stack.pop(); stack[stack.length - 1].text += ' '; }
    else top.text += ch;
  }
  return stack;
}

/** Whether a group opener (`related`, `rt`, `relatedfrom:12` …) starts a relationship sub-query. */
function isRelationOpener(opener) {
  const base = String(opener || '').split(':')[0].replace(/\d+$/, '');
  return ['related', 'rt', 'rf'].includes(canonicalPredicate(base) || base);
}

/** Filter and rank items by label: prefix matches first, then substring matches. */
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
