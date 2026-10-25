# Virtual parent pointers — development plan

**Status 2026-10-24:** implemented in both repositories; automated verification passed. Browser review pending. Not committed.

## 1. Decision and scope

Keep the forward resource field and `rst_CreateChildIfRecPtr=1` as the definition of a parent-child relationship. Explorer must neither create nor maintain a stored `DT_PARENT_ENTITY` reverse detail. Derive parents from incoming forward links instead.

The UI implementation is client-side. Reuse existing record search and write APIs, HDbDefs, HRecordManager, HRecordEditor, HInputResource and HFieldTree. Server snapshot generation, virtual title-mask resolution and Smarty compatibility are also included in this plan. Do not change legacy storage or migrate existing databases in this task.

Server work is included in the implementation phases (§8). As clarified by Artem, no literal `parent` title-mask token is required: **Parent entity** and **Record parent** are sufficient. Existing Smarty parent references must receive computed values on the server.

## 2. Definitions: HDbDefs

Add `parentLinks(childRectypeId)` returning descriptors `{parentRectypeId, fieldId, childRectypeId}`, and `isChildRectype(rectypeId)` as its boolean convenience method.

- Build the index once with the existing link graph; retain the field id, not only parent record type ids.
- Include only resource fields whose structure row has the child flag enabled and is not forbidden. The flag belongs to the source record type's structure row, not the global field.
- Respect effective pointer target constraints. An unconstrained flagged resource field can target any record type; represent this without eagerly constructing every pair.
- Invalidate with a replacement definitions snapshot. Do not mutate the persisted definitions to insert fake fields.
- Several parent types, or several eligible fields on one parent type, must remain distinguishable for selection and writes.

**Server task:** add `rst_CreateChildIfRecPtr` to snapshot generation as a per-structure-row boolean, normalized as `createChild`, read through DefinitionLookup. Expose it in HDbDefs.field() and index it for parent discovery. Keep snapshot and `/rst` representations consistent. Missing flags in older responses mean false; never infer this flag from stored reverse pointers.

## 3. Shared parent lookup and assignment

Add a framework-free shared parent service using descriptors from HDbDefs and existing `/records` queries. Query incoming forward resource links constrained by both source record type and field id; the same field may be a child field in one type and an ordinary pointer in another.

Return parent record headers together with the forward field id. Batch requests for record lists and share results between editor, viewer and selectors. Reuse normal access control; a request failure must not be presented as proof that the record has no parent. Invalidate after a successful link write.

For assignment, write the child's id into the selected parent's actual resource field through the existing write API. Preserve existing values, respect cardinality and permissions, and never submit a synthetic parent field in the child's details. If several fields qualify, select the field explicitly rather than guessing.

For a new child, keep the parent selection pending until the child has a persistent id. Save the child, then update the parent. A failed second write must leave a clear retry action and must not report that the parent was assigned. Cancellation before save must not modify the parent. Creating from a parent's resource input already supplies parent/field context and must not prompt twice or add the link twice.

Existing multi-parent data must be displayed without losing links. A single parent can be chosen in the new-record workflow; single-parent enforcement and concurrent updates are separate policy questions, not something the client can guarantee globally.

## 4. Add record and edit form

### 4.1 New child record

Integrate in Explorer's RecordEditorHost.addRecord() and the shared editor context so standalone callers get the same behavior. If the selected type is a child type and no parent context is supplied, show the legacy message, substituting record type names:

> [Child type] is defined as a child of [Parent types].
>
> To avoid creation of orphan records, you should only create [Child type] records from within a parent record.
>
> If you understand the implications and still wish to create an independent, non-child record, check this box then click [Create independent record].

Legacy source: `heurist/hclient/widgets/entity/manageRecords.js`, around lines 3057–3088.

Offer **Create independent record** (legacy acknowledgement checkbox), **Find or create parent record**, and cancellation. Use HRecordManager in `select` mode restricted to eligible parent types, with its normal Find/Add flow. Skipping the parent is allowed and does not turn the child flag into a required stored field. Cancelling parent selection must not silently count as choosing an independent record.

### 4.2 HRecordEditor

For child types insert a virtual resource field as the first field of the effective edit structure, before ordinary groups and non-standard fields:

