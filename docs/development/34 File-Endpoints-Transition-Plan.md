# 34 File URLs on the file endpoints

**Status 2026-11-16: agreed with Artem and implemented in both repos (phases 1-4); not committed, not checked in a
browser, bundles not deployed.**

## 1. Context

The file endpoints of plan 28 §4 (agreed 2026-11-16): `GET /api/{db}/files/{key}/asset` = the file itself (ranges),
`/web` = the reduced copy of a large local image (`srv/Files/WebImageCache`, 400×400 JPEG for files of 200 KB or
more; the file itself otherwise), `/thumbnail`. Guests read viewable files. `/files/{key}` (no action) is the file
**record** (JSON), not its content.

Until now heurist-explorer, the CMS designer, TinyMCE, Record View and the srv JSON wrote legacy `?db=X&file=K`,
`&fullres=1`, `&thumb=K`, `&download=1` URLs. Artem (2026-11-16): use the file endpoints everywhere in heurist-explorer,
the CMS designer and published sites included.

Players are HTML made from a file and its URL, never by an endpoint (the endpoints give files only):

- client: `shared/src/site/cmsMedia.js` `buildCmsMedia` (CMS media, galleries, badges), `shared/src/recordview/fileMediaItem.js`
  (Record View, file input), `shared/src/widgets/rich-text/mediaTag.js` (Media button of TinyMCE);
- server: Smarty `{wrap var=... dt="file" mode="player"}` (Custom reports, CMS Record cards), `srv/Files/FilePlayerHtml.php`
  (moved from `Reports/Smarty/ValueFormatter`, port of legacy `fileGetPlayerTag`).

Legacy `fileDownload.php?mode=tag|page` (a server player as a URL) is not used by heurist-explorer and not ported.

## 2. Decisions (Artem, 2026-11-16)

- **Stored form** (media / gallery / badges HTML, TinyMCE text, background images of styles): the relative URL
  `./api/{db}/files/{key}/{asset|web|thumbnail}` (relative to the Heurist base URL, as TinyMCE already stores `./`;
  `/heurist/api/...` is routed, so legacy pages read it too).
- **Old stored values**: rewritten on output by one rule in JS and PHP; the designer and TinyMCE store the new form at
  the next save. No conversion script.
- **Moved**: records / files / map JSON, Smarty reports and Record cards. **Not moved**: export files (they leave
  Heurist; legacy URLs stay valid).
- Viewer pages (OpenSeadragon, Mirador, 3D) stay legacy PHP pages: they are viewers, not file endpoints.

## 3. The URL rule (phase 1)

`shared/src/data/fileUrls.js` = `srv/Files/FileUrls.php`, cases in `shared/test/fixtures/file-urls.json`
(`shared/test/fileUrls.test.js`, `heurist/tests/FileUrlsTest.php`).

| Legacy | New |
|---|---|
| `?db=X&file=K&fullres=1` | `asset` |
| `?db=X&file=K` in an `img` or a CSS `url()` | `web` (what legacy gave) |
| `?db=X&file=K` in other tags (video, audio, source, a, embed, figure `data-h-full`) | `asset` |
| `?db=X&download=1&file=K` | `asset?download=1` |
| `?db=X&thumb=K` | `thumbnail` |
| `&fancybox=1`, `&embedplayer=1` | dropped (they only changed legacy headers) |

Forms: absolute with the base URL, `./?` and `?`; another host stays. `database` given: only that database;
empty: any database of this installation (relative URLs are always of this installation; the text editor).
`fileUrl()` / `FileUrls::url()` make a URL, `upgradeFileUrls()` / `FileUrls::upgrade()` legacy → relative,
`resolveFileUrls()` / `FileUrls::resolveHtml|resolveCss()` legacy and relative → absolute.

## 4. Client (phase 2)

- `fileMediaUrls(baseUrl, database, {apiBaseUrl, relative})`: always the file endpoints (`{baseUrl}api` by default);
  `relative: true` = the stored form. Record View zoom = `web`, players and Download = `asset`, thumbnails = `thumbnail`.
- `RecordViewRenderer` thumbnails, `RecordEditorHost._fileUrl` (`asset`) through it.
- `richTextHtml.js` (blocktext of Record View): file URLs of both forms → absolute endpoints (`web` only in `img`).
- `mediaTag.js`: `./api/{db}/files/{key}/web` for images, `asset` for video, audio, links. `HTinyMceEditor`: the value
  is upgraded when loaded (`upgradeFileUrls`, no database: any of this installation).
