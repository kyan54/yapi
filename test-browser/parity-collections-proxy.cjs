'use strict';
const http=require('node:http'),net=require('node:net');
const version=process.env.PARITY_COLLECTIONS_VERSION,run=process.env.PARITY_COLLECTIONS_RUN;
if(!['old','new'].includes(version)||run!=='fastb1003')throw Error('collections proxy requires explicit disposable run');
const host='parity-fast-collections-'+version+'-web',port=version==='old'?4186:4187;
const server=http.createServer((req,res)=>{const upstream=http.request({host,port:3000,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,{...reply.headers,'x-parity-collections-proxy':'parity-fast-collections-'+version+'-proxy','x-parity-collections-upstream':host});reply.pipe(res)});upstream.on('error',()=>{res.writeHead(502);res.end('Unavailable')});req.pipe(upstream)});
server.on('upgrade',(req,socket,head)=>{const upstream=net.connect(3000,host,()=>{upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`+Object.entries(req.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket)});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());});
server.listen(port,'0.0.0.0');
