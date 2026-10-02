'use strict';

// Not mounted in legacy routes. Only a read-only transport with independent
// credentials and a live ACL adapter may expose this service.
const FIELDS = Object.freeze([
  '_id', 'project_id', 'catid', 'title', 'path', 'method', 'status',
  'desc', 'markdown', 'type', 'req_query', 'req_headers', 'req_params',
  'req_body_type', 'req_body_form', 'req_body_other', 'req_body_is_json_schema',
  'res_body_type', 'res_body', 'res_body_is_json_schema', 'tag', 'up_time'
]);
const PARAM_FIELDS = Object.freeze({
  req_query: ['name', 'desc', 'required'],
  req_headers: ['name', 'desc', 'required'],
  req_params: ['name', 'desc'],
  req_body_form: ['name', 'type', 'desc', 'required']
});
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i;

function error(code) {
  const result = new Error(code);
  result.code = code;
  return result;
}
function numericId(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw error('INVALID_ID');
  return value;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function toDocumentationDTO(record) {
  numericId(record._id);
  numericId(record.project_id);
  const result = { format: 'yapi.documentation.v1' };
  for (const key of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    if (PARAM_FIELDS[key]) {
      if (!Array.isArray(record[key])) throw error('INVALID_DOCUMENT');
      result[key] = record[key].map(item => {
        const parameter = {};
        for (const field of PARAM_FIELDS[key]) {
          if (Object.prototype.hasOwnProperty.call(item, field)) parameter[field] = clone(item[field]);
        }
        // Keep header contract (name/required), never runtime values or examples.
        if (key === 'req_headers' && SENSITIVE_HEADER.test(item.name)) delete parameter.desc;
        return parameter;
      });
    } else {
      result[key] = clone(record[key]);
    }
  }
  return result;
}

function createReadService({ interfaces, authorize }) {
  if (!interfaces || typeof interfaces.findOne !== 'function' || typeof authorize !== 'function') {
    throw error('INVALID_ADAPTER');
  }
  return Object.freeze({
    async getInterface({ principal, projectId, interfaceId }) {
      numericId(projectId);
      numericId(interfaceId);
      // The authorization adapter MUST verify live principal, dedicated docs.read
      // scope, project grant, and current membership. Fail closed, without caching.
      if (await authorize({ principal, projectId, scope: 'docs.read' }) !== true) {
        throw error('FORBIDDEN');
      }
      // Do not call project.get: its legacy environment repair writes to Mongo.
      // No caller-provided projection, filter, script, sort or populate is accepted.
      const record = await interfaces.findOne({ _id: interfaceId, project_id: projectId })
        .select(FIELDS.join(' ')).lean().exec();
      if (!record || record._id !== interfaceId || record.project_id !== projectId) {
        throw error('NOT_FOUND');
      }
      return toDocumentationDTO(record);
    }
  });
}

module.exports = { createReadService, toDocumentationDTO, numericId, FIELDS };
