
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
