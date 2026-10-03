'use strict';
const {HTTP_METHOD}=require('../../../client/constants/variable');
function activeSchema(document, field) {
  const response = field === 'res_body';
  const method = HTTP_METHOD[String(document.method || '').toUpperCase()];
  // Match the product's existing request-body tabs, including DELETE support.
  // Unknown/legacy methods retain the historical flag behavior.
  if (!response && method && method.request_body === false) return false;
  const type = document[response ? 'res_body_type' : 'req_body_type'];
  return document[response ? 'res_body_is_json_schema' : 'req_body_is_json_schema'] === true &&
    // Records predating explicit body types retain their schema flag behavior.
    (type === undefined || type === 'json');
}
module.exports = {activeSchema};
