# Isolated old/new UI parity setup

## Status and non-negotiable gates

This is a prepared, **unexecuted runtime harness**, not a claim that the two applications or their UI passed. Only the dependency-free generator and its offline unit tests have run. No Docker, MongoDB, browser, or network service was started by this dual-version harness. Separate single-version GitHub CI is recorded independently.

- The requested comparison is **1920 × 1080 CSS pixels**, device scale factor 1. The published core candidate `889b7b5f28f7062d51901107868ab958c0f89af1` configures its single-version browser suite at 1920 × 1080. Its CI produced 1920-pixel-wide screenshots, but this does not establish a dual-version comparison or an available interactive cloud viewport.
- The current cloud-browser route is policy-blocked and its available surface is too small. Do not tunnel, re-host, change routes, or run this setup there to bypass that block. Execute only after the user approves the proposed Mac environment and its supported task is created. If that environment cannot supply an actual 1920 × 1080 browser content viewport, stop and report that blocker. A resized screenshot or CSS zoom is not equivalent.
- Old source baseline: `fd90eaf108c0382db133a6650e368e5d7d38734a`. New source is the explicitly frozen candidate commit recorded in the run. The published core candidate is `889b7b5f28f7062d51901107868ab958c0f89af1`, inheriting editor commit `a304004f45102646c12c0f7f9b078595babb162d`. Freeze the exact final candidate including this harness before execution; do not silently use a different head.
- The old repository contains tracked `static/prd` assets. Serving them proves only a **compiled old frontend** is available. An old frontend backed by a fake API or the new server is **not an old full-server comparison**.
- **The old compatible full-server runtime has not been established.** The official-image Node 16.20.2/npm 8 and MongoDB 4.4.29 combination below is a compatibility candidate, not a verified or supported deployment. These versions are EOL and may fail dependency installation or launch. The lockfile is version 3; npm 8 behavior with this exact lockfile must be verified. Do not regenerate it, substitute new dependencies, or claim parity if installation fails. Use only a dedicated disposable test environment, no real credentials/data, no public exposure. Old Mongo is pinned to Linux amd64 in the template; Apple Silicon emulation and image availability are unvalidated.
- New runtime follows `.github/workflows/modernization.yml`: Node 24, MongoDB 9.0.2 and the isolated script runner. The provided Compose/runner packaging is **unexecuted**; the existing CI design does not prove Docker Desktop socket, image, or networking behavior. Resolve official image tags and record their immutable digests and architecture on the approved machine before relying on them.
- The runner controls Docker and must use a **dedicated disposable daemon without sensitive workloads**. Only its trusted service receives the Docker socket. Neither app receives it. If that isolation or the daemon socket is unavailable, do not grant the app Docker access; mark script execution blocked. Merely rendering script controls is not a script-runtime pass.

## What the generator provides

`node scripts/modernization/ui-parity-fixture.cjs` emits local artifacts only. It has no driver, URI flag, network call, or server. The output directory must not already exist; existing files are never overwritten.

Synthetic accounts, all using `SyntheticParityOnly_901000!`:

| Account | UID | Intended permissions |
| --- | ---: | --- |
| admin@ui-parity.invalid | 910001 | Site admin |
| owner@ui-parity.invalid | 910002 | Main public-group owner and project owner |
| developer@ui-parity.invalid | 910003 | Main-project developer; not group owner/member |
| outsider@ui-parity.invalid | 910004 | No access to the main private project; can view public project |

These are published test-only credentials, not actual user credentials. Never use them on a real deployment.

- Main group `901000`, private project `901001`, category `901002`, rich interface `901003`
- Public project `901005`, private personal project `901004`, four private personal groups
- 26 public groups, 28 total projects, 39 interfaces, 42 activity entries
- Nested object/array/enum/required JSON schemas; schema and raw JSON modes; raw text; URL-encoded and multipart/file forms; unfinished and empty states
- Three cases in collection `901040`, a second empty collection, wiki `901030`, follows, synthetic project tokens and safe numeric-ID counters
- 90 consecutive days of variable mock activity ending on the explicit `--date`; use the same actual UTC date for the pair so the live statistics window contains the data
- A synthetic upload file and Swagger 2 import file. Perform imports into newly created disposable projects and apply the same action sequence to both versions.

`fixture.json` is the version-neutral source. `old.fixture.json` and `new.fixture.json` are the actual seed payloads. They differ only in the documented browser-mode origin. The manifest records each hash, counts, accounts, routes and an explicit `GENERATED_OFFLINE_NOT_EXECUTED` status.

### Request destinations and equivalence

Each app listens on port 3000 **inside its own container**. The host exposes old at `http://127.0.0.1:4174`, new at `http://127.0.0.1:4175`.

