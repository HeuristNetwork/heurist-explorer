# Stored text security policy

**Updated 2026-10-26** for the change of 2026-10-25 (heurist `8f9d9dd0d`): text styles of the HTML editor are
kept.

The server uses `Heurist\Utilities\StoredText` (`srv/Utilities/StoredText.php` in the Heurist repository) as
the save-time HTML policy. Browser validation is advisory; request parameters cannot authorize JavaScript.

| Field | Default policy |
| --- | --- |
| freetext | Only `u`, `i`, `b`, `strong`, `em`, without attributes; no `style` |
| blocktext | Rich HTML for TinyMCE: text, headings, lists, links, tables, images and media, with the limited inline styles below |
| CMS script field (`DT_CMS_SCRIPT`) | Cleared unless the CMS exception below applies, including bare code |
| CMS CSS field (`DT_CMS_CSS`) | Kept, checked as CSS by `StoredCss` (since 2026-10-26, plan 27a decision 12); unchanged with the CMS exception |

## Inline styles in blocktext (since 2026-10-25)

| Element | Allowed `style` | Source in the editor |
| --- | --- | --- |
| `span` | `font-family`, `font-size`, `color`, `text-decoration` (HTMLPurifier checks the values) | font, size and colour |
| `p`, `div`, `h1`–`h6` | `text-align: left \| center \| right \| justify` only | Align items of the Formats menu |
| all other elements | none | — |

Everything else in a `style` attribute is removed: other properties (`position`, `background`, ...), `url(...)`,
`expression(...)`, and on blocks every property except `text-align` (`<p style="text-align:center; color:red">`
keeps only `text-align: center;`). A block's `style` with no valid `text-align` is removed completely.

## What is removed

Outside the CMS exception, HTMLPurifier removes `script` and `style` elements with their contents, event handlers,
inline styles other than the ones above, unsafe URL schemes (only `http`, `https`, `mailto`, `tel`), executable
embeds, SVG and forms. Media iframes are limited to YouTube, Vimeo and SoundCloud. Kept attributes on any element:
`id`, `class`, `title`, `lang`, `dir`, `data-heurist-rec`, `data-heurist-app-id`, `data-inited`; plus `a[data-ref]`
and `img[data-id]`. Other `data-*` attributes are removed.

**Website format v4 (2026-10-26, plan 27a, all blocktext fields):** the elements `section`, `article`, `aside`,
`nav`, `header`, `footer`, `main`, `details` (`open`), `summary` and the attributes `data-h-node`, `data-h-instance`,
`data-h-control`, `data-h-text` are kept. A bare `data-h-text` is saved as `data-h-text=""` (the editor writes it so,
otherwise the save reports `html_sanitized`).

## Custom CSS (`StoredCss`, 2026-10-26)

`srv/Utilities/StoredCss.php` keeps a stylesheet and removes the declarations, selectors and at-rules that can load
or run something: comments are removed first; `expression(`, `behavior`, `-moz-binding`, `javascript:` / `vbscript:`,
`data:` URLs other than raster images, `@import` of other sites (Google Fonts allowed), `@charset`, and every `<`
(so `</style>` can not end the element). CSS escapes are decoded before the checks. `StoredCss::isSafeValue` checks
one value: also no `;`, `{`, `}` (the node styles of a v4 page, `srv/Website/StyleCompiler.php`, and the same rules in
`shared/src/site/cmsDocument.js`).

Plain text is not entity-encoded unnecessarily. JSON settings keep their structure and scalar types; HTML in their
string values is sanitized.

## CMS exception

Code and styles are kept unchanged only when the server's `isJavaScriptAllowed()` is true, the record type is
`RT_CMS_HOME` or `RT_CMS_PAGE`, and the field is one of `DT_CMS_SCRIPT`, `DT_CMS_CSS`, `DT_CMS_HEADER`,
`DT_CMS_FOOTER`, or `DT_EXTENDED_DESCRIPTION` (`StoredText::allowsCode`). `DT_CMS_EXTFILES` has no unconditional
bypass. Without the exception, a bare script in `DT_CMS_SCRIPT` is cleared and `DT_CMS_CSS` is checked by `StoredCss`.
The client's `isStoredCodeField()` names only `DT_CMS_SCRIPT` now.

## Where it is used

The `srv/` saves: the record validator (new record saves, `html_sanitized` warnings), scratchpads
(`RecordSaveService`), calculated text (`CalculatedFields`), new record duplication (`RecordDuplicateService`),
the System entity mapping (`EntityRecordMapping`) and the Files text metadata (`FileWriteService`). Uploaded file
contents are outside this text policy; their existing extension, path and permission checks remain separate. No
cleanup is run over existing databases.

**Not yet covered (checked again 2026-10-26):** legacy `hserv` saves (`recordModify.php`) and legacy batch
add/replace (`RecordsBatchAction.php`) do not call `StoredText`; they keep their own `USanitize` / HTMLPurifier
rules. Hooking them is a follow-up.

Plain text is recognised as in a browser: a tag starts with `<` directly followed by a letter, `!`, `/` or `?`, so
`a < b` stays text and is not entity-encoded (fixed 2026-10-24).

## Client

`HEditForm` checks all saved blocktext values, including translations and lazy tabs, and shows a non-blocking
JavaScript/CSS warning. `HRecordEditor` supplies the CMS exception using server-provided snapshot metadata and
local concept ids (`shared/src/data/storedTextPolicy.js`). The record validator returns `html_sanitized`
warnings for changed values.

`hasScriptOrStyle()` warns only for styles the server removes (fixed 2026-10-26; before, any `style=` gave the
warning): a `span` style with the four editor properties and plain values (no `url(`, `expression(`), and a block
style with only a `text-align` keyword, give no warning.

## Validation

- `php tests/StoredTextTest.php` in the Heurist repository (no database; the rules of this page, including the
  span and `text-align` cases, custom CSS and the v4 page markup; 90 checks pass on 2026-10-26). `tests/RecordEditApiTest.php` checks the
  validator's use.
- `node --experimental-loader ./scripts/cssLoader.mjs --test shared/test/storedTextPolicy.test.js` in this
  repository, plus the shared test suite and Explorer build.

## Follow-ups

A read-only scan of existing stored HTML before any cleanup, context-appropriate escaping at display points, and
isolated rendering of authorized custom CMS code. Review custom Smarty templates and other code-bearing fields
before rollout: they receive the default policy unless they meet the CMS exception.
