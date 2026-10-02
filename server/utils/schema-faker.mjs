import {generateSync,define} from 'json-schema-faker';
import Mock from 'mockjs';
// Legacy YApi annotation: {mock: {mock: '@string'}}. No external resolver or I/O.
define('mock', value => Mock.mock(value && typeof value === 'object' ? value.mock : value));
export function normalizeLegacySchema(schema) {
  if(typeof schema==='boolean'||schema===null||typeof schema!=='object')return schema;
  const result={...schema};
  // Draft-04 boolean exclusivity differs from modern numeric bounds.
  for(const [exclusive,bound] of [['exclusiveMinimum','minimum'],['exclusiveMaximum','maximum']]) {
    if(typeof result[exclusive]==='boolean') {
      if(result[exclusive]&&typeof result[bound]==='number')result[exclusive]=result[bound];else delete result[exclusive];
    }
  }
  if(Array.isArray(result.items)) {result.prefixItems=result.items.map(normalizeLegacySchema);result.items=result.additionalItems===undefined?true:normalizeLegacySchema(result.additionalItems);delete result.additionalItems;}
  for(const key of ['properties','patternProperties','definitions','$defs','dependentSchemas'])if(result[key]&&typeof result[key]==='object'&&!Array.isArray(result[key]))result[key]=Object.fromEntries(Object.entries(result[key]).map(([name,item])=>[name,normalizeLegacySchema(item)]));
  for(const key of ['items','additionalProperties','contains','not','if','then','else'])if(result[key]!==undefined)result[key]=normalizeLegacySchema(result[key]);
  for(const key of ['allOf','anyOf','oneOf','prefixItems'])if(Array.isArray(result[key]))result[key]=result[key].map(normalizeLegacySchema);
  if(result.dependencies&&typeof result.dependencies==='object'){
    result.dependentRequired={...result.dependentRequired};result.dependentSchemas={...result.dependentSchemas};
    for(const [name,value]of Object.entries(result.dependencies)){if(Array.isArray(value))result.dependentRequired[name]=value;else result.dependentSchemas[name]=normalizeLegacySchema(value);}
    delete result.dependencies;
  }
  return result;
}
export function generate(schema, options = {}) {
  return generateSync(normalizeLegacySchema(schema), {...options,failOnInvalidTypes:false,failOnInvalidFormat:false,
    validateSchemaVersion:false,maxDepth:10,maxDefaultItems:10,
    seed:Math.floor(Math.random()*0x100000000)});
}
