/**
 * @file smartySnippetBuilder.js
 * @brief Smarty code for fields chosen in the field tree (report editor,
 *        calculated fields, later record titles).
 *
 * Port of the legacy report editor's snippet builder
 * (`hclient/widgets/report/reportEditor.js`: _buildSmartySnippetForNode,
 * _buildSelectionTree, _renderSelectionTree, _renderLeafExpression,
 * _buildWrapExpression, _headerSmartyName, ...). The generated code is the same;
 * the input is a field path of HFieldTree instead of a Fancytree node:
 *
 *   [{via: {link: 'lt'|'lf'|'r', dty, targetRty}}, ..., {dty, fieldType, term?}]
 *
 * converted by `segmentsFromPath()` to the legacy segments:
 *   resource {fieldId, targetRectypeId}     pointer to a linked record      (lt)
 *   linked_from {fieldId, sourceRectypeId}  records pointing to this one    (lf)
 *   related {fieldId, targetRectypeId}      records related by relationship (r, new)
 *   field {fieldId, type} | term {fieldId, subfield} | header {headerKey}
 *   relationship {propName} | relationship {fieldId}   a relationship of $r ($r.Relationships)
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

/** HFieldTree header leaves and the record header keys they stand for. */
const HEADER_KEYS = {
  title: 'rec_Title',
  ids: 'rec_ID',
  id: 'rec_ID',
  url: 'rec_URL',
  added: 'rec_Added',
  modified: 'rec_Modified',
  addedby: 'rec_AddedByUGrpID',
  owner: 'rec_OwnerUGrpID',
  access: 'rec_NonOwnerVisibility',
  typeid: 'rec_RecTypeID'
};

/** Enum outputs offered by the field tree and the legacy subfield names. */
export const TERM_SUBFIELDS = Object.freeze(['label', 'code', 'internalid', 'term', 'conceptid', 'desc']);

/** Default insert options (the legacy dialog's defaults). */
export const DEFAULT_SNIPPET_OPTIONS = Object.freeze({
  ifnull: false,
  insLineBreak: true,
  addCaption: true,
  addLoop: false,
  addRemark: false,
  addWrap: false
});

/**
 * Convert an HFieldTree path to snippet segments, or null when the leaf is not
 * an output value (Any field, "records exist").
 *
 * @param {Array<object>} path Field tree path.
 * @returns {Array<object>|null}
 */
export function segmentsFromPath(path) {
  if (!Array.isArray(path) || !path.length) return null;
  const segments = [];
  for (const step of path.slice(0, -1)) {
    const via = step?.via;
    if (!via) return null;
    const fieldId = String(via.dty);
    if (via.link === 'lf') segments.push({ kind: 'linked_from', fieldId, sourceRectypeId: String(via.targetRty) });
    else if (via.link === 'r' || via.link === 'related') segments.push({ kind: 'related', fieldId, targetRectypeId: String(via.targetRty ?? '') });
    else segments.push({ kind: 'resource', fieldId, targetRectypeId: String(via.targetRty) });
  }
  const leaf = path[path.length - 1];
  if (!leaf || leaf.via) return null;
  const dty = String(leaf.dty);
  if (leaf.relationship) {
    // relationships of the record itself only (legacy "Relationship" branch)
    if (segments.length) return null;
    return [/^\d+$/.test(dty) ? { kind: 'relationship', fieldId: dty } : { kind: 'relationship', propName: dty }];
  }
  if (/^\d+$/.test(dty)) {
    if (leaf.term) segments.push({ kind: 'term', fieldId: dty, subfield: String(leaf.term), type: leaf.fieldType || '' });
    else segments.push({ kind: 'field', fieldId: dty, type: leaf.fieldType || '' });
  } else if (HEADER_KEYS[dty]) {
    segments.push({ kind: 'header', headerKey: HEADER_KEYS[dty], type: dty === 'url' ? '' : (leaf.fieldType || '') });
  } else {
    return null;
  }
  return segments;
}

