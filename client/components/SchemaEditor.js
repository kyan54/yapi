import React from 'react';
import { Alert, Button, Checkbox, Input, Select, Space, Tabs } from 'antd-modern';
const types = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
function NodeEditor({ schema, onChange, depth = 0, label = '根节点' }) {
  if (typeof schema === 'boolean' || !schema || typeof schema !== 'object') return <Alert type="info" title={`${label}: ${String(schema)}`} description="此 Schema 值请在 JSON 模式编辑，原始语义完整保留。" />;
  const type = schema.type || (schema.properties ? 'object' : 'string');
  const properties = schema.properties || {};
  const patch = changes => onChange({ ...schema, ...changes });
  const rename = (oldName, name) => {
    if (!name || name === oldName || Object.prototype.hasOwnProperty.call(properties, name)) return;
    const next = {};
    Object.keys(properties).forEach(key => { next[key === oldName ? name : key] = properties[key]; });
    patch({ properties: next, required: (schema.required || []).map(key => key === oldName ? name : key) });
  };
  return <fieldset style={{ margin: '8px 0', padding: 12, border: '1px solid #ddd' }}>
    <legend style={{ width: 'auto', fontSize: 13 }}>{label}</legend>
    <Space wrap>
      <Select aria-label={`${label} 类型`} value={type} style={{ width: 110 }} options={types.map(value => ({ value }))} onChange={value => patch({ type: value })} />
      <Input aria-label={`${label} 描述`} placeholder="描述" value={schema.description || ''} onChange={event => patch({ description: event.target.value })} style={{ width: 230 }} />
      <Input aria-label={`${label} Mock`} placeholder="Mock，例如 @name" value={typeof schema.mock === 'object' ? schema.mock.mock || '' : schema.mock || ''} onChange={event => patch({ mock: { mock: event.target.value } })} style={{ width: 200 }} />
    </Space>
    {type === 'object' && <div>
      {Object.entries(properties).map(([name, child]) => <div key={name}>
        <Space wrap style={{ marginTop: 8 }}>
          <Input aria-label={`字段 ${name} 名称`} defaultValue={name} onBlur={event => rename(name, event.target.value)} onPressEnter={event => rename(name, event.target.value)} />
          <Checkbox checked={(schema.required || []).includes(name)} onChange={event => patch({ required: event.target.checked ? [...new Set([...(schema.required || []), name])] : (schema.required || []).filter(key => key !== name) })}>必填</Checkbox>
          <Button danger onClick={() => { const next = { ...properties }; delete next[name]; patch({ properties: next, required: (schema.required || []).filter(key => key !== name) }); }}>删除字段</Button>
        </Space>
        {depth < 12 ? <NodeEditor label={name} depth={depth + 1} schema={child} onChange={next => patch({ properties: { ...properties, [name]: next } })} /> : <Alert title="更深层级请使用 JSON 编辑，内容将完整保留。" />}
      </div>)}
      <Button style={{ marginTop: 8 }} onClick={() => { let index = 1; while (Object.prototype.hasOwnProperty.call(properties, `field${index}`)) index++; patch({ properties: { ...properties, [`field${index}`]: { type: 'string', description: '' } } }); }}>添加字段</Button>
    </div>}
    {type === 'array' && depth < 12 && <NodeEditor label="数组元素" depth={depth + 1} schema={Array.isArray(schema.items) ? schema.items[0] || {} : schema.items || { type: 'string' }} onChange={items => patch({ items: Array.isArray(schema.items) ? [items, ...schema.items.slice(1)] : items })} />}
  </fieldset>;
}
export default function SchemaEditor({ data, onChange }) {
  const input = typeof data === 'string' ? data : JSON.stringify(data || { type: 'object', properties: {} }, null, 2);
  const [text, setText] = React.useState(input);
  const [error, setError] = React.useState('');
  React.useEffect(() => { setText(input); setError(''); }, [input]);
  let parsed;
  try { parsed = JSON.parse(text || '{}'); } catch (_) { parsed = null; }
  const update = value => { const next = JSON.stringify(value, null, 2); setText(next); setError(''); onChange(next); };
  return <div className="schema-editor-modern"><Tabs items={[
    { key: 'visual', label: '可视化 Schema', children: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? <NodeEditor schema={parsed} onChange={update} /> : <Alert type="error" title="Schema JSON 无效，请在 JSON 模式修复。" /> },
    { key: 'json', label: 'JSON（完整 Schema）', children: <><Input.TextArea aria-label="JSON Schema" rows={14} value={text} onChange={event => { const next = event.target.value; setText(next); try { const value = JSON.parse(next); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Schema 必须是对象'); setError(''); onChange(next); } catch (e) { setError(e.message); } }} />{error && <Alert type="error" title={error} />}</> }
  ]} /></div>;
}
