/**
 * @file fileUrls.js
 * @brief URLs of registered files on the file endpoints (plan 34): `asset` (the file), `web` (reduced copy of a
 *        large image), `thumbnail`. Stored values (media HTML, texts, styles) keep the relative form
 *        `./api/{db}/files/{key}/{kind}` (relative to the Heurist base URL, as TinyMCE stores `./`);
 *        `resolveFileUrls` makes it absolute for a page. `upgradeFileUrls` turns legacy URLs
 *        (`?db=X&file=K`, `&fullres=1`, `&thumb=K`, `&download=1`; absolute with the base URL, `./?` or `?`)
 *        into the relative form. Same rules as heurist `srv/Files/FileUrls.php` (fixture
 *        `shared/test/fixtures/file-urls.json`).
 *
 *   fileUrl('ab12', 'web', { database: 'db1' });            // ./api/db1/files/ab12/web
 *   upgradeFileUrls('<img src="./?db=db1&amp;file=ab12">', { database: 'db1', baseUrl });
 *   resolveFileUrls('<img src="./api/db1/files/ab12/web">', { database: 'db1', baseUrl });
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

/** Kinds of a file URL: `download` = the file as an attachment (`asset?download=1`). */
export const FILE_URL_KINDS = ['asset', 'web', 'thumbnail', 'download'];

/** Tags whose legacy `?file=` URL is the web copy (an image shown in the page); other tags get the file itself. */
const WEB_TAGS = new Set(['img']);

/**
 * Relative URL of a file (the form stored in records).
 *
 * @param {string} key Obfuscated key of the file.
 * @param {string} [kind] asset | web | thumbnail | download.
 * @param {{database: string}} options
 * @returns {string} '' without a key.
 */
export function fileUrl(key, kind = 'asset', { database } = {}) {
  const value = String(key ?? '').trim();
  if (!value) return '';
  const path = `./api/${encodeURIComponent(database || '')}/files/${encodeURIComponent(value)}/`;
  if (kind === 'download') return `${path}asset?download=1`;
  return path + (FILE_URL_KINDS.includes(kind) ? kind : 'asset');
}

/**
 * Absolute URL of a relative file URL (`./api/...`); other URLs are returned as they are.
 *
 * @param {string} url
 * @param {{baseUrl: string}} options Heurist base URL.
 * @returns {string}
 */
export function resolveFileUrl(url, { baseUrl } = {}) {
  const value = String(url ?? '');
  const base = normalizeBase(baseUrl);
  return base && value.startsWith('./api/') ? `${base}${value.slice(2)}` : value;
}

/**
 * Key and kind of a file URL in any form (legacy or new, absolute or relative), or null.
 *
 * @param {string} url
 * @param {{database?: string, baseUrl?: string}} options `database`: only URLs of this database; without it any
 *        database of this installation (relative URLs and URLs with the base URL are always of this installation).
 * @returns {{key: string, kind: string, database: string}|null} `kind`: asset | web | thumbnail | download; a legacy
 *          `?file=` without `fullres` gives `web`.
 */
