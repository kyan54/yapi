const crypto = require('crypto');
const yapi = require('../yapi');

const defaultSalt = 'abcde';
const algorithm = 'aes-192-cbc';
const keyLength = 24;
const ivLength = 16;

function evpBytesToKey(password, keyLen, ivLen) {
  const buffers = [];
  let current = Buffer.alloc(0);

  while (Buffer.concat(buffers).length < keyLen + ivLen) {
    const hash = crypto.createHash('md5');
    hash.update(current);
    hash.update(Buffer.from(password, 'utf8'));
    current = hash.digest();
    buffers.push(current);
  }

  const derived = Buffer.concat(buffers);
  return {
    key: derived.slice(0, keyLen),
    iv: derived.slice(keyLen, keyLen + ivLen)
  };
}

function createCipher(password) {
  const { key, iv } = evpBytesToKey(password, keyLength, ivLength);
  return crypto.createCipheriv(algorithm, key, iv);
}

function createDecipher(password) {
  const { key, iv } = evpBytesToKey(password, keyLength, ivLength);
  return crypto.createDecipheriv(algorithm, key, iv);
}

function aseEncode(data, password) {
  const cipher = createCipher(password);
  let crypted = cipher.update(data, 'utf8', 'hex');
  crypted += cipher.final('hex');
  return crypted;
}

function aseDecode(data, password) {
  const decipher = createDecipher(password);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

exports.getToken = function getToken(token, uid) {
  if (!token) throw new Error('token 不能为空');
  yapi.WEBCONFIG.passsalt = yapi.WEBCONFIG.passsalt || defaultSalt;
  return aseEncode(uid + '|' + token, yapi.WEBCONFIG.passsalt);
};

exports.parseToken = function parseToken(token) {
  if (!token) throw new Error('token 不能为空');
  yapi.WEBCONFIG.passsalt = yapi.WEBCONFIG.passsalt || defaultSalt;

  let tokens;
  try {
    tokens = aseDecode(token, yapi.WEBCONFIG.passsalt);
  } catch (e) {}

  if (tokens && typeof tokens === 'string' && tokens.indexOf('|') > 0) {
    tokens = tokens.split('|');
    return {
      uid: tokens[0],
      projectToken: tokens[1]
    };
  }

  return false;
};
