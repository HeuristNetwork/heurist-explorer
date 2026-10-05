/**
 * @file smartyTokenizer.js
 * @brief Line tokenizer for Smarty templates with HTML (CodeMirror StreamLanguage).
 *
 * Highlights Smarty tags `{...}` (functions, variables, strings, numbers,
 * operators, `{* comments *}`, `{literal}` blocks) and the HTML around them
 * (tags, attributes, attribute values, `<!-- comments -->`). Kept free of
 * CodeMirror imports so it can be tested in Node.
 *
 * The stream interface is the one of CodeMirror's StringStream: peek, next,
 * eat, eatWhile, eatSpace, match, sol, eol, skipToEnd, current.
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

/** Smarty built-in functions and Heurist plugins shown as keywords. */
export const SMARTY_KEYWORDS = Object.freeze([
  'foreach', 'foreachelse', 'if', 'elseif', 'else', 'for', 'while', 'section', 'sectionelse',
  'assign', 'capture', 'function', 'include', 'literal', 'strip', 'nocache', 'append', 'call',
  'break', 'continue', 'as', 'name', 'from', 'item', 'key', 'to', 'step',
  'eq', 'ne', 'neq', 'gt', 'lt', 'gte', 'ge', 'lte', 'le', 'and', 'or', 'not', 'mod', 'is', 'isset', 'empty',
  'wrap', 'out', 'ldelim', 'rdelim'
]);

const KEYWORDS = new Set(SMARTY_KEYWORDS);

/** Initial tokenizer state. */
export function startState() {
  return { smarty: false, comment: false, htmlComment: false, tag: false, literal: false, quote: null };
}

/** Copy of a tokenizer state. */
export function copyState(state) {
  return { ...state };
}

/**
 * Read one token and return its style (null for plain text).
 *
 * @param {object} stream CodeMirror StringStream (or a compatible object).
 * @param {object} state Tokenizer state.
 * @returns {string|null} Token style: comment, keyword, variableName, string, number,
 *          operator, bracket, typeName, attributeName, meta or null.
 */
