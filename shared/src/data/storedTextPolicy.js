/** Advisory checks only. The server's StoredText policy is the security boundary. */
export function allowsStoredCode(dbdefs, rectypeId, fieldId) {
  const id = (code) => Number(dbdefs?.dbconst?.(code)) || 0;
  return dbdefs?.meta?.javaScriptAllowed === true && Number(rectypeId) > 0 && Number(fieldId) > 0
    && ['RT_CMS_HOME', 'RT_CMS_PAGE'].some((code) => id(code) === Number(rectypeId))
    && ['DT_CMS_SCRIPT', 'DT_CMS_CSS', 'DT_CMS_HEADER', 'DT_CMS_FOOTER', 'DT_EXTENDED_DESCRIPTION']
      .some((code) => id(code) === Number(fieldId));
}

/**
 * A field whose value is cleared on save without the CMS exception: the custom JavaScript.
 * Custom CSS (DT_CMS_CSS) is kept, checked as CSS by the server (plan 27a, decision 12).
 */
export function isStoredCodeField(dbdefs, fieldId) {
  return Number(fieldId) > 0 && Number(dbdefs?.dbconst?.('DT_CMS_SCRIPT')) === Number(fieldId);
}

const SPAN_STYLES = ['font-family', 'font-size', 'color', 'text-decoration'];
const ALIGN_BLOCKS = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/**
 * Whether the server keeps this inline style unchanged (StoredText, 2026-10-25): the font, size and
 * colour of the HTML editor on `span`, `text-align` on blocks.
 */
function isKeptStyle(tag, style) {
  const name = tag.toLowerCase();
  return style.split(';').filter((declaration) => declaration.trim()).every((declaration) => {
    const [property, ...rest] = declaration.split(':');
    const key = property.trim().toLowerCase();
    const value = rest.join(':').trim().toLowerCase();
    if (ALIGN_BLOCKS.includes(name)) return key === 'text-align' && ['left', 'center', 'right', 'justify'].includes(value);
    return name === 'span' && SPAN_STYLES.includes(key) && value !== ''
      && /^[\w\s#%.,'"-]*$/.test(value.replace(/\b(?:rgba?|hsla?)\(\s*[\d\s.,%]+\)/g, ''));
  });
}

/** Warn about executable markup and CSS the server removes, including common encoded URL schemes. */
export function hasScriptOrStyle(value) {
  const text = String(value ?? '').replace(/&#(x[\da-f]+|\d+);?/gi, (match, number) => {
    const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(colon|tab|newline);/gi, (_, name) => ({ colon: ':', tab: '\t', newline: '\n' })[name.toLowerCase()]);
  const styles = [...text.matchAll(/<\s*([a-z][\w-]*)\b([^>]*)>/gi)].flatMap(([, tag, attributes]) =>
    [...attributes.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
      .map((match) => ({ tag, style: match[1] ?? match[2] ?? match[3] ?? '' })));
  return /<\s*\/?\s*(script|style)\b/i.test(text)
    || /<[^>]*\s(?:on[a-z\d_-]+|srcdoc)\s*=/i.test(text)
    || styles.some(({ tag, style }) => !isKeptStyle(tag, style))
    || /<\s*link\b[^>]*\brel\s*=\s*["']?stylesheet\b/i.test(text)
    || /\b(?:href|src|action|formaction|poster|data|xlink:href)\s*=\s*["']?\s*(?:j[\s\x00-\x20]*a[\s\x00-\x20]*v[\s\x00-\x20]*a[\s\x00-\x20]*s[\s\x00-\x20]*c[\s\x00-\x20]*r[\s\x00-\x20]*i[\s\x00-\x20]*p[\s\x00-\x20]*t|vbscript|data)\s*:/i.test(text);
}
