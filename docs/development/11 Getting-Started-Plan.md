# Getting started: start-up query, welcome popup and guided tour — development plan

Status: **agreed with Artem 2026-10-03. Phases 1 and 2 implemented 2026-10-03, not committed,
not yet checked in a browser. Phase 3 (content, recordings) open; first texts for topics 1–3
are in place.**

## Context

People who open the new Explorer don't understand its parts (Query Source editor, saved
filters and sources, independent presentation modules) and miss two things from the old
interface: a query that runs on opening, and some guidance. This plan adds both:

- On start, Explorer reopens the last query (as the old interface did).
- On the very first visit, a welcome popup describes Explorer and offers "Getting started".
- Getting started becomes a guided tour: a popup next to each described element with
  Back / Next, five topics, short text, recordings, and links to the manual.

There is no `runtimeMode` for Explorer yet; every Explorer start is the authoring case.
When the publication work adds a published mode, start-up behaviour of this plan applies
only to the authoring mode.

## Decisions (2026-10-03)

1. **Start-up query.** When Explorer starts without a DataSource in its bootstrap state and
   the history has entries, the most recent entry is activated
   (`ExplorerApplication.activateHistoryEntry`). That is the normal activation path: a
   parameterized query opens the Filter Form; any other query runs at once and is loaded
   into the Query Source editor.
2. **Welcome popup** only on the very first visit (no history and the browser has never
   shown it), and on demand from the Explorer configuration dialog (Getting started button,
   which closes the dialog first). "Shown" is stored per browser, not per database:
   localStorage `heurist.explorer.welcomeShown`.
3. **Tour, not emulation.** Steps show text and short recordings; user actions (inline
   query helper, Filter Builder) are not emulated programmatically. Recordings are silent
   loops of 5–15 s (WebM/MP4, about 0.3–0.8 MB), loaded only when their step is shown
   (`preload="none"`). They show the English interface.
4. **Content files.**
   - Tour text: one file per language, `explorerGettingStartedEng.htm` / `…Fre.htm` in
     `user-manual/`, one `<section id="…">` per step (2–5 sentences). Not one file per step.
   - Manual: `explorerUserManualEng.htm` / `…Fre.htm`, with the five topics as sections
     with anchors. Each tour step has a "Read more" link to its manual anchor
     (`InlineHelp` gets an anchor option).

## Welcome popup

Logo (`assets/branding/h6logo.png`), title "Welcome to Heurist Explorer", one sentence:
"Explorer is the module that allows filtering, analysing, visualising and publishing data in
your database.", a short description of how Explorer works (query sources, presentation
modules, publication), and the buttons **Getting started** and **Close**.

## Tour topics

1. **Filter builder and source editor** — inline query helper; parameterized filter;
   Filter Form; geographic / time / column fields; expansion rules.
2. **Saved filters and sources on the toolbar** — Favorites; Workspace; Subsets.
3. **Presentation modules** — Data, Map, Graph, Timeline, Record view (one paragraph each,
   linking to `<module>UserManual`); layout configuration.
4. **Tools** — Reports, Crosstabs, Actions, Export (content to be provided).
5. **Publication** (content to be provided).

## Phases

### Phase 1 — start-up query, welcome popup, configuration button (done 2026-10-03)
- `ExplorerApplication.initialize`: last history entry or first-visit welcome.
- `ui/ExplorerWelcome.js/.css`: the popup (HMsg dialog), `shouldShow()` / `markShown()`.
- `ExplorerConfigurationDialog`: `onGettingStarted` option, a Getting started button in the
  footer that cancels the dialog and calls it.
- Until the tour existed, Getting started opened the Explorer manual (now it starts the tour).
- `explorerUserManualEng.htm`: the five topics as sections with anchors (first text; Tools
  and Publication marked "to be provided").

### Phase 2 — tour widget (done 2026-10-03)
- `ui/ExplorerTour.js/.css`. A step: `{ id, topic, target: () => Element|null, before?: () =>
  Promise, placement, manualAnchor }`; text comes from the section with the step's id in
  the tour file.
- Popover in the top layer next to the target (the QSE Layout menu technique), with an
  arrow, title, text, optional video, "Read more", Back / Next / Close and "3 of 12".
- Highlight ring on the target (outline), no veil; the page stays usable.
- Reposition on resize and scroll; `before()` opens what must be visible (QSE, More,
  a toolbar list, a module pane); a step whose target can't be shown is skipped.
- Targets inside iframe modules (Map, Graph) can only be the whole pane.
- Compact mode: the popup is centred instead of placed next to the target.

**As implemented (2026-10-03).**
- `ui/ExplorerTour.js/.css` is generic (steps, topics, `loadText`, `onReadMore`,
  `isCompact`, `onClose`); `ui/explorerTourSteps.js` has the Explorer topics and 22 steps:
  QSE (intro, query helper, Builder, parameters/Filter Form, settings, rules, Save/Add,
  Layout menu), toolbar (Search, Filters/Entities/Sources, Favorites, History, Workspace,
  Subsets), modules (each module's pane when visible, else its toolbar button; Options for
  layout), Tools (Report button), Publication (Publish button).
- `ExplorerApplication.openGettingStarted()` starts the tour (Welcome → Getting started);
  `openManual(anchor)` opens the manual at a section (`InlineHelp.open(anchor)`). The QSE
  More state is restored when the tour closes.
- Texts: `user-manual/explorerGettingStartedEng.htm` (in the build's manual list). Other
  languages fall back to it; the fallback also applies when the file has no sections
  (the dev server answers a missing file with index.html). Links open in a new tab;
  relative `src`/`href` resolve against the file.
- Keyboard: Esc closes, ←/→ Back/Next (not while typing in a field).
- While a Filter Form is open the QSE steps are skipped: closing the form would lose the
  user's values.
- Recordings: `<video src="media/…">` in a section is supported (played muted in a loop
  when the step is shown). The `user-manual/media/` folder is not yet copied into the build
  — add that with the first recordings.
- Tests: `test/explorerTour.test.js`.

### Phase 3 — content
- Tour text and manual sections for topics 1–3 (Claude), Tools and Publication text and
  all recordings (Artem). French translations.

## Verification
- Phase 1: clear localStorage → welcome on the first start; run a query, reload → the
  query runs at start and is in the QSE; a parameterized last query → Filter Form opens;
  Explorer configuration → Getting started closes the dialog and shows the welcome.
- Phase 2: Getting started → the tour goes through the 5 topics; Back/Next skip steps whose
  element is not visible; the popup sits beside the element, the ring follows on resize and
  scroll; Esc closes; Read more opens the manual at the topic; compact mode centres it.
- Tests: `test/explorerWelcome.test.js` (first-visit flag), `test/explorerTour.test.js`.