Each project has two deliberately named environments:

1. `local-synthetic`: `http://127.0.0.1:3000/mock/<project-id>`. Select this only for **server request mode**, including server-side collection execution. It refers to that app's own container, never the other instance.
2. `browser-synthetic`: old uses `http://127.0.0.1:4174/mock/<project-id>`, new uses `http://127.0.0.1:4175/mock/<project-id>`. Select this for **browser request mode**, where loopback is the Mac/browser machine. Because the page and target share the same origin, no external CORS endpoint is needed.

Do not use the port-3000 environment in browser mode or the published-host environment in server mode. The explicit origin binding is a semantic-equivalence exception; actual seeded databases are **not byte-identical**. Normalize only `project.env[name=browser-synthetic].domain`'s documented origin when comparing fixture payloads or screenshots. No manual DB rewrites are needed. The source at both inspected revisions defaults to server mode, but verify the UI mode because local storage persists per origin.

`plugins: []` disables optional configured third-party plugins, including SSO. It does **not** disable built-in extensions: wiki and statistics remain registered through `common/config.js`. Mail is disabled, version notifications are disabled, no LDAP/SSO config is supplied, no LLM environment keys are forwarded, and all project/request scripts initially remain empty/disabled. Internal-only Docker networks prevent app egress; the trusted runner's network is `none`. Dependency/image builds happen before runtime isolation and must use official sources in the approved environment.

## 1. Offline fixture verification and staging

These commands create only a fresh temporary directory. Paths below are examples to replace with the actual approved machine's repository paths. Do not assume cloud paths exist on the Mac. The operator must first verify both commits exist there.

```sh
set -eu
OLD_REPO=/absolute/path/to/old-checkout
NEW_REPO=/absolute/path/to/new-checkout
OLD_COMMIT=fd90eaf108c0382db133a6650e368e5d7d38734a
NEW_COMMIT='REPLACE_WITH_EXACT_APPROVED_CANDIDATE_COMMIT'
# Replace the placeholder above before execution.
git -C "$OLD_REPO" cat-file -e "$OLD_COMMIT^{commit}"
git -C "$NEW_REPO" cat-file -e "$NEW_COMMIT^{commit}"
# Harness, templates and tests must come from this same clean frozen revision.
test "$(git -C "$NEW_REPO" rev-parse HEAD)" = "$NEW_COMMIT"
git -C "$NEW_REPO" diff --quiet "$NEW_COMMIT" --
git -C "$NEW_REPO" cat-file -e "$NEW_COMMIT:scripts/modernization/ui-parity-fixture.cjs"
node --test "$NEW_REPO/test-modernization/ui-parity-fixture.test.js"
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/yapi-ui-parity.XXXXXX")
chmod 700 "$ROOT"
export PARITY_RUN="r$(date -u +%Y%m%d%H%M%S)"
node "$NEW_REPO/scripts/modernization/ui-parity-fixture.cjs" \
  --date "$(date -u +%Y-%m-%d)" --run "$PARITY_RUN" --out "$ROOT/bundle"
mkdir -p "$ROOT/old/vendor" "$ROOT/new/vendor" "$ROOT/evidence"
git -C "$OLD_REPO" archive "$OLD_COMMIT" | tar -x -C "$ROOT/old/vendor"
git -C "$NEW_REPO" archive "$NEW_COMMIT" | tar -x -C "$ROOT/new/vendor"
ASSETS="$NEW_REPO/docs/modernization/ui-parity"
cp "$ASSETS/Dockerfile.old" "$ROOT/old/vendor/Dockerfile.parity"
cp "$ASSETS/Dockerfile.new" "$ROOT/new/vendor/Dockerfile.parity"
cp "$ASSETS/Dockerfile.runner" "$ROOT/new/vendor/Dockerfile.runner"
cp "$ASSETS/compose.yaml" "$ROOT/compose.yaml"
printf 'old=%s\nnew=%s\nrun=%s\n' "$OLD_COMMIT" "$NEW_COMMIT" "$PARITY_RUN" > "$ROOT/evidence/revisions.txt"
find "$ROOT/old/vendor/static/prd" -type f -exec shasum -a 256 {} \; > "$ROOT/evidence/old-assets.sha256"
cd "$ROOT"
```

Use `git archive` so no installed modules, local config, `.env`, secrets, untracked files, or existing databases enter build contexts. Never mount either original repository into a running app. Changes stay inside the staging directory. Review generated configs and `compose.yaml` before execution.

## 2. Runtime compatibility gate — approved environment only, NOT RUN

First check Docker/Compose is already installed and the selected daemon is the intended dedicated disposable one. Do not install software, change security settings, switch daemon contexts, or grant new Docker/socket permissions under these commands. Those are separate decisions. Check 4174 and 4175 are unused; do not terminate existing processes.

