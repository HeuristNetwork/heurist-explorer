# 31 Temporal text in a specified language

**Status 2026-11-07: DONE.** Implemented in both repos and committed (heurist `965067bd6`, explorer `7e889a5`); not
checked in a browser. The open points at the end are known limits, not tasks (point 1: leave legacy as it is, Artem).

## Goal

The human-readable text of a date (`temporalToHuman`, `Temporal::toReadable`) was always English. It now
follows a specified language: `3 mai 1969`, `vers 1850`, `500 av. J.-C.`, `1850 à juin 1900`.

## Decision: the source of the words

A small table in code, one copy per side, not the localization files:

- `shared/src/utils/temporalLocale.js`
- `heurist/srv/Utilities/TemporalLocale.php`

Reasons:

- `$HR` holds one dictionary, the interface language. It can not answer for another language, such as the
  language of a report or a website page.
- `shared/` has no dictionary, so the words would be repeated in 8 apps, 2 files each.
- The server does not read the localization files.
- Word order differs between languages, so the table has patterns (`{d} {m} {y}`, `{from} to {to}`).
- `Intl` alone does not help: the local PHP has no `intl` extension, so client and server would differ.

Languages: `eng`, `fre` (`fra` is accepted). Any other language falls back to English. A new language is one
entry in both tables. Russian needs extra plural forms and genitive months, so the table must grow for it.

## Use

- Client: `temporalToHuman(value, { language })`, `dateToString(value, calendar, language)`. Default = the
  active interface language, so existing callers follow the interface with no change.
- Server: last parameter `$language` (default `ENG`) of `toHumanReadable`, `toReadable`, `toReadableExt`,
  `dateToString`.
- Timeline: the client sends `lang` in `POST /time` when the language is not English (no new endpoint); the label
  of `when` (`getTimespan`, the tooltip of an item) follows it.
- Passed by: `PageContent::field` (page language), `ValueFormatter` for `{wrap dt=date}` (report language, given
  in the constructor by `SmartyTemplateRunner`), `ReportRecordAssembler` (`fN`), `TemplateApi`
  (`recRelationStartDate`, `recRelationEndDate`).

## Stays in English on purpose

- `TitleMask`: titles are stored and must not depend on who saved.
- Export (`srv/Records/Export/ValueFormatter`): export is data.
- Labels of extended mode 2 (`Terminus Post Quem`, etc.); the date values in it do follow the language.
- `native` calendar text: stored by the user, shown as it is.

## Differences from the plan

- Server English keeps the two spaces of the legacy text (`3 May  1969`, key `shortMonthYear`), so stored titles do
  not change. The client writes one space, as before. The test compares with spaces collapsed.
- `types`, `determinations` and `calibrated` are only in the server table, because only reports use compact text.
- The plan called `getTimespan` stored text. It is the label of the timeline data, so it follows the language
  (Artem, 2026-11-07).

## Small changes of English text

- `1 years`, `1 months`, `1 days` are now `1 year`, `1 month`, `1 day`, on both sides.
- `Calibarated` in compact text is now `Calibrated`. The label of mode 2 keeps the old spelling.
- Months of 30 days are one month name (2026-11-07): `1850-04` is `April 1850`, not `1 Apr 1850 to 30 Apr 1850`.
  `estMaxDate` is a number, so `1850.0430` was read as `1850.043` and the end-of-month check failed. Fixed in
  `Temporal::_decimalText` and `decimalText` in `temporal.js`.

## Fixed: timeline label of a range of two date fields (2026-11-07)

Records with Start and End date fields (2-10, 2-11, `mergeTemporals`) showed ` .. ` or `Fuzzy Range >1950:1951 .. :<` in
the timeline tooltip. The merged range has `start.in` / `end.in`, and `toReadableExt` calculated these dates but did not
store them. It now does, so the label is `1969 .. 2005`, and mode 2 lists them as estimates.

## Tests

Shared cases `shared/test/fixtures/temporal-locale/cases.json`, run by `shared/test/temporalLocale.test.js` and
`heurist/tests/TemporalLocaleTest.php`. Server text in English was compared with the git HEAD version on 73 values,
3 modes and 3 calendar options: only the two changes above differ. `TitleMaskCompareTest` and
`ReportEngineCompareTest` give the same results as before.

## Open points

1. The same 30-day bug stays in legacy `hserv/utilities/Temporal.php` (Artem, 2026-11-07: leave as it is), so titles
   written by legacy code keep the old text for these dates.
2. A plain month differs between the sides, also before this work: `1969-01` is `Jan 1969` on the client and
   `January 1969` on the server, because the server turns it into a range.
3. Numbers keep the decimal point in French (`3.5 Ma`).
4. The date snapshot in the website designer (`fieldSnapshot`) uses the interface language; the server replaces it
   with the page language when the page is rendered.