- CMS designer: media, galleries, badges, template media and file field snapshots built with the relative form;
  background images `url(./api/{db}/files/{key}/asset)` (`designerStyles.js`, legacy values read too). A loaded record
  (`designerData.recordDocument(record, codes, {baseUrl})`) has its parts, configuration and translations upgraded: a
  saved part stores the new form. Preview: `CmsPreview.apply` resolves the draft HTML; `compileCmsStyles` resolves
  background images; gallery / badges HTML of the settings resolved in `siteWidgets` / `siteRuntime`.

## 5. Server (phase 3)

- Pages: `PageRenderer::render` resolves header / main / footer after the instances are filled (galleries, badges,
  cards, record fields); `StyleCompiler` resolves background images (same as `compileCmsStyles`; fixture
  `cms-v4/styles.json` updated). Built sites use the same renderer.
- JSON: `rec_ThumbnailURL` of `/files` and `/records` (`LegacyFileStore`, `RecordFileStore`, `RecordDataService`) =
  `/thumbnail`; map image layers (`MapPresentationService`) = `/asset`.
- Smarty: `ReportEnvironment::fileUrl` = `web` by default (`<img src="{$file.URL}">` stays light, as legacy `?file=`),
  `thumbnailUrl` = `thumbnail`; `{wrap}` links = `asset`; `OutputSanitizer` and CMS content of `ValueFormatter`
  resolve file URLs. Player: `FilePlayerHtml` (image `web`; video, audio, PDF, links `asset`; thumbnail; services
  external; 3D / Mirador legacy viewers; lightbox hooks `fancybox-thumb`, `data-id`, `rec_Files` kept). Same choice as
  the client: `shared/test/fixtures/file-players.json` (`shared/test/filePlayers.test.js`, `heurist/tests/FilePlayerHtmlTest.php`).
- `FileContent` parity with legacy: a public local file is redirected to the file store of the web server when the
  installation sets `$allowWebAccessUploadedFiles` (not a download); a file of a repository with credentials
  (`ulf_Parameters.repository`, Nakala) is redirected to legacy `?file=` (sent with the API key).
- Exports (`Records/Export/ValueFormatter`) unchanged.
- **No system init for thumbnails and web copies** (Artem, 2026-11-16: the full request per image overloaded the
  server): `srv/Files/StaticFileSender`, called at the top of `hserv/controller/api.php`, sends
  `filethumbs/ulf_{key}.png` (when `$allowWebAccessThumbnails`) and `webimagecache/{key}.jpg` (when
  `$allowWebAccessUploadedFiles`) as static files, with ETag / 304; no database, no session. Measured on XAMPP:
  35 ms against 89 ms of legacy `?thumb=` and 132 ms with the full init. Not on disk yet or the setting off: the normal
  request (access check, the file made). Test `heurist/tests/StaticFileSenderTest.php`.
- **`/asset` load (Artem, 2026-11-16: switching two pages with a 4 MB banner loaded the server):** (1) bug: the static
  redirect never happened (`ServiceFactory::fileController` set `$paths` to its default before reading the static URL),
  so every `/asset` streamed the file through PHP after the full init; fixed. (2) The redirect of a public file is
  cached by the browser (`Cache-Control: public, max-age=86400`). (3) Guests without a Bearer token: `api.php` answers
  `/asset|web|thumbnail` through `ServiceFactory::guestFileContent` + `FileContent::trySendPublic` before the legacy
  system: one connection, no session file (no `Set-Cookie`), no login check, settings or write services; only a file
  that needs a login (403) goes on to the full request. Measured: 74 ms against 117 ms of legacy `?file=&fullres=1`
  (was 147 ms, and 245 ms streaming 4 MB, before).

## 6. Tests (2026-11-16)

- JS: `npm test` 1,811 pass (file URL and player fixtures; expectations of cmsMedia, Record View, mediaTag, designer
  updated). `npm run build:website` passes.
- PHP: FileUrlsTest 29, FilePlayerHtmlTest 9, WebImageCacheTest 14, CmsFormatTest 18, WebsiteEditTest 82,
  FileWriteTest `--write` 72, TileZipTest 11, DataAccessBoundaryTest pass.
- `ReportEngineCompareTest` compares file URLs by key (`[file K]`, `[thumb K]`; HTMLPurifier `alt` from the URL);
  remaining differences are template styles and data, not URLs.
- `WebsiteContentTest`: its default site 207627 was deleted; with `--site=209605` the file field check passes, the
  checks of titles and reports expect data of the old site.

## 7. Open

- Browser check (designer: Add Media, Gallery, TinyMCE Media; an old page opened and saved; published page as a guest;
  Record View; Map image layers; reports with players), deploy of the bundles.
- Custom CSS of websites (`customCss`) is not rewritten (the author's own CSS).
- Explorer modules (Map, Data, Graph, Timeline) take thumbnails from the srv JSON, nothing of their own to change.
