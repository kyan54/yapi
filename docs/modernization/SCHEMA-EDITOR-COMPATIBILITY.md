# Schema editor: source-confirmed compatibility fixes

## Evidence and scope

This change follows the compact editor at `a304004f45102646c12c0f7f9b078595babb162d`, on top of `889b7b5f28f7062d51901107868ab958c0f89af1`.

The legacy reference is the original repository at `fd90eaf108c0382db133a6650e368e5d7d38734a`, specifically the bundled `json-schema-editor-visual` implementation in `static/prd/index@38e61939aaa7223d6fa9.js`:

- Module 1516: root `changeCheckBox` / `requireAllAction`; `showEdit`, `handleEditOk`, `handleEditCancel`; `showAdv`, `handleAdvOk`, `handleAdvCancel`; import and modal rendering.
- Module 1521: field and array-item advanced, description and Mock controls.
- Module 1525: `handleSchemaRequired`, which traverses object `properties` and array `items`.
- Module 1527: Mock editing is disabled for object and array types.
- Module 1529: advanced settings include a source-JSON editor for the selected node.
- Module 1532: subtree replacement and required-field update actions.

The supplied original screenshot `image(6).png` was inspected as actual pixels. It shows the compact root row, require-all checkbox, Mock/description edit affordances, settings, and add controls. Source inspection establishes their behavior; the screenshot establishes their visible presence. Neither establishes rendered parity of the updated build.

## Restored behavior

### Rename safety

Field names use a controlled draft, committed on blur or Enter. Blank/whitespace-only or existing sibling names are visibly rejected and reset to the serialized name. Escape restores the current name without committing. Successful rename preserves field order, the complete field schema and unrelated keywords, and moves matching names in that parent's `required` array. Deletion removes that field's required reference.

### Require all

The root checkbox applies recursively through object properties and array items. Enabling replaces each traversed object's `required` list with its property names. Disabling removes that keyword, matching the legacy helper. Its checked/indeterminate state is derived from the current schema, including changes made through the JSON editor.

Boolean schemas are preserved. Tuple `items` entries are all traversed safely, extending the old object-only helper without dropping tuple members. Existing extension values, examples/defaults, definitions and composition branches are not treated as a property tree and are left unchanged. The control is disabled for scalar and boolean-root schemas.

### Per-node dialogs

Every displayed node has an advanced JSON dialog. Applying replaces only that selected subtree, including when it is a boolean schema. Syntax errors, scalar strings/numbers, arrays, `null`, and empty input cannot be applied. The last valid serialized schema is unchanged on error.

Description and scalar Mock controls also have multiline dialogs. Opening a dialog snapshots the selected field. Typing does not publish a change; Cancel, Close and Escape discard the draft. Apply publishes it, and reopening starts from the applied value. If incoming data replaces the subtree while a dialog is open, the stale dialog closes without overwriting newer data.

Mock editing is disabled for object/array nodes, matching the old source. Nonempty Mock strings use YApi's `{ "mock": "..." }` representation; clearing a simple Mock produces the legacy empty string. Additional keys in an existing Mock object are preserved, including when clearing only its expression.

All three kinds of modal (import, advanced, multiline) use `mask={{ closable: false }}`, the AntD 6 equivalent of the explicit legacy `maskClosable:false`. Outside clicks do not dismiss them. Cancel, Close, and Escape remain available.

### Boolean roots and complex schema preservation

Actual boolean `data` props, raw JSON `true`/`false`, schema imports, and advanced-node replacements are accepted and serialized without converting `false` into an empty object. Example import remains distinct: a JSON boolean example becomes `{ "type": "boolean" }`.

The SchemaTable preview explicitly describes boolean roots: `true` permits any JSON value; `false` permits no JSON value. It does not hide `false` or render `true` as an empty object row.

