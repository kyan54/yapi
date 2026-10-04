# YApi UI compatibility and acceptance matrix

- Legacy: `fd90eaf108c0382db133a6650e368e5d7d38734a`
- Initial upgraded candidate: `0bce16f7b13459ac93a5d5e6aefd24114a867b59`
- Schema/layout predecessor: `a304004f45102646c12c0f7f9b078595babb162d`
- Last exact CI base: `889b7b5f28f7062d51901107868ab958c0f89af1` (tree `630a1a65d6ca9af1f0c9e956c04c4166ee854e83`)
- Current reviewed source: working-tree overlay on that base, identified by SHA-256 file hashes in the companion JSON. No future commit SHA is assumed.

**59 surfaces and 246 planned old/new acceptance assertions. Full-scenario runtime passes: 0. Full-scenario visual passes: 0. All 246 assertions remain NOT RUN.**

Current source inventory: 1,684 versioned JSX controls, 174 versioned UI files, 1,894 handler records, 124 route declarations and 121 UI permission expressions. These are inventory counts, not tests. Exact current control lines, roles, states and scenarios appear in the JSON.

Cloud paired browsing remains blocked by URL-policy/resolution restrictions. The Mac fallback is explicitly authorized and preparation has started. Mac runtime and actual paired old/new execution remain **not_run**.

## Status definitions

- **source_reviewed**: Source existence and shape reviewed; not runtime proof.
- **tested_pass**: The explicitly named check executed successfully on the ledger commit, within its stated boundary. It does not imply whole-page or paired-version acceptance.
- **tested_fail**: The explicitly named check executed and failed on the ledger commit; partial earlier passes do not make the test pass.
- **blocked**: Execution cannot proceed because a named access, environment or permission prerequisite is unavailable.
- **not_run**: The full planned assertion has not been executed with sufficient evidence; partial or unrelated checks do not change this status.

Source-fixed pending exact-final CI means the change is present in the hashed source overlay. It is not a runtime pass, visual pass or successful final CI result.

## Historical exact-commit verification ledger

