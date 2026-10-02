import React from 'react';
import axios from 'axios';
import { Alert, Button, Checkbox, Empty, Modal, Space, Spin, Tag, Typography } from 'antd-modern';
const { Paragraph, Text } = Typography;
const codeStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 320, overflow: 'auto', padding: 12, background: '#f6f8fa', border: '1px solid #ddd' };
function annotationBefore(document, edit) {
  if (Number.isInteger(edit.index)) return document[edit.field] && document[edit.field][edit.index] ? document[edit.field][edit.index].desc : '';
  try { let node = JSON.parse(document[edit.field] || '{}'); for (const part of edit.pointer.slice(1).split('/')) node = node[part.replace(/~1/g, '/').replace(/~0/g, '~')]; return node; } catch (_) { return ''; }
}
function FieldDiff({ name, before, after }) {
  return <section aria-label={`${name} 差异`}><h4>{name}</h4><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div><Text strong>当前内容</Text><pre style={codeStyle}>{before || '（空）'}</pre></div><div><Text strong>建议内容</Text><pre style={codeStyle}>{after || '（空）'}</pre></div></div></section>;
}
/** The server owns provider credentials, ACL, compare-and-swap and immutable revisions. */
export default function DocumentationAssistant({ projectId, interfaceId, sourceDocument, onChanged }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [loaded, setLoaded] = React.useState(null);
  const [proposal, setProposal] = React.useState(null);
  const [history, setHistory] = React.useState(null);
  const [approved, setApproved] = React.useState(false);
  const [error, setError] = React.useState('');
  const [restoreVersion, setRestoreVersion] = React.useState(null);
  const sequence = React.useRef(0);
  const pending = React.useRef(false);
  const requestId = React.useRef(null);
  const ids = { projectId: Number(projectId), interfaceId: Number(interfaceId) };
  React.useEffect(() => { sequence.current++; pending.current = false; requestId.current = null; setOpen(false); setLoaded(null); setProposal(null); setHistory(null); setApproved(false); setError(''); setBusy(false); return () => { sequence.current++; }; }, [projectId, interfaceId]);
  const call = async (action, body, query = {}) => {
    let response;
    try { response = body ? await axios.post(`/api/documentation/${action}`, { ...ids, ...body }, { headers: { 'X-YApi-Docs-Intent': 'review' } }) : await axios.get(`/api/documentation/${action}`, { params: { ...ids, ...query } }); } catch (failure) {
      if (failure.response && failure.response.data && failure.response.data.errcode) response = failure.response; else throw failure;
    }
    const result = response.data;
    if (result.errcode !== 0) { const failure = new Error(result.errcode === 409 ? '文档已发生变化，请关闭并重新打开以获取最新版本后再生成建议。' : result.errmsg || '操作失败'); failure.code = result.errcode; throw failure; }
    return result.data;
  };
  const run = async task => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const token = sequence.current;
    try { await task(() => token === sequence.current); }
    catch (failure) { if (token === sequence.current) { setError(failure.message || '请求失败'); if (failure.code === 409) setProposal(null); } }
    finally { if (token === sequence.current) { pending.current = false; setBusy(false); } }
  };
  const show = () => { requestId.current = null; setLoaded(null); setOpen(true); setApproved(false); setProposal(null); setHistory(null); run(async current => { const result = await call('get'); if (current()) setLoaded(result); }); };
  const generate = () => run(async current => { if (!approved || !loaded || !loaded.provider.configured) return; if (!requestId.current) requestId.current = crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, digit => (Number(digit) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(digit) / 4).toString(16)); const result = await call('proposal', { approvedForTransmission: true, requestId: requestId.current, payloadHash: loaded.payloadHash }); if (current()) { setProposal(result); requestId.current = null; } });
  const refreshHistory = async current => { const result = await call('history'); if (current()) setHistory(result); };
  const moreHistory = () => run(async current => { const result = await call('history', null, { cursor: history.nextCursor, limit: 50 }); if (current()) setHistory(previous => ({ ...result, revisions: [...previous.revisions, ...result.revisions.filter(item => !previous.revisions.some(existing => existing.version === item.version))] })); });
  const accept = () => run(async current => { const result = await call('accept', { proposalId: proposal.id }); if (!current()) return; const refreshed = await call('get'); if (!current()) return; setLoaded(refreshed); requestId.current = null; setProposal(null); setApproved(false); if (onChanged) onChanged(); await refreshHistory(current); });
  const restore = () => run(async current => { const result = await call('restore', { version: restoreVersion }); if (!current()) return; setRestoreVersion(null); setProposal(null); const refreshed = await call('get'); if (!current()) return; setLoaded(refreshed); setApproved(false); requestId.current = null; if (onChanged) onChanged(); await refreshHistory(current); });
  const close = () => { if (busy) return; sequence.current++; setOpen(false); setLoaded(null); setRestoreVersion(null); };
  const provider = loaded && loaded.provider;
  return <>
    <Button onClick={show} disabled={!projectId || !interfaceId} data-testid="documentation-ai-button">AI 文档助手</Button>
    <Modal title="AI 文档助手 · 先预览，再人工采纳" open={open} onCancel={close} footer={null} width={960} mask={{ closable: !busy }} closable={!busy} keyboard={!busy} destroyOnHidden>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
      {!loaded && busy && <Spin />}
      {loaded && <>
        <Paragraph><Tag>{loaded.document.method}</Tag><Text code>{loaded.document.path}</Text> · {loaded.document.title} · 版本 {loaded.document.version}</Paragraph>
        <Alert type="info" showIcon title="只修改文档与参数、Schema 的描述注释。路径、方法、参数名称和类型、必填约束、Mock、测试和同步设置保持原样。" />
        {!provider.configured ? <Alert type="warning" title="尚未配置 AI 服务" description="请管理员在服务端配置兼容的 LLM 服务地址、模型及凭证，然后重新打开本窗口。当前不会调用外部模型。" style={{ marginTop: 12 }} /> : <div style={{ marginTop: 12 }}>
          <Paragraph>生成建议将把当前接口的标题、方法、路径、请求和响应字段定义及现有文档发送至 {provider.baseURL}（模型：{provider.model}）。自动脱敏只是启发式处理，不能保证所有秘密已移除。请检查以下完整发送内容，移除密钥、真实个人信息和机密内容后再生成。</Paragraph>
          <details open><summary>本次将发送的完整数据</summary><pre style={codeStyle} data-testid="documentation-outbound">{JSON.stringify(loaded.outbound, null, 2)}</pre></details>
          <Checkbox checked={approved} disabled={busy} onChange={event => setApproved(event.target.checked)}>我已检查接口内容，同意本次发送至上述 AI 服务</Checkbox>
        </div>}
        <Space style={{ margin: '16px 0' }}><Button type="primary" loading={busy && !proposal} disabled={!provider.configured || !approved || busy} onClick={generate}>生成文档建议</Button><Button disabled={busy} onClick={() => run(refreshHistory)}>查看历史与恢复</Button></Space>
        {proposal && <section aria-label="AI 文档建议预览">
          <Alert type="warning" title="AI 建议尚未保存。请审核完整差异，不确定的内容需人工确认。" />
          <FieldDiff name="描述（HTML 源码，安全文本显示）" before={loaded.document.desc} after={proposal.changes.desc} />
          <FieldDiff name="Markdown" before={loaded.document.markdown} after={proposal.changes.markdown} />
          {(proposal.changes.descriptionEdits || []).map((edit, index) => <FieldDiff key={index} name={`${edit.field}${Number.isInteger(edit.index) ? `[${edit.index}].desc` : edit.pointer}`} before={annotationBefore(sourceDocument || loaded.document, edit)} after={edit.desc === undefined ? edit.description : edit.desc} />)}
          {(proposal.changes.descriptionEdits || []).some(edit => edit.pointer) && <Alert type="info" title="Schema 描述注释更新可能重新排版 JSON，Schema 的非描述语义保持原样。" />}
          {proposal.unresolved && proposal.unresolved.length > 0 && <Alert type="warning" title="待确认问题" description={<ul>{proposal.unresolved.map((item, index) => <li key={index}>{String(item)}</li>)}</ul>} />}
          <Space style={{ margin: '16px 0' }}><Button type="primary" disabled={busy} loading={busy} onClick={accept}>审核完成，采纳此建议</Button><Button disabled={busy} onClick={() => setProposal(null)}>丢弃建议</Button></Space>
        </section>}
        {history && <section aria-label="文档修订历史"><h3>文档修订历史</h3>
          {!history.revisions.length && <Empty description="暂无已保存的 AI 文档修订" />}
          {history.revisions.map(revision => <div key={revision.version} style={{ padding: 12, borderBottom: '1px solid #ddd' }}><Space wrap><Text strong>版本 {revision.version}</Text><Tag>{revision.kind}</Tag><Text>操作人 {revision.actorId}</Text><Text>{String(revision.createdAt)}</Text><Button disabled={busy || revision.version === history.currentVersion} onClick={() => setRestoreVersion(revision.version)}>恢复此版本</Button></Space>{revision.fieldHistoryAvailable === false && <Tag>旧历史：仅包含顶层文档</Tag>}<details><summary>查看此版本内容</summary><pre style={codeStyle}>{revision.after.markdown || revision.after.desc || '（空）'}</pre>{revision.after.descriptionSnapshot && <pre style={codeStyle}>{JSON.stringify(revision.after.descriptionSnapshot, null, 2)}</pre>}</details></div>)}
          {history.hasMore && <Button style={{ marginTop: 12 }} disabled={busy} onClick={moreHistory}>加载更早历史</Button>}
          {history.revisions.length > 0 && <Button style={{ marginTop: 12 }} disabled={busy} onClick={() => setRestoreVersion(0)}>恢复原始文档（版本 0）</Button>}
        </section>}
      </>}
    </Modal>
    <Modal title="确认恢复文档" open={restoreVersion !== null} onOk={restore} onCancel={() => !busy && setRestoreVersion(null)} confirmLoading={busy} okText="确认恢复" cancelText="取消"><p>将版本 {restoreVersion} 的文档与已记录的字段描述 恢复为一个新版本，现有历史记录会保留。</p></Modal>
  </>;
}
