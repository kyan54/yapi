'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const normalize=require('../client/containers/Project/Interface/InterfaceList/normalizeSchema');
test('strict Schema text retains intentional source formatting only in editor mode',()=>{
 const source='{\n    "type": "object",\n    "$defs": {"value": {"type": ["string", "null"]}},\n    "properties": {"value": {"$ref": "#/$defs/value"}}\n}\n';
 assert.equal(normalize(source,{preserveFormatting:true}),source);
 assert.equal(normalize(source),JSON.stringify(JSON.parse(source)));
});
test('editor formatting preference preserves historical implicit type and JSON5 normalization',()=>{
 assert.equal(normalize('{\n "properties": {}\n}',{preserveFormatting:true}),'{"properties":{},"type":"object"}');
 assert.equal(normalize("{type:'object',properties:{}}",{preserveFormatting:true}),'{"type":"object","properties":{}}');
 assert.equal(normalize('{"type":"OBJECT"}',{preserveFormatting:true}),'{"type":"object"}');
 assert.equal(normalize('{bad',{preserveFormatting:true}),false);
});
test('boolean source whitespace remains honest and invalid schema types remain rejected',()=>{
 assert.equal(normalize(' false\n',{preserveFormatting:true}),' false\n');
 assert.equal(normalize('/* legacy */ false',{preserveFormatting:true}),'false');
 assert.equal(normalize('{"type":["string","string"]}',{preserveFormatting:true}),false);
});
