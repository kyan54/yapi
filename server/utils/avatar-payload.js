'use strict';
const MAX_AVATAR_BYTES = 200000;
function parseAvatarPayload(value) {
  if (typeof value !== 'string') throw new Error('basecode必须是图片编码字符串');
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || match[0] !== value) throw new Error('仅支持jpeg和png格式的规范base64图片');
  const basecode = match[2];
  if (!basecode || basecode.length % 4 !== 0 || basecode.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4) throw new Error('图片编码无效或大小超过200kb');
  const bytes = Buffer.from(basecode, 'base64');
  if (bytes.toString('base64') !== basecode) throw new Error('图片base64编码无效');
  if (bytes.length > MAX_AVATAR_BYTES) throw new Error('图片大小不能超过200kb');
  return { basecode, type: match[1] };
}
module.exports = { MAX_AVATAR_BYTES, parseAvatarPayload };
