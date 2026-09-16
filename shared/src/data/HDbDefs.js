/**
 * @file HDbDefs.js
 * @brief Client-side Heurist database-definition layer for the Explorer.
 *
 * Requests, parses and stores the definition snapshot served by
 * `GET /api/{db}/def/snapshot`, then answers the id <-> name / label questions the
 * Filter Builder, describer and inline helper need. Framework-free: no
 * `window.hWin`, no jQuery. Both resolution directions live here - id -> name
 * (Task A) and name/label -> id (Task B-min, builder value entry).
 *
 * The linked / reverse-pointer graph is NOT in the snapshot; it is computed on
 * construction from `fields[].targetTypes` + `structure`, mirroring the legacy
 * `$Db.rst_links()` (`hclient/core/utils_dbs.js`).
 *
 * See docs/query-language-filter-builder-plan.md sections 4 and 5.
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

/** Shared frozen empty array so accessors never leak a mutable internal list. */
const EMPTY = Object.freeze([]);

/** Field `dty_Type` values that create a record-to-record link. */
const RESOURCE_TYPE = 'resource';
const RELMARKER_TYPE = 'relmarker';

export class HDbDefs {
  /**
   * Fetch and parse the definition snapshot.
   *
   * @param {string} url Absolute or relative `/api/{db}/def/snapshot` URL.
   * @param {{lang?:string, fetchFn?:Function}} [opts] `lang` adds `?lang=`;
   *        `fetchFn` injects a fetch implementation (tests, non-browser hosts).
   * @returns {Promise<HDbDefs>} Parsed instance.
   */
  static async load(url, { lang = null, fetchFn = null } = {}) {
    const doFetch = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (typeof doFetch !== 'function') {
      throw new TypeError('HDbDefs.load: no fetch implementation available');
    }
    const target = new URL(String(url), globalThis.location?.href || 'http://localhost/');
    if (lang) target.searchParams.set('lang', lang);

    const response = await doFetch(target.toString(), { headers: { Accept: 'application/json' } });
    if (!response || !response.ok) {
      throw new Error(`HDbDefs.load: request failed (${response ? response.status : 'no response'})`);
    }
    return new HDbDefs(await response.json());
  }

  /**
   * @param {object} snapshot Parsed snapshot payload, or a `{data:{...}}` envelope
   *        wrapping it. Must contain a `meta` block.
   */
  constructor(snapshot) {
    const snap = snapshot && snapshot.meta
      ? snapshot
      : (snapshot && snapshot.data && snapshot.data.meta ? snapshot.data : null);
    if (!snap) {
      throw new TypeError('HDbDefs: a snapshot payload with a meta block is required');
    }

    this.snapshot = snap;
    this.meta = snap.meta || {};
    this._rectypes = snap.rectypes || {};
    this._fields = snap.fields || {};
    this._terms = snap.terms || {};
    this._rectypeGroups = snap.rectypeGroups || {};
    this._fieldGroups = snap.fieldGroups || {};
    this._structure = Array.isArray(snap.structure) ? snap.structure : [];
    this._termlinks = Array.isArray(snap.termlinks) ? snap.termlinks : [];

    this._buildIndexes();
  }

  // ---------------------------------------------------------------- indexes ---

