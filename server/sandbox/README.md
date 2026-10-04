# Isolated script runner

All server Mock custom scripts, assertion scripts, and pre/post request scripts require this runner. Ordinary Mock generation and requests without scripts continue without it. There is no Safeify/vm2 or host node:vm fallback. Missing configuration fails with `ISOLATED_RUNNER_REQUIRED`. The legacy `commons.sandbox` helper is now async.

## Disposable development/CI setup

Requires Docker on a dedicated trusted runner (Node 24). These commands build/run the isolated test service; they do not change a production deployment:

```
docker build -t yapi-script-runner:node24-v1 server/sandbox
node --test scripts/sandbox/sandbox.test.js scripts/sandbox/http-broker.test.js scripts/sandbox/broker-frames.test.js
YAPI_SANDBOX_DOCKER_TEST=1 node --test scripts/sandbox/docker.test.js
mkdir -m 700 /tmp/yapi-runner-$USER
export YAPI_ISOLATED_RUNNER_SOCKET=/tmp/yapi-runner-$USER/runner.sock
node server/sandbox/service.js
```

Set the same absolute socket path in the application environment. Use another terminal for the app. Remove a stale socket only after verifying its service is stopped. The service intentionally refuses to unlink arbitrary pre-existing paths.

## Deployment boundary

The trusted service controls Docker; the application must not. Deploy the service under a separate restricted operator-owned account on a dedicated worker host or VM. Expose only this Unix socket to the app using deployment-managed filesystem access; socket starts 0600 under umask 077. If the app has another UID, explicitly grant access to this one socket via a dedicated group/ACL as part of an approved deployment. Never grant the app Docker-group membership, mount docker.sock into it or the script image, or pass user-selected host mount paths, Docker arguments, image names or commands. Do not give the worker host production credentials. The service copies only JSON script input into a fresh container. Trusted network scope and per-destination context headers are retained in the service and stripped from the worker job.

The command fixes network=none, read-only root, nonroot UID, all capabilities dropped, no-new-privileges, PID/memory/CPU limits, no volumes, no persistent logs. Input/output are limited to 1 MiB; logs 64 KiB/256 entries; storage writes 256. An outer 10-second wall clock kills the CLI and force-removes the named container, including async hangs. Docker daemon unavailability is a runner failure; a cleanup failure marks the service unhealthy and stops new jobs until an operator verifies container inventory/cleanup and restarts it. Two jobs maximum execute concurrently; request-body deadlines bound slow clients. Only authorized application tenants should be able to submit scripts; add deployment-level rate limits/quotas.

Docker/kernel isolation has residual risk. Use a dedicated disposable VM/host; do not co-locate sensitive workloads. node:vm inside the container only supplies compatibility semantics and is explicitly assumed escapable. An escaped script gets no app env or host filesystem but could falsify its own script result, which is untrusted tenant output. Treat helper package updates and image builds as release artifacts; resolve and pin an approved Node 24 image digest in your release pipeline and scan dependencies before deployment. Never build from user-controlled Dockerfiles.

## Supported and gated APIs

- `assert`, `log`, console logs, `Random`, `Mock`, mutable JSON context, `context` alias
- `utils._`, CryptoJS, jsrsasign, base64/unbase64, md5 and SHA helpers
- Async scripts, `setTimeout`, and `context.promise` completion
- `storage.getItem/setItem` snapshots with bounded writes replayed only after successful, scope-matched response validation
- Host functions/classes, arbitrary module imports, circular context values, and live object capabilities are not transported
- `utils.axios(config)`, `request`, and get/head/delete/options/post/put/patch helpers use an interactive host broker. Awaited requests resume the same script; scripts are never replayed. JSON/text responses expose data/status/statusText/headers; non-2xx results reject with an error.response. The supported request fields are url, method, headers, data and simple params. No create(), interceptors, custom agents, sockets, streams, proxy overrides, credentials, redirect options, multipart or binary transforms. Unsupported options fail explicitly.
- Network remains default-deny (`SCRIPT_NETWORK_DISABLED`) until an operator configures exact scoped rules and the authenticated app adapter supplies trusted scope. Actual configured request execution in host `crossRequest` is separate from this script helper.

