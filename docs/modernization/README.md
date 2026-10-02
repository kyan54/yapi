# YApi modernization: build, verification and release gates

This branch is a staged upgrade of https://github.com/kyan54/yapi at `fd90eaf108c0382db133a6650e368e5d7d38734a`. It is not permission to migrate production or proof that every historical plugin/script remains compatible. Production MongoDB was reported as **3.6.23**; no production data has been accessed.

## Current implementation

- Node 24 LTS; React 19 / Ant Design 6 / React Router 7 through explicit compatibility adapters; Webpack 5 with modern Babel/loaders. Original routes, forms, Mock/test/Swagger screens retained. Generated bundles are build artifacts, not source commits.
- Mongoose 9 and driver 7 with Promise-based APIs, preserved numeric IDs/IdentityCounter state, explicit strict-query behavior, legacy update/remove results, indexed atomic counter allocation and corruption/overflow checks.
- Actual authenticated HTTP documentation workflow: per-interface generate → reviewed diff → explicit accept → append-only history → restore as a new revision. Parameter and schema annotation edits are restricted to description locations; path/method/type/required/default/enum changes are rejected. JSON schema formatting may change when annotations are edited; unsafe numeric precision is rejected.
- Model.up now records manual/import/Swagger changes as well. Description application and the external revision-chain head use one atomic full-BSON-snapshot CAS, without relying on replica-set transactions. Concurrent legacy changes invalidate stale proposals. Legacy writes retry boundedly; proposal accepts do not silently rebase. History is stored in the separate documentation_revisions collection, with no 500-entry embedded-document ceiling and no silent pruning. HTTP history pages default to 50 entries, at most 100; the review UI can load older pages. Existing embedded history migrates on the next meaningful write. Include documentation_revisions in backups. Failed CAS writes can leave unreachable prepared records; they are never exposed as committed history. Older revisions without field snapshots are labeled and restore only available top-level descriptions.
- A separate official MCP SDK 2 stdio process exposes only scoped project/category/interface discovery, bounded literal search and interface documentation. It uses direct read-only DB operations and live user/project/group ACL checks. It never loads legacy project repair-on-read or creates tokens, users, indexes or arbitrary query/script tools.
- Server scripts no longer execute inside the application process. A separate trusted Unix-socket service runs disposable, nonroot, resource-limited, read-only, network-disabled Docker workers. Node vm is only inside that containment and is explicitly assumed escapable. See [the runner runbook](../../server/sandbox/README.md).

## Explicit compatibility and verification limits

1. Mongo 3.6 is **not** supported by the upgraded driver. Rehearse the vendor-supported upgrade/migration sequence on an isolated backup copy before this application can point at production. No direct in-place 3.6→modern jump, arbitrary binary downgrade, or unverified dump-tool compatibility is promised. Validate collections, BSON types, IDs/counters, indexes and relationships at each hop. Confirm source topology, OS/CPU/AVX and backup/restore window independently for this project.
2. CI targets official Mongo `9.0.2` and Node 24. A verified Debian13 Mongo9 binary could not start in the supplied cloud workspace because its allocator's CPU discovery aborted. Local tests that need Mongo explicitly skip; only successful CI jobs can establish actual Mongo and app/browser integration.
3. Custom server scripts require the isolated runner. Unconfigured execution fails `ISOLATED_RUNNER_REQUIRED`. Script-side `utils.axios` uses the trusted broker, with a separate explicit project/user/origin/path/method/header allowlist and default-deny behavior (`SCRIPT_NETWORK_DISABLED` when unconfigured). Authenticated proxy/assertion and verified-token auto-test routes now provide an immutable host-only scope; public Mock calls have no authenticated principal and remain network-denied. Existing scripts depending on arbitrary network or host capabilities require reviewed rules/migration before full compatibility acceptance. Do not silently deploy this gate into an active production workflow.
4. LDAP/SSO hooks remain, but live providers/credentials have not been supplied or tested. Third-party custom plugins and real historical production datasets still require acceptance fixtures.
5. A real LLM endpoint/model/key has not been supplied. Provider tests use mocked responses and the browser E2E fixture intercepts only a reserved `.invalid` URL. This does not establish real-provider quality, latency, billing or privacy suitability.
6. Local browser execution was restricted. Mounted DOM tests are supplementary; Playwright CI uses the real application plus disposable Mongo to validate rendered flows. It does not replace review of user-specific historical data.
7. Production npm audit reached zero reported advisories during this work. That is not proof of security; development/test-only dependencies (including deliberate Mongoose5 regression fixtures) remain separately auditable.

