const http=require('node:http');
const name='parity-fast-collections-echo',run='fastb1003';
http.createServer((req,res)=>{
 const u=new URL(req.url,'http://synthetic.invalid');
 if(u.pathname==='/fixture-identity'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({fixture:name,run}));}
 const origin=req.headers.origin;
 if(origin && /^http:\/\/127\.0\.0\.1:418[67]$/.test(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Expose-Headers','X-Fixture-Result');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','content-type,x-parity-synthetic,x-fixture');}
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 if(req.headers['x-parity-synthetic']!==run){res.statusCode=403;return res.end('synthetic fixture required');}
 let body='';req.on('data',c=>{body+=c;if(body.length>1048576)req.destroy()});req.on('end',()=>{
  res.setHeader('X-Fixture-Result','synthetic');
  const value={fixture:name,method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams),body,contentType:req.headers['content-type']||'',header:req.headers['x-fixture']||''};
  if(u.searchParams.get('format')==='xml'){res.setHeader('Content-Type','application/xml');return res.end('<fixture>合成 XML</fixture>');}
  if(u.searchParams.get('format')==='text'){res.setHeader('Content-Type','text/plain');return res.end('Synthetic text 合成');}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
 });
}).listen(3001,'0.0.0.0');
