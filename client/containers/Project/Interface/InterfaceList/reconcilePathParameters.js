'use strict';

module.exports = function reconcilePathParameters(path, current) {
  const names = [];
  if (path && path.includes(':')) {
    path.split('/').slice(1).forEach(segment => {
      if (segment[0] === ':') names.push(segment.slice(1));
    });
  }
  if (path && path.length > 3) path.replace(/\{(.+?)\}/g, (match, name) => { names.push(name); });
  return names.map(name => {
    const existing = current.find(item => item.name === name);
    return existing ? { ...existing } : { name, desc: '', example: '' };
  });
};