/**
 * Smarty code for one field (legacy "Insert field").
 *
 * @param {object} item `{segments, label, remark?}`; see `segmentsFromPath`.
 * @param {object} options Insert options; see DEFAULT_SNIPPET_OPTIONS.
 * @param {object} context
 * @param {string|number} context.rootRectypeId Record type of `$r`.
 * @param {function(string, string): boolean} context.isRepeatable (rectypeId, fieldId) -> repeatable.
 * @param {function(string): string} [context.rectypeName] Record type name for comments.
 * @param {number} [indent=0] Indent level.
 * @param {string} [parentVar='r'] Smarty variable of the record.
 * @returns {string}
 */
export function buildFieldSnippet(item, options, context, indent = 0, parentVar = 'r') {
  const segments = item?.segments;
  if (!segments?.length) return '';
  const opts = { ...DEFAULT_SNIPPET_OPTIONS, ...options };
  if (segments[0].kind === 'relationship') return buildRelationshipSnippet([item], opts, { remarkOnLoop: true });
  const nl = '\n';
  let snippet = '';
  let currentVar = parentVar || 'r';
  let currentRectype = String(context.rootRectypeId ?? '');
  let pad = indentText(indent);
  let loopDepth = 0;
  // per opened loop: whether it also opened a record type {if} (related records)
  const filters = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const loopName = `valueloop${loopDepth ? loopDepth + 1 : ''}`;

    if (seg.kind === 'resource') {
      const loopVar = `f${seg.fieldId}`;
      if (context.isRepeatable(currentRectype, seg.fieldId) || opts.addLoop) {
        snippet += `${pad}{foreach $${currentVar}.f${seg.fieldId}s as $${loopVar} name=${loopName}}`;
        if (opts.addRemark) snippet += remarkComment(rectypeLabel(context, seg.targetRectypeId));
        snippet += nl;
        pad = indentText(indent + 1 + loopDepth);
        snippet += `${pad}{$${loopVar}=$heurist->getRecord($${loopVar})}`;
        if (opts.addRemark) snippet += ' {* get record by record id *}';
        snippet += nl;
        filters.push(false);
        loopDepth++;
      } else {
        snippet += `${pad}{$${loopVar}=$heurist->getRecord($${currentVar}.f${seg.fieldId})}`;
        if (opts.addRemark) snippet += ' {* get record by record id *}';
        snippet += nl;
      }
      currentVar = loopVar;
      currentRectype = seg.targetRectypeId;
      continue;
    }

    if (seg.kind === 'linked_from' || seg.kind === 'related') {
      const opened = openRecordLoop(seg, currentVar, pad, loopName, opts, context);
      snippet += opened.text;
      pad = indentText(indent + 1 + loopDepth);
      snippet += opened.inner(pad);
      currentVar = opened.itemVar;
      currentRectype = opened.rectypeId;
      const filtered = seg.kind === 'related' && Boolean(seg.targetRectypeId);
      filters.push(filtered);
      loopDepth++;
      // the record type {if} indents the loop body one more level
      if (filtered) {
        indent++;
        pad = indentText(indent + loopDepth);
      }
    }
  }

  snippet += renderLeafExpression({
    item,
    leaf: segments[segments.length - 1],
    currentVar,
    currentRectype,
    opts,
    context,
    indent: indent + loopDepth
  });

  while (loopDepth > 0) {
    if (filters.pop()) {
      indent--;
      snippet += `${indentText(indent + loopDepth)}{/if}${nl}`;
    }
    snippet += `${indentText(indent + loopDepth - 1)}{/foreach}${nl}`;
    loopDepth--;
  }
  return snippet;
}

/**
 * Smarty code for several fields: fields that share pointer hops share one
 * loop (legacy "Insert all").
 *
 * @param {Array<object>} items Fields, each `{segments, label}`.
 * @param {object} options Insert options.
 * @param {object} context See `buildFieldSnippet`.
 * @returns {string}
 */
