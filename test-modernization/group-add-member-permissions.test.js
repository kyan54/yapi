'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../util-polyfill');
const yapi = require('../server/yapi');
const Group = require('../server/controllers/group');
yapi.commons = {...require('../server/utils/commons'), resReturn: (data, errcode = 0, errmsg = '') => ({data, errcode, errmsg})};

test('group member admission uses live danger rights before lookup, role normalization, or writes', async () => {
  const original = yapi.getInst;
  yapi.getInst = () => assert.fail('denied admission must not instantiate a data model');
  try {
    for (const role of ['owner', 'dev', 'guest', 'unrecognized']) {
      const params = {id: 901000, member_uids: [910004], role};
      const before = structuredClone(params);
      const ctx = {params};
      let checks = 0;
      await Group.prototype.addMember.call({checkAuth: async (id, type, action) => {
        checks++;
        assert.deepEqual([id, type, action], [901000, 'group', 'danger']);
        return false;
      }}, ctx);
      assert.equal(checks, 1);
      assert.equal(ctx.body.errcode, 405);
      assert.deepEqual(params, before);
    }
  } finally {
    yapi.getInst = original;
  }
});
