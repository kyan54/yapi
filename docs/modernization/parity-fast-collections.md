# Scope B Mac parity batch — 2026-10-03

Branch `fix/parity-fast-collections-20261003` starts at `521f330f4fa38f856055a7d06e1c171cd2b6e189`; legacy comparison is `fd90eaf108c0382db133a6650e368e5d7d38734a`.

This batch fixes discarded collection rules leaking into the next modal, invalid `_id` rule saves, overlapping collection runs and late navigation reports, destructive collection search, hidden import selections, repeated import/case/expectation saves, inline collection creation overwriting a custom case name, narrow Postman URL layout, and persisted Advanced Mock scripts appearing empty after React batches state updates.

Validation: client build passes; default unit tests 32 pass; modernization tests 268 pass, 6 existing skips. Twenty-four distinct new browser cases passed across the final run and targeted corrections; checked-in hydration/docs/navigation regressions were rerun together, 3/3 passed. Initial harness failures (hover after a closing modal, loading-icon accessible name and legacy switch role) are retained in local evidence rather than removed. Advanced Mock hydration and late collection reports were genuine product failures and were repaired.

The paired tests use actual Chrome at 1920×1080, synthetic owner/developer/guest identities, response `errcode` checks, visible results, refresh/API readback and projected direct MongoDB readback. Old/new run on separate loopback ports 4186/4187 and separate `parity_fast_collections_*_fastb1003` databases. Web, MongoDB and the local TLS LLM fixture are on an internal network without external egress. No production/financial data, shared 4174/4175 databases, or user browser was used. Script text is a disabled comment; enabled script execution remains blocked until a dedicated isolated legacy runner exists.

The exact 52 owned compound IDs are in `parity-fast-collections-results.json`: 8 scoped closures, 5 script-dependent blockers, 39 incomplete compound assertions. This is an incremental batch, **not completion of scope B or the original 246-scenario inventory**. Partial atomic evidence must not promote an entire compound scenario. Remaining ordinary UI substeps include all body/file variants, all expression fields, cross-collection dragging, rapid ordering, inaccessible import responses, environment/dependency variants, complete report assertions and expectation priority/IP/delay variations.

Legacy defects remain separately recorded: immutable `_id` save errors, destructive tree filtering, stale imported IDs, double runs, guest Advanced Mock writes and repeated Mock save failures. A successful characterization test does not mean the legacy behavior is correct. AI documentation is new-only: consent, preview/diff, discard, accept, restore cancel, version-0 restore and history reload passed using a local fixed provider. MCP read-only/redaction unit coverage passes; no MCP browser UI exists and no end-user MCP session is claimed.

Visual inspection covered Run, case editor, collection table/tree, rules, Advanced Mock and AI preview. The URL group fix restores usable width. Shared tab spacing, tree row density, rules-modal height and advanced Mock empty-state height still differ; these are reported for integration acceptance, not silently treated as pixel equality. No shared styles or compatibility adapters were modified.

## Reproduce the browser assertions

Provision the approved synthetic fixture and local provider first. Do not point this suite at a shared or production instance. The exact local fixture generator and runtime scripts are retained in the evidence directory for the integration owner.

```sh
PARITY_CHROME=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  npx playwright test -c test-browser/parity-collections.config.cjs
```

`PARITY_DB_READBACK=1` additionally checks only the exact marked `parity_fast_collections_*_fastb1003` containers/databases. Leave it unset in other environments. Legacy failures and documented skips are expected to remain visible. Tests create only synthetic resources and use separate headless contexts. Test files are independent of `app.spec.cjs`.

Local evidence: `/Users/hujinwu/Documents/Codex/2026-10-03/task-5/collections/`. Key reports are `acceptance.json`, `new-final.json`, `targeted-final.json`, `script-fixed.json`, `repo-regressions.json`, `unit-final-verified.log`, `db-final.json`, and `final-{old,new}-{run,case,collection,rules,mock}.png`. Hashes are recorded in the delta. Raw traces and the local fixture certificate/private key are deliberately not committed.
