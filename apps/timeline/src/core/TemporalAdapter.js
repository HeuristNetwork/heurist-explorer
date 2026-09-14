/** Converts the normal /time records envelope into engine-neutral timeline items. */
export class TemporalAdapter {
  static convertContext(context, response) {
    const items = [];
    for (const record of response?.records || []) {
      const whens = Array.isArray(record.when) ? record.when : [];
      whens.forEach((when, index) => {
        if (!Array.isArray(when) || when.length < 9) return;
        items.push(this.convertWhen(context, record, when, index));
      });
    }
    return items.filter(Boolean);
  }

  static convertWhen(context, record, when, index) {
    const [start, latestStart, earliestEnd, end, label, profileStart, profileEnd, determination, dtyID] = when;
    const temporal = { start, latestStart, earliestEnd, end, label, profileStart, profileEnd, determination, dtyID };
    const layout = deriveLayout(temporal);
    if (!layout.start) return null;

    // Scaled kinds carry a vis end so their bar follows the zoom level and vis
    // stacks them by time width. Single-date kinds (exact/circa/before/after)
    // are vis points: their marker+label flow so vis stacks them by label width,
    // and the fixed uncertainty bar is a CSS-only decoration.
    const scaled = layout.kind === "range" || layout.kind === "fuzzy-range";

    return {
      id: `${context.id}:${record.rec_ID}:${index}`,
      group: context.id,
      recID: Number(record.rec_ID),
      dtyID: Number(dtyID) || dtyID,
      rectypeId: Number(record.rec_RecTypeID) || record.rec_RecTypeID || null,
      content: record.rec_Title || String(record.rec_ID),
      title: label || record.rec_Title || "",
      type: scaled ? "range" : "point",
      start: layout.start,
      ...(scaled && layout.end ? { end: layout.end } : {}),
      temporal,
      temporalKind: layout.kind,
      ...(layout.kind === "fuzzy-range" ? { fuzzy: fuzzyZones(layout) } : {}),
      className: `heurist-time-kind-${layout.kind} heurist-profile-start-${Number(profileStart) || 0} heurist-profile-end-${Number(profileEnd) || 0} heurist-determination-${Number(determination) || 0}`,
      record
    };
  }
}

function deriveLayout(t) {
  const start = parseTemporalDate(t.start);
  const end = parseTemporalDate(t.end);
  const latestStart = parseTemporalDate(t.latestStart);
  const earliestEnd = parseTemporalDate(t.earliestEnd);

  // /time already supplies the outer display limits in start/end. Keep those
  // for vis layout and retain latestStart/earliestEnd for the solid/fuzzy split.
  const hasFuzzyBounds =
    (t.latestStart != null && String(t.latestStart) !== "") ||
    (t.earliestEnd != null && String(t.earliestEnd) !== "");
  const hasSpan = !!(start && end && end.getTime() !== start.getTime());
  const kind = classifyTemporal(t, hasSpan, hasFuzzyBounds);

  if (!start) return { kind, start: null, end: null };
  return {
    kind,
    start,
    end: hasSpan ? end : null,
    latestStart,
    earliestEnd
  };
}

function classifyTemporal(t, hasSpan, hasFuzzyBounds) {
  // Temporal::getTimelineDate profile contract:
  // 0 flat/exact, 1 central/circa, 2 slow start/before, 3 slow finish/after.
  const profileStart = Number(t.profileStart) || 0;
  const profileEnd = Number(t.profileEnd) || 0;

  // Any real span is a scaled range; a start/end profile only steers the
  // gradient (whole-bar direction, or fuzzy end caps when inner limits exist).
  if (hasSpan || hasFuzzyBounds) {
    return profileStart || profileEnd ? "fuzzy-range" : "range";
  }

  // Single date: a start profile characterises the whole instant.
  if (profileStart === 1) return "circa";
  if (profileStart === 2) return "before";
  if (profileStart === 3) return "after";
  return "exact";
}

/** Head/tail gradient-cap widths for a fuzzy range, as a percentage of the whole span. */
function fuzzyZones(layout) {
  const startMs = layout.start?.getTime();
  const endMs = layout.end?.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { headPct: 0, tailPct: 0 };
  }
  const span = endMs - startMs;
  const latestStartMs = layout.latestStart?.getTime();
  const earliestEndMs = layout.earliestEnd?.getTime();
  let headPct = Number.isFinite(latestStartMs) ? ((latestStartMs - startMs) / span) * 100 : 0;
  let tailPct = Number.isFinite(earliestEndMs) ? ((endMs - earliestEndMs) / span) * 100 : 0;
  headPct = clampPercent(headPct);
  tailPct = clampPercent(tailPct);
  if (headPct + tailPct > 100) tailPct = Math.max(0, 100 - headPct);
  return { headPct: round2(headPct), tailPct: round2(tailPct) };
}

function clampPercent(value) {
  return value < 0 ? 0 : value > 100 ? 100 : value;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/** ISO-like Heurist dates. JS Date is used only for vis layout; the original value remains in temporal. */
function parseTemporalDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(-?\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Math.max(1, Math.min(12, Number(match[2] || 1)));
  const day = Math.max(1, Math.min(31, Number(match[3] || 1)));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0,0,0,0);
  return Number.isNaN(date.getTime()) ? null : date;
}
