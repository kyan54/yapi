'use strict';
// Separate process: no legacy startup, migrations, repairs, scripts or keys.
// Local stdio authentication belongs to the OS/MCP host. This is not an HTTP
// endpoint and must not be bridged to a network without separate authentication.
const mongoose = require('mongoose');
const {serveStdio} = require('@modelcontextprotocol/server/stdio');
const {createDocumentationMcp} = require('./server');
const {createReadService,numericId} = require('../services/documentation/read-service');
const {createAccess,readAdapter} = require('../services/documentation/access');
const {createDiscovery} = require('../services/documentation/discovery');
async function main() {
  const uri=process.env.YAPI_MCP_MONGO_URI;
  if(!uri) throw Error('YAPI_MCP_MONGO_URI_REQUIRED');
  const userId=numericId(Number(process.env.YAPI_MCP_USER_ID));
  const projects=(process.env.YAPI_MCP_PROJECT_IDS || '').split(',').map(value=>numericId(Number(value)));
  // Provision a least-privilege existing read-only Mongo credential separately.
  // This process never creates users/tokens or automatically installs indexes.
  await mongoose.connect(uri,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});
  const db=mongoose.connection.db;
  const principal=Object.freeze({userId,projects,scopes:['docs.read']});
  const authorize=createAccess({db});
  const readService=createReadService({interfaces:readAdapter(db.collection('interface')),authorize});
  const discovery=createDiscovery({db,authorize});
  const handle=serveStdio(()=>createDocumentationMcp({readService,principal,discovery}));
  process.once('SIGTERM',async()=>{await mongoose.disconnect();process.exit(0);});
  process.once('SIGINT',async()=>{await mongoose.disconnect();process.exit(0);});
  process.stdin.once('end',async()=>{await mongoose.disconnect();});
  return handle;
}
if(require.main===module) main().catch(()=>{console.error('YApi read-only MCP startup failed; verify scoped configuration and DB availability.');process.exitCode=1;});
module.exports={main};
