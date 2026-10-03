'use strict';
const json5 = require('json5');
const types = new Set(['object', 'string', 'number', 'array', 'boolean', 'integer', 'null']);

// Return the serialized schema, or false for an invalid document. A JSON
// Schema does not require a type: boolean roots, references and compositions
// must survive the same save path as the visual editor.
module.exports = function normalizeSchema(text) {
  try {
    const schema = json5.parse(text);
    if (typeof schema === 'boolean') return JSON.stringify(schema);
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false;
    // Preserve the historical implicit-type normalization for existing forms.
    if (schema.properties && typeof schema.properties === 'object' && schema.type === undefined) schema.type = 'object';
    if (schema.items && typeof schema.items === 'object' && schema.type === undefined) schema.type = 'array';
    if (schema.type !== undefined) {
      if (typeof schema.type === 'string') {
        schema.type = schema.type.toLowerCase();
        if (!types.has(schema.type)) return false;
      } else if (Array.isArray(schema.type)) {
        if (!schema.type.length || schema.type.some(type => typeof type !== 'string' || !types.has(type)) || new Set(schema.type).size !== schema.type.length) return false;
      } else return false;
    }
    return JSON.stringify(schema);
  } catch (error) {
    return false;
  }
};
