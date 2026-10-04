# Acceptance record and historical-data rehearsal

## Verified backend candidate

Commit: `cc612f057fb5f484cc816a1b649580842f6fc662`.
[GitHub Actions run 37084983018](https://github.com/kyan54/yapi/actions/runs/37084983018) passed on 2026-10-03 with Node 24 and MongoDB 9.0.2:

| Check | Result |
| --- | --- |
| Original assertion cases | 33 passed, 0 skipped |
| Real Docker isolation and scoped HTTP broker | 24 passed, 0 skipped |
| Modernization and persisted Mongo regression cases | 177 passed, 0 skipped |
| Real Chromium application flows | 3 passed, 0 skipped |
| Production client build | Passed |

Coverage includes actual login; approved AI diff/accept/restore with a deterministic provider fixture; manual interface updates; real Mock and collection assertions through the isolated runner; Advanced Mock CRUD; Wiki create/update; Swagger configuration persistence; and scheduled Swagger fetch/import/update through real HTTP endpoints and MongoDB. It also covers immutable revision ancestry/orphan protection, more than 500 historical versions, numeric counters and project-scope negative tests.

The six-file Ant Design layout integration is sourced from immutable UI head `89a14a650ce8c8093932f1565fb06f670117bb7d`, whose only changes relative to this backend candidate are those six frontend files. This record does not itself certify the subsequent combined commit: record its exact SHA and successful combined CI before delivery. Model fixture responses are not real-provider validation. No production database has been accessed or migrated.

## Remaining deployment-specific acceptance

- [ ] Review the final six-file UI integration on the user's test computer and rerun exact-commit browser/functional tests.
- [ ] Configure a real approved HTTPS model destination/model and server-only credential; review the exact outbound payload before a real request. Check cost, timeout, cancellation and proposal quality.
- [ ] Inventory actual custom scripts and third-party plugins. Confirm needed broker rules using exact approved destinations, methods and headers; public Mock has no authenticated broker principal and remains network-denied.
- [ ] Verify LDAP/SSO against disposable accounts and the actual provider's configuration. Preserved hooks and mocked tests do not establish live identity-provider interoperability.
- [ ] Resolve and pin the approved script-runner base image digest; scan its final helper dependency image; keep Docker orchestration outside the web process.
- [ ] Run historical-data rehearsal below, then measure representative load and revision-history latency.

## Historical MongoDB 3.6.23 rehearsal checklist

1. Record the source Mongo version, FCV, topology, OS/architecture, storage engine, indexes and data size. Record deployment plugin versions, scheduled jobs and script capabilities separately. Do not infer this environment from another project.
2. Obtain an authorized, encrypted, consistent backup using tooling documented to support MongoDB 3.6. Verify restoration into an isolated source-version environment before attempting any upgrade. Never assume current database tools still support the old source.
3. Preserve BSON types and numeric identities. Inventory all collection counts and IDs, foreign-key-like references, `IdentityCounter` compound keys/counts, duplicate records, non-safe integer identifiers and malformed legacy schema strings. Any reconciliation needs an explicit reviewed plan, not silent conversion.
4. Select the vendor-supported intermediate upgrade/FCV or logical migration route for the actual topology and target. Rehearse each required step on the copy, with its own backup and verification. A direct 3.6→9 in-place jump is not supported by this project.
5. Start the upgraded application only against the modern isolated copy. The new driver must not point to the old production 3.6 server. Compare API responses, access controls, projects/categories, imports/exports, Swagger sync, Mock output constraints and automated assertions using sanitized representative fixtures.
6. Rehearse description proposals, concurrent manual/Swagger updates, history pagination and restore. Verify committed revision-chain ownership and that prepared orphan records are not exposed as history. Establish an explicit backup/retention/maintenance policy for revision collections; do not silently trim history.
7. Test the isolated worker and broker against approved synthetic endpoints. Verify time/resource limits, private-address policy, cleanup failures, cancellation and recovery without widening host access.
8. Measure cutover duration and define rollback as restoring a compatible application/database backup set. New writes during the cutover window need an explicit reconciliation strategy. Do not promise arbitrary Mongo binary downgrade or lossless rollback after new writes without a tested plan.
9. Obtain separate production cutover/deployment authorization only after test evidence, backups, monitoring and a recovery owner are documented.

Official references: [MongoDB upgrade guidance](https://www.mongodb.com/docs/manual/release-notes/), [driver compatibility](https://www.mongodb.com/docs/drivers/compatibility/?driver-language=javascript&javascript-driver-framework=nodejs), [Mongoose migration guidance](https://mongoosejs.com/docs/migrating_to_9.html).
