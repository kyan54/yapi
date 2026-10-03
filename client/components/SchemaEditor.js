import React from 'react';
import PropTypes from 'prop-types';
import { Alert, AutoComplete, Button, Checkbox, Input, InputNumber, Modal, Radio, Select, Tabs } from 'antd-modern';

const mockOptions = 'string natural float character boolean url domain ip id guid now timestamp date time datetime image imageData color hex rgba rgb hsl integer email paragraph sentence word cparagraph ctitle title name cname cfirst clast first last csentence cword region province city county upper lower pick shuffle protocol'.split(' ').map(name => ({ value: '@' + name }));

const types = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const hasType = (schema, type) => isObject(schema) && (schema.type === type || (Array.isArray(schema.type) && schema.type.includes(type)) || (!schema.type && (type === 'object' ? isObject(schema.properties) : type === 'array' && schema.items !== undefined)));
const requiredNames = schema => Array.isArray(schema.required) ? schema.required : [];

export function parseSchema(text) {
  const value = JSON.parse(text);
  if (typeof value !== 'boolean' && !isObject(value)) throw new Error('Schema 必须是对象或布尔值');
  return value;
}

export function schemaFromExample(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    const variants = [...new Map(value.map(item => { const schema = schemaFromExample(item); return [JSON.stringify(schema), schema]; })).values()];
    return { type: 'array', items: variants.length > 1 ? { anyOf: variants } : variants[0] || {} };
  }
  if (typeof value === 'object') return { type: 'object', properties: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, schemaFromExample(item)])) };
  return { type: typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value };
}

// Match the legacy require-all traversal: properties and items, not arbitrary
// objects in defaults, examples, extension keywords, definitions or composition.
export function setAllRequired(schema, checked) {
  if (!isObject(schema)) return schema;
  const next = { ...schema };
  if (hasType(schema, 'object')) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    if (checked) next.required = Object.keys(properties);
    else delete next.required;
    if (isObject(schema.properties)) next.properties = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, setAllRequired(value, checked)]));
  }
  if (hasType(schema, 'array') && schema.items !== undefined) {
    next.items = Array.isArray(schema.items) ? schema.items.map(item => setAllRequired(item, checked)) : setAllRequired(schema.items, checked);
  }
  return next;
}

function allRequiredState(schema) {
  let total = 0, selected = 0;
  const visit = node => {
    if (!isObject(node)) return;
    if (hasType(node, 'object')) {
      const properties = isObject(node.properties) ? node.properties : {};
      const names = Object.keys(properties);
      total += names.length || 1;
      selected += names.length ? names.filter(name => requiredNames(node).includes(name)).length : Number(Array.isArray(node.required));
      Object.values(properties).forEach(visit);
    }
    if (hasType(node, 'array')) (Array.isArray(node.items) ? node.items : [node.items]).forEach(visit);
  };
  visit(schema);
  return { checked: total > 0 && selected === total, indeterminate: selected > 0 && selected < total };
}

function mockText(schema) {
  const value = isObject(schema.mock) ? schema.mock.mock : schema.mock;
  return value == null ? '' : String(value);
}

function mockValue(schema, value) {
  // Legacy YApi uses an empty string for a cleared Mock. Preserve extensions in
  // existing Mock objects even when their expression is cleared.
  if (isObject(schema.mock) && (value || Object.keys(schema.mock).some(key => key !== 'mock'))) return { ...schema.mock, mock: value };
  return value ? { mock: value } : '';
}

