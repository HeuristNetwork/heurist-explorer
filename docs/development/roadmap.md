# Roadmap

*Status: agreed with Artem 2026-11-18. This file is the single source for the order of the next plans and their
estimated dates. Each plan gets its own planning session and file in this folder; update this table when a plan
starts, moves or is done.*

Done plans and their history: `current-work.md`. Open items of done plans: `leftovers 24, 27-34.md`.

## 1. Order and schedule

Conversion and polishing of the existing websites can take much time. It runs beside the other work and has a buffer
of about 20 %.

| Stage | Plan | Content | Depends on | Estimate |
|---|---|---|---|---|
| **A. Finish CMS** | 27o Multilevel layout | Map or another module as the background of a page, content over it | 27l | 19 Nov |
| | 27p Conversion of three websites | MapOfTheAbsentees, PFC, DigitalHarlem rebuilt by hand in the designer; every manual step written down as a rule for the converter (input for 27s) | 27o | 20–24 Nov |
| | 33a Other Actions | convert to record type, add / remove tags, rate, unbookmark, add link or relation (listed in the Actions tool, disabled now) | 33 | 25–26 Nov |
| | 27q1 Story map | Presentation set record type (story map, crosstabs, export); Explorer tool pane + website element; patterns points / path (plan file agreed 2026-11-18) | 27l, 09 | 27 Nov – 3 Dec |
| | 27q2 Crosstabs | Explorer tool + website widget, settings in a Presentation set | 27q1, 17 (ranges) | |
| | 27q3 Blog / news template | | 27i | |
| | (ongoing) | polishing of converted websites, review rounds | | buffer |
| **B. Independent srv** | 35 srv bootstrap and authorisation | own front controller (no `hserv\System::init`), own configuration and settings, session and login check in srv; hserv and srv share only the database and the session cookie (`legacy_dependencies.md` S1–S3) | — | 4–10 Dec |
| | 36 Login / logout in Explorer | login, logout, current user, session expiry, links to register / reset password; module preferences on srv (C1, C8) | 35 | 11–12 Dec |
| **C. Storage** | 28b Database structure | plan 28 §7 decisions (global ids, `MEDIUMTEXT` + `dtl_Lang`, companion tables per pair), `sysRecords` / `fileRecords` pairs, migration scripts, switch per database, saved filters (§11.1) | 35 | 15–23 Dec |
| **D. Agent and conversion** | 27r API for an AI agent (plan 27 phase 7) | tools / MCP description of the common record API, the designer services (with revision checks) and the module settings (`describeConfiguration`, plan 29); for outside agents | 28b | 5–9 Jan |
| | 27s Legacy website conversion in the designer (plan 27 phase 8) | one converter per legacy widget, report per page; rules from 27p | 27p | 12–16 Jan |
| **Later** | 37 Database administration | create, clone, delete, upgrade databases; registration; statistics | 35, 36 | Jan–Feb |
| | 38 Database definitions | record types, fields, terms on `def` / `terms` (replaces the legacy editors); the agent defines a new record type | 28b, 27r | Feb |
| | 39 Import | CSV / XML / JSON import as srv jobs; the agent matches columns and values | 38, 27r | Feb–Mar |
| | 40 Assistant in Explorer | chat panel in Explorer and the designer on the 27r tools | 27r, 36 | later |

## 2. Why this order

- **35 before 36:** login needs the srv session.
- **35 before 28b:** the new tables are safe only when srv is their only reader and writer.
- **27r after 28b:** the agent API describes the common API, so that API must be stable first. Definitions (38) and
  import (39) reuse the agent tools.
- **27p now, 27s later:** the manual conversion shows which rules a converter needs (plan 27 decision 15: conversion
  last).

## 3. Decisions (Artem, 2026-11-18)

1. The three websites are converted by hand in the designer now; each manual step is noted as a converter rule for
   27s.
2. Base work in the order 35 srv → 36 login → 28b storage.
3. Plan 28 tables: the switch is **per database**, and only when that database no longer uses the legacy interface.
   hserv never reads the new tables.
4. AI agent: both, **external first**. 27r = tools for outside agents; the built-in assistant (40) comes later on
   the same tools.

## 4. Open questions per stage

- **B (35):** how hserv and srv share a login during the transition (same session cookie, or a token).
- **C (28b):** plan 28 §7.6: global id sequence or ranges per pair; one `recLinks` / `recDetailsDateIndex` /
  `usrRecPermissions` for all pairs or one per pair; order of the conversions; tags in `usrTags` or `sysRecords`.
- **D (27r):** MCP server or OpenAPI tool list; which actions need a confirmation by the user.

## 5. History

- 2026-11-18 — first version, agreed with Artem (decisions §3).