  /**
   * Build the structure/term-hierarchy/concept-code indexes and the link graph.
   *
   * @private
   * @returns {void}
   */
  _buildIndexes() {
    // structure rows grouped by rectype, order-sorted once
    this._structByRty = new Map();
    for (const row of this._structure) {
      let list = this._structByRty.get(row.rty);
      if (!list) this._structByRty.set(row.rty, (list = []));
      list.push(row);
    }
    for (const list of this._structByRty.values()) {
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    // term hierarchy (poly-hierarchy tolerated: values are arrays)
    this._termChildren = new Map();
    this._termParents = new Map();
    for (const { parent, term } of this._termlinks) {
      let kids = this._termChildren.get(parent);
      if (!kids) this._termChildren.set(parent, (kids = []));
      kids.push(term);
      let parents = this._termParents.get(term);
      if (!parents) this._termParents.set(term, (parents = []));
      parents.push(parent);
    }

    // concept code -> local id, per kind
    this._conceptToLocal = { rty: new Map(), dty: new Map(), trm: new Map() };
    for (const [id, r] of Object.entries(this._rectypes)) {
      if (r.concept) this._conceptToLocal.rty.set(r.concept, Number(id));
    }
    for (const [id, f] of Object.entries(this._fields)) {
      if (f.concept) this._conceptToLocal.dty.set(f.concept, Number(id));
    }
    for (const [id, t] of Object.entries(this._terms)) {
      if (t.concept) this._conceptToLocal.trm.set(t.concept, Number(id));
    }

    this._buildLinkGraph();
  }

  /**
   * Build `direct` / `reverse` (resource fields) and `relDirect` / `relReverse`
   * (relationship-marker fields) rectype maps, plus the `from:to -> dty` pointer
   * index. Unconstrained pointers (no `targetTypes`) are tracked per rectype and
   * folded in at query time so the maps stay small.
   */
  _buildLinkGraph() {
    this._direct = new Map();
    this._reverse = new Map();
    this._relDirect = new Map();
    this._relReverse = new Map();
    this._pointerFields = new Map();      // "from:to" -> Set<dty>
    this._unconstrainedByRty = new Map(); // rty -> Set<dty> (resource, no targetTypes)

    const add = (map, key, value) => {
      let set = map.get(key);
      if (!set) map.set(key, (set = new Set()));
      set.add(value);
    };

    for (const row of this._structure) {
      if (row.req === 'forbidden') continue;
      const field = this._fields[row.dty];
      if (!field) continue;

      const isResource = field.type === RESOURCE_TYPE;
      const isRelmarker = field.type === RELMARKER_TYPE;
      if (!isResource && !isRelmarker) continue;

      const targets = Array.isArray(field.targetTypes) ? field.targetTypes : [];
      if (!targets.length) {
        if (isResource) add(this._unconstrainedByRty, row.rty, row.dty);
        continue;
      }

      const dir = isRelmarker ? this._relDirect : this._direct;
      const rev = isRelmarker ? this._relReverse : this._reverse;
      for (const target of targets) {
        add(dir, row.rty, target);
        add(rev, target, row.rty);
        add(this._pointerFields, `${row.rty}:${target}`, row.dty);
      }
    }
  }

  /**
   * Every rectype id, computed once and cached.
   *
   * @private
   * @returns {number[]}
   */
  _allRectypeIds() {
    if (!this.__allRectypeIds) {
      this.__allRectypeIds = Object.keys(this._rectypes).map(Number);
    }
    return this.__allRectypeIds;
  }

  // ------------------------------------------------------------------- meta ---

  /** @returns {number} Registered DB id (`0` when unregistered). */
  dbId() {
    return Number(this.meta.dbId) || 0;
  }

  /** @returns {string} Snapshot version / ETag (cache-file mtime). */
  version() {
    return String(this.meta.version || '');
  }

  /** @returns {string} Language this snapshot was rendered in. */
  language() {
    return this.meta.language || 'eng';
  }

  /** @returns {string[]} Advertised available languages. */
  languages() {
    return Array.isArray(this.meta.languages) ? this.meta.languages.slice() : [];
  }

  /**
   * @param {string} name e.g. `RT_RELATION`, `DT_TARGET_RESOURCE`.
   * @returns {number|null} Reserved definition id, or null when absent.
   */
  dbconst(name) {
    const value = this.meta.dbconst?.[name];
    return value == null ? null : Number(value);
  }

  // ---------------------------------------------------------------- groups ---

  /** @returns {Array<{id,name,order}>} Rectype groups, order-sorted. */
  rectypeGroups() {
    return sortGroups(this._rectypeGroups);
  }

  /** @returns {Array<{id,name,order}>} Field groups, order-sorted. */
  fieldGroups() {
    return sortGroups(this._fieldGroups);
  }

  // -------------------------------------------------------------- rectypes ---

  /**
   * @returns {Array<{id,name,plural,group}>} Every rectype, sorted by group
   *          display order then name - ready for a grouped dropdown.
   */
  rectypes() {
    return Object.entries(this._rectypes)
      .map(([id, r]) => ({
        id: Number(id),
        name: r.name,
        plural: r.plural || r.name,
        group: r.group ?? null
      }))
      .sort((a, b) => {
        const byGroup = groupOrder(this._rectypeGroups, a.group) - groupOrder(this._rectypeGroups, b.group);
        return byGroup || String(a.name).localeCompare(String(b.name));
      });
  }

  /**
   * @param {number|string} id Rectype id.
   * @returns {{id,name,plural,group,concept,showInLists,description}|null}
   */
  rectype(id) {
    const r = this._rectypes[id];
    if (!r) return null;
    return {
      id: Number(id),
      name: r.name,
      plural: r.plural || r.name,
      group: r.group ?? null,
      concept: r.concept || this.conceptId('rty', Number(id)),
      showInLists: r.showInLists !== false,
      description: r.description || ''
    };
  }

  /**
   * Resolve free text to a rectype id. Matches `rty_Name` or `rty_Plural`,
   * case-insensitive: exact match first, then unique partial (substring).
   *
   * @param {string} text
   * @returns {number|number[]|null} Single id, ambiguous id list, or null.
   */
  rectypeIdByName(text) {
    const entries = Object.entries(this._rectypes)
      .map(([id, r]) => [Number(id), [r.name, r.plural]]);
    return resolveName(text, entries);
  }

  /**
   * @param {number|string} id
   * @param {{plural?:boolean}} [opts]
   * @returns {string} Rectype name, or `''` when unknown.
   */
  rectypeName(id, { plural = false } = {}) {
    const r = this._rectypes[id];
    if (!r) return '';
    return plural ? (r.plural || r.name) : r.name;
  }

  // ---------------------------------------------------------------- fields ---

  /**
   * Fields placed on a rectype, structure-merged. `rst_DisplayName` overrides
   * `dty_Name`; `type` / `group` come from the global field. `forbidden` rows and
   * rows whose global field is missing (separators) are excluded. Order-sorted.
   *
   * @param {number|string} rtyId
   * @returns {Array<{id,name,type,group,order,req}>}
   */
  fields(rtyId) {
    const rows = this._structByRty.get(Number(rtyId)) || EMPTY;
    const out = [];
    for (const row of rows) {
      if (row.req === 'forbidden') continue;
      const global = this._fields[row.dty];
      if (!global) continue;
      out.push({
        id: row.dty,
        name: row.name || global.name,
        type: global.type,
        group: global.group ?? null,
        order: row.order ?? 0,
        req: row.req || 'optional'
      });
    }
    return out;
  }

  /**
   * One field in a rectype context. Adds `vocabulary` / `targetTypes` from the
   * global field when present.
   *
   * @param {number|string} rtyId
   * @param {number|string} dtyId
   * @returns {{id,name,type,group,order,req,vocabulary?,targetTypes?}|null}
   */
  field(rtyId, dtyId) {
    const rows = this._structByRty.get(Number(rtyId)) || EMPTY;
    const row = rows.find((r) => r.dty === Number(dtyId));
    if (!row || row.req === 'forbidden') return null;
    const global = this._fields[dtyId];
    if (!global) return null;

    const result = {
      id: Number(dtyId),
      name: row.name || global.name,
      type: global.type,
      group: global.group ?? null,
      order: row.order ?? 0,
      req: row.req || 'optional'
    };
    if (global.vocabulary) result.vocabulary = Number(global.vocabulary);
    if (Array.isArray(global.targetTypes) && global.targetTypes.length) {
      result.targetTypes = global.targetTypes.slice();
    }
    return result;
  }

  /**
   * Global field definition, with no rectype context.
   *
   * @param {number|string} dtyId
   * @returns {{id,name,type,group,concept,vocabulary?,targetTypes?}|null}
   */
  fieldGlobal(dtyId) {
    const global = this._fields[dtyId];
    if (!global) return null;
    const result = {
      id: Number(dtyId),
      name: global.name,
      type: global.type,
      group: global.group ?? null,
      concept: global.concept || this.conceptId('dty', Number(dtyId))
    };
    if (global.vocabulary) result.vocabulary = Number(global.vocabulary);
    if (Array.isArray(global.targetTypes) && global.targetTypes.length) {
      result.targetTypes = global.targetTypes.slice();
    }
    return result;
  }

  /**
   * Resolve free text to a field id within one or more rectypes. Matches
   * `rst_DisplayName` or `dty_Name`, case-insensitive: exact then unique partial.
   *
   * @param {number|number[]} rtyIds
   * @param {string} text
   * @returns {number|number[]|null}
   */
  fieldIdByName(rtyIds, text) {
    const scope = (Array.isArray(rtyIds) ? rtyIds : [rtyIds]).map(Number);
    const names = new Map(); // dty -> Set<string>
    for (const rty of scope) {
      for (const row of this._structByRty.get(rty) || EMPTY) {
        if (row.req === 'forbidden') continue;
        const global = this._fields[row.dty];
        if (!global) continue;
        let set = names.get(row.dty);
        if (!set) names.set(row.dty, (set = new Set()));
        if (row.name) set.add(row.name);
        if (global.name) set.add(global.name);
      }
    }
    return resolveName(text, [...names].map(([id, set]) => [id, [...set]]));
  }

  /**
   * @param {number|string} rtyId
   * @param {number|string} dtyId
   * @returns {string} Display name in this rectype, else the global name, else `''`.
   */
  fieldName(rtyId, dtyId) {
    const field = this.field(rtyId, dtyId);
    if (field) return field.name;
    return this._fields[dtyId]?.name || '';
  }

  /**
   * @param {number|string} _rtyId Kept for call-site symmetry; type is global.
   * @param {number|string} dtyId
   * @returns {string} `dty_Type`, or `''` when unknown.
   */
  fieldType(_rtyId, dtyId) {
    return this._fields[dtyId]?.type || '';
  }

  // ----------------------------------------------------- enum / relation terms ---

  /**
   * @param {number|string} dtyId
   * @returns {number} Vocabulary root term id for the field, or `0`.
   */
  vocabRoot(dtyId) {
    return Number(this._fields[dtyId]?.vocabulary) || 0;
  }

  /**
   * @param {number|string} id Term id.
   * @returns {{id,label,code,concept}|null}
   */
  term(id) {
    const t = this._terms[id];
    if (!t) return null;
    return {
      id: Number(id),
      label: t.label,
      code: t.code || '',
      concept: t.concept || this.conceptId('trm', Number(id))
    };
  }

  /**
   * @param {number|string} id
   * @returns {string} Term label, or `''`.
   */
  termLabel(id) {
    return this._terms[id]?.label || '';
  }

  /**
   * @param {number|string} id
   * @returns {number[]} Direct child term ids (order preserved from `termlinks`).
   */
  termChildren(id) {
    return (this._termChildren.get(Number(id)) || EMPTY).slice();
  }

  /**
   * Materialise a vocabulary as a nested tree or a flat list.
   *
   * @param {number|string} rootId Vocabulary root term id.
   * @param {{flat?:boolean}} [opts]
   * @returns {object|Array} `{id,label,code,concept,children?}` tree, or a flat
   *          array of `term()` objects (root first) when `flat` is set.
   */
  termTree(rootId, { flat = false } = {}) {
    const root = Number(rootId);
    if (flat) {
      return this.termDescendants([root]).map((id) => this.term(id)).filter(Boolean);
    }
    const build = (id, seen) => {
      if (seen.has(id)) return null; // guard against a cyclic termlink
      seen.add(id);
      const node = this.term(id) || { id, label: '', code: '', concept: '' };
      const children = (this._termChildren.get(id) || EMPTY)
        .map((child) => build(child, seen))
        .filter(Boolean);
      if (children.length) node.children = children;
      return node;
    };
    return build(root, new Set());
  }

  /**
   * @param {number|number[]} rootIds
   * @returns {number[]} `rootIds` plus every descendant term id (deduplicated).
   */
  termDescendants(rootIds) {
    const roots = (Array.isArray(rootIds) ? rootIds : [rootIds]).map(Number);
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const child of this._termChildren.get(id) || EMPTY) stack.push(child);
    }
    return [...seen];
  }

  /**
   * Resolve a term label or code to an id within a vocabulary. Dotted paths
   * (`Parent.Child`) walk the hierarchy level by level; a single bare segment
   * also falls back to a unique match anywhere in the subtree.
   *
   * @param {number|string} rootId Vocabulary root term id.
   * @param {string} label Label, code, or dotted path.
   * @returns {number|null}
   */
  termIdByLabel(rootId, label) {
    const root = Number(rootId);
    const path = String(label ?? '').split('.').map((s) => s.trim()).filter(Boolean);
    if (!path.length) return null;

    let parent = root;
    let matched = null;
    for (let i = 0; i < path.length; i++) {
      const segment = path[i].toLowerCase();
      const candidates = this._termChildren.get(parent) || EMPTY;
      matched = null;
      for (const id of candidates) {
        const t = this._terms[id];
        if (!t) continue;
        if ((t.label || '').toLowerCase() === segment || (t.code || '').toLowerCase() === segment) {
          matched = id;
          break;
        }
      }
      if (matched == null) {
        if (path.length === 1) {
          const hits = this.termDescendants([root]).filter((id) => {
            if (id === root) return false;
            const t = this._terms[id];
            return t && ((t.label || '').toLowerCase() === segment || (t.code || '').toLowerCase() === segment);
          });
          return hits.length === 1 ? hits[0] : null;
        }
        return null;
      }
      parent = matched;
    }
    return matched;
  }

  // ------------------------------------------------------------- link graph ---

  /**
   * Rectypes reachable from `rtyId` through pointer fields.
   *
   * @param {number|string} rtyId
   * @param {{direction?:'to'|'from', relation?:boolean}} [opts]
   *        `direction` `'to'` = fields on `rtyId` pointing out (default);
   *        `'from'` = fields on other rectypes pointing at `rtyId`.
   *        `relation` `true` selects relationship-marker fields instead of
   *        plain resource fields.
   * @returns {number[]} Rectype ids, ascending.
   */
  linkedRectypes(rtyId, { direction = 'to', relation = false } = {}) {
    const rty = Number(rtyId);
    const map = relation
      ? (direction === 'from' ? this._relReverse : this._relDirect)
      : (direction === 'from' ? this._reverse : this._direct);

    const set = new Set(map.get(rty) || EMPTY);

    if (!relation) {
      if (direction === 'to' && this._unconstrainedByRty.has(rty)) {
        // an unconstrained pointer on this rectype can point at anything
        for (const id of this._allRectypeIds()) set.add(id);
      } else if (direction === 'from') {
        // any rectype carrying an unconstrained pointer can point at this one
        for (const from of this._unconstrainedByRty.keys()) set.add(from);
      }
    }
    return [...set].sort((a, b) => a - b);
  }

  /**
   * Candidate pointer field ids that link `fromRty` records to `toRty` records.
   *
   * @param {number|string} fromRty
   * @param {number|string} toRty
   * @returns {number[]} `dty` ids, ascending (resource and relmarker fields).
   */
  pointerFieldsBetween(fromRty, toRty) {
    const from = Number(fromRty);
    const set = new Set(this._pointerFields.get(`${from}:${Number(toRty)}`) || EMPTY);
    for (const dty of this._unconstrainedByRty.get(from) || EMPTY) set.add(dty);
    return [...set].sort((a, b) => a - b);
  }

  // ----------------------------------------------------------- concept codes ---

  /**
   * Concept code -> local id for this database.
   *
   * @param {'rty'|'dty'|'trm'} kind
   * @param {string} conceptCode `"<originatingDbId>-<idInOriginatingDb>"`.
   * @returns {number} Local id, or `0` when it does not resolve here.
   */
  localId(kind, conceptCode) {
    const map = this._conceptToLocal[kind];
    if (!map || conceptCode == null) return 0;
    const code = String(conceptCode).trim();
    const hit = map.get(code);
    if (hit) return hit;
    const parts = /^(\d+)-(\d+)$/.exec(code);
    if (parts && Number(parts[1]) === this.dbId()) return Number(parts[2]);
    return 0;
  }

  /**
   * Local id -> concept code.
   *
   * @param {'rty'|'dty'|'trm'} kind
   * @param {number|string} localId
   * @returns {string} Stored concept code, else `"<dbId>-<localId>"`.
   */
  conceptId(kind, localId) {
    const source = { rty: this._rectypes, dty: this._fields, trm: this._terms }[kind];
    const stored = source?.[localId]?.concept;
    if (stored) return stored;
    return `${this.dbId()}-${Number(localId)}`;
  }
}

