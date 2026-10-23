/** Advisory checks only. The server's StoredText policy is the security boundary. */
export function allowsStoredCode(dbdefs, rectypeId, fieldId) {
  const id = (code) => Number(dbdefs?.dbconst?.(code)) || 0;
  return dbdefs?.meta?.javaScriptAllowed === true && Number(rectypeId) > 0 && Number(fieldId) > 0
    && ['RT_CMS_HOME', 'RT_CMS_PAGE'].some((code) => id(code) === Number(rectypeId))
    && ['DT_CMS_SCRIPT', 'DT_CMS_CSS', 'DT_CMS_HEADER', 'DT_CMS_FOOTER', 'DT_EXTENDED_DESCRIPTION']
      .some((code) => id(code) === Number(fieldId));
}

export function isStoredCodeField(dbdefs, fieldId) {
  return Number(fieldId) > 0 && ['DT_CMS_SCRIPT', 'DT_CMS_CSS']
    .some((code) => Number(dbdefs?.dbconst?.(code)) === Number(fieldId));
}

/** Warn about executable markup and CSS, including common encoded URL schemes. */
export function hasScriptOrStyle(value) {
  const text = String(value ?? '').replace(/&#(x[\da-f]+|\d+);?/gi, (match, number) => {
    const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(colon|tab|newline);/gi, (_, name) => ({ colon: ':', tab: '\t', newline: '\n' })[name.toLowerCase()]);
  return /<\s*\/?\s*(script|style)\b/i.test(text)
    || /<[^>]*\s(?:on[a-z\d_-]+|style|srcdoc)\s*=/i.test(text)
    || /<\s*link\b[^>]*\brel\s*=\s*["']?stylesheet\b/i.test(text)
    || /\b(?:href|src|action|formaction|poster|data|xlink:href)\s*=\s*["']?\s*(?:j[\s\x00-\x20]*a[\s\x00-\x20]*v[\s\x00-\x20]*a[\s\x00-\x20]*s[\s\x00-\x20]*c[\s\x00-\x20]*r[\s\x00-\x20]*i[\s\x00-\x20]*p[\s\x00-\x20]*t|vbscript|data)\s*:/i.test(text);
}
