# 27m Website publication and SEO

**DONE 2026-11-18** (Artem): all phases committed (explorer `e1d54de`, heurist `97008004b`); the open items are in `leftovers 24, 27-34.md`. Status lines below that say *not committed* are older.

**Status.** Decisions agreed 2026-11-16 (§1-§4, §2.1 Generate options). Phases A-D implemented 2026-11-16 (both repos,
not committed, no browser check, bundles not deployed; §8-9). Replaces the first draft of the same day.

Plans 27a-b share one renderer (`srv/Website/PageRenderer.php`) between live pages and the build job
(`srv/Website/Build/WebsiteBuilder.php`, now only a ZIP of `{lang}/{pageId}.html`). This plan adds a generated
site served by Heurist from a database folder, and the basic SEO of live and generated pages.

## 1. One public URL — live or generated is not in the URL

- The public URL stays `/{db}/site/{id}[/{page}]` (parameter form `?db=&site=&pageid=`), `SiteUrls.php`.
- **If the generated folder has the file of the page, the file is served by default.** No file (never
  generated, deleted, failed build) → live render.
- Live output on request: `?live=1` (logged-in editors) and `?design=1` (designer). Both `noindex`.
- Record pages `/{page}/{record}` (27g): from the folder when the record was generated (§2.1), otherwise live.
- Always live, also when files exist: instance frames `/frame/`, requests with filter state (`?source=`,
  `?filter=`, `v.*`, 27j/27l), the API. Rule: **only the bare page or record page URL (+ `lang`) is served from
  the folder; any other parameter → live.**
- A served file gets `Last-Modified` / `ETag` from the file and `X-Heurist-Site: generated` (diagnostics).
- Language: `?lang=xx` stays for now (default language = no parameter); the server maps it to the `{lang}/`
  folder. Page ids stay numeric; slugs are postponed (a later slug = non-numeric segment, no conflict).

## 2. Generated site in the database folder

- Folder: `{db files}/generated-sites/{site id}/`: `{lang}/index.html`, `{lang}/{pageId}.html`, `sitemap.xml`,
  `manifest.json` (build time, user, languages, pages, number of files, size, max `rec_Modified` of the site and
  its pages).
- Links inside the files use the live URL form (`SiteUrls` normal mode), so the URL never changes.
- Build into a temporary folder, replace the site folder on success. No previous copy, no Revert: if a build
  fails, the old folder stays (or none) and visitors get live output.
- Frozen at build: static text, `data-h-field`, cards, galleries, reports, menus (27e). Modules stay live
  through the API.
- Build = the existing job (`POST /website/{id}/execute`, §2.1 options in the body). No new endpoint (plan 28,
  agreed 2026-11-16): `DELETE /website/{id}/asset` removes the generated folder (the generated site = the
  website's asset, as the generated file of `output`); `GET /website/{id}` returns `meta.generated` (date, size,
  files, languages, record pages).

### 2.1 Generate options (agreed 2026-11-16)

Options of the Generate dialog, sent in the body of `POST /{website|page}/{id}/execute`; `manifest.json` records
them and the dialog starts from them the next time. *Changed in Phase B (2026-11-16):* agreed as a `generate` key of
the website configuration; not done, because a save of the configuration changes `rec_Modified` (every Generate would
mark the site as changed since the generation) and can clash with an open designer draft. Without a generated folder
(deleted, or only ZIPs) the dialog starts with the defaults.

- **Languages:** checkboxes of the site languages, all by default. A language not generated is rendered live.
- **Target:** *Server folder* | *ZIP* | *Both*. The ZIP is a separate render (relative file links); it asks for
  the optional final base URL (§4). *Both* renders twice.
- **Record pages:** per record page of the site a query (Filter Builder, as the Record cards query, or a saved
  filter). Default: none, record pages stay live. Only guest-visible records (the build runs as a guest).
  - Hard limit per build (e.g. 5,000 files over all languages); the dialog shows records × languages first.
  - Files `{lang}/{pageId}/{recordId}.html`; the URL `/{db}/site/{id}/{page}/{record}` is served from the
    folder when the file exists (this changes the rule of §1, where record pages are always live).
  - Before a record-page file is sent, the server checks that guests can still see the record (one read);
    otherwise 404. Ordinary pages are a snapshot without a check.
  - Links: unchanged in the folder (live URL form). In the ZIP a record link is a relative file link only when
    the record is in the generated set, otherwise a link to the live server.
  - The sitemap lists the generated record pages (this is the opt-in of §5).
- The Website manager section (§3) shows the counts, e.g. "Record pages: 1,240 files".

## 3. Website manager

The website card gets a section *Generated site*: date of generation, size, number of files, a note when the
site or a page was changed after the generation, buttons *Generate* and *Delete* (folder removed → live again).

## 4. ZIP

