'use strict';
// Test-only preload. Never imported by the production application or image.
const http=require('node:http'),os=require('node:os');
const version=process.env.PARITY_COLLECTIONS_VERSION,run=process.env.PARITY_COLLECTIONS_RUN;
if(!['old','new'].includes(version)||run!=='fastb1003')throw Error('collections identity preload requires explicit disposable run');
const emit=http.Server.prototype.emit;
http.Server.prototype.emit=function(event,req,res,...rest){
 if(event!=='request'||!req.url.startsWith('/__parity_collections_identity?'))return emit.call(this,event,req,res,...rest);
 (async()=>{
  const challenge=new URL(req.url,'http://localhost').searchParams.get('challenge');
  if(!/^[a-f0-9]{32}$/.test(challenge||''))throw Error('invalid identity challenge');
  const app=require('/app/vendor/server/yapi.js');
  const connection=require('/app/vendor/node_modules/mongoose').connection;
  if(connection.readyState!==1)throw Error('application database is not connected');
  const mark=await connection.db.collection('_ui_parity_fixture').findOne({_id:'yapi-ui-parity-v1'});
  if(!mark||mark.run!==run||mark.synthetic!==true||mark.state!=='seeded')throw Error('application database is not this synthetic run');
  const db=app.WEBCONFIG.db;
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  res.end(JSON.stringify({challenge,version,run,appHostname:os.hostname(),appPort:req.socket.localPort,configuredDatabase:db.DATABASE,configuredDbHost:db.servername,connectedDatabase:connection.name,marker:{_id:mark._id,database:mark.database,run:mark.run,synthetic:mark.synthetic,state:mark.state,fixtureSha256:mark.fixtureSha256}}));
 })().catch(()=>{res.statusCode=503;res.end('Disposable collections identity unavailable')});
 return true;
};
