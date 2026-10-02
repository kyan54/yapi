'use strict';
// SYNTHETIC UI REGRESSION FIXTURE. No MongoDB, production data, or real LLM.
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const project = { _id: 1, name: 'Synthetic regression project', group_id: 1, role: 'owner', basepath: '', desc: 'Synthetic UI fixture only', project_type: 'private', members: [], env: [{ name: 'local', domain: 'http://127.0.0.1:4174', header: [], global: [] }], cat: [{ _id: 1, name: 'Synthetic category' }], tag: [], switch_notice: false, pre_script: '', after_script: '', project_mock_script: '', uid: 1 };
const group = { _id: 1, group_name: 'Synthetic regression group', type: 'public', role: 'owner', members: [], custom_field1: { name: '', enable: false } };
let document = { _id: 1, project_id: 1, catid: 1, uid: 1, title: 'Synthetic user lookup', method: 'GET', path: '/users/{id}', status: 'done', desc: '<p>Original synthetic description</p>', markdown: 'Original synthetic description', version: 0, req_params: [{ name: 'id', desc: 'User ID', example: '1' }], req_query: [{ name: 'verbose', desc: 'Detailed response', required: '0', example: 'true' }], req_headers: [], req_body_type: 'json', req_body_is_json_schema: true, req_body_other: '{"type":"object","properties":{}}', res_body_type: 'json', res_body_is_json_schema: true, res_body: '{"type":"object","properties":{"id":{"type":"integer"},"name":{"type":"string","mock":{"mock":"@name"}}},"required":["id"]}', tag: [], username: 'Synthetic tester', add_time: 1760000000, up_time: 1760000000, api_opened: false };
const initial = { ...document };
let revisions = [], loggedIn = process.env.YAPI_UI_FIXTURE_AUTH === '1';
const send = (res, data, extra = {}) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ errcode: 0, errmsg: 'Synthetic fixture', data, ...extra })); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let body = ''; for await (const chunk of req) body += chunk;
  if (url.pathname.startsWith('/api/')) {
    console.log(req.method, url.pathname, body.slice(0, 200));
    let data; try { data = JSON.parse(body || '{}'); } catch (_) { data = {}; }
    switch (url.pathname.replace(/\/$/, '')) {
      case '/api/user/status': return send(res, loggedIn ? { _id: 1, uid: 1, username: 'Synthetic tester', role: 'admin', type: 'site', study: true } : null, { errcode: loggedIn ? 0 : 40011, ladp: true, canRegister: true });
      case '/api/user/login': case '/api/user/login_by_ldap': loggedIn = true; return send(res, { uid: 1, username: 'Synthetic tester', role: 'admin', study: true });
      case '/api/group/list': return send(res, [group]);
      case '/api/group/get': return send(res, group);
      case '/api/project/get': return send(res, project);
      case '/api/project/list': return send(res, { list: [project], total: 1, userinfo: { role: 'admin' } });
      case '/api/project/get_env': return send(res, { env: project.env });
      case '/api/interface/get': return send(res, document);
      case '/api/interface/list_menu': return send(res, [{ _id: 1, name: 'Synthetic category', desc: 'Fixture', list: [document] }]);
      case '/api/interface/list': case '/api/interface/list_cat': return send(res, { list: [document], count: 1, total: 1 });
      case '/api/interface/getCatMenu': return send(res, [{ _id: 1, name: 'Synthetic category' }]);
      case '/api/interface/save': document = { ...document, ...data }; return send(res, document);
      case '/api/col/list': return send(res, [{ _id: 1, name: 'Synthetic test collection', desc: 'Fixture', caseList: [{ _id: 1, casename: 'Synthetic case' }] }]);
      case '/api/col/case_list': return send(res, [{ ...document, _id: 1, id: 1, casename: 'Synthetic case', interface_id: 1, enable_script: false, test_script: '' }], { colData: { test_report: '{}' } });
      case '/api/col/case_env_list': return send(res, [{ project_id: 1, env: project.env }]);
      case '/api/project/token': return send(res, 'synthetic-nonsecret-token');
      case '/api/documentation/get': return send(res, { document, provider: { configured: url.searchParams.get('disabled') !== 'true', baseURL: 'Synthetic local fixture (no external calls)', model: 'synthetic-test-provider' } });
      case '/api/documentation/proposal': if (!data.approvedForTransmission || req.headers['x-yapi-docs-intent'] !== 'review') return send(res, null, { errcode: 403, errmsg: 'Intent required' }); return send(res, { id: 'synthetic-proposal', baseVersion: document.version, baseHash: 'fixture', changes: { desc: '<p>Reviewed synthetic documentation</p>', markdown: 'Reviewed synthetic documentation\n\n<script>alert("untrusted")</script>' }, unresolved: ['Confirm optional verbose parameter behavior'], createdAt: new Date().toISOString() });
      case '/api/documentation/accept': { const before = { desc: document.desc, markdown: document.markdown }; document = { ...document, desc: '<p>Reviewed synthetic documentation</p>', markdown: 'Reviewed synthetic documentation', version: document.version + 1 }; const revision = { version: document.version, kind: 'accept', actorId: 1, createdAt: new Date().toISOString(), before, after: { desc: document.desc, markdown: document.markdown } }; revisions.push(revision); return send(res, { document, revision }); }
      case '/api/documentation/history': return send(res, { revisions, currentVersion: document.version });
      case '/api/documentation/restore': { const previous = data.version === 0 ? initial : revisions.find(item => item.version === data.version).after; const before = { desc: document.desc, markdown: document.markdown }; document = { ...document, desc: previous.desc, markdown: previous.markdown, version: document.version + 1 }; const revision = { version: document.version, kind: 'restore', actorId: 1, createdAt: new Date().toISOString(), before, after: { desc: document.desc, markdown: document.markdown } }; revisions.push(revision); return send(res, { document, revision }); }
      case '/api/log/list': return send(res, { list: [], total: 0 });
      case '/api/follow/list': return send(res, []);
      case '/api/plugin/export': return send(res, []);
      default: return send(res, []);
    }
  }
  let file = path.join(root, 'static', decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(root, 'static'))) { res.statusCode = 400; return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'static/prd/index.html');
  const ext = path.extname(file); const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
  res.setHeader('content-type', mime);
  let content = fs.readFileSync(file);
  if (ext === '.html') content = content.toString().replace('<body>', '<body><div style="position:fixed;bottom:0;left:0;z-index:99999;background:#ffe58f;padding:4px;font-size:12px">SYNTHETIC UI REGRESSION FIXTURE · no real database or AI provider</div>');
  res.end(content);
}).listen(4174, '0.0.0.0', () => console.log('Synthetic UI fixture listening on 4174'));
