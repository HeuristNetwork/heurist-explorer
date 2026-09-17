/** Utilities shared by Query Source field-path helper editors. */
export function fieldPathCode(path = [], rootRtyId = null) {
  if (!Array.isArray(path) || !path.length) return '';
  if (path.length === 1 && path[0]?.code) return String(path[0].code);
  const root = Number(rootRtyId);
  const parts = root > 0 ? [String(root)] : [];
  for (const step of path) {
    if (step?.code) {
      parts.push(String(step.code));
    } else if (step?.via) {
      const via = step.via;
      if (!(Number(via.dty) > 0)) return '';
      parts.push(`${via.link || 'lt'}${Number(via.dty)}`);
      if (Number(via.targetRty) > 0) parts.push(String(Number(via.targetRty)));
    } else if (Number(step?.dty) > 0) {
      parts.push(String(Number(step.dty)));
    }
  }
  return parts.join(':');
}

export function fieldPathLabel(path = [], dbdefs) {
  if (!Array.isArray(path) || !path.length) return '';
  const labels = [];
  for (const step of path) {
    if (step?.label) labels.push(step.label);
    else if (step?.code) labels.push(headerFieldLabel(step.code));
    else if (step?.via) {
      const via = step.via;
      const field = dbdefs?.fieldGlobal?.(Number(via.dty));
      labels.push(field?.name || `${via.link || 'lt'}${via.dty}`);
    } else if (Number(step?.dty) > 0) {
      const field = dbdefs?.fieldGlobal?.(Number(step.dty));
      labels.push(field?.name || String(step.dty));
    }
  }
  return labels.join(' > ');
}

/** Resolve a persisted field/path code to a readable hierarchy caption. */
export function fieldCodeLabel(code, dbdefs) {
  const text = String(code ?? '').trim();
  if (!text) return '';
  if (text.startsWith('rec_')) return headerFieldLabel(text);
  const tokens = text.split(':').filter(Boolean);
  const labels = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      // Record-type ids are structural separators in a path. A final numeric token is a field id.
      continue;
    }
    const link = token.match(/^(lt|lf)(\d+)$/i);
    if (link) {
      const field = dbdefs?.fieldGlobal?.(Number(link[2]));
      if (field?.name) labels.push(field.name);
    }
  }
  const final = tokens.at(-1);
  if (final && /^\d+$/.test(final)) {
    const field = dbdefs?.fieldGlobal?.(Number(final));
    if (field?.name) labels.push(field.name);
  }
  return labels.length ? labels.join(' > ') : text;
}

export function normalizeFieldDescriptors(values = [], dbdefs = null) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => {
    if (typeof value === 'string' || typeof value === 'number') {
      const field = String(value);
      return { field, title: dbdefs ? fieldCodeLabel(field, dbdefs) : null };
    }
    if (!value || typeof value !== 'object') return null;
    const field = String(value.field ?? value.code ?? '').trim();
    if (!field) return null;
    const title = value.title || (dbdefs ? fieldCodeLabel(field, dbdefs) : null);
    return { ...value, field, title };
  }).filter(Boolean);
}

export function inferRecordTypeId(query) {
  const find = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const match = value.match(/(?:^|\s)t\s*:\s*(\d+)/i);
      return match ? Number(match[1]) : null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = find(item);
        if (hit) return hit;
      }
      return null;
    }
    if (typeof value === 'object') {
      if (value.t != null && Number(value.t) > 0) return Number(value.t);
      if (value.q != null) return find(value.q);
      for (const child of Object.values(value)) {
        const hit = find(child);
        if (hit) return hit;
      }
    }
    return null;
  };
  return find(query);
}

function headerFieldLabel(code) {
  return ({
    rec_ID: 'Record ID',
    rec_Title: 'Title',
    rec_RecTypeID: 'Record type',
    rec_Modified: 'Modified',
    rec_Added: 'Added'
  })[String(code)] || String(code).replace(/^rec_/, '').replace(/_/g, ' ');
}