function EnumField({ schema, onChange, onError }) {
  const formatted = Array.isArray(schema.enum) ? schema.enum.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join('\n') : '';
  const [draft, setDraft] = React.useState(formatted);
  React.useEffect(() => { setDraft(formatted); onError(''); }, [formatted]);
  return <React.Fragment><Checkbox checked={Array.isArray(schema.enum)} onChange={event => { onError(''); onChange(event.target.checked ? [] : undefined); }}>枚举</Checkbox>
    {Array.isArray(schema.enum) && <Input.TextArea aria-label="枚举值（每行一个）" value={draft} onChange={event => {
      const value = event.target.value; setDraft(value);
      try {
        const values = value === '' ? [] : value.split('\n').map(line => {
          if (hasType(schema, 'string')) return line;
          const parsed = JSON.parse(line);
          if (hasType(schema, 'integer') ? !Number.isInteger(parsed) : hasType(schema, 'number') ? typeof parsed !== 'number' : hasType(schema, 'boolean') ? typeof parsed !== 'boolean' : false) throw new Error('枚举值必须匹配字段类型');
          return parsed;
        });
        onChange(values); onError('');
      } catch (_) { onError('枚举值必须匹配字段类型；每行一个有效值。'); }
    }} />}</React.Fragment>;
}
EnumField.propTypes = { schema: PropTypes.object.isRequired, onChange: PropTypes.func.isRequired, onError: PropTypes.func.isRequired };

function AdvancedFields({ text, onChange, onError }) {
  let schema;
  try { schema = parseSchema(text); } catch (_) { return null; }
  if (!isObject(schema)) return null;
  const change = (key, value) => {
    const next = { ...schema };
    if (value === undefined || value === null) delete next[key]; else next[key] = value;
    onChange(JSON.stringify(next, null, 2));
  };
  const number = (key, label, nonnegative = false) => <label key={key}>{label}<InputNumber aria-label={label} min={nonnegative ? 0 : undefined} value={schema[key]} onChange={value => change(key, value)} /></label>;
  const numeric = hasType(schema, 'integer') || hasType(schema, 'number');
  const string = hasType(schema, 'string');
  const array = hasType(schema, 'array');
  const object = hasType(schema, 'object');
  return <div className="schema-advanced-fields">
    <h4>基础设置</h4>
    {(numeric || string || hasType(schema, 'boolean')) && <label>默认值{numeric ? <InputNumber aria-label="默认值" value={schema.default} onChange={value => change('default', value)} /> : hasType(schema, 'boolean') ? <Select aria-label="默认值" allowClear value={schema.default} options={[{value:true,label:'true'},{value:false,label:'false'}]} onChange={value => change('default', value)} /> : <Input aria-label="默认值" value={schema.default === undefined ? '' : schema.default} onChange={event => change('default', event.target.value)} />}</label>}
    {numeric && <React.Fragment>{number('minimum', '最小值')}{number('maximum', '最大值')}<Checkbox checked={schema.exclusiveMinimum === true} onChange={event => change('exclusiveMinimum', event.target.checked)}>exclusiveMinimum</Checkbox><Checkbox checked={schema.exclusiveMaximum === true} onChange={event => change('exclusiveMaximum', event.target.checked)}>exclusiveMaximum</Checkbox>{number('multipleOf', 'multipleOf')}</React.Fragment>}
    {string && <React.Fragment>{number('minLength', '最小长度', true)}{number('maxLength', '最大长度', true)}<label>Pattern<Input aria-label="Pattern" value={schema.pattern || ''} onChange={event => change('pattern', event.target.value)} /></label><label>format<Select aria-label="format" allowClear value={schema.format} options={['date-time','date','time','email','hostname','ipv4','ipv6','uri','uuid','regex'].map(value => ({value}))} onChange={value => change('format', value)} /></label></React.Fragment>}
    {array && <React.Fragment>{number('minItems', '最小元素个数', true)}{number('maxItems', '最大元素个数', true)}<Checkbox checked={schema.uniqueItems === true} onChange={event => change('uniqueItems', event.target.checked)}>uniqueItems</Checkbox></React.Fragment>}
    {object && <React.Fragment>{number('minProperties', '最小属性个数', true)}{number('maxProperties', '最大属性个数', true)}<Checkbox checked={schema.additionalProperties !== false} onChange={event => change('additionalProperties', event.target.checked)}>additionalProperties</Checkbox></React.Fragment>}
    {(numeric || string || hasType(schema, 'boolean')) && <EnumField schema={schema} onChange={value => change('enum', value)} onError={onError} />}
    <label>备注<Input.TextArea aria-label="枚举备注" value={schema.enumDesc || ''} onChange={event => change('enumDesc', event.target.value)} /></label>
    <h4>编辑源码</h4>
  </div>;
}
AdvancedFields.propTypes = { text: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, onError: PropTypes.func.isRequired };