- Label: **Parent record**; use HInputResource.
- Existing parent(s): read-only values with the normal navigation actions.
- No parent: red `fa-triangle-exclamation`, localized request to define a parent, and editable selection restricted to eligible parents.
- Before lookup completes, show loading; lookup errors show retry, not the missing-parent warning.
- A skipped independent record still shows the missing-parent indication, without blocking save solely for that reason.
- Keep virtual values out of dirty detail serialization, ordinary field validation, automatic defaults, and child POST/PUT/PATCH payloads.
- Hide legacy stored Parent Entity values from the non-standard group when showing the derived field; avoid duplicate presentation. Do not remove legacy data.

## 5. HFieldTree and consumers

For a child record type insert resource branches first, labelled **Parent: <Record type>**. Each branch carries the actual source type and forward field and expands into the parent's fields. If two fields on one parent type qualify, disambiguate with the forward field name.

These branches are visible even when **Show linked-from types** is off. Do not duplicate the same branches in the ordinary linked-from section. Do not suppress eligible parent types merely because their current record count is zero. Keep parent branches available as navigation when a geographic/time/other leaf-type filter is active, while still applying that filter to selectable leaves. Apply existing recursion/depth safeguards to self-parent and cyclic type graphs.

Audit every consumer, rather than assuming one widget change covers serialization:

1. HFilterBuilder: parent record/id conditions, nested parent-field conditions and null/absence conditions.
2. Geographic and time field selection.
3. Data columns and other field-path selectors, including thematic fields.
4. Custom Smarty report editor and its snippet builder.
5. Export field selection for formats allowing field selection.

Use existing incoming-link path notation (`lf<forwardFieldId>` with source type constraints) for filters and persisted field paths. A synthetic forward `247` path would query stored reverse data and is therefore incorrect. Round-trip saved filters, column configurations and labels through the shared fieldPathCodes helpers. Verify projection/export support for the resulting incoming paths before exposing a selectable leaf.

Smarty snippets need special handling: a generic incoming traversal is not automatically equivalent to an actual `.f247` resource. Preserve parent-type/field constraints and use the runtime contract in §7 where applicable.

## 6. Record titles: audit result

Modern title generation is server-side in `heurist/srv/Records/Edit/TitleMask.php`.

The existing isParentEntity() recognizes names beginning with **Parent entity** and **Record parent**, concept `2-247`, and its local field id. These aliases are sufficient; do not add a literal `parent` token. Parent field resolution currently maps to the local stored field and record loading reads ordinary stored details; this is not virtual-parent support.

Required result: resolve the existing aliases through forward child links, including traversal to parent fields. Preserve existing title-mask syntax and deterministic handling of several parents. Refresh affected child titles after parent assignment; handle invalidation when parent titles or child-field definitions change. Implement this in the server title resolver, where titles are generated and stored.

## 7. Smarty compatibility

Provide a virtual resource value in the server-side report record representation:

- `f<localParentFieldId>` = first parent record id.
- `f<localParentFieldId>s` = array of parent record ids, following the existing resource-field convention.
- With no parent, use the existing empty-resource convention; define deterministic ordering for the first parent.
- Obtain the local field id through concept `2-247`, never assume the local id is 247. The requested `f247` / `f247s` names apply where that local id is 247. A fixed alias in other databases would require an explicit compatibility decision to avoid colliding with another local field.
- Derive from forward links, apply record visibility rules, and batch lookups. Do not write generated values into recDetails. Prefer derived values to stale stored reverse values.

Runtime integration point: `heurist/srv/Reports/Smarty/ReportRecordAssembler.php`, which currently assembles ordinary resource fields from record data. Client-side HSmartyEditor/snippet changes alone cannot supply these values to background report jobs or schedules.

## 8. Client and server responsibilities

| Item | Implementation responsibility |
|---|---|
| HDbDefs child-type detection | Server adds the child flag to snapshot generation; client exposes and indexes it. |
| Parent lookup, editor and selection | Existing incoming-link search and parent forward-field writes; verify permissions, projection and append/update semantics. |
| Parent branches in field trees | Client work, using existing incoming paths; verify each consumer supports them. |
| Existing title-mask aliases | Server derives Parent entity / Record parent values from forward links. No literal parent token. |
| Smarty fN/fNs | Server fills derived parent ids, including existing f247/f247s references where the local id is 247, in previews, background jobs and scheduled reports. |
| Export of virtual parent values | Existing incoming field projections may suffice; verify each selected format and background writer. |

