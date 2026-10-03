/** Bridge the original YApi extension API to Ant Design 6, without shipping AntD 3. */
import React from 'react';
import * as Ant from 'antd-modern';
import * as Icons from '@ant-design/icons';
export * from 'antd-modern';

const iconAliases = { 'check-circle-o': 'CheckCircleOutlined', 'close-circle-o': 'CloseCircleOutlined', 'question-circle-o': 'QuestionCircleOutlined', 'info-circle-o': 'InfoCircleOutlined', 'exclamation-circle-o': 'ExclamationCircleOutlined', 'plus-circle-o': 'PlusCircleOutlined', 'minus-circle-o': 'MinusCircleOutlined', 'file-text': 'FileTextOutlined', 'loading': 'LoadingOutlined', 'logout': 'LogoutOutlined', 'github': 'GithubOutlined', 'down-square-o': 'DownSquareOutlined', 'up-square-o': 'UpSquareOutlined' };
export function Icon({ type = 'question-circle', theme, ...props }) {
  const name = iconAliases[type] || type.replace(/-o$/, '').replace(/(^|-)(\w)/g, (_, dash, letter) => letter.toUpperCase()) + (theme === 'filled' ? 'Filled' : 'Outlined');
  const Component = Icons[name] || Icons.QuestionCircleOutlined;
  return <Component {...props} />;
}
export const LocaleProvider = Ant.ConfigProvider;
const FormContext = React.createContext(null);
const fieldPath = value => Array.isArray(value) ? value : String(value).replace(/\[(\d+)\]/g, '.$1').split('.').map(part => /^\d+$/.test(part) ? Number(part) : part);
export function Form({ onSubmit, form, children, ...props }) {
  const context = React.useContext(FormContext);
  return <Ant.Form {...props} form={form || (context && context.instance)} onSubmitCapture={onSubmit ? event => { event.preventDefault(); event.stopPropagation(); onSubmit(event); } : undefined} onValuesChange={context && context.onValuesChange}>{children}</Ant.Form>;
}
Form.Item = Ant.Form.Item;
Form.useForm = Ant.Form.useForm;
Form.create = (options = {}) => Wrapped => {
  function CompatibleForm(props) {
    const [instance] = Ant.Form.useForm();
    const [, redraw] = React.useReducer(n => n + 1, 0);
    const initial = React.useRef({});
    const facade = React.useMemo(() => ({
      getFieldDecorator: (name, settings = {}) => element => {
        const path = fieldPath(name);
        const key = JSON.stringify(path);
        if (Object.prototype.hasOwnProperty.call(settings, 'initialValue') && !Object.prototype.hasOwnProperty.call(initial.current, key)) {
          initial.current[key] = settings.initialValue;
        }
        const rules = (settings.rules || []).map(rule => {
          if (!rule.validator || rule.validator.length < 3) return rule;
          return { ...rule, validator: (r, value) => new Promise((resolve, reject) => rule.validator(r, value, error => error ? reject(new Error(Array.isArray(error) ? error.join(', ') : error)) : resolve())) };
        });
        return <Ant.Form.Item key={key} name={path} noStyle initialValue={initial.current[key]} valuePropName={settings.valuePropName} getValueFromEvent={settings.getValueFromEvent} normalize={settings.normalize} trigger={settings.trigger} validateTrigger={settings.validateTrigger} rules={rules}>{element}</Ant.Form.Item>;
      },
      getFieldValue: name => { const value = instance.getFieldValue(fieldPath(name)); return value === undefined ? initial.current[JSON.stringify(fieldPath(name))] : value; },
      getFieldsValue: names => instance.getFieldsValue(names ? names.map(fieldPath) : true),
      getFieldError: name => instance.getFieldError(fieldPath(name)),
      getFieldsError: names => instance.getFieldsError(names && names.map(fieldPath)),
      isFieldTouched: name => instance.isFieldTouched(fieldPath(name)),
      isFieldsTouched: names => instance.isFieldsTouched(names && names.map(fieldPath)),
      isFieldValidating: name => instance.isFieldValidating(fieldPath(name)),
      setFieldsValue: values => { instance.setFieldsValue(values); redraw(); },
      resetFields: names => { instance.resetFields(names && names.map(fieldPath)); redraw(); },
      setFields: fields => instance.setFields(Object.keys(fields).map(name => ({ name: fieldPath(name), ...fields[name] }))),
      validateFields: (...args) => {
        const callback = args.find(arg => typeof arg === 'function');
        const names = args.find(Array.isArray);
        const promise = instance.validateFields(names && names.map(fieldPath));
        if (callback) { promise.then(values => callback(null, values), error => callback(error.errorFields, error.values)); return; }
        return promise;
      },
      validateFieldsAndScroll: (...args) => facade.validateFields(...args)
    }), [instance]);
    const onValuesChange = (changed, values) => { redraw(); if (options.onValuesChange) options.onValuesChange(props, changed, values); };
    React.useEffect(() => { if (props.ref) { if (typeof props.ref === 'function') props.ref({ ...facade, props: { ...props, form: facade }, form: facade }); else props.ref.current = { ...facade, form: facade }; } }, [props.ref, facade]);
    React.useEffect(() => { redraw(); }, []);
    return <FormContext.Provider value={{ instance, onValuesChange }}><Wrapped {...props} ref={props.wrappedComponentRef} form={{ ...facade }} /></FormContext.Provider>;
  }
  CompatibleForm.displayName = `Form(${Wrapped.displayName || Wrapped.name || 'Component'})`;
  return CompatibleForm;
};
export const Button = React.forwardRef(({ icon, type, ...props }, ref) => <Ant.Button {...props} ref={ref} danger={type === 'danger' || props.danger} type={type === 'danger' ? 'default' : type} icon={typeof icon === 'string' ? (icon ? <Icon type={icon} /> : undefined) : icon} />);
Button.Group = ({ children, ...props }) => <Ant.Space.Compact {...props}>{children}</Ant.Space.Compact>;
export const Input = React.forwardRef(({ type, autosize, ...props }, ref) => type === 'textarea' ? <Ant.Input.TextArea {...props} ref={ref} autoSize={autosize} /> : <Ant.Input {...props} type={type} ref={ref} />);
Input.TextArea = React.forwardRef(({ autosize, ...props }, ref) => <Ant.Input.TextArea {...props} ref={ref} autoSize={props.autoSize || autosize} />);
Input.Search = Ant.Input.Search;
Input.Password = Ant.Input.Password;
Input.Group = ({ compact, children, ...props }) => compact ? <Ant.Space.Compact {...props}>{children}</Ant.Space.Compact> : <div {...props}>{children}</div>;
function overlay(Component) {
  return React.forwardRef(({ visible, onVisibleChange, ...props }, ref) => <Component {...props} ref={ref} open={props.open === undefined ? visible : props.open} onOpenChange={props.onOpenChange || onVisibleChange} />);
}
export const Modal = overlay(Ant.Modal);
for (const method of ['info', 'success', 'error', 'warning', 'warn', 'confirm', 'destroyAll', 'useModal']) Modal[method] = Ant.Modal[method];
export const Tooltip = overlay(Ant.Tooltip);
export const Popover = overlay(Ant.Popover);
export const Popconfirm = overlay(Ant.Popconfirm);
export const Dropdown = React.forwardRef(({ overlay: content, visible, onVisibleChange, ...props }, ref) => <Ant.Dropdown {...props} ref={ref} open={props.open === undefined ? visible : props.open} onOpenChange={props.onOpenChange || onVisibleChange} popupRender={content ? () => typeof content === 'function' ? content() : content : props.popupRender} />);
Dropdown.Button = Ant.Dropdown.Button;
export function Tabs({ children, ...props }) {
  const items = props.items || React.Children.toArray(children).filter(React.isValidElement).map(child => ({ key: String(child.key).replace(/^.*\$/, ''), label: child.props.tab, children: child.props.children, ...child.props }));
  return <Ant.Tabs {...props} items={items} />;
}
Tabs.TabPane = () => null;
export function Collapse({ children, ...props }) {
  const items = props.items || React.Children.toArray(children).filter(React.isValidElement).map(child => ({ ...child.props, key: String(child.key).replace(/^.*\$/, ''), label: child.props.header, children: child.props.children }));
  return <Ant.Collapse {...props} items={items} />;
}
Collapse.Panel = () => null;
export function Timeline({ children, ...props }) {
  return <Ant.Timeline {...props} items={props.items || React.Children.toArray(children).filter(React.isValidElement).map(child => ({ ...child.props, content: child.props.children }))} />;
}
Timeline.Item = () => null;
const legacyOption = option => option ? { ...option, props: { ...option, children: option.label === undefined ? (option.children === undefined ? option.value : option.children) : option.label } } : option;
const selectCallbacks = props => ({ ...props, onSelect: props.onSelect ? (value, option) => props.onSelect(value, legacyOption(option)) : undefined, filterOption: typeof props.filterOption === 'function' ? (input, option) => props.filterOption(input, legacyOption(option)) : props.filterOption });
export const Select = React.forwardRef((props, ref) => <Ant.Select {...selectCallbacks(props)} ref={ref} />);
Select.Option = Ant.Select.Option;
Select.OptGroup = Ant.Select.OptGroup;
export const AutoComplete = React.forwardRef(({ dataSource, ...props }, ref) => <Ant.AutoComplete {...selectCallbacks(props)} ref={ref} options={props.options || (dataSource || []).map(item => typeof item === 'string' ? { value: item } : React.isValidElement(item) ? { ...item.props, value: item.props.value === undefined ? item.key : item.props.value, label: item.props.children } : item)} />);
AutoComplete.Option = Ant.Select.Option;
AutoComplete.OptGroup = Ant.Select.OptGroup;
export function Table({ onRowClick, onRow, ...props }) { return <Ant.Table {...props} onRow={(record, index) => ({ ...(onRow ? onRow(record, index) : {}), ...(onRowClick ? { onClick: event => onRowClick(record, index, event) } : {}) })} />; }
Table.Column = Ant.Table.Column;
Table.ColumnGroup = Ant.Table.ColumnGroup;
export function Row({ type, ...props }) { return <Ant.Row {...props} />; }