export function parseFileUrl(url, { database, baseUrl } = {}) {
  const value = String(url ?? '').trim().replace(/&amp;/g, '&');
  const api = /^(?:\.\/|(?:https?:)?\/\/[^?#]*?\/|\/[^?#]*?\/)?api\/([^/?#]+)\/files\/([A-Za-z0-9]+)\/(asset|web|thumbnail)(\?download=1)?$/.exec(value);
  if (api) {
    const db = decodeURIComponent(api[1]);
    if (database && db !== database) return null;
    return { key: api[2], kind: api[4] ? 'download' : api[3], database: db };
  }
  const query = legacyQuery(value, baseUrl);
  if (query === null) return null;
  const params = new URLSearchParams(query);
  const db = params.get('db') || '';
  if (!db || (database && db !== database)) return null;
  const thumb = params.get('thumb');
  if (thumb && /^[A-Za-z0-9]+$/.test(thumb)) return { key: thumb, kind: 'thumbnail', database: db };
  const file = params.get('file');
  if (!file || !/^[A-Za-z0-9]+$/.test(file)) return null;
  if (params.get('download') === '1') return { key: file, kind: 'download', database: db };
  return { key: file, kind: params.has('fullres') && params.get('fullres') !== '0' ? 'asset' : 'web', database: db };
}

/**
 * Legacy file URLs of this database in HTML or CSS → the relative new form. `?file=` in an `img` and in a CSS
 * `url()` is the web copy (as legacy gave it), in other tags (video, audio, source, a, embed) the file itself;
 * `fullres=1` the file; `thumb=` the thumbnail; `download=1` the attachment.
 *
 * @param {string} text HTML or CSS.
 * @param {{database?: string, baseUrl?: string}} options `database`: see parseFileUrl; `baseUrl`: absolute legacy
 *        URLs with it are converted too.
 * @returns {string}
 */
export function upgradeFileUrls(text, { database, baseUrl } = {}) {
  const value = String(text ?? '');
  if (!value || !/[?&](?:amp;)?(?:file|thumb)=/.test(value)) return value;
  return value.replace(urlPattern(baseUrl), (match, offset) => {
    const parsed = parseFileUrl(match, { database, baseUrl });
    if (!parsed) return match;
    let kind = parsed.kind;
    if (kind === 'web' && !webContext(value, offset)) kind = 'asset';
    return fileUrl(parsed.key, kind, { database: parsed.database });
  });
}

/**
 * HTML or CSS for a page: legacy URLs upgraded, relative file URLs (`./api/{db}/files/...`) made absolute.
 *
 * @param {string} text
 * @param {{database?: string, baseUrl: string}} options `database`: see parseFileUrl.
 * @returns {string}
 */
export function resolveFileUrls(text, { database, baseUrl } = {}) {
  const base = normalizeBase(baseUrl);
  const upgraded = upgradeFileUrls(text, { database, baseUrl });
  if (!base) return upgraded;
  return upgraded.replace(/(^|["'(=\s])\.\/api\/([^/"'\s()<>]+)\/files\//g, (match, before, db) => (
    !database || decodeURIComponent(db) === database ? `${before}${base}api/${db}/files/` : match));
}

/** URLs that may be legacy file URLs: `?...` after the base URL, `./` or nothing, at the start of a value. */
function urlPattern(baseUrl) {
  const base = normalizeBase(baseUrl);
  const prefixes = ['\\./'];
  if (base) prefixes.unshift(escapeRegExp(base));
  return new RegExp(`(?<=^|["'(=\\s])(?:${prefixes.join('|')})?\\?[^"'\\s()<>]+`, 'g');
}

/** The query of a legacy URL (base URL, `./` or nothing before `?`), or null. */
function legacyQuery(value, baseUrl) {
  const base = normalizeBase(baseUrl);
  let rest = value;
  if (base && rest.startsWith(base)) rest = rest.slice(base.length);
  else if (rest.startsWith('./')) rest = rest.slice(2);
  return rest.startsWith('?') ? rest.slice(1) : null;
}

/** Whether the URL at `offset` is an image shown in the page: in an `img` tag or a CSS `url()`. */
function webContext(text, offset) {
  const before = text.slice(Math.max(0, offset - 2000), offset);
  if (/url\(\s*["']?$/i.test(before)) return true;
  const open = before.lastIndexOf('<');
  if (open < 0 || before.lastIndexOf('>') > open) return false;
  const tag = /^<\s*([a-z0-9-]+)/i.exec(before.slice(open))?.[1]?.toLowerCase() || '';
  return WEB_TAGS.has(tag);
}

/** Base URL with one trailing slash, or ''. */
function normalizeBase(baseUrl) {
  const value = String(baseUrl ?? '').trim();
  if (!value) return '';
  return value.endsWith('/') ? value : `${value}/`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