Implement client UI/traversal and server snapshot, title/report compatibility as phases of this plan. Verify incoming export projections and implement any missing virtual-parent export support. No reverse-pointer maintenance is introduced in any phase. Server data access must stay within DefinitionLookup and RecordRepository/RecordStore boundaries (plan 15).

## 9. Other legacy uses and compatibility audit

The earlier investigation found these dependencies in addition to titles, Smarty/CSV, record rendering, edit forms and field trees/dropdowns:

- `hclient/widgets/entity/searchRecords.js`: excludes already-parented records from child selection using the stored field's null predicate. Replace with absence of eligible incoming links when this rule is required.
- `hserv/structure/search/dbsDataTree.php`: synthesizes the Parent Entity structure entry for consumers.
- `hclient/widgets/report/reportEditor.js`: special Parent Entity field handling.
- `hserv/records/edit/recordModify.php`: reverse insertion/removal, child-side edits creating forward pointers, validation, and related title updates.
- `hserv/records/batch/relationship/RecordsBatchAddReverseChildPointer.php` and `batch/record/RecordsBatchCreateSubRecords.php`: conversion/backfill and child creation; older equivalents also remain in recordsBatchOld.php.
- `hserv/records/import/importHeurist.php`, `importAction.php`: ignore/rebuild or specially process reverse parent values; other import paths have structure exceptions.
- `hserv/utilities/DbVerify.php`: check_target_parent and non-standard-field exclusions.
- `hclient/widgets/entity/manageDefRecStructure.js`: enabling the child flag triggers reverse-pointer creation.
- Pointer input/browse widgets have child-specific creation/selection behavior; graph visualization marks forward child links using the flag.
- Deletion cascades and duplicate-record handling use the forward child flag. They remain semantic policies to preserve, not justification for storing reverse pointers.

Explorer already filters incoming legacy Parent Entity links in `shared/src/recordview/RecordRelationsProvider.js`. Retain compatibility for legacy databases without relying on those links for parent discovery. Audit Record View parent display/summary, incoming counts, cached resolved headers and saved configurations alongside the editor to avoid missing or duplicate links.

Legacy code is audited here, not modified. Globally removing old reverse-pointer maintenance or repairing legacy inconsistencies is a separate migration task.

## 10. Implementation sequence and acceptance

1. Add the child flag to server snapshot generation; verify incoming search/projection/write contracts.
2. HDbDefs parent descriptors and shared batched lookup/assignment service.
3. New-record warning, contextual parent selection, virtual editor field and failure recovery.
4. HFieldTree branches; filter/path/snippet/export adapters and persistence round trips.
5. Implement server compatibility for existing title aliases, Smarty fN/fNs and any missing export projections, sharing batched parent lookup through the data-access layer.
6. Focused tests and browser review; update this plan with implemented behavior and deviations.

Acceptance checks:

- Flagged versus ordinary incoming fields, forbidden fields, unconstrained targets, multiple parent types/fields, and self/cyclic graphs.
- New record: select parent, skip, cancel, create from a parent input, and reopen saved child.
- Read-only defined parent; editable missing parent with red warning; lookup failure distinguished from absence.
- Forward-only assignment, no lost existing pointers, cardinality/access errors and second-write retry; no virtual detail submitted.
- Parent branches first with linked-from off, including geo/time filters and zero-count types; no duplicate branches.
- Filter, geographic, time, columns, Smarty and export selections round-trip and return forward-derived results without stored Parent Entity data.
- Existing Parent entity / Record parent title aliases without stored reverse details; no literal parent token added. Smarty scalar/array shapes, existing f247/f247s references where applicable, non-247 local concept id and multiple-parent ordering.
- Visible-parent permissions, legacy stale/missing reverse pointers, list batching and cache refresh.

## 11. As implemented (2026-10-24)

