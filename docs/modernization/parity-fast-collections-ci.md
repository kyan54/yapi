# Collections script parity in the existing isolated CI runner

The Mac results remain **38 passed / 5 blocked** for B's remaining43 ownership list. The seven tests in `test-browser/parity-collections-ci.spec.cjs` are new-runtime CI tests, not proof of old/new script equivalence. Do not mark any of these five rows passed until the corresponding real CI execution succeeds.

## Integration command

After the existing modernization workflow has built `yapi-script-runner:node24-v1`, started `server/sandbox/service.js`, built the client and installed Chromium, run:

```sh
npx playwright test --config test-browser/parity-collections-ci.config.cjs
```

Required inherited variables are `CI=true`, `YAPI_TEST_MONGO_URI=mongodb://127.0.0.1:27017`, and the existing absolute `YAPI_ISOLATED_RUNNER_SOCKET`. No new deployment or user configuration is required. The owner adds the CI step; this branch does not change the shared workflow or `app.spec.cjs`.

The spec deliberately fails outside CI or without the pre-existing socket; it does not silently skip these acceptance cases. Mac validation is limited to syntax, test discovery, dependency-stub unit tests and browser build. The script runner has not been started or used on the Mac for this stage.

## Exact remaining IDs and missing actions

| Original ID | CI actions still needing a real successful run | Required capability |
| --- | --- | --- |
| `project_requests-03` | UI save/reload + Mongo readback of pre/post scripts, send and observe both mutations; missing-runner visible failure; explicitly disabled server visible rejection with no echo request | Existing trusted isolated runner; separate missing/disabled app configurations |
| `project_requests-04` | Default-deny must reject before echo; one authorized broker path succeeds; another path rejects without any forbidden echo request or false success | Existing default-deny service plus separate trusted service with one fixed synthetic scope/path rule |
| `project_mock-03` | UI enabled script affects actual Mock result; disabled script has no effect; missing-runner response contains an error and no scripted field, visible in Run | Existing runner, actual Mock middleware, separate app without socket |
| `project_mock-04` | Business and network save failures keep draft/DB unchanged; retry saves once; actual script throw shows business error; corrected script rerun clears old error | C's saved-configuration fixes composed with B runtime tests and existing runner |
| `runner-03` | Browser mode with nonempty script rejects with actionable isolation error and no request; server sandbox failure visible; removing scripts retries ordinary request successfully | Existing runner for server failure; browser must never evaluate script |

Browser/server ordinary request modes, CORS and network failures were already exercised on Mac. No extension installer control exists in either baseline; timing and row-selection are separately recorded N/A decisions, not runner dependencies.

## Resource lifecycle and safety

The spec verifies the existing Unix socket and allows only a credential-free loopback Mongo URI. It creates one unique `yapi_ci_collections_<uuid>` DB with a marker, one temporary directory, and a loopback fixed-response echo server. A second **trusted CI host process** runs the same existing runner service with a mode0600 rule file granting user9/project1002 only `GET /allowed` at that echo origin. No wildcard, public network or external data is used. Four local web processes share only this test DB: configured, unconfigured, allowlisted, and explicitly disabled.

The worker image, Docker arguments and runtime boundary are unchanged: network none, read-only filesystem, nonroot uid65532, dropped capabilities, resource bounds, no-new-privileges. No Docker socket is mounted into a web process. The spec never starts Docker itself; the already approved trusted service manages disposable workers. It neither adds nor alters a Mac daemon or security setting.

Teardown stops only the child processes it created, closes its echo listener, drops only its uniquely named marked DB, and deletes only its own temporary directory. Screenshots and projected Mongo configuration readbacks contain controlled synthetic fixtures. CI evidence is emitted under `test-results/collections-ci` and `playwright-report/collections-ci`, covered by the existing upload paths.

## Script-mode repair proven before CI

The browser build aliases `../server/yapi` to false. Before the repair, a browser-side `scriptEnable=false` fallback erased configured pre/post text before the authenticated proxy request. A dependency-stub regression reproduced three failures: erased scripts, browser-mode silent omission, and disabled-server silent omission. After repair, 13 focused tests passed; no synthetic script text was evaluated by these tests.

Server mode now forwards existing configured text so the server retains its policy decision. Browser mode rejects nonempty scripts with `ISOLATED_RUNNER_REQUIRED`; the browser eval fallback is removed. Node still requires `scriptEnable===true` and the existing isolated runner. An explicitly disabled server rejects with `SCRIPT_EXECUTION_DISABLED`; it performs no request or script execution. Default configuration values are unchanged.

Old baseline script execution still requires a separately approved isolated legacy runner. The existing new-runtime CI cannot establish that legacy comparison, and one pre-existing sandbox smoke test must not be counted as coverage of all five rows.

## Post-only configuration boundary (stage14)

A request with only an after-script previously reached the target before discovering that no runner socket was configured. `common/postmanLib.js` now calls the existing adapter's `getConfiguredSocket()` before any Node request with enabled scripts. The adapter retains the same absolute-socket configuration requirement and reuses it when executing the job. This check sends no script, starts no process and probes no network.

The seventh CI scenario saves only an after-script, runs through an app with no socket and verifies a zero delta in actual synthetic echo requests plus the visible isolation error. The same script through the configured app deliberately throws after its ordinary target request: the echo delta must be exactly one and the visible post-script error must be preserved. This is normal post-request semantics. Configuration validation does not reserve a worker or establish liveness; a service failure after validation or a genuine after-script error may happen after the target has received the request. No rollback or absolute side-effect guarantee is claimed.
