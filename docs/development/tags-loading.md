# Tags (keywords): how the client loads them

Status: **decided on 2026-09-27: keep loading tags at bootstrap.** Tags are not widely
used, so the list is small. The lazy alternative below is written down so it can be
built if tag lists grow.

## Current design: Explorer loads the tags at bootstrap

`UserGroupManager.load()` (`apps/explorer/src/core/UserGroupManager.js`) loads users and
groups, and also tags in the same parallel round:

```
GET /sys?q={"t":"tag","user":"current"}&fields=owner&limit=5000
```

It returns the current user's own tags and the tags of the groups they belong to. It
is scoped even for a database administrator, who could otherwise read every user's
tags; before 2026-09-27 the request was unscoped and returned all tags, capped at 1000.
Guests get nothing. The rows are published on HDbDefs (`setUserGroups`), which provides
`hasTags()`, `tags()` and `tagName(id)`.

### What uses the bootstrap list

| Consumer | Uses | Server alternative |
|---|---|---|
| Filter Builder tag row (`HFilterBuilderItem`, `TagSource`) | the list to choose from, grouped: "My tags" first, then each group | a `/sys` tag search that runs only when the picker opens (see below) |
| Filter Form tag parameter in a list mode, no Facets (`HFilterForm`, `TagSource`) | the list | same |
| Filter Form tag Facets (`FacetTagSource`) | tag names and owner grouping; the counts come from the server | `detail=values&field=tag` already returns `value` = `tag_ID` and `label` = `tag_Text` (`FieldValueCounter.php`); only the owner is missing |
| Names for tag IDs already in a query: builder rows, `queryDescribe`, and so Explorer search history titles | `HDbDefs.tagName(id)` | `/sys {t:"tag", ids:"1,6"}` when needed, then cached |

### What does not use it

**Record View** loads only the tags of the record it shows, with one request per record
(`RecordDataProvider.loadTags`):

```
GET /sys?q={"t":"tag","record":"<rec_ID>","user":"current"}&fields=owner,ownername
```

Each row carries the tag ID and text (`rec_ID`, `rec_Title`), the owner
(`rec_OwnerUGrpID`) and the owner's name (`details.ownerName`), much like a record row
carries `rec_ID` / `rec_Title`. The response's `meta.currentUser` tells the view which
tags are personal. The "Tags" section groups them by owner, and each tag is a link that
runs `[{"tag":<tag ID>}]` in Explorer.

## Alternative (not built): load tags only when needed

If a user's tag list grows too large for bootstrap:

1. **A server-backed tag source**, modelled on `RecordTitleSource`
   (`shared/src/data/valueSources/FieldValueSource.js`), that loads only when a picker
   or list first opens:
   `GET /sys?q={"t":"tag","user":"current","title":"<typed text>"}&fields=owner,ownername&limit=200`.
   The "My tags" / group headings come from `ownername`, so no group list is needed.
2. **Names on demand:** when a builder row or form opens with tag IDs already in its
   query, fetch their names with one request, `GET /sys?q={"t":"tag","ids":"1,6"}`, and
   cache them (like `RecordTitleSource.fetchLabels`).
3. **Facets without a tag list:** add the tag owner to the rows returned by
   `detail=values&field=tag` (one more column beside `label`), and build the facet list
   from that response alone.
4. **Remove the tag request** from `UserGroupManager.load()`, together with `tags()` and
   `tagName()` on HDbDefs.

**Trade-off:** `queryDescribe` is synchronous. A tag not yet fetched is described by its
ID (`tag is "6"`) instead of its name, including in Explorer search history titles. The
cache from step 2 covers most cases. A tag search started from Record View already
passes its own title ("Tag: key1").

## Tags with the same text under several owners

Several owners can use the same tag text. A plain text in a search matches that text
under every owner, as legacy Heurist did; public website filters rely on this. To pick
one owner's tag, write `"Owner\text"`: the user or group name, a backslash, then the tag
text. In JSON the backslash is doubled, e.g. `{"tag":"Database Managers\\key1"}`. The
Filter Builder always stores tag IDs, so it is not affected.