export function buildGroupedSnippet(items, options, context) {
  const usable = (items || []).filter((item) => item?.segments?.length);
  if (!usable.length) return '';
  const opts = { ...DEFAULT_SNIPPET_OPTIONS, ...options };
  const snippets = [];
  let i = 0;
  while (i < usable.length) {
    const group = [usable[i]];
    const key = branchKey(usable[i]);
    let j = i + 1;
    while (j < usable.length && branchKey(usable[j]) === key) group.push(usable[j++]);
    if (key === RELATIONSHIP_KEY) snippets.push(buildRelationshipSnippet(group, opts));
    else {
      snippets.push(group.length > 1
        ? renderSelectionTree(buildSelectionTree(group, context.rootRectypeId), { opts, context, indent: 0, parentVar: 'r', loopDepth: 0 })
        : buildFieldSnippet(group[0], opts, context, 0, 'r'));
    }
    i = j;
  }
  return snippets.filter(Boolean).join('\n');
}

/** Branch key of relationship items: they share one loop over `$r.Relationships`. */
const RELATIONSHIP_KEY = 'Relationship';

/**
 * Relationships of `$r`: one loop over `$r.Relationships` with a line per item
 * (legacy _buildGroupedRelationshipSnippet and the Relationship case of
 * _buildSmartySnippetForNode). Line breaks are not added, as in the legacy editor.
 *
 * @param {Array<object>} items Items with a `relationship` segment, `{segments, label, remark?}`.
 * @param {object} options Insert options (ifnull, addCaption, addRemark).
 * @param {{remarkOnLoop?: boolean}} [mode] Single field: its comment also follows the loop.
 * @returns {string}
 */
export function buildRelationshipSnippet(items, options, { remarkOnLoop = false } = {}) {
  const opts = { ...DEFAULT_SNIPPET_OPTIONS, ...options };
  const usable = (items || []).filter((item) => item?.segments?.[0]?.kind === 'relationship');
  if (!usable.length) return '';
  let res = '{if !isset($r.Relationships)}\n{$r.Relationships = $heurist->getRelatedRecords($r)}\n{/if}\n';
  res += '{foreach $r.Relationships as $Relationship name=relations}';
  if (remarkOnLoop && opts.addRemark) res += remarkComment(usable[0].remark || usable[0].label);
  res += '\n';
  for (const item of usable) {
    const leaf = item.segments[0];
    const expr = leaf.fieldId ? `$Relationship.relationRecord.f${leaf.fieldId}` : `$Relationship.${leaf.propName}`;
    let line = opts.addCaption ? escapeSmartyText(`${item.label || 'Relationship'}: `) : '';
    line += `{${expr}}`;
    if (opts.addRemark) line += remarkComment(item.remark || item.label);
    const pad = indentText(1);
    res += opts.ifnull ? `${pad}{if ${expr}}\n${indentText(2)}${line}\n${pad}{/if}\n` : `${pad}${line}\n`;
  }
  return `${res}{/foreach}\n`;
}

/**
 * Pointer/link prefix of a field: fields with the same key can share loops.
 *
 * @param {object} item `{segments}`.
 * @returns {string}
 */
export function branchKey(item) {
  if (item.segments?.[0]?.kind === 'relationship') return RELATIONSHIP_KEY;
  const parts = [];
  for (const seg of item.segments || []) {
    if (seg.kind === 'resource') parts.push(`lt${seg.fieldId}`, seg.targetRectypeId);
    else if (seg.kind === 'linked_from') parts.push(`lf${seg.fieldId}`, seg.sourceRectypeId);
    else if (seg.kind === 'related') parts.push(`r${seg.fieldId}`, seg.targetRectypeId);
    else break;
  }
  return parts.join(':');
}