```sh
docker version
docker compose version
docker context show
docker info
lsof -nP -iTCP:4174 -sTCP:LISTEN || true
lsof -nP -iTCP:4175 -sTCP:LISTEN || true
docker compose config > evidence/compose-resolved.yaml
# Must succeed without altering either lockfile. Failure means old runtime blocked.
docker compose build app_old > evidence/build-old.log 2>&1
docker compose build app_new runner > evidence/build-new-runner.log 2>&1
docker build -t yapi-script-runner:node24-v1 new/vendor/server/sandbox > evidence/build-worker.log 2>&1
docker compose pull mongo_old mongo_new > evidence/pull-mongo.log 2>&1
docker image inspect node:16.20.2-bullseye node:24-bookworm-slim docker:28-cli mongo:4.4.29 mongo:9.0.2 \
  > evidence/official-images.json
```

The old image uses its tracked compiled frontend without rebuilding. Report this provenance clearly. If source-rebuilt old assets are required, establish the original build toolchain separately; do not reuse the modern React/Ant Design/node_modules tree. Build failure, EOL-runtime failure, unavailable image, or architecture mismatch is a **blocker**, not a UI regression.

## 3. Empty-database claim, seed and exact verification — NOT RUN

```sh
docker compose up -d --wait mongo_old mongo_new
OLD_DB="ui_parity_old_$PARITY_RUN"
NEW_DB="ui_parity_new_$PARITY_RUN"
for ACTION in claim seed verify; do
  docker compose exec -T mongo_old mongo --quiet --host 127.0.0.1 --port 27017 \
    "$OLD_DB" "/fixture/old.$ACTION.js" > "evidence/old-$ACTION.log" 2>&1
  docker compose exec -T mongo_new mongosh --quiet --host 127.0.0.1 --port 27017 \
    "$NEW_DB" "/fixture/new.$ACTION.js" > "evidence/new-$ACTION.log" 2>&1
done
```

The scripts check the exact per-run database name, a literal loopback single-host connection on port 27017, and the specific synthetic marker/hash. Claims require a completely empty database, including no empty pre-created application collections. Seed requires an exact claimed marker and no other collections, acquires an atomic marker lock, and refuses nonempty, unmarked, mismatched, already-seeded, or partially-seeded databases. Remote hosts, credentials, multiple hosts, SRV URIs, replica-set options and unknown connection options are refused. Supported URI query fields are only `directConnection=true`, `appName` and numeric `serverSelectionTimeoutMS`.

There is **no delete, drop, reset, overwrite, or resume operation**. Do not run `install-server`: it would create extra data. If a seed fails, retain its evidence and use a completely fresh run and fresh disposable databases after fixing the cause. Never weaken guards to point at an existing database. Verify before app startup, because app/plugin initialization can legitimately add storage/indexes and later UI actions mutate data. The verification script compares full documents and counts, ignoring only Mongo-generated identity-counter `_id` values.

## 4. Start and prove full-server readiness — NOT RUN

```sh
docker compose up -d --wait runner app_old app_new
docker compose ps > evidence/containers.txt
docker compose logs --no-color > evidence/startup.log
for PORT in 4174 4175; do
  curl --fail --silent --show-error "http://127.0.0.1:$PORT/api/user/status" \
    > "evidence/status-$PORT.json"
  curl --fail --silent --show-error -c "evidence/admin-$PORT.cookies" \
    -H 'Content-Type: application/json' \
    --data '{"email":"admin@ui-parity.invalid","password":"SyntheticParityOnly_901000!"}' \
    "http://127.0.0.1:$PORT/api/user/login" > "evidence/login-$PORT.json"
  curl --fail --silent --show-error -b "evidence/admin-$PORT.cookies" \
    "http://127.0.0.1:$PORT/api/interface/get?id=901003" > "evidence/interface-$PORT.json"
done
```

A listening port or HTTP 200 is insufficient: YApi returns JSON application error codes. Inspect each login/read response for `errcode: 0`, confirm UID `910001`, and confirm interface `_id: 901003`, project `901001`, and the expected nested schema. Verify the Mongo healthchecks remain healthy and startup logs have no connection/plugin errors. The old app does not await DB readiness before listening, so retry read-only readiness probes only until it either succeeds or exhibits a concrete startup failure; never mark it ready solely from its startup banner.

The old app ignores `host` config and listens on all interfaces inside the container. Its **only host publication** must remain `127.0.0.1:4174`; the new app similarly uses `127.0.0.1:4175`. Mongo has no host-published ports. Inspect `docker compose config` and `docker compose ps` to confirm these facts. Do not change to `0.0.0.0` host publications, a public tunnel, or an external provider.

