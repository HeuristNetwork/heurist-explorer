# Relationship marker input (HInputRelmarker) — development plan

**Current state 2026-10-21:** implemented, not committed, not checked in a browser. Tests pass
(`shared/test/relmarker.test.js`, and `editStructuresAllTypes.test.js` renders relmarker fields as inputs).
The live definitions of `osmak_mapping` give the reverse fields. That database has no relationship records,
so creating and deleting one through the API has not been tried yet.

Plans 14 (record editing), 14a (HEditForm) and 21 (§4: "HInputRelmaker, later") are the base.

## 1. Request (Artem, 2026-10-21)

1. New relationship: a small popup, not the full record editor, with HEditForm and three fields of RT_RELATION
   (2-1): DT_PRIMARY_RESOURCE (the edited record, read only), DT_RELATION_TYPE (the field's vocabulary),
   DT_TARGET_RESOURCE (the field's record types). No Record summary. Buttons *Create Link* (save, close),
   *Save and Edit Attributes* (save, then the record editor of the new relationship record), *Cancel*. Title
   "Create relationship between <source type> and <target type> (Field: <relmarker field>)".
2. No relationship: a button `fa-circle-plus` "Add Relationship to <constrained type>".
3. A relationship inline, in an input-like box: relation type (muted), triangle right, target title, Edit / View
   of the target on mouse over, relationship record icon, Edit / View of the relationship record on mouse over,
   then the hover clear action.
4. Clear: warning "You are about to delete link between records.<br><br>Are you sure?" Proceed / Cancel;
   Proceed deletes the relationship record.
5. No "hidden from the public" switch.
6. Order of creation: a new record must exist when its relationship is created, without `rec_FlagTemporary`.

## 2. Decisions (Artem, 2026-10-21)

| Question | Decision |
|---|---|
| New record and *Add Relationship* | The record is saved first (normal checks; invalid fields are marked and the popup does not open), then the popup opens. Plan 14 §5: the record is created on its first save, no temporary record. |
| Reverse relationships (the record is the target) | Shown **and** added, in an own last group **"Relationships from other records"** (before *Non-standard fields*): one field for each relmarker field of another record type that targets this type. Rows: inverse relation type ▸ source record. |
| More relationships (max values 0 or > 1) | The field's "+" after the label (plan 18). It adds a row and opens the popup at once; on Cancel the row goes again. |
| Owner / visibility of a new relationship record | Those of the edited record (owner, visibility, view groups, as currently edited). |

## 3. Implementation (2026-10-21)

| File | What |
|---|---|
| `shared/src/data/relmarkerRelations.js` | `loadRelmarkerStates`: two `/records` searches (the record as source / as target, `resolveDetails=1`, limit 500). Each relationship goes to the **first** field that fits (`relationFits`: direction, relation type in the field's vocabulary, the other record of an allowed type). Entry `{value: relId, relation: {relId, term, termLabel, reverse, other: {id, title, rty}}}`; a reverse relation has the inverse type label. Also `loadRelationship` and `relationshipBody`. |
| `shared/src/data/recordEditStructure.js` | `reverseRelmarkerGroup(rty, dbdefs, label)`: `linkedRectypes(rty, {direction: 'from', relation: true})` + `pointerFieldsBetween`, relmarker fields only. One field per dty, named `rev:<dty>` (no dty: it does not clash with a field of the same dty on this type), `reverse`, `sourceTypes`, label `<field> ← <source types>`. |
| `shared/src/widgets/form/inputs/HInputRelmarker.js` + `.css` | The input (type `relmarker` in `createHInput`). Value = relationship record id. Add button, the relationship box, Edit / View of the other record and of the relationship record; after an edit of the relationship record it is loaded again and leaves the field when it no longer fits. Clear = `beforeClear()`: warning, then `remove`. |
| `shared/src/widgets/form/inputs/HInput.js` | New generic hook `beforeClear()` (default true; a promise waits) before the clear / remove action. |
| `shared/src/widgets/relationship/relationshipDialog.js` | `openRelationshipDialog`, `relationshipForm`, `relationshipDialogTitle`. Field labels from the RT_RELATION structure. The chooser has pointer mode `dropdown_add` with Browse. Save issues are shown beside the three fields. |
| `shared/src/widgets/edit-form/editFormDialog.js` | Optional `buttons: [{id, label, primary}]` + `onAction(id, values, form)` (false keeps it open), result `{action, values}`; OK / Cancel unchanged. |
| `HEditField` / `HEditForm` | relmarker is an input (not the note); no visibility switch; no required check (a required one would block the first save); option `relationships` passed through; the state keeps `relation`. |
| `HRecordEditor` | Reverse group in `open()`; relationships of a saved record loaded after the structure and put into the form states; `_relationshipService()` (`ensureRecord`, `create`, `remove`, `load`, `fits`, `changed`); *Linked records* drawn again after a change; event `h-relmarker-change`; `getRecord` takes only numeric field names. |

Relationships are records of their own, saved and deleted at once (as in legacy). They are never in the record
body (`fieldsToDetails` skips relmarker), so the editor does not become "dirty".

Differences from the agreed plan:
- The reverse group is shown for a new record too (the plan said: saved records only). *Add Relationship* saves
  the record first anyway.

## 4. Open points

- Browser check: add (forward and reverse), Save and Edit Attributes, Edit / View, delete with the warning, a new
  record, a read-only editor.
- Relationship dates / other attributes are not shown in the row (legacy showed start - end dates after the title).
- The record type icon of the other record is not shown (not in the request).
