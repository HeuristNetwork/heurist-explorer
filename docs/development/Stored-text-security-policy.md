# Stored text security policy

The server uses `Heurist\Utilities\StoredText` (in the Heurist repository) as
the save-time HTML policy. Browser validation is advisory; request parameters
cannot authorize JavaScript.

| Field | Default policy |
| --- | --- |
| freetext | Only `u`, `i`, `b`, `strong`, `em`, without attributes |
| blocktext | Rich HTML for TinyMCE text, headings, lists, links, tables, images and media |
| CMS script/CSS fields | Cleared unless the CMS exception below applies, including bare code |

Outside the exception, HTMLPurifier removes script/style elements and their
contents, event handlers, inline styles, unsafe URL schemes, executable embeds,
SVG and forms. Media iframes are limited to YouTube, Vimeo and SoundCloud.
TinyMCE colors, font sizes and alignment expressed as inline CSS are therefore
removed. Plain text is not entity-encoded unnecessarily. JSON settings retain
their structure and scalar types, with HTML in string values sanitized.

Code and styles are preserved only when the server's `isJavaScriptAllowed()`
is true, the record type is `RT_CMS_HOME` or `RT_CMS_PAGE`, and the field is
one of `DT_CMS_SCRIPT`, `DT_CMS_CSS`, `DT_CMS_HEADER`, `DT_CMS_FOOTER`, or
`DT_EXTENDED_DESCRIPTION`. `DT_CMS_EXTFILES` has no unconditional bypass.

The shared policy is used by normal legacy/new record saves, active legacy
batch add/replace, calculated text, new record duplication, scratchpads, and
the new System/Files text-metadata mapping. Uploaded file contents are outside
this text policy; their existing extension, path and permission checks remain
separate. This change does not run a cleanup over existing databases.

`HEditForm` checks all saved blocktext values, including translations and lazy
tabs. It shows a non-blocking JavaScript/CSS warning. `HRecordEditor` supplies
the CMS exception using server-provided snapshot metadata and local concept ids.
The new record validator returns `html_sanitized` warnings for changed values.

Validation:

- `php admin/verification/StoredTextTest.php` in the Heurist repository.
- `node --experimental-loader ./scripts/cssLoader.mjs --test shared/test/storedTextPolicy.test.js`
  in this repository, plus the shared test suite and Explorer build.

Recommended follow-ups: a read-only scan of existing stored HTML before any
cleanup, context-appropriate escaping at display points, and isolated rendering
of authorized custom CMS code. Review custom Smarty templates and other
code-bearing fields before rollout: they receive the default policy unless
they meet the explicit CMS exception.