Run a bounded synthetic assertion through the authenticated app to prove the runner service can actually launch its isolated job (no external network, no document changes):

```sh
curl --fail --silent --show-error -b evidence/admin-4175.cookies \
  -H 'Content-Type: application/json' \
  --data '{"col_id":901040,"interface_id":901003,"response":{"status":200,"body":{"id":42},"header":{}},"records":[],"params":{},"script":"assert.equal(status,200); assert.equal(body.id,42); log(\"parity-runner-ok\");"}' \
  http://127.0.0.1:4175/api/col/run_script > evidence/new-runner-assertion.json
```

Require `errcode: 0` and the `parity-runner-ok` log. If it fails, preserve app/runner logs and treat actual script execution as blocked.

Prove runner behavior using the existing isolated-runner tests on the approved trusted Node 24 environment, following `server/sandbox/README.md`. The Compose socket is shared within Linux named-volume storage, not a macOS host Unix-socket bind. Its healthcheck only verifies a socket exists; it does not prove a Docker job executes. Until an actual bounded synthetic assertion job succeeds, keep script-runtime scenarios **blocked**, even if the UI renders. Never fall back to host `vm`, vm2, or Safeify for the new version. Keep script network rules unset.

## 5. Browser execution and evidence — NOT RUN

Use the approved Mac browser or another browser mechanism explicitly supported in that approved task. Do not treat this document as permission to use blocked browser tooling. Each version needs separate cookies/local-storage/browser contexts: cookies on the same hostname can otherwise leak across ports. Keep timezone UTC, same Chromium version, locale, font set, theme and zoom 100%. Confirm `innerWidth === 1920`, `innerHeight === 1080`, `devicePixelRatio === 1` through the supported browser tooling, and save that evidence. Configure **content viewport**, not outer-window size. Fail the viewport gate if it cannot be achieved.

Capture each state as a viewport screenshot at exactly 1920 × 1080, plus a full-page screenshot when scroll content matters. Do not crop away errors or normalize layout differences. Record browser/version, commit, account/role, route, action sequence, selected request mode/environment, screenshot dimensions, console errors, failed requests, expected/actual behavior and disposition. Disable motion identically only for a separate clearly labeled stability pass; do not hide animation regressions in the primary evidence.

Representative routes (not the exhaustive coverage matrix):

- `/login`, `/`, `/group/901000`, `/add-project`
- `/project/901001/interface/api` and `/project/901001/interface/api/901003`
- `/project/901001/interface/col/901040`
- `/project/901001/activity`, `/data`, `/members`, `/setting`, `/wiki` (append each to `/project/901001`)
- `/project/901005/interface/api/901019` for outsider/public access
- `/statistic` as admin; verify 90-day data and responsive chart/table layout
- `/user/profile/910002`

Use the separately maintained page/button coverage matrix for the complete run. These examples are only fixture anchors. Test each requested page/control with admin, owner, developer and outsider where permissions differ; verify refusals are visible and writes do not occur. Include empty, loading/error, validation, cancel/close/Escape, repeat clicks, refresh, Back/Forward and persisted-save states. No successful screenshot alone proves buttons or APIs work.

Use equal action sequences against equal initial state. Begin read-only captures before mutations. For save/delete/import tests, create disposable child projects/interfaces through the UI in each instance and record generated-ID mappings; random auto-increment steps may differ, so do not equate newly allocated IDs. Deletes remain bounded to created synthetic records. Never reset a seeded database; start a new fixture run for a fresh baseline. Mock calls add stats, so take the comparable statistics baseline before executing mock/run cases, or record the exact extra request count in each instance.

For new-only AI controls, the default run verifies unconfigured/disabled states and permission boundaries. A synthetic provider simulation can be a separate explicitly labeled test using the repository's fixture; it does not demonstrate an actual external LLM call. Do not forward or configure real provider keys, mail, SSO, LDAP, remote Swagger sources or external URLs.

## Results and stopping criteria

A parity result is complete only when both full-server runtime gates, equivalent-data verification, exact viewport gate and every applicable matrix row have recorded outcomes. Use **PASS / REGRESSION / INTENTIONAL CHANGE / BLOCKED / NOT RUN**, with evidence. Compiled-old-frontend-only, mock API and source/unit checks are distinct evidence categories and cannot replace the old-fullserver pass.

Stop on missing approval, incompatible runtime, wrong/unsafe DB target, isolation loss, unavailable exact viewport, or unsupported browser access. Preserve evidence and report the smallest specific blocker. Do not invent an alternate cloud route. After the authorized run, `docker compose stop` stops these test services; tmpfs database contents are lost on stop. Do not remove other containers, volumes, repositories or Docker contexts, and do not add an automatic cleanup/reset command to this harness.