Commit: `889b7b5f28f7062d51901107868ab958c0f89af1`. Evidence: [CI run 37088809409](https://github.com/kyan54/yapi/actions/runs/37088809409) and [browser artifact 11261970363](https://github.com/kyan54/yapi/actions/runs/37088809409/artifacts/11261970363). Overall result: **tested_fail / FAILURE**.

- **tested_pass**: 33 legacy assertions, 24 isolation checks, 194 modernization/Mongo checks and the production build; suite skips: 0.
- **tested_pass**: four existing real-browser flows: login/AI review/history/restore; selected legacy screen mounting; actual Mock/collection assertion routes; and selected editor persistence with cancelled navigation.
- **tested_pass, partial only**: statistics real-API, 1920×1080 geometry, populated/empty data and failed-request error/retry assertions.
- **tested_fail**: the same statistics test failed its final no-pageerror assertion at test-browser/app.spec.cjs:247 on that commit, after the login/group race requested GET /api/group/get without an id.

The overlay addresses that race in source, but the historical failure remains a failure. Final combined CI has not established a result for this overlay. Selected new-version fixtures, screen mounting and geometry checks do not establish complete old/new control or screenshot parity.

## Source findings and candidate changes

### UI-01: Invalid schema JSON can leave stale parent data in the initial candidate
State: **source_fixed_pending_exact_final_ci**; evidence: **source_reviewed**.

The inherited a304004 parent-form guards remain, and the current overlay parses object/boolean schemas without coercing empty invalid drafts. Invalid JSON reports invalidity without replacing the last valid schema. This is source-fixed pending exact-final CI; the broader error→Save/cancel/reopen scenarios remain not_run.

Evidence: prior_candidate `client/components/SchemaEditor.js:36–47`; prior_candidate `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:223–263`; candidate `client/components/SchemaEditor.js:153–177`; candidate `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:223–237`

### UI-02: Sample-JSON import and tree collapse restored
State: **source_fixed_pending_exact_final_ci**; evidence: **source_reviewed**.

Current source retains the a304004 compact row tree, per-node collapse, explicit example/Schema import and add/remove controls. Import, advanced and multiline dialogs stage changes and use non-dismissible masks with Cancel/Close/Escape available. Source restoration is pending exact-final CI and does not establish complete visual parity.

Evidence: old `static/prd/index@38e61939aaa7223d6fa9.js:1–1`; prior_candidate `client/components/SchemaEditor.js:1–48`; candidate `client/components/SchemaEditor.js:118–149`; candidate `client/components/SchemaEditor.js:165–179`

### UI-03: Core historical schema controls restored; narrower interaction differences remain
State: **partially_source_fixed_pending_exact_final_ci**; evidence: **source_reviewed**.

The overlay restores recursive require-all, per-node advanced JSON and multiline description/Mock dialogs. It still does not recreate legacy type-specific advanced form fields, separate Title inputs or Mock autocomplete choices; these values remain available in advanced JSON. The inline tree shows the first tuple item and caps depth at 12. Runtime and paired visual comparison remain not_run.

Evidence: old `static/prd/index@38e61939aaa7223d6fa9.js:1–1`; candidate `client/components/SchemaEditor.js:26–57`; candidate `client/components/SchemaEditor.js:105–149`; candidate `client/components/SchemaEditor.js:140–144`

### UI-04: Boolean-root schema and preview support restored in source
State: **source_fixed_pending_exact_final_ci**; evidence: **source_reviewed**.

parseSchema now accepts object or boolean schemas in raw JSON, schema import and per-node advanced dialogs. Actual false data remains false instead of becoming an empty object. SchemaTable explicitly describes allow-any true and allow-none false. This is source-fixed pending exact-final CI; no paired runtime pass is claimed.

Evidence: candidate `client/components/SchemaEditor.js:10–14`; candidate `client/components/SchemaEditor.js:153–177`; candidate `client/components/SchemaTable/SchemaTable.js:118–124`

### UI-05: Rejected field rename now restores the displayed serialized name
State: **source_fixed_pending_exact_final_ci**; evidence: **source_reviewed**.

Controlled nameDraft, visible validation and reset on blank/whitespace/duplicate rename replace the prior uncontrolled input. Escape restores the name; successful rename updates matching required references. This is source-fixed pending exact-final CI and full Save/reopen acceptance.

Evidence: candidate `client/components/SchemaEditor.js:72–98`; candidate `client/components/SchemaEditor.js:120–143`

### UI-06: Admin upgrade notification removed from shell
State: **intentional_or_unconfirmed_behavior_change**; evidence: **source_reviewed**.

Current Application no longer imports or mounts Notify. Confirm whether removing external version notification is accepted rather than expecting old banner parity.

Evidence: old `client/Application.js:14–15`; old `client/Application.js:112–116`; old `client/components/Notify/Notify.js:14–49`; candidate `client/Application.js:1–16`; candidate `client/Application.js:107–124`

### UI-07: Collection ordering migrated to native table and drag handlers
State: **changed_interaction_requires_acceptance**; evidence: **source_reviewed**.

Current table is native HTML with native drag/drop and added up/down buttons. Ordering persistence, selected rows, first/last disabled controls, repeated click, browser back and report formatting require actual interaction checks.

Evidence: old `client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js:1090–1118`; candidate `client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js:461–475`; candidate `client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js:1081–1095`

### UI-08: Legacy AntD selectors remain a visual migration risk
State: **remaining_source_risk**; evidence: **source_reviewed**.

The shared body/theme/search fixes address major defaults. Remaining old structural selectors in common.scss, interface.scss, Edit.scss, ProjectList.scss and ProjectData.scss need rendered inspection; source presence is not a reproduced failure.

Evidence: candidate `client/styles/common.scss:128–128`; candidate `client/styles/common.scss:180–180`; candidate `client/styles/common.scss:183–183`; candidate `client/styles/common.scss:191–191`; candidate `client/styles/common.scss:195–195`; candidate `client/styles/common.scss:201–201`; candidate `client/containers/Project/Interface/interface.scss:9–9`; candidate `client/containers/Project/Interface/interface.scss:23–23`; candidate `client/containers/Project/Interface/interface.scss:29–29`; candidate `client/containers/Project/Interface/interface.scss:32–32`; candidate `client/containers/Project/Interface/interface.scss:35–35`; candidate `client/containers/Project/Interface/interface.scss:41–41`; candidate `client/containers/Project/Interface/interface.scss:45–45`; candidate `client/containers/Project/Interface/InterfaceList/Edit.scss:45–45`; candidate `client/containers/Project/Interface/InterfaceList/Edit.scss:102–102`; candidate `client/containers/Group/ProjectList/ProjectList.scss:1–1`; candidate `client/containers/Project/Setting/ProjectData/ProjectData.scss:98–98`

### UI-09: Statistics cursor and chart failure-state fixes are committed in the reviewed candidate
State: **fixed_in_committed_base**; evidence: **source_reviewed**.

Base commit 889b7b5 removes cursor.exec(), awaits cursor.eachAsync, handles malformed/network responses, offers Retry and ignores stale/unmounted requests. Its CI statistics API/geometry/empty/error-retry assertions passed before the separate final pageerror failure. The historical CI ledger is retained; overlay acceptance is pending.

Evidence: candidate_base `exts/yapi-plugin-statistics/statisMockModel.js:38–59`; candidate_base `exts/yapi-plugin-statistics/statisticsClientPage/StatisChart.js:24–60`

### UI-10: Stored HTML is sanitized in migrated display paths
State: **changed_behavior_requires_acceptance**; evidence: **source_reviewed**.

Sanitization is a protective change; representative historical HTML, tables, links and images need rendering comparison. Unsafe HTML should not be preserved merely to match the old appearance.

Evidence: candidate `client/containers/Project/Interface/InterfaceList/View.js:499–505`; candidate `exts/yapi-plugin-wiki/wikiPage/View.js:1–42`; candidate `client/containers/Project/Setting/ProjectData/ProjectData.js:190–204`

### UI-11: Group and project startup/navigation race repaired in source
State: **source_fixed_pending_exact_final_ci**; evidence: **source_reviewed**.

The overlay validates numeric route/resource IDs, uses action-result data rather than stale connected props, rejects stale/unmounted responses, follows absolute group routes, adds retry/empty/error states, and refreshes group/project/settings from the route-selected entity. Exact-final CI and paired browser acceptance remain pending.

Evidence: candidate `client/containers/Group/Group.js:1–143`; candidate `client/containers/Group/GroupList/GroupList.js:1–355`; candidate `client/containers/Group/GroupSetting/GroupSetting.js:1–316`; candidate `client/containers/Group/ProjectList/ProjectList.js:1–221`; candidate `client/containers/Group/navigation.js:1–24`; candidate `client/containers/Project/Project.js:1–194`; candidate `client/reducer/modules/group.js:1–170`; candidate `client/reducer/modules/project.js:1–344`

### UI-12: Statistics administrator enforcement is an intentional security correction
State: **intentional_security_correction_source_fixed_pending_exact_final_ci**; evidence: **source_reviewed**.

All four statistics read actions now call requireAdministrator before querying cross-project/system data. The page refuses non-admin direct navigation and skips protected requests. This intentionally tightens legacy access; it is not a parity regression to preserve. Exact-final CI and role-specific runtime acceptance remain pending.

Evidence: old `exts/yapi-plugin-statistics/controller.js:61–69`; candidate `exts/yapi-plugin-statistics/controller.js:27–44`; candidate `exts/yapi-plugin-statistics/controller.js:70–71`; candidate `exts/yapi-plugin-statistics/controller.js:93–94`; candidate `exts/yapi-plugin-statistics/controller.js:140–141`; candidate `exts/yapi-plugin-statistics/statisticsClientPage/index.js:112–149`; candidate `exts/yapi-plugin-statistics/statisticsClientPage/index.js:190–192`

## Required fixture matrix

Anonymous; normal/LDAP/SSO user; global admin; group owner/dev/guest/nonmember; project owner/dev/guest/nonmember; inherited group access; public/private/personal group. Test empty/populated/loading/error, revoked permissions, concurrent edits, cancelled/repeated actions and navigation with requests in flight.

## Page and control acceptance

### Shell, authentication boundary and navigation
Routes: /; /group; /project/:id; /user; /follow; /add-project; /login
Roles: anonymous, authenticated, global admin
States: login checking/loading; logged out; expired session; authenticated

Source: `client/Application.js:1–156`; exact old/new control ranges are in JSON.
Source: `client/components/AuthenticatedComponent.js:1–45`; exact old/new control ranges are in JSON.
Source: `client/components/Breadcrumb/Breadcrumb.js:1–43`; exact old/new control ranges are in JSON.
Source: `client/components/Footer/Footer.js:1–118`; exact old/new control ranges are in JSON.
Source: `client/components/Header/Header.js:1–327`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · shell-01**: Open every top-level route directly and through navigation, including refresh, trailing slash, invalid IDs and unknown path
- [ ] **NOT RUN · shell-02**: login redirect preserves intended behavior and does not loop
- [ ] **NOT RUN · shell-03**: logo, breadcrumbs and Back/Forward lead to the intended project/group
- [ ] **NOT RUN · shell-04**: close browser-support warning and reopen navigation without layout obstruction

### Header guidance and user menu
Routes: all authenticated routes
Roles: authenticated, new user, global admin, non-admin
States: guide steps 1/2/3; completed guide; dropdown closed/open

Source: `client/components/GuideBtns/GuideBtns.js:1–52`; exact old/new control ranges are in JSON.
Source: `client/components/Header/Header.js:1–327`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · onboarding-01**: Advance or skip each guidance popover and verify stored completion after reload
- [ ] **NOT RUN · onboarding-02**: open/close/reopen avatar menu by click, outside click and Escape
- [ ] **NOT RUN · onboarding-03**: ordinary users do not receive admin menu entries and direct routes still enforce authorization
- [ ] **NOT RUN · onboarding-04**: logout clears authenticated shell and Back does not recover private content

### Public home and Mock demonstration
Routes: /
Roles: anonymous, authenticated
States: initial home; demo filled/invalid; logged-in redirect

Source: `client/containers/Home/Home.js:1–410`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · home-01**: Login/register and documentation links land correctly
- [ ] **NOT RUN · home-02**: Mock-rule input generates expected sample and reports malformed input
- [ ] **NOT RUN · home-03**: sample scroll, animation and layout do not cover controls
- [ ] **NOT RUN · home-04**: authenticated home redirect matches baseline and browser history remains usable

### Normal login, LDAP and SSO entry
Routes: /login
Roles: anonymous, already authenticated, normal account, LDAP account, SSO account
States: empty; invalid email; wrong password; request pending; server unavailable

Source: `client/containers/Login/Login.js:1–152`; exact old/new control ranges are in JSON.
Source: `client/containers/Login/LoginWrap.js:1–44`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · login-01**: Required email/password validation is visible and blocks submission
- [ ] **NOT RUN · login-02**: valid login sets session and navigates correctly
- [ ] **NOT RUN · login-03**: repeated login and Enter do not cause duplicate navigation
- [ ] **NOT RUN · login-04**: switch provider and return after cancelled/failed SSO or LDAP, retaining only appropriate input and errors

### Registration and disabled registration
Routes: /login (注册 tab)
Roles: anonymous, registration enabled, registration disabled
States: empty; invalid email; duplicate email/name; mismatched passwords; valid

Source: `client/containers/Login/LoginWrap.js:1–44`; exact old/new control ranges are in JSON.
Source: `client/containers/Login/Reg.js:1–170`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · register-01**: Validate name/email/password/confirmation and visible errors
- [ ] **NOT RUN · register-02**: successful creation navigates and session behaves like baseline
- [ ] **NOT RUN · register-03**: disabled registration explains state and cannot submit by direct tab or repeated click
- [ ] **NOT RUN · register-04**: switch login/register, Back and reopen without stale validation or duplicate creation

### Global user, group, project and interface search
Routes: all authenticated routes
Roles: authenticated, public/private nonmember, group/project member
States: empty query; no hits; multi-category hits; loading; rapid query changes

Source: `client/components/Header/Search/Search.js:1–159`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · search-01**: Type and clear search, select each result type and verify exact destination
- [ ] **NOT RUN · search-02**: hidden private data is absent for nonmembers
- [ ] **NOT RUN · search-03**: rapid searches cannot show stale results for an older query
- [ ] **NOT RUN · search-04**: keyboard selection, blur, outside click and reopen preserve sensible focus and dismiss overlays

### Profile display, account edits, avatar and password
Routes: /user/profile/:uid
Roles: self, other user, global admin, normal/LDAP/SSO account
States: view; edit modal; invalid fields; avatar invalid type/size; save error

Source: `client/containers/User/Profile.js:1–557`; exact old/new control ranges are in JSON.
Source: `client/containers/User/User.js:1–46`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · profile-01**: Profile facts and timestamps match selected uid
- [ ] **NOT RUN · profile-02**: modify username/email, Cancel, reopen and save, verifying reload persistence
- [ ] **NOT RUN · profile-03**: password rules/current-password failure and confirmation mismatch remain visible and no stale values survive cancel
- [ ] **NOT RUN · profile-04**: permitted JPG/PNG avatar up to 200KB previews/uploads while invalid files and unauthorized edits are blocked

### Administrative user list
Routes: /user/list
Roles: global admin, non-admin
States: loading; empty; search match/no match; paginated; delete prompt

Source: `client/containers/User/List.js:1–232`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · users-01**: Search user names and clear filter, inspect pagination and profile links
- [ ] **NOT RUN · users-02**: admin delete exposes confirmation and Cancel causes no deletion
- [ ] **NOT RUN · users-03**: confirmed deletion updates only selected row and repeated click does not delete another user
- [ ] **NOT RUN · users-04**: non-admin sees no destructive control and server rejects direct unauthorized attempt

### Followed projects and project-card actions
Routes: /follow; /group/:groupId
Roles: authenticated, project member, nonmember
States: no follows; many follows; followed/unfollowed; private removed project

Source: `client/components/ProjectCard/ProjectCard.js:1–180`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · follow-01**: Open followed project cards and verify role/read access
- [ ] **NOT RUN · follow-02**: toggle follow repeatedly and reconcile icon, count and server state on reload
- [ ] **NOT RUN · follow-03**: cancelling delete/unfollow flow leaves intended state
- [ ] **NOT RUN · follow-04**: removed or inaccessible projects render a clear empty/error outcome

### Group sidebar, search and add-group dialog
Routes: /group; /group/:groupId
Roles: global admin, group owner, group dev, group guest, nonmember, personal group
States: loading; personal/public group; search no hit; create dialog

Source: `client/containers/Group/Group.js:1–143`; exact old/new control ranges are in JSON.
Source: `client/containers/Group/GroupList/GroupList.js:1–355`; exact old/new control ranges are in JSON.
Source: `client/containers/Group/navigation.js:1–24`; exact old/new control ranges are in JSON.
Source: `client/reducer/modules/group.js:1–170`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · group_nav-01**: Select and search groups and verify project/member/log/settings content resets to selected group
- [ ] **NOT RUN · group_nav-02**: add group validates name, description and owner selection
- [ ] **NOT RUN · group_nav-03**: Cancel/Close/reopen does not create or leak values between groups
- [ ] **NOT RUN · group_nav-04**: repeated create submits once and Back/Forward highlights correct group

### Group project cards and add-project access
Routes: /group/:groupId (项目列表)
Roles: global admin, group owner, group dev, group guest, nonmember, personal group
States: no project; follow/my-project sections; public/private projects; many cards

Source: `client/components/ProjectCard/ProjectCard.js:1–180`; exact old/new control ranges are in JSON.
Source: `client/containers/Group/ProjectList/ProjectList.js:1–221`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · projects-01**: Project cards show title/status/count and open correct route
- [ ] **NOT RUN · projects-02**: personal-group followed/my-project sections remain laid out and independently clickable
- [ ] **NOT RUN · projects-03**: Add project is enabled only when role permits, otherwise explanation appears
- [ ] **NOT RUN · projects-04**: create/follow/delete errors leave cards and counts synchronized after reload

### Create project form
Routes: /add-project
Roles: global admin, group owner, group dev, group guest, nonmember
States: empty; selected eligible/ineligible group; malformed basepath; duplicate name

Source: `client/containers/AddProject/AddProject.js:1–216`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · add_project-01**: Validate project name/group/base path and permission choice
- [ ] **NOT RUN · add_project-02**: ineligible group options are disabled
- [ ] **NOT RUN · add_project-03**: submit correct name, description, basepath and visibility and open new project
- [ ] **NOT RUN · add_project-04**: repeated create, Back and revisit do not clone project or reuse another group

### Group member management
Routes: /group/:groupId (成员列表)
Roles: global admin, group owner, group dev, group guest, nonmember
States: public/private group; member search; role change; delete confirm

Source: `client/components/UsernameAutoComplete/UsernameAutoComplete.js:1–123`; exact old/new control ranges are in JSON.
Source: `client/containers/Group/MemberList/MemberList.js:1–327`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · group_members-01**: Add exact selected user with owner/dev/guest role and prevent duplicate user
- [ ] **NOT RUN · group_members-02**: role changes persist and inherited project rights reflect change
- [ ] **NOT RUN · group_members-03**: deletion Cancel keeps member, confirmation removes only intended member
- [ ] **NOT RUN · group_members-04**: nonowners cannot mutate members, including direct requests

### Group and project activity, pagination and diff
Routes: /group/:groupId (分组动态); /project/:id/activity
Roles: global admin, group/project member, guest, nonmember
States: no logs; multiple types; paged; expanded diff; download available

Source: `client/components/TimeLine/TimeLine.js:1–289`; exact old/new control ranges are in JSON.
Source: `client/containers/News/NewsList/NewsList.js:1–81`; exact old/new control ranges are in JSON.
Source: `client/containers/News/NewsTimeline/NewsTimeline.js:1–90`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Activity/Activity.js:1–59`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · logs-01**: Filter log type and load more without duplicate/missing rows
- [ ] **NOT RUN · logs-02**: expand/collapse change details with sanitized readable content
- [ ] **NOT RUN · logs-03**: follow interface/user links and return to same context
- [ ] **NOT RUN · logs-04**: download Mock/history data and verify generated content and permission

### Group settings, custom field and deletion
Routes: /group/:groupId (分组设置)
Roles: global admin, group owner, group dev, personal group
States: custom field on/off; invalid name; save pending/error; danger modal

Source: `client/containers/Group/GroupSetting/GroupSetting.js:1–316`; exact old/new control ranges are in JSON.
Source: `client/containers/Group/navigation.js:1–24`; exact old/new control ranges are in JSON.
Source: `client/reducer/modules/group.js:1–170`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · group_settings-01**: Edit group name/description/custom-field toggle and required custom-field name, save and reload
- [ ] **NOT RUN · group_settings-02**: Cancel or close danger section causes no deletion
- [ ] **NOT RUN · group_settings-03**: typed group-name confirmation only authorizes intended group deletion
- [ ] **NOT RUN · group_settings-04**: owner can edit but admin-only delete visibility remains and other roles cannot write

### Project subnavigation and plugin tabs
Routes: /project/:id; /project/:id/interface/api; /project/:id/activity; /project/:id/data; /project/:id/members; /project/:id/setting; /project/:id/wiki
Roles: global admin, owner, dev, guest, public/private nonmember, personal group
States: loading/missing project; private/public group; plugin enabled/disabled

Source: `client/components/Subnav/Subnav.js:1–44`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Project.js:1–194`; exact old/new control ranges are in JSON.
Source: `client/containers/Group/navigation.js:1–24`; exact old/new control ranges are in JSON.
Source: `client/reducer/modules/project.js:1–344`; exact old/new control ranges are in JSON.
Source: `client/reducer/modules/group.js:1–170`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · project_shell-01**: Project root redirects to interface list and subnav highlights exact destination
- [ ] **NOT RUN · project_shell-02**: personal-group projects hide both member link and member route
- [ ] **NOT RUN · project_shell-03**: configured plugins appear once and tab switching works after rerender
- [ ] **NOT RUN · project_shell-04**: changing project ID updates all state and Back/Forward never retains previous-project controls

### Project configuration and destructive operations
Routes: /project/:id/setting (项目配置)
Roles: global admin, project owner, dev, guest
States: name/basepath/group change; visibility; JSON5/mock strictness; email notice; danger modal

Source: `client/containers/Project/Setting/ProjectMessage/ProjectMessage.js:1–521`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Setting/Setting.js:1–63`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · project_settings-01**: Edit project name/group/basepath/description/tags and save/reload
- [ ] **NOT RUN · project_settings-02**: permission, strict Mock validation, JSON5 and notification toggles persist exact booleans
- [ ] **NOT RUN · project_settings-03**: project move and visibility controls follow role restrictions
- [ ] **NOT RUN · project_settings-04**: danger Cancel preserves data and name-confirmed delete targets only current project

### Tag editor and interface tag selection
Routes: /project/:id/setting; /project/:id/interface/api/:actionId (编辑)
Roles: owner, dev, guest
States: no tags; multiple tags; delete/edit/add; tag modal

Source: `client/containers/Project/Interface/InterfaceList/Edit.js:1–230`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:1–1373`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Setting/ProjectMessage/ProjectTag.js:1–117`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · project_tags-01**: Add/edit/delete tags and descriptions and preserve selected tags on interface
- [ ] **NOT RUN · project_tags-02**: close or cancel tag modal does not persist edits unexpectedly
- [ ] **NOT RUN · project_tags-03**: save tag modal refreshes options without wiping unsaved interface fields
- [ ] **NOT RUN · project_tags-04**: duplicate/empty tags and removed selected tags behave consistently

### Environment list and environment editor
Routes: /project/:id/setting (环境配置); runner environment modal
Roles: owner, dev, guest
States: no env; many envs; selected env deleted; invalid domain; unsaved

Source: `client/components/CaseEnv/index.js:1–101`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Setting/ProjectEnv/ProjectEnvContent.js:1–383`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Setting/ProjectEnv/index.js:1–229`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · project_envs-01**: Add, select and rename environment
- [ ] **NOT RUN · project_envs-02**: edit domain and header name/value rows and save exact order/data
- [ ] **NOT RUN · project_envs-03**: deletion confirmation Cancel retains environment and confirmed deletion reconciles runners
- [ ] **NOT RUN · project_envs-04**: close/reopen inline runner environment modal and verify cancel/save propagation without stale selection

### Pre-request and pre-response scripts
Routes: /project/:id/setting (请求配置)
Roles: owner, dev, guest
States: script enabled/disabled; syntax error; runner configured/unconfigured; network allowed/denied

Source: `client/containers/Project/Setting/ProjectRequest/ProjectRequest.js:1–107`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · project_requests-01**: Toggle and edit both scripts then save/reload exact source
- [ ] **NOT RUN · project_requests-02**: editor syntax errors are shown without unintended submission
- [ ] **NOT RUN · project_requests-03**: authorized runner executes configured scripts and unconfigured runner displays actionable failure
- [ ] **NOT RUN · project_requests-04**: script network default-deny and allowlist failures cannot appear as a successful request

### Project token display, copy and refresh
Routes: /project/:id/setting (token配置)
Roles: global admin, owner, dev, guest, nonmember
States: token loading; copy; refresh permitted/denied

Source: `client/containers/Project/Setting/ProjectToken/ProjectToken.js:1–100`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Setting/Setting.js:1–63`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · project_token-01**: Guest has no token tab
- [ ] **NOT RUN · project_token-02**: permitted users read/copy correct project's token
- [ ] **NOT RUN · project_token-03**: owner/admin refresh updates value and obsolete value loses intended capability
- [ ] **NOT RUN · project_token-04**: dev/nonmember direct refresh is denied and repeated refresh does not leave UI with an older returned value

### Global Mock script
Routes: /project/:id/setting (全局mock脚本)
Roles: owner, dev, guest
States: enabled/disabled; empty; invalid; isolated runner unavailable

Source: `client/containers/Project/Setting/ProjectMock/index.js:1–137`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · project_mock-01**: Enable/edit/save global script and reload
- [ ] **NOT RUN · project_mock-02**: disable prevents script effects
- [ ] **NOT RUN · project_mock-03**: Mock request reflects script only under supported runner capability
- [ ] **NOT RUN · project_mock-04**: save/execution failure leaves clear state and no false success

### Project members, roles, notifications and bulk import
Routes: /project/:id/members
Roles: global admin, owner, dev, guest, personal group
States: empty; member roles; notification toggles; project import modal

Source: `client/components/UsernameAutoComplete/UsernameAutoComplete.js:1–123`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Setting/ProjectMember/ProjectMember.js:1–445`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · project_members-01**: Add selected user, change owner/dev/guest role and verify persisted rights
- [ ] **NOT RUN · project_members-02**: per-member email notification toggle follows owner/admin restriction
- [ ] **NOT RUN · project_members-03**: bulk import from selected project displays correct candidates and Cancel imports none
- [ ] **NOT RUN · project_members-04**: delete confirmation/repeated add cannot remove or duplicate wrong member

### Interface category tree, search, drag and menus
Routes: /project/:id/interface/api; /project/:id/interface/api/:actionId; /project/:id/interface/api/cat_:categoryId
Roles: owner, dev, guest, nonmember
States: empty tree; collapsed/expanded; selected; search; drag source/target

Source: `client/containers/Project/Interface/Interface.js:1–142`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/InterfaceMenu.js:1–640`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · interface_tree-01**: Search and clear matches
- [ ] **NOT RUN · interface_tree-02**: expanding and selecting category/API update correct route and highlight
- [ ] **NOT RUN · interface_tree-03**: add/edit/delete category and add/copy/delete interface menu actions call correct IDs
- [ ] **NOT RUN · interface_tree-04**: drag category ordering and move interface across category persist after reload
- [ ] **NOT RUN · interface_tree-05**: Cancel/reopen context modal and browser Back preserve selected node and no overlay trap

### Add interface and category forms
Routes: /project/:id/interface/api (add modal)
Roles: owner, dev, guest
States: empty; invalid/duplicate method+path; category list change

Source: `client/containers/Project/Interface/InterfaceList/AddInterfaceCatForm.js:1–70`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/AddInterfaceForm.js:1–130`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · interface_add-01**: Required category/title/path validation and method options work
- [ ] **NOT RUN · interface_add-02**: create interface populates target category and navigates correct ID
- [ ] **NOT RUN · interface_add-03**: category name/description creation and editing persist
- [ ] **NOT RUN · interface_add-04**: Cancel/Close/Escape/reopen and rapid submits produce no accidental duplicate

### Interface table filters and bulk operations
Routes: /project/:id/interface/api; /project/:id/interface/api/cat_:categoryId
Roles: owner, dev, guest, public/private nonmember
States: all/category list; empty; selected rows; tag/status filter; page changed

Source: `client/containers/Project/Interface/InterfaceList/InterfaceList.js:1–408`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · interface_list-01**: Filter by completed/unfinished, tag and public/open interface state, combine and clear filters
- [ ] **NOT RUN · interface_list-02**: title/path links and add button route correctly
- [ ] **NOT RUN · interface_list-03**: row selection/bulk action operates only selected records and selection clears on relevant navigation
- [ ] **NOT RUN · interface_list-04**: pagination, sort and row-click behavior remain consistent after data changes

### Interface documentation preview and copy
Routes: /project/:id/interface/api/:actionId (预览)
Roles: owner, dev, guest, public/private nonmember
States: form/json/raw response; path/query/header/body fields; long docs; missing data

Source: `client/components/SchemaTable/SchemaTable.js:1–132`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/View.js:1–587`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · interface_view-01**: Render title/creator/status/time/path and copy complete path including basepath
- [ ] **NOT RUN · interface_view-02**: display required flags, examples, descriptions, file fields and JSON schemas correctly
- [ ] **NOT RUN · interface_view-03**: nested schema expand/collapse keeps keywords visible and safe long-content layout
- [ ] **NOT RUN · interface_view-04**: legacy HTML formatting remains readable while dangerous HTML is stripped

### Interface editing and collaboration lock
Routes: /project/:id/interface/api/:actionId (编辑)
Roles: owner, dev, guest, two concurrent editors
States: loading/locked/unlocked; websocket error; dirty; save pending/failure

Source: `client/containers/Project/Interface/InterfaceList/Edit.js:1–230`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/InterfaceContent.js:1–186`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:1–1373`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · interface_edit_meta-01**: Edit title/category/method/path/status/tag/custom field/open flag/notification and save exact payload
- [ ] **NOT RUN · interface_edit_meta-02**: websocket lock blocks simultaneous editor and failure state is explicit
- [ ] **NOT RUN · interface_edit_meta-03**: required and duplicate/path validation is visible
- [ ] **NOT RUN · interface_edit_meta-04**: save double-click/error/route-change does not silently lose edits or update another interface

### Path/query/header/form parameter editor
Routes: /project/:id/interface/api/:actionId (编辑)
Roles: owner, dev, guest
States: zero/one/many rows; required/optional; text/file; reordered; row deleted

Source: `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:1–1373`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · interface_params-01**: Add/edit/remove query, header and body-form rows then save/reopen verifying exact count/order
- [ ] **NOT RUN · interface_params-02**: rename path placeholders updates path-param metadata without leaving removed parameters
- [ ] **NOT RUN · interface_params-03**: toggle required/file types and automatic Content-Type remains correct
- [ ] **NOT RUN · interface_params-04**: drag rows and rapid add/delete retain the right values with no stale indexed fields

### Bulk parameter import overlay
Routes: /project/:id/interface/api/:actionId (编辑 / 批量添加)
Roles: owner, dev
States: query/body bulk; empty; malformed lines; colon in value

Source: `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:1–1373`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · interface_bulk-01**: Open bulk import with current values, replace using name:example lines and verify exact parsing
- [ ] **NOT RUN · interface_bulk-02**: malformed/empty lines are handled visibly
- [ ] **NOT RUN · interface_bulk-03**: Cancel/Close/reopen leaves parent unchanged until import
- [ ] **NOT RUN · interface_bulk-04**: repeated import and query/body switching do not duplicate or cross-populate parameters

### Body type, raw/JSON/JSON5 and preview
Routes: /project/:id/interface/api/:actionId (编辑)
Roles: owner, dev, guest
States: GET/POST; form/json/file/raw; JSON5 on/off; invalid source; preview errors

Source: `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:1–1373`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · interface_body-01**: Switch request body type and response JSON/raw without losing intended content or saving hidden stale fields
- [ ] **NOT RUN · interface_body-02**: JSON5 enabled/disabled follows project setting and malformed data blocks saving
- [ ] **NOT RUN · interface_body-03**: template→preview generates current content and reports parser/schema errors
- [ ] **NOT RUN · interface_body-04**: fullscreen F9, blur, back and reopen restore usable editor and focus

### Visual schema editor and legacy control parity
Routes: /project/:id/interface/api/:actionId (request and response schema)
Roles: owner, dev, guest
States: object/array/primitives; nested; empty schema; missing type; tuple items; depth 12+

Source: `client/components/SchemaEditor.js:1–198`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:1–1373`; exact old/new control ranges are in JSON.
Source: `client/components/SchemaTable/SchemaTable.js:1–132`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · schema_visual-01**: Add/delete/rename fields, change type/description/Mock and required flag, save/reopen and verify unknown keywords retained
- [ ] **NOT RUN · schema_visual-02**: compare legacy sample-JSON import, require-all, node advanced edit, multiline edit and expand/collapse surfaces against new replacement
- [ ] **NOT RUN · schema_visual-03**: array tuple edits preserve untouched tuple members and deep schemas remain accessible
- [ ] **NOT RUN · schema_visual-04**: duplicate/empty rename visibly rejects and resets displayed name rather than diverging from saved schema

### Raw schema JSON state and invalid edits
Routes: /project/:id/interface/api/:actionId (schema JSON tab)
Roles: owner, dev
States: valid; invalid JSON; boolean root; union type; refs; invalid then recover

Source: `client/components/SchemaEditor.js:1–198`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:1–1373`; exact old/new control ranges are in JSON.
Source: `client/components/SchemaTable/SchemaTable.js:1–132`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · schema_json-01**: Edit full schema and switch visual/JSON without dropping keywords or reformatting unexpectedly
- [ ] **NOT RUN · schema_json-02**: invalid displayed JSON must prevent Save from reporting success with a stale previous schema
- [ ] **NOT RUN · schema_json-03**: first invalid edit must participate in unsaved-change prompt
- [ ] **NOT RUN · schema_json-04**: valid boolean schema and multi-type schemas should be represented honestly or limitation explained, not reported as invalid JSON

### Interface rich-text and Markdown editor
Routes: /project/:id/interface/api/:actionId (编辑 / 备注)
Roles: owner, dev, guest
States: legacy HTML-only; Markdown; WYSIWYG; links/images/tables; dirty

Source: `client/containers/Project/Interface/InterfaceList/InterfaceEditForm.js:1–1373`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · rich_editor-01**: Switch WYSIWYG/Markdown, format text/table/code/link/image and preserve content on save/reopen
- [ ] **NOT RUN · rich_editor-02**: legacy HTML-only descriptions load without markup corruption
- [ ] **NOT RUN · rich_editor-03**: typing only in rich text marks dirty and Cancel navigation preserves unsaved edits
- [ ] **NOT RUN · rich_editor-04**: unmount/reopen or rapid interface switching destroys old editor and prevents duplicate toolbar or cross-record changes

### Unsaved edit prompts and navigation interruption
Routes: interface edit to preview/run/mock; routes; browser Back/Forward
Roles: owner, dev
States: clean; dirty; prompt open; cancel; confirm; repeated navigation

Source: `client/Application.js:1–156`; exact old/new control ranges are in JSON.
Source: `client/compat/router.js:1–79`; exact old/new control ranges are in JSON.
Source: `client/components/MyPopConfirm/MyPopConfirm.js:1–52`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/InterfaceContent.js:1–186`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · unsaved-01**: Changing tab with dirty edits shows one prompt, Cancel keeps current content and Confirm discards only intended changes
- [ ] **NOT RUN · unsaved-02**: route navigation and browser Back/Forward use same decision semantics
- [ ] **NOT RUN · unsaved-03**: repeated navigation while prompt open creates no stacked modal or blocker deadlock
- [ ] **NOT RUN · unsaved-04**: reload/close browser warning appears only while dirty and disappears after save/discard

### Single-interface request runner
Routes: /project/:id/interface/api/:actionId (运行)
Roles: owner, dev, guest
States: browser/server mode; extension available/missing; env selected; request pending/error

Source: `client/components/Postman/Postman.js:1–1062`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/Run/Run.js:1–114`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · runner-01**: Choose environment, edit path/query/header/body/file inputs and send intended method/URL
- [ ] **NOT RUN · runner-02**: required fields cannot be silently disabled and optional inclusion works
- [ ] **NOT RUN · runner-03**: switch browser/server modes and show extension/cross-origin/network/sandbox failure clearly
- [ ] **NOT RUN · runner-04**: repeated send, navigation during request and late response do not overwrite another interface

### Response tabs, test assertions and HTML preview
Routes: single runner; /project/:id/interface/case/:actionId
Roles: owner, dev, guest
States: JSON/text/html/binary/error; passing/failing script; pending

Source: `client/components/Postman/Postman.js:1–1062`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceCol/CaseReport.js:1–126`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · runner_response-01**: Request/response headers, status, timing and body render accurately for all content types
- [ ] **NOT RUN · runner_response-02**: raw/pretty/preview and auto-preview switch without executing unsafe active content outside intended sandbox
- [ ] **NOT RUN · runner_response-03**: test script toggle, editor and assertion results remain usable
- [ ] **NOT RUN · runner_response-04**: failed HTTP/assertion/schema cases are distinct and old results clear before a new run

### Variable, Mock and helper-expression modal
Routes: runner parameter expression modal
Roles: owner, dev, guest
States: literal; prior-case variable; Mock expression; method helper; invalid expression

Source: `client/components/ModalPostman/MethodsList.js:1–193`; exact old/new control ranges are in JSON.
Source: `client/components/ModalPostman/MockList.js:1–68`; exact old/new control ranges are in JSON.
Source: `client/components/ModalPostman/VariablesSelect.js:1–158`; exact old/new control ranges are in JSON.
Source: `client/components/ModalPostman/index.js:1–318`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · runner_variables-01**: Open parameter expression editor for each supported field and insert selected variable/function/Mock rule
- [ ] **NOT RUN · runner_variables-02**: verify correct parameter path/index receives value
- [ ] **NOT RUN · runner_variables-03**: Cancel/Close leaves original value and reopen shows current value
- [ ] **NOT RUN · runner_variables-04**: run expression with missing prior-case output and show clear failure without leaking unrelated data

### Save request to collection and inline collection creation
Routes: /project/:id/interface/api/:actionId (运行 / 添加到集合)
Roles: owner, dev, guest
States: no collections; existing collection; new collection modal; duplicate name

Source: `client/containers/Project/Interface/InterfaceList/Run/AddColModal.js:1–150`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · add_case-01**: Name case and select collection, submit then open newly saved case with exact request data
- [ ] **NOT RUN · add_case-02**: inline create collection validates and updates destination options
- [ ] **NOT RUN · add_case-03**: Cancel/reopen preserves documented defaults without creating collection/case
- [ ] **NOT RUN · add_case-04**: repeated submit or response failure cannot duplicate case

### Collection and case tree, search, CRUD and drag
Routes: /project/:id/interface/col/:actionId; /project/:id/interface/case/:actionId
Roles: owner, dev, guest
States: empty; expanded/collapsed; search; selected; modal; cross-collection drag

Source: `client/containers/Project/Interface/InterfaceCol/InterfaceColMenu.js:1–628`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · collection_tree-01**: Create/edit/delete/clone collection and create/delete/clone case with correct IDs and refreshed tree
- [ ] **NOT RUN · collection_tree-02**: search and case selection route/highlight correctly
- [ ] **NOT RUN · collection_tree-03**: drag collection or case within/across collections persists order and ownership
- [ ] **NOT RUN · collection_tree-04**: Cancel/Close/reopen and repeated context-menu click never affect adjacent record

### Import interfaces into test collection
Routes: /project/:id/interface/col/:actionId (导入接口)
Roles: owner, dev, guest
States: project selector; category/status filter; selected interfaces; empty

Source: `client/containers/Project/Interface/InterfaceCol/ImportInterface.js:1–242`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceCol/InterfaceColMenu.js:1–628`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · collection_import-01**: Choose source project and filter by category/status
- [ ] **NOT RUN · collection_import-02**: selection updates as source/filter changes and no hidden stale IDs import
- [ ] **NOT RUN · collection_import-03**: submit creates expected cases only and reports duplicate/inaccessible entries
- [ ] **NOT RUN · collection_import-04**: Cancel/reopen and repeated confirm do not duplicate cases

### Collection case table and ordering
Routes: /project/:id/interface/col/:actionId
Roles: owner, dev, guest
States: zero/one/many cases; selected; reordered; first/last row

Source: `client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js:1–1245`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · collection_table-01**: Case names, corresponding-interface links, status, environment and selection map correct records
- [ ] **NOT RUN · collection_table-02**: drag reorder and new up/down buttons persist exact order
- [ ] **NOT RUN · collection_table-03**: first/last buttons disable correctly and repeated clicks never lose/duplicate rows
- [ ] **NOT RUN · collection_table-04**: rerun, reload and browser Back preserve saved ordering and cases

### Collection global validation, variables and scripts
Routes: /project/:id/interface/col/:actionId (通用规则配置 / 自定义测试脚本)
Roles: owner, dev, guest
States: HttpCode/json/schema checks; global script enabled/disabled; variable editor

Source: `client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js:1–1245`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · collection_rules-01**: Toggle HTTP-code/JSON/data-structure checks and persist rules
- [ ] **NOT RUN · collection_rules-02**: add/edit/delete global variables and reference from cases
- [ ] **NOT RUN · collection_rules-03**: edit/enable/save collection script and verify execution scope
- [ ] **NOT RUN · collection_rules-04**: Cancel/reopen and guest permissions preserve baseline with no hidden unauthorized write

### Collection bulk runner, progress and report
Routes: /project/:id/interface/col/:actionId
Roles: owner, dev, guest
States: all/subset; browser/server mode; env; pass/fail/request exception; run pending

Source: `client/containers/Project/Interface/InterfaceCol/CaseReport.js:1–126`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js:1–1245`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · collection_run-01**: Run selected/all cases with chosen environment and intended sequential variable dependencies
- [ ] **NOT RUN · collection_run-02**: start loading/progress and final per-case report reflect actual results
- [ ] **NOT RUN · collection_run-03**: repeated start, cancelled modal and route change do not overlap or corrupt run state
- [ ] **NOT RUN · collection_run-04**: open/close/reopen report and inspect request/response/assertion data including failures

### Server automation URL and downloads
Routes: /project/:id/interface/col/:actionId (服务端自动化测试)
Roles: owner, dev, guest, valid/invalid project token
States: environment override; output formats; email notice; download; runner unavailable

Source: `client/containers/Project/Interface/InterfaceCol/InterfaceColContent.js:1–1245`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · collection_server-01**: Generate/copy exact test URL with selected environment/output/notification options
- [ ] **NOT RUN · collection_server-02**: valid token runs intended project only and invalid token shows denial
- [ ] **NOT RUN · collection_server-03**: download JSON/report data matches selected collection and preserves encoding
- [ ] **NOT RUN · collection_server-04**: sandbox/network policy failures remain visible and do not look like empty successful tests

### Saved-case details and request save
Routes: /project/:id/interface/case/:actionId
Roles: owner, dev, guest
States: initial; rename/description; edited request; deleted source API

Source: `client/components/Label/Label.js:1–66`; exact old/new control ranges are in JSON.
Source: `client/components/Postman/Postman.js:1–1062`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceCol/InterfaceCaseContent.js:1–236`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · case_editor-01**: Edit case name/description and request values, save/reload exact data
- [ ] **NOT RUN · case_editor-02**: corresponding-interface link opens right API and Back restores case
- [ ] **NOT RUN · case_editor-03**: changed/deleted source API handles missing fields without crash
- [ ] **NOT RUN · case_editor-04**: repeated Save, rejected permissions and late responses leave consistent state

### Advanced Mock script and expectation tabs
Routes: /project/:id/interface/api/:actionId (高级Mock)
Roles: owner, dev, guest
States: expectations/script tab; enabled/disabled; populated/empty

Source: `exts/yapi-plugin-advanced-mock/AdvMock.js:1–157`; exact old/new control ranges are in JSON.
Source: `exts/yapi-plugin-advanced-mock/MockCol/MockCol.js:1–270`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · mock_advanced-01**: Switch expectation/script tabs and toggle script enable
- [ ] **NOT RUN · mock_advanced-02**: edit/save script with clear runner/syntax errors
- [ ] **NOT RUN · mock_advanced-03**: add/edit/delete/reorder expectations and verify matched response priority
- [ ] **NOT RUN · mock_advanced-04**: guest mutation controls and server authorization enforce permissions

### Mock expectation condition and response editor
Routes: /project/:id/interface/api/:actionId (高级Mock / 期望 dialog)
Roles: owner, dev, guest
States: new/edit; query/body conditions; IP filter; status/delay; headers/body

Source: `exts/yapi-plugin-advanced-mock/MockCol/CaseDesModal.js:1–483`; exact old/new control ranges are in JSON.
Source: `exts/yapi-plugin-advanced-mock/MockCol/MockCol.js:1–270`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · mock_expectation-01**: Set expectation name/IP/parameter filters and response status/delay/headers/body then save and verify matching request
- [ ] **NOT RUN · mock_expectation-02**: add/remove condition/header rows with correct values and ordering
- [ ] **NOT RUN · mock_expectation-03**: Cancel/Close/reopen no writes and no previous-expectation state
- [ ] **NOT RUN · mock_expectation-04**: disable/delete confirmation and repeated Save affect intended expectation only

### Wiki read, edit, conflict and notification
Routes: /project/:id/wiki
Roles: owner, dev, guest, two concurrent editors
States: empty; Markdown/HTML legacy; edit lock; notification; save error

Source: `exts/yapi-plugin-wiki/wikiPage/Editor.js:1–72`; exact old/new control ranges are in JSON.
Source: `exts/yapi-plugin-wiki/wikiPage/View.js:1–43`; exact old/new control ranges are in JSON.
Source: `exts/yapi-plugin-wiki/wikiPage/index.js:1–256`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · wiki-01**: Display sanitized wiki and preserve normal headings/tables/images/links
- [ ] **NOT RUN · wiki-02**: owner/dev edit via WYSIWYG/Markdown, update and reload exact content
- [ ] **NOT RUN · wiki-03**: Cancel edit and reopen do not save draft and conflict prevents unauthorized overwrite
- [ ] **NOT RUN · wiki-04**: notification choice, repeated update and switching project prevent duplicate/stale updates

### Data import formats, modes, target category and file drop
Routes: /project/:id/data (数据导入)
Roles: owner, dev, guest
States: Postman/HAR/Swagger/YApi; normal/merge/overwrite; file valid/invalid; category

Source: `client/containers/Project/Setting/ProjectData/ProjectData.js:1–528`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · imports-01**: Select each installed importer, target default category and synchronization mode
- [ ] **NOT RUN · imports-02**: file picker and drag/drop process valid input and display malformed input errors
- [ ] **NOT RUN · imports-03**: normal skips duplicates, smart merge retains intended manual edits, full overwrite changes only explicit scope
- [ ] **NOT RUN · imports-04**: repeated upload/cancel/navigation during import does not duplicate or falsely report completion

### Swagger URL import and diff review
Routes: /project/:id/data (swagger url 导入)
Roles: owner, dev, guest
States: URL toggle; valid/unreachable/invalid URL; preview diff; pending

Source: `client/containers/Project/Setting/ProjectData/ProjectData.js:1–528`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · import_url-01**: Enable URL import and validate supplied URL and target category
- [ ] **NOT RUN · import_url-02**: display readable sanitized import differences and exact added/updated/skipped counts
- [ ] **NOT RUN · import_url-03**: URL/network/auth/schema failure is clear and no partial success is hidden
- [ ] **NOT RUN · import_url-04**: repeated trigger or navigation during fetch cannot apply to a newly selected project

### HTML, Markdown, JSON and Swagger export
Routes: /project/:id/data (数据导出)
Roles: owner, dev, guest, public/private nonmember
States: format; all/single category; all/public APIs; wiki on/off

Source: `client/containers/Project/Setting/ProjectData/ProjectData.js:1–528`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · exports-01**: Select every export format and verify filename/content/media type
- [ ] **NOT RUN · exports-02**: category/API visibility filters limit output exactly and private APIs never leak
- [ ] **NOT RUN · exports-03**: include-wiki toggle affects supported HTML/Markdown output
- [ ] **NOT RUN · exports-04**: no-data, long Unicode paths and repeated export remain usable

### Swagger automatic synchronization
Routes: /project/:id/setting (Swagger自动同步)
Roles: owner, dev, guest
States: disabled/enabled; URL; cron valid/invalid; modes; last run; error

Source: `exts/yapi-plugin-swagger-auto-sync/swaggerAutoSync/swaggerAutoSync.js:1–240`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · swagger_sync-01**: Toggle sync and save URL/cron/mode with visible validation
- [ ] **NOT RUN · swagger_sync-02**: reopen/reload reads saved config and last update
- [ ] **NOT RUN · swagger_sync-03**: manual/import changes are preserved or replaced per selected mode and revision history captures intended writes
- [ ] **NOT RUN · swagger_sync-04**: unauthorized guest and stale-owner job operations deny clearly with no misleading enabled state

### TypeScript services generation help and link
Routes: /project/:id/setting (生成 ts services)
Roles: owner, dev, guest
States: new/old tool version instructions; project/token config

Source: `exts/yapi-plugin-gen-services/Services/Services.js:1–76`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · services-01**: Tab remains discoverable once and configuration reflects selected project
- [ ] **NOT RUN · services-02**: copy/install/config/generation instructions render fully at narrow widths
- [ ] **NOT RUN · services-03**: generated service source/download links target permitted project
- [ ] **NOT RUN · services-04**: changing project clears old-project information and direct unauthorized output is denied

### Administrative system statistics cards, charts and table
Routes: /statistic
Roles: global admin, non-admin, anonymous
States: loading; zero; many groups; chart empty; mail/system error

Source: `exts/yapi-plugin-statistics/client.js:1–23`; exact old/new control ranges are in JSON.
Source: `exts/yapi-plugin-statistics/statisticsClientPage/StatisChart.js:1–95`; exact old/new control ranges are in JSON.
Source: `exts/yapi-plugin-statistics/statisticsClientPage/StatisTable.js:1–48`; exact old/new control ranges are in JSON.
Source: `exts/yapi-plugin-statistics/statisticsClientPage/index.js:1–214`; exact old/new control ranges are in JSON.
Source: `exts/yapi-plugin-statistics/controller.js:1–186`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · statistics-01**: Show group/project/API/test totals and OS/CPU/memory/mail states accurately
- [ ] **NOT RUN · statistics-02**: chart for last three months labels/tooltip/resize works
- [ ] **NOT RUN · statistics-03**: group detail table pagination/sort/links correspond to counts
- [ ] **NOT RUN · statistics-04**: non-admin hidden menu and direct-route/backend denial prevent disclosure

### Legacy admin upgrade notification removal
Routes: all admin routes
Roles: global admin, non-admin
States: old version equal/different; remote lookup failure; dismissed

Source: `client/Application.js:1–156`; exact old/new control ranges are in JSON.
Source: `client/components/Notify/Notify.js:1–52`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · admin_notify-01**: Record that old shell mounted Notify only for admin while new does not mount it
- [ ] **NOT RUN · admin_notify-02**: if notification behavior is required, compare banner/current/latest/version-detail link and close behavior
- [ ] **NOT RUN · admin_notify-03**: confirm intentional removal policy rather than calling missing banner a visual pass

### AI documentation modal and provider consent
Routes: /project/:id/interface/api/:actionId (AI 文档助手)
Roles: owner, dev, guest, nonmember
States: closed/loading; provider configured/unconfigured; approved/unapproved; network error

Source: `client/components/DocumentationAssistant/DocumentationAssistant.js:1–87`; exact old/new control ranges are in JSON.
Source: `client/containers/Project/Interface/InterfaceList/InterfaceContent.js:1–186`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · ai_gate-01**: Open on current interface and show exact document version/provider/model/outbound payload
- [ ] **NOT RUN · ai_gate-02**: unconfigured provider and unchecked consent disable generation
- [ ] **NOT RUN · ai_gate-03**: consent checkbox applies to displayed payload and is reset on close/reopen or document change
- [ ] **NOT RUN · ai_gate-04**: loading/Close/Escape/repeated open cannot strand overlay or reuse previous-interface state

### AI generation, diff, discard and accept
Routes: /project/:id/interface/api/:actionId (AI proposal)
Roles: owner, dev, guest
States: pending; success; unresolved questions; duplicate; stale 409; failed provider

Source: `client/components/DocumentationAssistant/DocumentationAssistant.js:1–87`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · ai_proposal-01**: Generate only after consent and show complete HTML/Markdown/field-annotation diff as safe text
- [ ] **NOT RUN · ai_proposal-02**: discard saves nothing and retry uses intended idempotency
- [ ] **NOT RUN · ai_proposal-03**: accept once creates revision then refreshes interface and clears proposal/consent
- [ ] **NOT RUN · ai_proposal-04**: concurrent legacy edit produces visible stale error without overwriting newer document

### Documentation history, pagination and restore
Routes: /project/:id/interface/api/:actionId (历史与恢复)
Roles: owner, dev, guest
States: no history; >50 entries; old partial revisions; restore modal; error

Source: `client/components/DocumentationAssistant/DocumentationAssistant.js:1–87`; exact old/new control ranges are in JSON.

- [ ] **NOT RUN · ai_history-01**: Load history and earlier pages without duplicate versions, retaining actor/time/kind
- [ ] **NOT RUN · ai_history-02**: inspect current/original/old field snapshots and label incomplete history
- [ ] **NOT RUN · ai_history-03**: Cancel restore writes nothing, confirm creates a new revision preserving history
- [ ] **NOT RUN · ai_history-04**: repeated restore, navigation and stale version failure never rewrite another interface

## Shared interruptions, roles and rendering

- [ ] **NOT RUN · cross-role_matrix**: Run as anonymous, global admin, owner, developer, guest and unrelated user, with public/private project and inherited group rights; UI hiding and server denial must both be verified.
- [ ] **NOT RUN · cross-empty_loading_error**: Run empty, loading, populated, slow request, network error, server validation error and permission revoked states; stale success and infinite spinner are failures.
- [ ] **NOT RUN · cross-cancel_reopen**: For every dialog/popover/editor: open, edit, Cancel, reopen, close icon, Escape, outside click and save; verify exactly the intended persistence and focus return.
- [ ] **NOT RUN · cross-repeat_actions**: Rapid double-click each create/save/delete/send/restore/import control and retry after failure; assert no duplicate write, duplicate run, dropped loading state or stale callback.
- [ ] **NOT RUN · cross-navigation**: Direct-link, refresh, in-app links, browser Back/Forward, dirty navigation cancel/confirm, and switch project/interface mid-request; assert target IDs, location and content agree.
- [ ] **NOT RUN · cross-keyboard**: Keyboard Tab/Shift-Tab, Enter, Space and Escape; ensure actionable controls are reachable, labels/errors understandable and no trapped focus after close.
- [ ] **NOT RUN · cross-layout**: At desktop, narrow desktop and mobile widths: inspect clipping, overflow, stacking, AntD dropdown/modal portals, long Unicode titles and tables, loading overlays, tooltip placement and editor height.
- [ ] **NOT RUN · cross-persistence**: After each mutation verify server response, visible state, reload and readback independently; inspect payload for unchanged unrelated fields and expected data types.
- [ ] **NOT RUN · cross-plugin_matrix**: Enable/disable each bundled plugin and representative configured external plugins; confirm no duplicate routes/tabs, hook failures or incompatible AntD/router assumptions.
- [ ] **NOT RUN · cross-historical_data**: Use real authorized backup-derived fixtures with legacy Markdown/HTML, numeric IDs, empty arrays/nulls, malformed/boolean/multi-type schemas, deep nesting and old collection state; no production mutation.

## Evidence boundaries

- All 246 planned assertions retain not_run, independently of partial CI evidence.
- The historical CI ledger belongs only to 889b7b5; it does not test the later overlay.
- source_reviewed/source-fixed confirms source presence only.
- Syntactic controls are not rendered runtime instances; shared components and plugin branches require execution.
- UI role expressions do not prove server authorization.
- Old type-specific schema advanced fields, Title inputs and Mock autocomplete still differ; tuple/depth inline limits remain.
- Exact-final CI and authorized paired browser comparison are required before full compatibility claims.