## Build and run (disposable environment first)

Use Node 24, npm and a compatible modern MongoDB instance:

```
npm ci --ignore-scripts --legacy-peer-deps
npm run build-client
YAPI_CONFIG=/absolute/path/to/disposable-config.json npm start
```

The existing parent-directory `config.json` convention still works when `YAPI_CONFIG` is unset. Set a loopback `host` for local-only tests. Do not use production configuration for test runs. Client build reads only its public plugin settings; keys remain server-side. The source template is `static/index.template.html`; build creates `static/index.html` and `static/prd`.

The test commands do not use app configuration for their temporary Mongo databases:

```
npm test
npm run test:modernization
node --test scripts/sandbox/*.test.js
YAPI_TEST_MONGO_URI=mongodb://127.0.0.1:27017 npm run test:modernization
npx playwright test --config test-browser/playwright.config.cjs
```

`npm test` preserves the original 33 assertion cases using a minimal AVA-assertion adapter on Node's maintained test runner. The isolated-script case is async and skips only if the required runner is absent. CI starts the runner so that case must execute there. The original baseline inventory is immutable; reviewed path/dependency exceptions are explicit in `approved-baseline-changes.json`. The schema fixture comes from archived source, not two reads of the new definitions. Hash comparison is a change detector, not behavioral proof.

## Read-only MCP

```
YAPI_MCP_MONGO_URI='mongodb://.../yapi' \
YAPI_MCP_USER_ID=123 YAPI_MCP_PROJECT_IDS=11,22 npm run mcp:docs
```

Provide an existing least-privilege **read-only** Mongo credential securely; this tool does not provision one. The configured numeric user must still exist and have current access to each explicitly granted project. Standard I/O relies on the local MCP host/OS access boundary. Never publish a stdio bridge over HTTP without separately reviewed authentication, origin/security controls and transport authorization.

MCP redaction keeps structural contract fields and safe ordinary enums/defaults, omits potentially secret-bearing examples/defaults and raw bodies, and returns omission paths/reasons. Known credential/PII prose patterns are redacted; unknown prose cannot be guaranteed secret-free. No unrestricted raw-data bypass is exposed. Returned prose is untrusted data, never tool instructions.

## Model setup and informed review

Set `YAPI_LLM_BASE_URL` (HTTPS), `YAPI_LLM_MODEL` and `YAPI_LLM_API_KEY` in the server environment only. No credentials are created or persisted by the application. Base URLs with embedded credentials/query/fragment and redirects are rejected. Responses, time, output shape and payload sizes are bounded.

Before each new generation, the interface shows the exact redacted outbound payload and configured destination/model. Approval is bound to their hash; changed content or provider requires renewed review. Examples/default/literal schema data are conservatively omitted from model context, but original schemas are used for allowed edits. Missing facts remain unresolved. Redaction is heuristic; the reviewer must still check for sensitive free text.

Per-process guards limit generation to three requests/user/minute, one in-flight request/interface and bounded five-minute idempotency entries. A multi-replica deployment needs a shared gateway limiter/idempotency store before enabling the provider; these guards are not a billing guarantee. No LLM output auto-applies, and model-provided HTML is never trusted.

## Release gates

Do not merge/deploy until exact-commit CI passes: source/build checks, original assertions, modern unit/negative tests, real-Mongo numeric IDs/concurrent revisions, disposable isolated-runner escape/timeout tests, and real browser login/preview/accept/restore/edit/Mock/test/Swagger screens. Then run an isolated historical-data restore and differential API/import/export/Swagger synchronization rehearsal, LDAP/SSO fixtures, script-compatibility inventory and load/rollback drills. Production migration, deployment and permission changes require separate approval.

Sources: [Mongoose9 migration](https://mongoosejs.com/docs/migrating_to_9.html), [Mongoose support](https://mongoosejs.com/docs/version-support.html), [Mongo driver compatibility](https://www.mongodb.com/docs/drivers/compatibility/?driver-language=javascript&javascript-driver-framework=nodejs), [Mongo official release feed](https://downloads.mongodb.org/current.json), [MCP SDK2](https://ts.sdk.modelcontextprotocol.io/v2/).