/** Prefix tree of the selected fields (legacy _buildSelectionTree). */
export function buildSelectionTree(items, rootRectypeId) {
  const root = { kind: 'root', rectypeId: String(rootRectypeId ?? ''), children: [] };
  for (const item of items) {
    let cursor = root;
    item.segments.forEach((seg, index) => {
      const isLeaf = index === item.segments.length - 1;
      let child = cursor.children.find((node) => node.kind === seg.kind
        && node.fieldId === seg.fieldId
        && node.targetRectypeId === seg.targetRectypeId
        && node.sourceRectypeId === seg.sourceRectypeId
        && node.headerKey === seg.headerKey);
      if (!child) {
        child = {
          ...seg,
          subfields: seg.kind === 'term' ? [{ subfield: seg.subfield, item: isLeaf ? item : null }] : null,
          item: isLeaf ? item : null,
          children: []
        };
        cursor.children.push(child);
      } else if (isLeaf) {
        if (seg.kind === 'term') {
          if (!child.subfields.some((sub) => sub.subfield === seg.subfield)) {
            child.subfields.push({ subfield: seg.subfield, item });
          }
        } else {
          child.item = item;
        }
      }
      cursor = child;
    });
  }
  return root;
}

/** Render a selection tree (legacy _renderSelectionTree). */
function renderSelectionTree(tree, { opts, context, indent, parentVar, loopDepth }) {
  if (!tree?.children?.length) return '';
  let res = '';
  const currentRectype = tree.rectypeId;
  const childContext = { opts, context };

  for (const child of tree.children) {
    const pad = indentText(indent);
    const loopName = `valueloop${loopDepth ? loopDepth + 1 : ''}`;

    if (child.kind === 'resource') {
      const varname = `f${child.fieldId}`;
      let openedLoop = false;
      if (context.isRepeatable(currentRectype, child.fieldId) || opts.addLoop) {
        res += `${pad}{foreach $${parentVar}.f${child.fieldId}s as $${varname} name=${loopName}}`;
        if (opts.addRemark) res += remarkComment(rectypeLabel(context, child.targetRectypeId));
        res += '\n';
        res += `${indentText(indent + 1)}{$${varname}=$heurist->getRecord($${varname})}`;
        if (opts.addRemark) res += ' {* get record by record id *}';
        res += '\n';
        openedLoop = true;
      } else {
        res += `${pad}{$${varname}=$heurist->getRecord($${parentVar}.f${child.fieldId})}`;
        if (opts.addRemark) res += ' {* get record by record id *}';
        res += '\n';
      }
      res += renderSelectionTree({ ...child, rectypeId: child.targetRectypeId }, {
        ...childContext,
        indent: indent + (openedLoop ? 1 : 0),
        parentVar: varname,
        loopDepth: loopDepth + (openedLoop ? 1 : 0)
      });
      if (openedLoop) res += `${pad}{/foreach}\n`;
      continue;
    }

    if (child.kind === 'linked_from' || child.kind === 'related') {
      const opened = openRecordLoop(child, parentVar, pad, loopName, opts, context);
      res += opened.text + opened.inner(indentText(indent + 1));
      const filtered = child.kind === 'related' && child.targetRectypeId;
      res += renderSelectionTree({ ...child, rectypeId: opened.rectypeId }, {
        ...childContext,
        indent: indent + (filtered ? 2 : 1),
        parentVar: opened.itemVar,
        loopDepth: loopDepth + 1
      });
      if (filtered) res += `${indentText(indent + 1)}{/if}\n`;
      res += `${pad}{/foreach}\n`;
      continue;
    }

    if (child.kind === 'term' && child.subfields?.length > 1) {
      // each output of the field on its own (with its own loop when the field repeats);
      // the legacy editor nested a second loop over $f19.f19s inside a loop over $r.f19s
      for (const sub of child.subfields) {
        res += renderLeafExpression({
          item: sub.item || child.item,
          leaf: { kind: 'term', fieldId: child.fieldId, subfield: sub.subfield },
          currentVar: parentVar,
          currentRectype,
          opts,
          context,
          indent
        });
      }
      continue;
    }

    res += renderLeafExpression({ item: child.item, leaf: child, currentVar: parentVar, currentRectype, opts, context, indent });
  }
  return res;
}