export function token(stream, state) {
  if (state.comment) return smartyComment(stream, state);
  if (state.htmlComment) return htmlComment(stream, state);
  if (state.literal) {
    if (stream.match(/^\{\/literal\}/)) {
      state.literal = false;
      return 'keyword';
    }
    stream.next();
    return null;
  }
  if (state.smarty) return smartyToken(stream, state);

  if (stream.match(/^\{\*/)) {
    state.comment = true;
    return smartyComment(stream, state);
  }
  if (stream.match(/^\{literal\}/)) {
    state.literal = true;
    return 'keyword';
  }
  // "{" followed by a space is not a Smarty tag (CSS, JavaScript in templates)
  if (stream.peek() === '{' && !/^\{\s/.test(rest(stream))) {
    stream.next();
    state.smarty = true;
    return 'bracket';
  }
  if (state.tag) return htmlTagToken(stream, state);
  if (stream.match(/^<!--/)) {
    state.htmlComment = true;
    return htmlComment(stream, state);
  }
  if (stream.match(/^<\/?[A-Za-z][\w:-]*/)) {
    state.tag = true;
    return 'typeName';
  }
  // plain text up to the next tag or Smarty brace
  if (!stream.eatWhile((ch) => ch !== '<' && ch !== '{')) stream.next();
  return null;
}

/** Inside `{...}`. */
function smartyToken(stream, state) {
  if (state.quote) return quoted(stream, state);
  if (stream.eatSpace()) return null;
  const ch = stream.peek();
  if (ch === '}') {
    stream.next();
    state.smarty = false;
    return 'bracket';
  }
  if (ch === '"' || ch === "'") {
    state.quote = stream.next();
    return quoted(stream, state);
  }
  if (stream.match(/^\$[\w.]*/)) return 'variableName';
  if (stream.match(/^\/?[A-Za-z_]\w*/)) {
    const word = stream.current().replace(/^\//, '');
    return KEYWORDS.has(word) ? 'keyword' : (stream.peek() === '(' ? 'variableName' : 'attributeName');
  }
  if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';
  if (stream.match(/^(->|==|!=|<=|>=|&&|\|\||[-+*/%=<>!|:.,@])/)) return 'operator';
  stream.next();
  return null;
}

/** A quoted string inside a Smarty tag. */
function quoted(stream, state) {
  let escaped = false;
  let ch;
  while ((ch = stream.next()) != null) {
    if (ch === state.quote && !escaped) {
      state.quote = null;
      break;
    }
    escaped = !escaped && ch === '\\';
  }
  return 'string';
}

/** `{* ... *}` across lines. */
function smartyComment(stream, state) {
  while (!stream.eol()) {
    if (stream.match(/^\*\}/)) {
      state.comment = false;
      return 'comment';
    }
    stream.next();
  }
  return 'comment';
}

/** `<!-- ... -->` across lines. */
function htmlComment(stream, state) {
  while (!stream.eol()) {
    if (stream.match(/^-->/)) {
      state.htmlComment = false;
      return 'comment';
    }
    stream.next();
  }
  return 'comment';
}

/** Inside an HTML tag `<name ... >`. */
function htmlTagToken(stream, state) {
  if (state.quote) return htmlQuoted(stream, state);
  if (stream.eatSpace()) return null;
  if (stream.match(/^\/?>/)) {
    state.tag = false;
    return 'typeName';
  }
  const ch = stream.peek();
  if (ch === '"' || ch === "'") {
    state.quote = stream.next();
    return htmlQuoted(stream, state);
  }
  if (stream.match(/^[^\s=>/{"']+/)) return 'attributeName';
  stream.next();
  return 'operator';
}

/** An attribute value; a Smarty tag inside it ends the string token. */
function htmlQuoted(stream, state) {
  while (!stream.eol()) {
    const ch = stream.peek();
    if (ch === '{' && !/^\{\s/.test(rest(stream))) return 'string';
    stream.next();
    if (ch === state.quote) {
      state.quote = null;
      return 'string';
    }
  }
  return 'string';
}

/** Text from the stream position to the end of the line. */
function rest(stream) {
  return stream.string.slice(stream.pos);
}

/**
 * Tokenize a template (tests, quick checks): `[[text, style], ...]` per line.
 *
 * @param {string} text Template text.
 * @returns {Array<Array<[string, string|null]>>}
 */
export function tokenizeText(text) {
  const state = startState();
  return String(text).split('\n').map((line) => {
    const stream = new LineStream(line);
    const tokens = [];
    while (!stream.eol()) {
      stream.start = stream.pos;
      const style = token(stream, state);
      if (stream.pos === stream.start) stream.next();
      tokens.push([stream.current(), style]);
    }
    return tokens;
  });
}

/** Minimal StringStream for `tokenizeText`. */
class LineStream {
  constructor(string) {
    this.string = string;
    this.pos = 0;
    this.start = 0;
  }
  eol() { return this.pos >= this.string.length; }
  sol() { return this.pos === 0; }
  peek() { return this.string.charAt(this.pos) || undefined; }
  next() { return this.pos < this.string.length ? this.string.charAt(this.pos++) : undefined; }
  eat(match) {
    const ch = this.string.charAt(this.pos);
    const ok = typeof match === 'string' ? ch === match : ch && (match.test ? match.test(ch) : match(ch));
    if (ok) { this.pos++; return ch; }
    return undefined;
  }
  eatWhile(match) {
    const start = this.pos;
    while (this.eat(match)) { /* advance */ }
    return this.pos > start;
  }
  eatSpace() {
    const start = this.pos;
    while (/[\s ]/.test(this.string.charAt(this.pos))) this.pos++;
    return this.pos > start;
  }
  skipToEnd() { this.pos = this.string.length; }
  match(pattern) {
    if (typeof pattern === 'string') {
      if (this.string.startsWith(pattern, this.pos)) { this.pos += pattern.length; return true; }
      return null;
    }
    const match = this.string.slice(this.pos).match(pattern);
    if (match && match.index === 0) { this.pos += match[0].length; return match; }
    return null;
  }
  current() { return this.string.slice(this.start, this.pos); }
}