function NodeEditor({ schema, onChange, depth = 0, label = '根节点', name, onRename, required, onRequired, onDelete }) {
  const [collapsed, setCollapsed] = React.useState(depth > 4);
  const [nameDraft, setNameDraft] = React.useState(name || '');
  const [nameError, setNameError] = React.useState('');
  const [editor, setEditor] = React.useState(null);
  const [enumError, setEnumError] = React.useState('');
  React.useEffect(() => { setNameDraft(name || ''); setNameError(''); }, [name]);
  // Never apply a draft captured from an older externally replaced subtree.
  React.useEffect(() => { setEditor(null); }, [schema]);
  const object = isObject(schema);
  const objectType = hasType(schema, 'object');
  const arrayType = hasType(schema, 'array');
  const expandable = objectType || arrayType;
  const properties = object && isObject(schema.properties) ? schema.properties : {};
  const patch = changes => onChange({ ...schema, ...changes });
  const rename = (oldName, nextName) => {
    if (!nextName.trim()) return '字段名称不能为空，已恢复原名称。';
    if (nextName === oldName) return '';
    if (Object.prototype.hasOwnProperty.call(properties, nextName)) return `字段 ${nextName} 已存在，已恢复原名称。`;
    const next = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key === oldName ? nextName : key, value]));
    patch({ properties: next, ...(Array.isArray(schema.required) ? { required: schema.required.map(key => key === oldName ? nextName : key) } : {}) });
    return '';
  };
  const commitName = value => {
    const error = onRename(value);
    setNameError(error);
    if (error) setNameDraft(name);
  };
  const add = () => {
    let index = 1;
    while (Object.prototype.hasOwnProperty.call(properties, `field${index}`)) index++;
    patch({ properties: { ...properties, [`field${index}`]: { type: 'string', description: '' } } });
    setCollapsed(false);
  };
  const openEditor = kind => { setEnumError(''); setEditor({ kind, text: kind === 'advanced' ? JSON.stringify(schema, null, 2) : kind === 'mock' ? mockText(schema) : schema[kind] || '', error: '' }); };
  const saveEditor = () => {
    if (editor.error || enumError) return;
    try {
      if (editor.kind === 'advanced') onChange(parseSchema(editor.text));
      else patch({ [editor.kind]: editor.kind === 'mock' ? mockValue(schema, editor.text) : editor.text });
      setEditor(null);
    } catch (error) { setEditor({ ...editor, error: error.message }); }
  };
  const type = object && typeof schema.type === 'string' ? schema.type : '__custom__';
  const customType = object ? Array.isArray(schema.type) ? schema.type.join(' | ') : '未指定' : `Schema ${String(schema)}`;
  const mockDisabled = !object || expandable;
  const allRequired = depth === 0 ? allRequiredState(schema) : null;
  const modalLabel = editor && (editor.kind === 'advanced' ? '高级设置' : editor.kind === 'mock' ? 'Mock' : editor.kind === 'title' ? '标题' : '描述');
  return <div className="schema-node">
    <div className="schema-node-row" style={{ paddingLeft: depth * 18 }}>
      {expandable ? <Button type="text" aria-label={`${collapsed ? '展开' : '折叠'} ${label}`} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '▸' : '▾'}</Button> : <span />}
      {onRename ? <Input aria-label={`字段 ${name} 名称`} value={nameDraft} status={nameError ? 'error' : undefined} onChange={event => { setNameDraft(event.target.value); setNameError(''); }} onBlur={event => commitName(event.target.value)} onPressEnter={event => event.target.blur()} onKeyDown={event => { if (event.key === 'Escape') { setNameDraft(name); setNameError(''); } }} /> : <Input aria-label={`${label} 名称`} value={depth === 0 ? 'root' : label} disabled />}
      {depth === 0 ? <Checkbox aria-label="全部字段必填" title="全部字段必填" {...allRequired} disabled={!expandable} onChange={event => onChange(setAllRequired(schema, event.target.checked))} /> : <Checkbox aria-label={`${label} 必填`} checked={!!required} disabled={!onRequired} onChange={event => onRequired(event.target.checked)} />}
      <Select aria-label={`${label} 类型`} value={type} disabled={!object} options={[...(type === '__custom__' ? [{ value: '__custom__', label: customType, disabled: true }] : []), ...types.map(value => ({ value }))]} onChange={value => patch({ type: value })} />
      <div className="schema-node-input-editor">
        <AutoComplete disabled={mockDisabled} value={object ? mockText(schema) : ''} options={mockOptions} filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())} onChange={value => patch({ mock: mockValue(schema, value) })}><Input aria-label={`${label} Mock`} placeholder="mock" /></AutoComplete>
        <Button type="text" disabled={mockDisabled} aria-label={`编辑 ${label} Mock`} onClick={() => openEditor('mock')}>✎</Button>
      </div>
      <div className="schema-node-input-editor">
        <Input aria-label={`${label} 标题`} placeholder="Title" disabled={!object} value={object ? schema.title || '' : ''} onChange={event => patch({ title: event.target.value })} />
        <Button type="text" disabled={!object} aria-label={`编辑 ${label} 标题`} onClick={() => openEditor('title')}>✎</Button>
      </div>
      <div className="schema-node-input-editor">
        <Input aria-label={`${label} 描述`} placeholder="description" disabled={!object} value={object ? schema.description || '' : ''} onChange={event => patch({ description: event.target.value })} />
        <Button type="text" disabled={!object} aria-label={`编辑 ${label} 描述`} onClick={() => openEditor('description')}>✎</Button>
      </div>
      <div className="schema-node-actions">
        <Button type="text" aria-label={`高级设置 ${label}`} onClick={() => openEditor('advanced')}>⚙</Button>
        {objectType && <Button type="text" aria-label={`添加字段 ${label}`} onClick={add}>＋</Button>}
        {onDelete && <Button type="text" danger aria-label={`删除字段 ${label}`} onClick={onDelete}>×</Button>}
      </div>
    </div>
    {nameError && <Alert type="error" title={nameError} />}
    {!object && <Alert type="info" title={`${label}: ${String(schema)}`} description="此 Schema 值可在高级设置或 JSON 模式编辑，原始语义完整保留。" />}
    {!collapsed && objectType && Object.entries(properties).map(([childName, child]) => <NodeEditor key={childName} label={childName} name={childName} depth={depth + 1} schema={child}
      required={requiredNames(schema).includes(childName)} onRequired={checked => patch({ required: checked ? [...new Set([...requiredNames(schema), childName])] : requiredNames(schema).filter(key => key !== childName) })}
      onRename={value => rename(childName, value)} onDelete={() => { const next = { ...properties }; delete next[childName]; patch({ properties: next, ...(Array.isArray(schema.required) ? { required: schema.required.filter(key => key !== childName) } : {}) }); }}
      onChange={next => patch({ properties: { ...properties, [childName]: next } })} />)}
    {!collapsed && arrayType && (Array.isArray(schema.items) ? <React.Fragment>
      {schema.items.map((item, index) => <NodeEditor key={index} label={`数组元素 ${index + 1}`} depth={depth + 1} schema={item}
        onDelete={() => patch({ items: schema.items.filter((_, position) => position !== index) })}
        onChange={next => patch({ items: schema.items.map((value, position) => position === index ? next : value) })} />)}
      <Button onClick={() => patch({ items: [...schema.items, { type: 'string' }] })}>添加数组元素</Button>
    </React.Fragment> : <NodeEditor label="数组元素" depth={depth + 1} schema={schema.items === undefined ? { type: 'string' } : schema.items} onChange={items => patch({ items })} />)}
    {editor && <Modal title={`${label} ${modalLabel}`} open mask={{ closable: false }} width={editor.kind === 'advanced' ? 780 : 520} okText="应用" okButtonProps={{ disabled: !!(editor.error || enumError) }} cancelText="取消" onCancel={() => setEditor(null)} onOk={saveEditor}>
      <p>应用后更新当前节点；保存接口后生效。</p>
      {editor.kind === 'advanced' && <AdvancedFields onError={setEnumError} text={editor.text} onChange={text => setEditor({ ...editor, text, error: '' })} />}
      <Input.TextArea aria-label={`${label} ${modalLabel}内容`} rows={editor.kind === 'advanced' ? 14 : 6} value={editor.text} onChange={event => setEditor({ ...editor, text: event.target.value, error: '' })} />
      {(editor.error || enumError) && <Alert type="error" title={editor.error || enumError} />}
    </Modal>}
  </div>;
}