/**
 * Open a loop over linked-from or related records.
 *
 * @returns {{text: string, inner: function(string): string, itemVar: string, rectypeId: string}}
 */
function openRecordLoop(seg, currentVar, pad, loopName, opts, context) {
  if (seg.kind === 'linked_from') {
    const listVar = linkedFromVarName(seg.sourceRectypeId, seg.fieldId, true);
    const itemVar = linkedFromVarName(seg.sourceRectypeId, seg.fieldId, false);
    let text = `${pad}{$${listVar} = $heurist->getLinkedFromRecords($${currentVar}, ${seg.sourceRectypeId}, ${seg.fieldId})}\n`;
    text += `${pad}{foreach $${listVar} as $${itemVar} name=${loopName}}`;
    if (opts.addRemark) text += remarkComment(rectypeLabel(context, seg.sourceRectypeId));
    text += '\n';
    return {
      text,
      inner: (innerPad) => `${innerPad}{$${itemVar}=$heurist->getRecord($${itemVar})}${opts.addRemark ? ' {* get record by record id *}' : ''}\n`,
      itemVar,
      rectypeId: seg.sourceRectypeId
    };
  }
  // related records: getRelatedRecords returns full records with recRelationType
  const target = seg.targetRectypeId;
  const listVar = `rel${target ? `_t${target}` : ''}_f${seg.fieldId}s`;
  const itemVar = `rel${target ? `_t${target}` : ''}_f${seg.fieldId}`;
  let text = `${pad}{$${listVar} = $heurist->getRelatedRecords($${currentVar})}\n`;
  text += `${pad}{foreach $${listVar} as $${itemVar} name=${loopName}}`;
  if (opts.addRemark) text += remarkComment(target ? rectypeLabel(context, target) : 'related records');
  text += '\n';
  return {
    text,
    inner: (innerPad) => (target ? `${innerPad}{if $${itemVar}.recTypeID==${target}}\n` : ''),
    itemVar,
    rectypeId: target
  };
}

/** Final field, term or header output (legacy _renderLeafExpression). */
function renderLeafExpression({ item, leaf, currentVar, currentRectype, opts, context, indent }) {
  if (!leaf) return '';
  const pad = indentText(indent);
  let res = '';
  let expr = '';
  let cond = '';
  let inLoop = false;
  const dtype = leaf.type || '';
  const remark = opts.addRemark ? (item?.remark || item?.label || '') : '';
  const loopName = `valueloop${indent > 0 ? indent + 1 : ''}`;

  if (leaf.kind === 'header') {
    expr = `$${currentVar}.${headerSmartyName(leaf.headerKey)}`;
    cond = expr;
  } else if (leaf.kind === 'field' || leaf.kind === 'term') {
    const subfield = leaf.kind === 'term' ? `.${leaf.subfield}` : '';
    if (context.isRepeatable(currentRectype, leaf.fieldId) || opts.addLoop) {
      const localVar = `f${leaf.fieldId}`;
      res += `${pad}{foreach $${currentVar}.f${leaf.fieldId}s as $${localVar} name=${loopName}}`;
      if (remark) res += remarkComment(remark);
      res += '\n';
      inLoop = true;
      expr = `$${localVar}${subfield}`;
      cond = expr;
    } else if (leaf.kind === 'term' && currentVar === `f${leaf.fieldId}`) {
      // grouped term rendering inside an existing enum loop uses $f19.term, not $f19.f19.term
      expr = `$${currentVar}${subfield}`;
      cond = expr;
    } else {
      expr = `$${currentVar}.f${leaf.fieldId}${subfield}`;
      cond = expr;
    }
  }

  const linePad = inLoop ? indentText(indent + 1) : pad;
  let line = '';
  if (opts.addCaption) {
    // the caption before the first value (legacy: "!...first", i.e. before every other value)
    if (inLoop) line = `{if $smarty.foreach.${loopName}.first} `;
    line += escapeSmartyText(`${item?.label || leaf.title || 'Value'}: `);
    if (inLoop) line += `{/if}\n${indentText(indent + 2)}`;
  } else if (inLoop) {
    line = `\n${linePad}`;
  }

  const needWrap = opts.addWrap && shouldUseWrap(leaf);
  line += dtype === 'file' || needWrap ? buildWrapExpression(leaf, expr, inLoop) : `{${expr}}`;

  if (inLoop) {
    line += `\n${opts.addCaption ? indentText(indent + 2) : linePad}{if !$smarty.foreach.${loopName}.last}, {/if}`;
  }
  if (remark) line += remarkComment(remark);

  if (opts.ifnull && cond) {
    res += `${linePad}{if ${cond}}\n`;
    res += `${indentText(inLoop ? indent + 2 : indent + 1)}${line}\n`;
    res += `${linePad}{/if}\n`;
  } else {
    res += `${linePad}${line}\n`;
  }
  if (inLoop) res += `${pad}{/foreach}\n`;
  if (opts.insLineBreak) res = `${pad}<br>${opts.ifnull || inLoop ? '\n' : ' '}${res}`;
  return res;
}

