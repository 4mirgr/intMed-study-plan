import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../docs/',import.meta.url),html=fs.readFileSync(new URL('index.html',root),'utf8');
let count=0;
for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)){
 const src=/\bsrc=["']([^"']+)["']/.exec(match[1]);
 const file=src?src[1].split('?')[0]:'index.html#inline';
 const code=src?fs.readFileSync(new URL(file,root),'utf8'):match[2];
 new vm.Script(code,{filename:file});count++;
}
if(!count)throw Error('No application scripts');
console.log(`JavaScript syntax passed (${count} inline/external scripts).`);
