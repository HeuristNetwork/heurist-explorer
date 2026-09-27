
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

### 2026-09-27 — Facets of fields in linked records (fix)

- Bug: a facet of a parameter inside a linked branch counted the **linked** records (`[{"t":"48"}]`):
  two "Visited" Events of one Person gave 2. Now the form sends `detail=values&q=<query without the
  branch>&via=[{"lt:240":[{"t":"48"}, …other filled conditions of the branch]}, …]` and the server counts
  **main records** per value (the Person once) — `linkedFacetRequest` (client), `RecordSearchService::
  linkedPathTargets` (walks lt/lf/rt/rf/related with the search's own edge functions, now shared via
  `matchingResourceEdges` / `matchingRelationshipEdges`) and `FieldValueCounter::countThroughLinks`.
  Live test: each value's count equals the search (resource and `related` paths).
- Not yet: range lists and slider bounds (`detail=ranges` / `detail=minmax`) of a parameter in a linked
  branch still count over the linked record type; a parameter inside an any/all group keeps the old count.

### 2026-09-27 — Tags (keywords)

- `/sys` type **tag** (`usrTags`: id, title = tag text, owner = user or group, modified, field
  `description`): database admins see all, others their personal and their groups' tags, guests none.
  Predicate `user=<id|current>`: a user's tags (personal + groups'); with `t=group` the groups a user
  belongs to. `owner` takes lists. `record=<id,…>`: the tags on those records; virtual field `ownername`;
  tag responses carry `meta.currentUser`. OpenAPI updated.
- Bootstrap (UserGroupManager) loads only `{t:"tag", user:"current"}` (limit 5000) - an admin no longer
  receives every user's tags.
- Same text under several owners: plain texts stay global (legacy, public websites); `"Owner\text"`
  (user/group name, backslash, text; JSON `"Database Managers\\key1"`) picks one owner's tag.
- Record View footer: tags of the record grouped by owner - "Personal tags: …" first, then
  "<group> tags: …" (`RecordDataProvider.loadTags`, `tagGroups`).
- Record search `tag`: IDs and tag texts interchangeable and mixable (a text matches every tag with that
  text, as legacy): `"1,6"`, `[1,6]`, `["key1","DBM 1"]` (any); `{"all":[…]}`; `{"not":{…}}`; `"-1,6"` (none);
  `NULL` / `-NULL`. Live tests: `SystemQueryTest`, `FieldValueCounterTest`.
- Filter Builder: tag operators **is, is not** | exists, missing (vocabulary: "is any of"/"is all of"
  removed — both copies); values picked from `TagSource` (HDbDefs overlay loaded by UserGroupManager:
  personal tags first, then each group of the user, with headings); OR → `"1,2,3"` / `"-1,2,3"`, AND →
  `{"all":[4,5]}` / `{"not":{"all":[4,5]}}`; a blank value is a parameter (`$X1$`). Older `{any:[…]}` /
  arrays read back as the same row.
- Filter Form: tag in a list mode lists the user's tags (grouped); **Facets** (designer checkbox, now also
  for tags) lists only tags in the result with counts (`FacetTagSource` over `detail=values&field=tag`,
  also through linked branches via `via`). Picker/list group headings: item `groupLabel`.