/** Whether "Wrapper" applies to a value (legacy _shouldUseWrap). */
export function shouldUseWrap(leaf) {
  const dtype = leaf?.type || '';
  return dtype === 'geo' || dtype === 'file' || dtype === 'date' || leaf?.headerKey === 'rec_URL';
}

/** `{wrap ...}` call for a value (legacy _buildWrapExpression). */
export function buildWrapExpression(leaf, expr, inLoop) {
  const dtype = leaf?.type || '';
  const original = inLoop ? '' : '_originalvalue';
  let res = `{wrap var=${expr}`;
  if (leaf?.kind !== 'term' && (!dtype || leaf?.headerKey === 'rec_URL')) res += ' dt="url"';
  else if (dtype === 'geo') res += `${original} dt="geo"`;
  else if (dtype === 'date') res += `${original} dt="date" mode="0" calendar="native"`;
  else if (dtype === 'file') res += `${original} dt="file" width="300" height="auto" auto_play="0" show_artwork="0"`;
  return `${res}}`;
}

/** Smarty name of a record header field (legacy _headerSmartyName). */
export function headerSmartyName(headerKey) {
  const map = {
    rec_ID: 'recID',
    rec_RecTypeID: 'recTypeID',
    rec_Title: 'recTitle',
    rec_URL: 'recURL',
    rec_Modified: 'recModified',
    rec_Tags: 'rec_Tags'
  };
  if (map[headerKey]) return map[headerKey];
  const tail = String(headerKey || '').substring(4);
  return `rec${tail.replace(/_([a-zA-Z])/g, (match, ch) => ch.toUpperCase())}`;
}

/** Variable name of a linked-from loop (legacy _getLinkedFromVarName). */
export function linkedFromVarName(rectypeId, fieldId, plural) {
  const base = `lf_t${rectypeId}_f${fieldId}`;
  return plural ? `${base}s` : base;
}

/** Four spaces per level. */
export function indentText(level) {
  return '    '.repeat(Math.max(0, level || 0));
}

/** Escape braces in text written into a template. */
export function escapeSmartyText(text) {
  return String(text || '').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
}

/** ` {* text *}` */
function remarkComment(text) {
  const value = String(text || '').replace(/\*\}/g, '* }').trim();
  return value ? ` {* ${value} *}` : '';
}

/** Record type name for a comment. */
function rectypeLabel(context, rectypeId) {
  return context.rectypeName?.(rectypeId) || `Record ${rectypeId}`;
}