The visual tree does not invent a scalar type for a missing or union `type`. Boolean nodes are labeled with their actual value and can be edited using advanced JSON. `items:false` is never displayed as a synthesized string item. Editing the visible first tuple item retains later tuple entries. Unknown keywords, `$defs`, composition, multi-type schemas and deep content remain available through full-schema or per-node JSON.

## Save guards and deliberate limits

- The existing parent dirty/validity guards remain intact. Invalid full-schema JSON (including empty input) calls `onValidityChange(false)` without publishing stale or coerced data. Valid object/boolean JSON restores validity.
- Advanced/import dialogs stage changes until explicit Apply/import. Invalid local dialog drafts cannot publish a change. Cancel does not dirty the committed schema.
- Validation here checks JSON syntax and object/boolean schema shape. It is not full dialect/meta-schema validation. Unknown keywords and existing schema dialects are not normalized or discarded.
- The compact visual tree still shows only the first tuple item and limits inline object traversal to depth 12. Later tuple entries and deeper nodes remain accessible in JSON. This change does not claim complete legacy interaction parity: old type-specific advanced form fields, separate Title inputs and Mock autocomplete choices are not recreated here; their values remain editable in advanced JSON.
- Database persistence, parent-form Save/reopen, navigation warnings, keyboard focus/scroll behavior and original/new screenshot comparison require the real application browser acceptance suite. Mounted save/reopen tests below serialize and remount the component; they do not establish DB persistence.

## Verification

`test-modernization/frontend.test.js` mounts the real React 19/AntD 6 components in jsdom. Schema regressions cover:

1. Unknown-keyword preservation while editing descriptions.
2. Explicit example import, cancellation and mixed arrays.
3. Invalid raw drafts, no stale `onChange`, and validity recovery.
4. Empty/whitespace/duplicate rename rejection, Escape, required references, delete and serialized remount.
5. Require-all on nested objects, arrays, tuple items and booleans, repeated toggles, immutability and untouched extension data.
6. Multiline description/Mock cancel, apply and reopen; object Mock disabled; Mock extension preservation.
7. Per-node advanced invalid syntax/shapes, cancel, subtree-only apply, union types, boolean replacement and serialized remount.
8. Boolean-root mount, raw editing, invalid drafts, advanced editing, import and remount.
9. Array collapse, repeated add/delete, first-tuple-item edit and untouched later entries/complex keywords.
10. Stale modal cancellation when incoming schema data changes.
11. Simple Mock clearing and cancellation without publishing a draft.
12. Depth-limited content, special property names and full-JSON round-trip.
13. Close/Escape dismissal, rejected schema imports and distinct boolean-example import.
14. Explicit true/false SchemaTable preview and return to an ordinary object table.

Checks on 2026-10-03:

- All 23 mounted frontend tests passed, including 14 schema/editor/preview cases.
- Five focused save-normalizer tests cover boolean roots, typeless references/compositions, null/union types, legacy implicit types, invalid inputs and both request/response save paths.
- Whole-candidate `npm run test:modernization`: 244 tests, 238 passed, 6 explicitly gated integration skips, 0 failures in this workspace. `npm test`: 32 passed, 1 isolated-runner skip. Real Mongo/runner coverage is checked separately in exact-commit CI.
- Focused changed-source ESLint and `git diff --check` passed. Legacy ESLint emits Node deprecation warnings.
- Standard production build passed for the combined source. These local checks do not replace real save/preview/reopen browser acceptance.
- The original form-level normalizer required a single root `type`, conflicting with the restored editor's valid boolean, null, union and typeless schema states. Both request and response saves now use `normalizeSchema.js`; unknown keywords remain intact and legacy implicit object/array normalization is retained.
- Exact-final-head browser results must be recorded separately. Earlier component-only boolean tests did not exercise the legacy outer save normalizer.

jsdom reports its known pseudo-element `getComputedStyle` limitation. Browser execution was not attempted in the restricted cloud environment. No screenshot/rendered-parity claim is made.