// -------------------------------------------------------------------- helpers ---

/**
 * @param {Record<string,{name:string,order?:number}>} groups
 * @param {number|string|null} id
 * @returns {number} Display order, or a large sentinel when unknown.
 */
function groupOrder(groups, id) {
  return groups?.[id]?.order ?? 9999;
}

/**
 * @param {Record<string,{name:string,order?:number}>} groups
 * @returns {Array<{id,name,order}>} Order-sorted, then name.
 */
function sortGroups(groups) {
  return Object.entries(groups)
    .map(([id, g]) => ({ id: Number(id), name: g.name, order: g.order ?? 0 }))
    .sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
}

/**
 * Case-insensitive name resolver shared by rectype / field lookups.
 * Exact match wins; otherwise a unique substring match; otherwise the ambiguous
 * list, or null.
 *
 * @param {string} text
 * @param {Array<[number, string[]]>} entries `[id, [candidate names]]` pairs.
 * @returns {number|number[]|null}
 */
function resolveName(text, entries) {
  const query = String(text ?? '').trim().toLowerCase();
  if (!query) return null;

  const exact = new Set();
  const partial = new Set();
  for (const [id, candidates] of entries) {
    const names = candidates.filter(Boolean).map((n) => String(n).toLowerCase());
    if (names.some((n) => n === query)) exact.add(Number(id));
    else if (names.some((n) => n.includes(query))) partial.add(Number(id));
  }

  const pick = (set) => {
    if (set.size === 1) return [...set][0];
    if (set.size > 1) return [...set];
    return null;
  };
  return pick(exact) ?? pick(partial);
}
