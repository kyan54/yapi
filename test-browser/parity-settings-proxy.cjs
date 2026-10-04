'use strict';
const http=require('node:http'),net=require('node:net');
const version=process.env.PARITY_SETTINGS_VERSION,run=process.env.PARITY_SETTINGS_RUN;
if(!['old','new'].includes(version)||run!=='fast_settings')throw Error('settings proxy requires explicit disposable run');
const host='parity-fast-settings-'+version+'-web',port=version==='old'?4188:4189;
const server=http.createServer((req,res)=>{const upstream=http.request({host,port:3000,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,{...reply.headers,'x-parity-settings-proxy':'parity-fast-settings-'+version+'-proxy','x-parity-settings-upstream':host});reply.pipe(res)});upstream.on('error',()=>{res.writeHead(502);res.end('Unavailable')});req.pipe(upstream)});
server.on('upgrade',(req,socket,head)=>{const upstream=net.connect(3000,host,()=>{upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`+Object.entries(req.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket)});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());});
server.listen(port,'0.0.0.0');
