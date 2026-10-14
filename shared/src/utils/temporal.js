/**
 * @file temporal.js
 * @brief Human-readable text of a Heurist date value: a plain date (`1969`,
 *        `1969-05-03`) or a temporal object (JSON: timestamp with
 *        circa/before/after and deviation, ranges, native calendars).
 *
 * Port of the server's `Heurist\Utilities\Temporal::toReadable` (calendar "both"),
 * so the client shows the same text as reports and exports.
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/**
 * Human-readable text of a date field value.
 *
 * @param {string|object|null} value Plain date text, temporal JSON text or a parsed temporal object.
 * @returns {string} The text; a value that cannot be read is returned as it is.
 */
export function temporalToHuman(value) {
  if (value == null || value === '') return '';
  let date = value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('{')) {
      try {
        date = JSON.parse(text);
      } catch {
        return text;
      }
    } else if (text.startsWith('|VER=')) {
      date = fromPlainTemporal(text);
      if (!date) return text;
    } else {
      const readable = dateToString(text);
      return readable == null ? text : readable;
    }
  }
  if (!date || typeof date !== 'object') return String(value);
  return toReadable(date) ?? String(value);
}

/** Temporal object → text (Temporal::toReadable). */
function toReadable(date) {
  const calendar = date.calendar || null;
  const gregorian = !calendar || String(calendar).toLowerCase() === 'gregorian';
  let native = date.native && !gregorian ? date.native : null;
  let result;

  if (date.timestamp) {
    result = dateToString(date.timestamp.in, calendar);
    if (result == null) return null;
    result += deviationSuffix(date.timestamp);
    const prefix = date.timestamp.circa ? 'circa ' : date.timestamp.before ? 'before ' : date.timestamp.after ? 'after ' : '';
    if (prefix) {
      result = prefix + result;
      if (native) native = prefix + native;
    }
  } else {
    let from = '';
    let to = '';
    if (date.start?.in) {
      from = dateToString(date.start.in, calendar) ?? '';
      if (from) from += deviationSuffix(date.start);
    } else if (date.start?.earliest) {
      from = dateToString(date.start.earliest, calendar) ?? '';
    }
    if (date.end?.in) {
      to = dateToString(date.end.in, calendar) ?? '';
      if (to) to += deviationSuffix(date.end);
    } else if (date.end?.latest) {
      to = dateToString(date.end.latest, calendar) ?? '';
    }
    if (!from && !to) return null;
    result = longDateSpan(date) ?? `${from} to ${to}`;
  }

  return native ? `${native}  ${calendar} (Gregorian ${result})` : result;
}

/**
 * One date → text (Temporal::dateToString): `3 May 1969`, `May 1969`, `1969`, `500 BCE`, with the time
 * when given; a non-Gregorian calendar keeps `YYYY-MM-DD`.
 *
 * @param {string} value Date text.
 * @param {string|null} [calendar] Calendar name.
 * @returns {string|null} The text, or null when the date cannot be read.
 */
export function dateToString(value, calendar = null) {
  const date = parseDate(value);
  if (!date) return null;
  const bce = date.year < 0;
  let result = String(Math.abs(date.year));
  const hasTime = date.hour > 0 || date.minute > 0 || date.second > 0;
  const gregorianOrJulian = !calendar || ['gregorian', 'julian'].includes(String(calendar).toLowerCase());

  if (gregorianOrJulian) {
    let dayMonth = date.hasDays && date.day ? String(date.day) : '';
    if (date.month) dayMonth = `${dayMonth} ${MONTHS[date.month - 1]}`;
    result = `${dayMonth} ${result}`.trim();
  } else if (date.month || hasTime) {
    result += `-${pad(date.month)}`;
    if ((date.hasDays || hasTime) && date.day) result += `-${pad(date.day)}`;
  }

  if (hasTime) {
    result += ` ${pad(date.hour)}:${pad(date.minute)}`;
    if (date.second > 0 || date.hasSeconds) result += `:${pad(date.second)}`;
  }

  if (bce) {
    if (!date.hasDays && date.year < -999999) {
      if (date.year < -999999999) result = `${Math.abs(date.year) / 1e9} bya`;
      else result = `${Math.abs(date.year) / 1e6} Mya`;
    } else {
      result += ' BCE';
    }
  }
  return result;
}

/**
 * Parse a Heurist date text (Temporal::_datePrepare, the forms stored in records):
 * `YYYY`, `-YYYY`, `YYYY BCE`, `YYYY-MM`, `YYYY-MM-DD`, with an optional time `hh:mm[:ss]`.
 *
 * @param {string} value Date text.
 * @returns {{year:number, month:number, day:number, hour:number, minute:number, second:number, hasDays:boolean, hasSeconds:boolean}|null}
 */
