
### 2026-09-26 — Facet rounds (V15 revised)

- Counts are recounted **after each search** (not on every change): `HFilterForm` awaits what
  `onSubmit` returns (QuerySourcePanel returns the search promise), then runs one **round**: facets top
  to bottom, **one request at a time**. A new search aborts the round at once (the request in flight
  and the rest of the queue — they count over values that are no longer current); the next round
  starts when that search returns. The input whose change started the search is skipped; unchanged
  queries are answered from the value source cache (rounds do not invalidate it).
- Lazy: a picker (`select`) is only marked stale (`HValueCombo.markStale` → loads on open); a
  collapsed accordion field loads when expanded. Visible lists load in the round.
- Designer option **"Update counts after each search"** (Lists group, on by default); off →
  `settings.facetsInitOnly: true`, counts from the initial load only.
- Fixes a race: list loads now take the round's `AbortSignal`, so a slower old answer can no longer
  overwrite a newer one.

### 2026-09-27 — Linked record "is / is not" (exception to V5)

- The "<record type> records" row of a linked branch offers **is, is not** | exists, missing. "is" / "is
  not" pick linked records by title (`RecordTitleSource`: `GET /records/` of the branch's record type,
  title search on the server) → `{"ids":"234,235"}` / `{"ids":"-234"}` inside the branch; a plain
  `ids`/`id` list in a branch reads back as this row. **Exception to V5** (the Filter Builder otherwise
  never asks the server for values): records cannot be listed from HDbDefs. Without a records API the
  row takes record ids as text.
- One picker per value line (single select); "+ add value" adds alternatives, always OR — a linked
  record cannot be two records, so AND is not offered. (Two *different* linked records, "linked to 234
  and to 235", would need two branches; not generated.) A blank "is" is not a runtime parameter.
- Default operator on picking the row stays "exists".