Existing scripts relying on network must have approved scoped rules; scripts requiring unsupported Axios APIs or arbitrary host capabilities need migration. This is a deliberate compatibility gate, not a promise that those APIs still work. Browser-only script behavior is unchanged by this server isolation change. Never expose runner service publicly; it is an execution capability, not a general web API.


## Optional scoped HTTP broker (deployment approval required)

Configure `YAPI_SCRIPT_HTTP_RULES_FILE` only in the trusted service environment, pointing to an operator-owned JSON file (not writable by the app or workers). The service reads it at startup and validates it. Missing configuration means no network. Never derive this file from script input or enable private networks broadly. Changes to destinations, scope, headers or private addresses require explicit deployment review/approval.

Example rule schema (illustrative only; no destination is enabled by shipping this file):

```json
[{
  "id": "project_api",
  "projectIds": ["123"],
  "userIds": ["456"],
  "origin": "https://api.example.com",
  "paths": ["/v1/check"],
  "methods": ["GET", "POST"],
  "headers": ["content-type", "x-request-id"],
  "contextHeaders": ["x-explicit-project-token"],
  "privateAddresses": []
}]
```

Origins (including scheme and port), normalized URL paths and methods match exactly; no wildcard origins, paths, users or projects. Query strings are allowed on approved paths. Rule owners must account for the full behavior of those endpoints, including any downstream fetch/proxy functionality. A rule is an authorization to send script-controlled data to that destination. Header names must be lowercase. The broker adds no application configuration, cookies, global credentials, environment values or implicit authorization headers. Hop-by-hop, host, proxy and framing headers are prohibited. Object request bodies automatically request content-type: application/json; the rule must permit content-type. Explicit content-type values take precedence.

The app may send `job.networkScope = {projectId, userId, headers: {project_api: {"x-explicit-project-token": "authorized value"}}}` only from its authenticated and authorized request pathway, separately from mutable script context. IDs are strings. Both project and user must match a rule. Per-rule context headers are optional, must be explicitly authorized for that exact destination and must occur in contextHeaders. Do not populate them automatically from incoming headers or global app config. The service captures scope before execution and removes it from container input; worker-supplied scope, DNS, socket, proxy or transport options cannot override it. The Unix socket authenticates the application, not arbitrary tenants; restrict socket access accordingly.

DNS is resolved and every answer checked before connecting. The connection uses that validated address without a second DNS lookup while preserving HTTPS certificate/hostname checks. Mixed public/private answers are denied unless each private address is explicitly listed for that exact scoped rule. Only exact loopback/RFC1918/ULA addresses may be opted in; link-local/cloud-metadata, mapped/transition and reserved addresses remain blocked. Internal API rules must name the concrete origin/path/method/scope plus concrete private addresses. Redirects are rejected without following them. No retries are performed, so side effects are not duplicated automatically.

Each job permits at most 8 broker requests, each with a 2.5-second absolute deadline including DNS, a 64 KiB request body, 8 KiB request headers, 16 KiB response headers and 256 KiB response body. Existing outer job, stdio and container limits remain in force. Closing/killing a job aborts pending HTTP requests; already accepted remote side effects cannot be rolled back. Worker messages are untrusted and checked for job ID, message type, request ID uniqueness, count and shape before any broker operation. `node:vm` remains explicitly escapable; all policy is outside the container.

The Docker-gated test starts a synthetic loopback HTTP receiver in the test process and grants only its ephemeral origin plus `/fixture`, POST, synthetic IDs and explicit headers. It verifies two awaited calls continue once in a single script and that cross-project use never reaches the receiver. This requires Docker in CI; local unit tests independently cover DNS, transport, denials and real bounded host HTTP without Docker. No production rules or credentials are required by these tests.

Application integration: authenticated `/api/interface/proxy` and collection assertion routes mint an opaque host-only capability after project ACL checks. Verified-token auto tests mint it for the token project and reject collection/case project mismatches. The capability is passed separately through pre/post and assertion execution; script/client `networkScope` values are ignored. Rules match string project/user IDs (legacy project-token identity is `999999`). No request cookies, bearer tokens or application secrets are copied into broker headers. Public Mock invocations have no authenticated principal and remain network-denied; ordinary Mock script computation still works in the isolated runner. Deployments needing authenticated network-enabled Mock require an explicit authenticated route integration, not scope derived from incoming Mock query/body values.
