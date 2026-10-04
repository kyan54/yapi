'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAvatarPayload } = require('../server/utils/avatar-payload');
for (const type of ['image/png', 'image/jpeg']) {
  for (const size of [199998, 199999, 200000]) test(`avatar accepts ${type} ${size} decoded bytes including padding`, () => {
    const basecode = Buffer.alloc(size, 7).toString('base64');
    assert.deepEqual(parseAvatarPayload(`data:${type};base64,${basecode}`), { type, basecode });
  });
  test(`avatar rejects ${type} 200001 decoded bytes`, () => assert.throws(() => parseAvatarPayload(`data:${type};base64,${Buffer.alloc(200001).toString('base64')}`), /200kb/));
}
for (const value of [null, {}, 'data:image/gif;base64,YQ==', 'data:image/svg+xml;base64,YQ==', 'data:image/png;base64,', 'data:image/png;base64,YQ', 'data:image/png;base64,YQ===', 'data:image/png;base64,YR==', 'data:image/png;base64,YQ==\n', 'data:image/png;base64,!!!!', 'data:image/png;base64, YQ==']) test(`avatar rejects malformed payload ${JSON.stringify(value)}`, () => assert.throws(() => parseAvatarPayload(value)));
