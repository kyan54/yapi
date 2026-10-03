import React from 'react';
import { Alert, Button, Checkbox, Input, Modal, Radio, Select, Tabs } from 'antd-modern';
const types = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
export function schemaFromExample(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    const variants = [...new Map(value.map(item => { const schema = schemaFromExample(item); return [JSON.stringify(schema), schema]; })).values()];
    return { type: 'array', items: variants.length > 1 ? { anyOf: variants } : variants[0] || {} };
  }
  if (typeof value === 'object') return { type: 'object', properties: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, schemaFromExample(item)])) };
  return { type: typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value };
}
function NodeEditor({ schema, onChange, depth = 0, label = '根节点', name, onRename, required, onRequired, onDelete }) {
  const [collapsed, setCollapsed] = React.useState(false);
  if (typeof schema === 'boolean' || !schema || typeof schema !== 'object') return <Alert type="info" title={`${label}: ${String(schema)}`} description="此 Schema 值请在 JSON 模式编辑，原始语义完整保留。" />;
  const type = schema.type || (schema.properties ? 'object' : 'string');
  const properties = schema.properties || {};
  const patch = changes => onChange({ ...schema, ...changes });
  const rename = (oldName, nextName) => {
    if (!nextName || nextName === oldName || Object.prototype.hasOwnProperty.call(properties, nextName)) return;
    const next = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key === oldName ? nextName : key, value]));
    patch({ properties: next, ...(schema.required ? { required: schema.required.map(key => key === oldName ? nextName : key) } : {}) });
  };
  const add = () => { let index = 1; while (Object.prototype.hasOwnProperty.call(properties, `field${index}`)) index++; patch({ properties: { ...properties, [`field${index}`]: { type: 'string', description: '' } } }); setCollapsed(false); };
  const expandable = type === 'object' || type === 'array';
  return <div className="schema-node">
    <div className="schema-node-row" style={{ paddingLeft: depth * 18 }}>
      {expandable ? <Button type="text" aria-label={`${collapsed ? '展开' : '折叠'} ${label}`} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸' : '▾'}</Button> : <span />}
      {onRename ? <Input aria-label={`字段 ${name} 名称`} defaultValue={name} onBlur={event => { onRename(event.target.value); }} onPressEnter={event => event.target.blur()} /> : <Input aria-label={`${label} 名称`} value={depth === 0 ? 'root' : label} disabled />}
      <Checkbox aria-label={`${label} 必填`} checked={!!required} disabled={!onRequired} onChange={event => onRequired(event.target.checked)} />
      <Select aria-label={`${label} 类型`} value={type} options={types.map(value => ({ value }))} onChange={value => patch({ type: value })} />
      <Input aria-label={`${label} Mock`} placeholder="mock" value={typeof schema.mock === 'object' ? schema.mock.mock || '' : schema.mock || ''} onChange={event => patch({ mock: { ...(typeof schema.mock === 'object' ? schema.mock : {}), mock: event.target.value } })} />
      <Input aria-label={`${label} 描述`} placeholder="description" value={schema.description || ''} onChange={event => patch({ description: event.target.value })} />
      <div className="schema-node-actions">
        {type === 'object' && <Button type="text" aria-label={`添加字段 ${label}`} onClick={add}>＋</Button>}
        {onDelete && <Button type="text" danger aria-label={`删除字段 ${label}`} onClick={onDelete}>×</Button>}
      </div>
    </div>
    {!collapsed && type === 'object' && Object.entries(properties).map(([childName, child]) => depth < 12 ? <NodeEditor key={childName} label={childName} name={childName} depth={depth + 1} schema={child}
      required={(schema.required || []).includes(childName)} onRequired={checked => patch({ required: checked ? [...new Set([...(schema.required || []), childName])] : (schema.required || []).filter(key => key !== childName) })}
      onRename={value => rename(childName, value)} onDelete={() => { const next = { ...properties }; delete next[childName]; patch({ properties: next, ...(schema.required ? { required: schema.required.filter(key => key !== childName) } : {}) }); }}
      onChange={next => patch({ properties: { ...properties, [childName]: next } })} /> : <Alert key={childName} title="更深层级请使用 JSON 编辑，内容将完整保留。" />)}
    {!collapsed && type === 'array' && depth < 12 && <NodeEditor label="数组元素" depth={depth + 1} schema={Array.isArray(schema.items) ? schema.items[0] || {} : schema.items || { type: 'string' }} onChange={items => patch({ items: Array.isArray(schema.items) ? [items, ...schema.items.slice(1)] : items })} />}
  </div>;
}
export default function SchemaEditor({ data, onChange, onValidityChange }) {
  const input = typeof data === 'string' ? data : JSON.stringify(data || { type: 'object', properties: {} }, null, 2);
  const [text, setText] = React.useState(input);
  const [error, setError] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const [importText, setImportText] = React.useState('');
  const [importKind, setImportKind] = React.useState('example');
  const [importError, setImportError] = React.useState('');
  React.useEffect(() => { setText(input); setError(''); }, [input]);
  let parsed; try { parsed = JSON.parse(text || '{}'); } catch (_) { parsed = null; }
  const valid = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  React.useEffect(() => { if (onValidityChange) onValidityChange(valid); }, [valid, onValidityChange]);
  const update = value => { const next = JSON.stringify(value, null, 2); setText(next); setError(''); onChange(next); };
  return <div className="schema-editor-modern">
    <Button type="primary" onClick={() => { setImportOpen(true); setImportText(''); setImportError(''); }}>导入 JSON</Button>
    <Tabs items={[
      { key: 'visual', label: '可视化 Schema', children: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? <div className="schema-tree-scroll"><NodeEditor schema={parsed} onChange={update} /></div> : <Alert type="error" title="Schema JSON 无效，请在 JSON 模式修复。" /> },
      { key: 'json', label: 'JSON（完整 Schema）', children: <><Input.TextArea aria-label="JSON Schema" rows={14} value={text} onChange={event => { const next = event.target.value; setText(next); try { const value = JSON.parse(next); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Schema 必须是对象'); setError(''); onChange(next); } catch (e) { setError(e.message); } }} />{error && <Alert type="error" title={error} />}</> }
    ]} />
    <Modal title="导入 JSON" open={importOpen} onCancel={() => setImportOpen(false)} okText="导入并替换" cancelText="取消" onOk={() => {
      try { const value = JSON.parse(importText); if (importKind === 'schema' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('Schema 必须是对象'); update(importKind === 'example' ? schemaFromExample(value) : value); setImportOpen(false); } catch (e) { setImportError(e.message); }
    }}>
      <p>导入将替换当前 Schema；保存接口后生效。</p>
      <Radio.Group value={importKind} onChange={event => setImportKind(event.target.value)} options={[{label:'JSON 示例',value:'example'},{label:'JSON Schema',value:'schema'}]} />
      <Input.TextArea aria-label="导入 JSON 内容" rows={10} value={importText} onChange={event => setImportText(event.target.value)} />
      {importError && <Alert type="error" title={importError} />}
    </Modal>
  </div>;
}