- DefinitionLookup exposes the structure-level boolean `createChild`; snapshot format 8 forces old caches to rebuild. Verified on the local osmak_mapping API: 1,207 structure rows, four child fields.
- HDbDefs builds parent descriptors during its existing link-graph construction. There is no second definitions cache or stored synthetic field.
- `parentRecords.js` uses existing typed outgoing queries on candidate parent records (`lt:<forward field>` with the child id), backed by recLinks, and paginates. Parent assignment uses RecordEditClient PATCH with the loaded rec_Modified token, preserves existing values and checks cardinality.
- HRecordEditor adds a named transient HInputResource at the top of the existing HEditForm. Existing parents are read only; missing parents allow selection; errors remain distinct from missing links and have Retry. Retrying a lookup preserves the other edited fields. The synthetic value is never submitted as a child detail. Pre-existing legacy details remain subject to the editor's normal preservation policy; no migration runs.
- The legacy creation warning and acknowledgement are reused in wording. Parent selection is through the existing HRecordManager. Multiple eligible forward fields require an explicit choice. Creation from a parent input passes context through RecordEditorHost; the source input owns the forward write. A draft source parent is described as pending until that parent is saved.
- A child save followed by a failed parent write reports partial success, informs the host about the saved child, retains the selection and permits Save again. Retrying does not insert another child or append duplicate pointers. No cross-record transaction or global single-parent constraint is claimed.
- HFieldTree inserts typed incoming parent branches before ordinary fields, independently of Show linked-from types and record counts, and includes them in geo/time first-match navigation. Its existing filter, path-code, Smarty snippet and export adapters handle the branches without additional virtual path syntax. Existing explicit Parent Entity entries are suppressed when the virtual branches apply.
- RecordRepository.parentLinks reuses links(), headers() and DefinitionLookup. TitleMask resolves the existing parent aliases lazily, so ordinary masks do not acquire parent queries. RecordSaveService refreshes affected child titles after linking/unlinking or changes to parent values/titles, following changed descendant titles with a cycle guard.
- ReportRecordAssembler derives and batches parent ids, filters visible parents, deduplicates and orders them, and feeds the existing resource formatter. Both f247/f247s and databases with a different local id for concept 2-247 are covered. Stale stored reverse values do not override derived values.
- Record View already exposes incoming parent links through its ordinary Linked from section. Its existing filter for legacy child-to-parent links remains for compatibility; no reverse-link creation is added.

**Verification:** full JavaScript suite (1,405 passed), focused parent/editor/field-tree tests, isolated SQLite PHP integration (13 checks, `heurist/tests/VirtualParentTest.php`), PHP syntax and data-access-boundary checks, all seven application builds and build verification. SQLite tests cover stale reverse data, flag/constraint/temporary exclusions, both title aliases, no literal parent alias, parent visibility, and Smarty scalar/array values for local ids 247 and 900. No live database records were edited.

**Review fixes (2026-10-25):**

- The stored Parent Entity field is found by the constant `DT_PARENT_ENTITY`: snapshot dbconst (client `dbconst('DT_PARENT_ENTITY')`, required in cached snapshots), ServiceFactory codes → TitleMask constructor (`parentField()`), RecordSaveService through the TitleMask, ReportRecordAssembler codes. The concept code `2-247` remains only as a mask field name alias.
- One server rule for child fields: `DefinitionLookup::childLinks()` / `childFields($rectype)` (flagged, resource, not forbidden), used by RecordSaveService and `RecordRepository::parentLinks`. parentLinks looks up only records of a type that a child field may point at and reads recLinks only for the child fields (reports no longer read every incoming pointer).
- Child titles after a parent save: all children only when the parent's title or other values changed; otherwise only the linked and unlinked children. The mask check is done once per record type.
- HRecordEditor: only the parent write is reported as a partial success (an error of the host's `onSaved` is no longer reported as a parent failure and `onSaved` is not called twice); the selected parent is read as a header only (`parentCandidate`), the full parent is loaded once for the write; `isDirty` ignores a cleared parent selection; Retry handles its own errors.
- HFieldTree: one `_parentFolders` helper for the branches and the geo/time navigation; shared `parentFieldsOf` in parentRecords.js; ReportRecordAssembler uses `rawValue('resource')`.
- Tests: 1,407 JavaScript tests, 16 isolated PHP checks, `TitleMaskCompareTest` (280 same, 0 different) and `ReportEngineCompareTest` (10 same), all seven builds.

**Review boundaries:** browser interaction review is still needed. The older live-database PHP test bootstrap currently fails before tests execute (hserv class autoloading); the isolated modern integration test does not use that bootstrap. Administrative changes to structure flags still require the existing title-regeneration workflow: this task does not add a schema-write observer to the read-only modern definitions API. No deployment or commit was performed.
