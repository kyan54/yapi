const util = require('util');
const types = require('util/types');

const polyfills = {
  isRegExp: types.isRegExp || ((obj) => Object.prototype.toString.call(obj) === '[object RegExp]'),
  isDate: types.isDate || ((obj) => Object.prototype.toString.call(obj) === '[object Date]'),
  isArray: Array.isArray,
  isError: types.isNativeError || ((obj) => Object.prototype.toString.call(obj) === '[object Error]' || obj instanceof Error),
  isFunction: (obj) => typeof obj === 'function',
  isString: (obj) => typeof obj === 'string',
  isNumber: (obj) => typeof obj === 'number',
  isBoolean: (obj) => typeof obj === 'boolean',
  isUndefined: (obj) => obj === undefined,
  isNull: (obj) => obj === null,
  isNullOrUndefined: (obj) => obj == null,
  isObject: (obj) => obj !== null && typeof obj === 'object',
  isPrimitive: (obj) => (typeof obj !== 'object' && typeof obj !== 'function') || obj === null,
  isSymbol: (obj) => typeof obj === 'symbol',
  isBuffer: Buffer.isBuffer
};

for (const key in polyfills) {
  if (typeof util[key] === 'undefined') {
    util[key] = polyfills[key];
  }
}

// Some old versions of webpack/ykit might use process.binding('util')
if (!process.binding) {
  process.binding = (name) => {
    if (name === 'util') return polyfills;
    throw new Error('process.binding is not supported for ' + name);
  };
}