A copy for another host: relative file links (`SiteUrls::files()`, as now). Canonical, hreflang and sitemap are
written only when the author gives the final base URL at build time; otherwise left out.

## 5. SEO basics (live and generated alike)

- Per page: translated `<title>`, editable meta description (translated page field), `html lang`,
  self-canonical, `hreflang` for real translations + `x-default`.
- Real `<a href>` for menus, breadcrumbs, language switch, record links; swap/scroll navigation (27f, 27k)
  updates title and canonical.
- `noindex` on `?live=1`, `?design=1`, `/frame/`; real 404 for missing pages and records not visible to guests.
- `sitemap.xml` per site: pages × languages; record pages only if the author opts in, guest-visible records only.
  Generated: written to the folder; live: rendered.
- Website setting *Search engines* (index / noindex for the whole site): `layout.searchEngines` of the website
  configuration 2-1187 (a standalone page: its own), `false` = noindex, not given = index. Agreed as `seo: { index }`,
  changed in Phase A (2026-11-16): `layout` already holds the site settings (`startPage`) with read, save and the
  validator on both sides.
- Page description = `DT_SHORT_SUMMARY` of the page (already the menu rollover), record pages as in 27g.
- Own domains (`domainWebsites.json`): a v4 website is mapped with `"site"` (not `"website"`, the router can not
  read the version): `{ "db": "x", "site": 207627 }` → `https://host/`, `/{page}`, `/{page}/{record}`,
  `[/{page}]/frame/{instance}`, other v4 pages `/site/{id}/...`, `/robots.txt` (the sitemap of the site, or
  `Disallow: /`), the sitemap `/site/{id}/sitemap.xml` (`/sitemap.xml` too, but a `sitemap.xml` file of the web root
  hides it).

## 6. Later

Slugs with redirects, language in the path, browse pages with pagination for collections, filter landing pages,
release check crawler, Open Graph, structured data, automatic rebuild after save.

## 7. Phases

- **A** — head metadata, noindex, sitemap (live).
- **B** — folder build, serving from the folder, Website manager section.
- **C** — own-domain v4 routing, per-host `robots.txt`.
- **D** — ZIP with base URL.

Tests: `heurist/tests/WebsiteRenderTest.php` (canonical / hreflang / noindex), build into a temporary folder then
the same URL returns the file (`X-Heurist-Site`), `?live=1`, `?source=` and record URLs stay live, a failed
build leaves the folder as it was.

## 8. Implementation of Phase A (2026-11-16)

Server (`heurist`):
- `srv/Website/PageRenderer.php`: meta description of every page (`DT_SHORT_SUMMARY` of the record of a record page,
  else of the page, the website record on the home page); `<link rel="canonical">` on every page = `selfUrl` (no
  Saved filter or designer parameters); hreflang alternates of every language + `x-default`; `<meta name="robots"
  content="noindex">` for `design`, `live` and `layout.searchEngines` false (`PageRenderer::indexable`); no canonical /
  alternates in a built site (`SiteUrls::isFiles()`, until the base URL of Phase D); instance frames always noindex;
  `sitemap()`: home + menu pages (no record pages and their sub pages) × languages, `lastmod` from `rec_Modified`
  (now read by `WebsiteRepository::records`), `xhtml:link` alternates; empty `urlset` when not indexable.
- `SiteUrls::sitemap()`, route `/{db}/site/{id}/sitemap.xml` (`RequestRouter`, `&sitemap=1`), `WebsiteController`
  writes it read as a guest (`ServiceFactory::websiteController`, a site a guest can not see = 404); `?live=1` sets
  `live` (noindex) already.
- `CmsValidator::layoutProblems` / `cmsLayoutProblems`: `searchEngines` true or false.
- Test `tests/WebsiteRenderTest.php`: 114 pass (12 new: canonical, alternates, x-default, French canonical and
  `html lang`, noindex of design / live / searchEngines false, sitemap content, no record page, built site).

Client (`heurist-explorer`):
- Designer *Navigation and layout*: select *Search engines* Allowed | Not allowed (noindex) (`designerStyles.js`),
  localization eng / fre.
- `apps/website/src/siteNavigator.js`: swap / scroll replace canonical, description, robots and alternates of the
  shown page (`seoTags`, was `alternateLinks`).
- JS tests 1,841 pass; `build:website` passes, not deployed.

Not done in Phase A: per-host `robots.txt` (Phase C), a link to the sitemap in the Website manager.

## 9. Implementation of Phases B-D (2026-11-16)

Server (`heurist`):
- `srv/Website/Build/GeneratedSites.php`: `generated-sites/{id}/` (`getSysDir('generated-sites')`, ServiceFactory
  `generatedSites()`): page files, manifest, `buildFolder()` beside the site folder + `install()` by rename (the former
  folder removed, none kept), `remove()`, `info()` (`meta.generated`).