function parseDate(value) {
  let text = String(value ?? '').trim().replace(/\?\?-/g, '').replace(/\?/g, '');
  if (!text) return null;
  if (/bce/i.test(text)) text = `-${text.replace(/bce/i, '').trim()}`;
  // compact forms: 20090410 and 20090410153000
  const compact = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?$/.exec(text);
  if (compact) {
    text = `${compact[1]}-${compact[2]}-${compact[3]}${compact[4] ? ` ${compact[4]}:${compact[5]}:${compact[6]}` : ''}`;
  }
  if (/^-?[\d\s]+$/.test(text)) {
    const year = Number(text.replace(/\s+/g, ''));
    return Number.isFinite(year) ? dateParts(year) : null;
  }
  const match = /^(-?)(\d{1,})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (!match) return null;
  const year = Number(match[2]) * (match[1] ? -1 : 1);
  const month = Number(match[3] || 0);
  const day = Number(match[4] || 0);
  if (month > 12 || day > 31) return null;
  return {
    ...dateParts(year),
    month,
    day: month ? day || 1 : 0,
    hasDays: Boolean(match[4]),
    hour: Number(match[5] || 0),
    minute: Number(match[6] || 0),
    second: Number(match[7] || 0),
    hasSeconds: match[7] != null
  };
}

/** Parts of a year-only date. */
function dateParts(year) {
  return { year, month: 0, day: 0, hour: 0, minute: 0, second: 0, hasDays: false, hasSeconds: false };
}

/** ` ±10 years`, ` -2 months +3 months`: the deviation of a timestamp (Temporal::_deviationSuffix). */
function deviationSuffix(timestamp) {
  if (timestamp?.deviation) return deviationText(timestamp.deviation, ' ±');
  let result = '';
  if (timestamp?.deviation_negative) result = deviationText(timestamp.deviation_negative, ' -');
  if (timestamp?.deviation_positive) result = `${result} ${deviationText(timestamp.deviation_positive, ' +')}`.trimEnd();
  return result;
}

/** An ISO 8601 duration (`P10Y`, `P2M`, `P5D`) as text: its largest unit only, like the server. */
function deviationText(value, prefix) {
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?/i.exec(String(value || ''));
  if (!match) return '';
  if (Number(match[1])) return `${prefix}${Number(match[1])} years`;
  if (Number(match[2])) return `${prefix}${Number(match[2])} months`;
  if (Number(match[3])) return `${prefix}${Number(match[3])} days`;
  return '';
}

/**
 * A range that covers one whole month (`May 1969`) or one whole year (`1969`)
 * (Temporal::checkForLongDateSpan, from the estimated decimal dates YYYY.MMDD).
 */
function longDateSpan(date) {
  const start = date.estMinDate == null ? '' : String(date.estMinDate);
  const end = date.estMaxDate == null ? '' : String(date.estMaxDate);
  if (!start || !end || start.slice(0, 4) !== end.slice(0, 4)) return null;
  const year = start.slice(0, 4);
  const earliest = String(date.start?.earliest || '');
  const latest = String(date.end?.latest || '');
  if (start.slice(0, -2) === end.slice(0, -2) && /01$/.test(start)
    && /(?:02(?:28|29)|(?:01|03|05|07|08|10|12)31|(?:04|06|09|11)30)$/.test(end)) {
    const month = Number(start.split('.')[1]?.slice(0, 2));
    return month >= 1 && month <= 12 ? `${MONTHS_LONG[month - 1]} ${year}` : null;
  }
  if ((/0101$/.test(start) || new RegExp(`${year}-01$`).test(earliest))
    && (/1231$/.test(end) || new RegExp(`${year}-12$`).test(latest))) {
    return year;
  }
  return null;
}

/** The legacy plain temporal `|VER=1|TYP=s|DAT=...` as a temporal object (simple date and range only). */
function fromPlainTemporal(text) {
  const parts = Object.fromEntries(text.split('|').filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)];
  }));
  if (parts.DAT) return { timestamp: { in: parts.DAT, circa: parts.CIR === '1' } };
  if (parts.TPQ || parts.TAQ) return { start: { earliest: parts.TPQ || '' }, end: { latest: parts.TAQ || '' } };
  return null;
}

/** Two-digit text of a number. */
function pad(value) {
  return String(value || 0).padStart(2, '0');
}