export default function SchemaEditor({ data, onChange, onValidityChange }) {
  const input = data === '' || data == null ? JSON.stringify({ type: 'object', properties: {} }, null, 2) : typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const [text, setText] = React.useState(input);
  const [error, setError] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const [importText, setImportText] = React.useState('');
  const [importKind, setImportKind] = React.useState('example');
  const [importError, setImportError] = React.useState('');
  React.useEffect(() => { setText(input); setError(''); }, [input]);
  const parsed = React.useMemo(() => { try { return { value: parseSchema(text), valid: true }; } catch (_) { return { valid: false }; } }, [text]);
  React.useEffect(() => { if (onValidityChange) onValidityChange(parsed.valid); }, [parsed.valid, onValidityChange]);
  const update = value => { const next = JSON.stringify(value, null, 2); setText(next); setError(''); onChange(next); };
  return <div className="schema-editor-modern">
    <Button type="primary" onClick={() => { setImportOpen(true); setImportText(''); setImportError(''); }}>导入 JSON</Button>
    <Tabs items={[
      { key: 'visual', label: '可视化 Schema', children: parsed.valid ? <div className="schema-tree-scroll"><NodeEditor schema={parsed.value} onChange={update} /></div> : <Alert type="error" title="Schema JSON 无效，请在 JSON 模式修复。" /> },
      { key: 'json', label: 'JSON（完整 Schema）', children: <React.Fragment><Input.TextArea aria-label="JSON Schema" rows={14} value={text} onChange={event => { const next = event.target.value; setText(next); try { parseSchema(next); setError(''); onChange(next); } catch (e) { setError(e.message); } }} />{error && <Alert type="error" title={error} />}</React.Fragment> }
    ]} />
    <Modal title="导入 JSON" open={importOpen} mask={{ closable: false }} onCancel={() => setImportOpen(false)} okText="导入并替换" cancelText="取消" onOk={() => {
      try { const value = importKind === 'schema' ? parseSchema(importText) : JSON.parse(importText); update(importKind === 'example' ? schemaFromExample(value) : value); setImportOpen(false); } catch (e) { setImportError(e.message); }
    }}>
      <p>导入将替换当前 Schema；保存接口后生效。</p>
      <Radio.Group value={importKind} onChange={event => { setImportKind(event.target.value); setImportError(''); }} options={[{label:'JSON 示例',value:'example'},{label:'JSON Schema',value:'schema'}]} />
      <Input.TextArea aria-label="导入 JSON 内容" rows={10} value={importText} onChange={event => { setImportText(event.target.value); setImportError(''); }} />
      {importError && <Alert type="error" title={importError} />}
    </Modal>
  </div>;
}

NodeEditor.propTypes = {
  schema: PropTypes.any,
  onChange: PropTypes.func.isRequired,
  depth: PropTypes.number,
  label: PropTypes.string,
  name: PropTypes.string,
  onRename: PropTypes.func,
  required: PropTypes.bool,
  onRequired: PropTypes.func,
  onDelete: PropTypes.func
};
SchemaEditor.propTypes = {
  data: PropTypes.oneOfType([PropTypes.string, PropTypes.object, PropTypes.bool]),
  onChange: PropTypes.func.isRequired,
  onValidityChange: PropTypes.func
};
