const json5 = require('json5');
function initialSchemaMode(type, stored, json5Enabled) {
  if (type !== undefined && type !== 'json') return false;
  return stored === undefined ? !json5Enabled : stored;
}
function parseBodyJson(source, allowJson5) {
  return allowJson5 ? json5.parse(source) : JSON.parse(source);
}
function clearInactiveBodies(values, hasRequestBody) {
  if (!hasRequestBody || values.req_body_type !== 'form') values.req_body_form = [];
  if (!hasRequestBody || values.req_body_type === 'form') values.req_body_other = '';
  values.req_body_is_json_schema = !!(hasRequestBody && values.req_body_type === 'json' && values.req_body_is_json_schema);
  values.res_body_is_json_schema = !!(values.res_body_type === 'json' && values.res_body_is_json_schema);
  return values;
}
module.exports = { initialSchemaMode, parseBodyJson, clearInactiveBodies };
