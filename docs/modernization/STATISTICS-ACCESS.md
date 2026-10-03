# Statistics authorization correction

This is an intentional security correction, not a visual-parity claim. The legacy menu already restricted system statistics to administrators, but its chart controller used `!this.getRole() === 'admin'`, which never enforced that restriction. The other statistics actions had no administrator check.

All four read endpoints now require the authenticated site role `admin` before accessing system or cross-project data:

- `/api/plugin/statismock/count`
- `/api/plugin/statismock/get`
- `/api/plugin/statismock/get_system_status`
- `/api/plugin/statismock/group_data_statis`

Authenticated non-administrators receive the normal YApi error envelope with `errcode: 405` and `data: null`. The existing authentication layer continues to return `errcode: 40011` for unauthenticated requests. Administrator response formats and aggregation semantics are unchanged. Direct non-admin navigation displays an explicit refusal and does not request protected statistics.

`test-modernization/statistics-permissions.test.js` checks every controller action for missing users, member/owner/developer/guest roles, and successful administrator contracts. The real browser/application suite also exercises all four routes without authentication, as administrator, and as an ordinary member, then checks direct-route refusal. Its exact-commit CI outcome must be recorded separately; adding a test is not evidence that it passed.

No production database, account, credential or deployed permission was changed by this source patch.