- `srv/Website/Build/WebsiteBuilder.php`: `options()` (languages, target folder | zip | both, baseUrl, recordPages),
  `build($id, $dir, 'folder'|'zip', $options)`: chosen languages, record pages `{lang}/{page}/{record}.html` from a guest
  search of each query (`RECORD_FILE_LIMIT` 5,000 files), `sitemap.xml` (folder; ZIP with its address, also
  `robots.txt`), `lastChange()`; the renderer factory takes `SiteUrls`.
- `WebsiteBuildJob`: options validated in prepare, folder → manifest (`baseUrl` of the build, options, counts, size,
  `modified`) → install; ZIP as before; both = two renders; limit 1,800 s. `api.php` passes the execute body as
  `options`.
- `srv/Website/Build/GeneratedPages.php` + `WebsiteController`: a request with only `db, site, pageid, rec, lang,
  domain` is answered from the folder when the file exists and the website, page and record are still visible to a
  guest (one read: also ordinary pages, not only record pages as written in §2.1); `Last-Modified`, `ETag`, 304,
  `X-Heurist-Site: generated <date>`; the generated sitemap first.
- `WebsiteEntityHandler`: `meta.generated` (+ `changed`: the latest `rec_Modified` of the site and its pages is newer
  than the manifest), `GET|DELETE /{website|page}/{id}/asset` (DELETE needs the rights of Generate).
- `SiteUrls`: `files(..., $publicBase, $records)` (record pages of a ZIP, `withDepth(2)` for their links,
  `absolute()` for canonical / alternates / sitemap with the address), `domain()` (own domain);
  `WebsiteRepository::recordHeads` returns `modified`.
- Own domain (Phase C): `RequestRouter::routeOwnDomainSite` (param `domain`), live pages with `SiteUrls::domain()`;
  generated files are rewritten when sent: `{build server}/{db}/site/{id}` → the domain root, other sites →
  `/site/`, the server root → the domain (http or https of the build server, manifest `baseUrl`).
- Tests: `tests/WebsiteEditTest.php` 112 pass (options, record pages, ZIP with its address, folder build, serving rules,
  removal, domain URLs), `tests/WebsiteRenderTest.php` 114 pass. Checked over HTTP on the local server with a real
  job: generated pages, record page and sitemap from the folder, 304, `?live=1` / `?source=` live, own domain through
  a temporary `domainWebsites.json` entry (pages, frame, bundle, API, robots.txt, sitemap on the domain).

Client (`heurist-explorer`):
- `WebsiteClient`: `summary().generated`, `build(id, {options})`, `deleteGenerated(id)`.
- Website manager: Generate opens `openGenerateForm` (`websiteForms.js`: languages, target, ZIP address, a query per
  record page with the Filter Builder of the bridge; `generateOptions`, `generateQuery`); section *Generated site* of
  the card (date, languages, pages, record pages, files and size, changed note, Open the live pages `?live=1`,
  Delete); `recordPagesOf` (WebsiteManager.js). Localization eng / fre.
- JS tests 1,842 pass; `build:website` passes, not deployed.

Open: a browser check; deploy of the website bundle; documentation of the `"site"` mapping for server admins;
the records of a record page are not rebuilt when a record changes (Generate again).

## 10. Review 2026-11-17 (minor CMS tasks; not committed, no browser check)

- Website manager card: headings h2 (`--h-font-size-large`) = website title, Check, Generated site; h3
  (`--h-font-size`) = Address, Menu, Format / Non public pages / Non public records on pages, Generated files and log.
  Page titles in Check (format list and the page column of the record list) in normal size and `--h-color-primary`;
  the record lists of Check use `fontSize: 12`.
- Generated site in two columns (text left, buttons right): *Generate site* (moved from the toolbar, disabled while a
  build runs), *Clear generated site* (Open live pages removed: the `live` parameter is not kept in the navigation).
  The h2 headings have the background `--h-color-surface`. Subsection *Generated files and log* with *Clear log and
  delete zip files* (`WebsiteApplication.clearBuilds`: DELETE `/jobs/{id}` of every finished build of the record).
- Check: the instances of the website configuration (header, footer and home content) count as "configured
  elsewhere" on menu pages (`WebsiteService::context`, `$otherInstances`); before, every instance of the home content
  gave "Instance ... has no host in the page" on the first menu page. The whole-site check reads the home content
  itself even with a Startup page. New warning `media_placeholder` "Replace placeholder image" for a media element that
  shows a valid placeholder of assets/cms and no file (`CmsValidator::isPlaceholder` = `cmsIsPlaceholder`; fixture
  `page-style-placeholder.json`).
- New website: the home content (template Landing) without the banner. Header logo without a website logo: the
  placeholder `cms/placeholder_logo.png` (CSS of `.h-site-logo:empty`, was a dashed icon box).
