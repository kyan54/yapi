'use strict';

module.exports = function parseBulkParameters(text, currentValues, template) {
  const lines = text.split('\n');
  const invalidIndex = lines.findIndex(line => {
    const colon = line.indexOf(':');
    return line.trim() && (colon < 1 || !line.slice(0, colon).trim());
  });
  if (invalidIndex !== -1) return { invalidLine: invalidIndex + 1 };
  const values = lines.filter(line => line.trim()).map((line, index) => {
    const colon = line.indexOf(':');
    return { ...currentValues[index] || template, name: line.slice(0, colon), example: line.slice(colon + 1) };
  });
  return { values };
};
