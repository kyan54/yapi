'use strict';
function activeSchema(document, field) {
  const response = field === 'res_body';
  const type = document[response ? 'res_body_type' : 'req_body_type'];
  return document[response ? 'res_body_is_json_schema' : 'req_body_is_json_schema'] === true &&
    // Records predating explicit body types retain their schema flag behavior.
    (type === undefined || type === 'json');
}
module.exports = {activeSchema};
