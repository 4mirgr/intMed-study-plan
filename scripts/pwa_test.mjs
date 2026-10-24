import assert from 'node:assert/strict';import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync('docs/manifest.webmanifest','utf8')),index=fs.readFileSync('docs/index.html','utf8'),sw=fs.readFileSync('docs/sw.js','utf8');
assert.equal(manifest.lang,'fa');assert.equal(manifest.dir,'rtl');assert.equal(manifest.display,'standalone');assert.ok(manifest.start_url.startsWith('./'));
for(const icon of manifest.icons){const path='docs/'+icon.src;assert.ok(fs.existsSync(path),path);const bytes=fs.readFileSync(path);assert.equal(bytes.toString('hex',1,4),'504e47');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),expected=Number(icon.sizes.split('x')[0]);assert.equal(width,expected);assert.equal(height,expected);}
assert.match(index,/rel="manifest" href="manifest\.webmanifest"/);assert.match(index,/js\/intmed-pwa\.js/);assert.ok(fs.existsSync('docs/offline.html'));
assert.match(sw,/request\.method!==['"]GET['"]/);assert.match(sw,/url\.origin!==self\.location\.origin/);for(const marker of ['/auth/','/rest/','/functions/','/storage/','/messages/','/profile/','/entitlement/','intmed-content-inbox'])assert.ok(sw.includes(marker),marker);
const precache=sw.match(/const PRECACHE=\[([^;]+)\]/s)?.[1]||'';assert.ok(!/supabase|api\.drgerami|config\.js|message|profile|entitlement/i.test(precache));
console.log('PWA contract passed: Persian install manifest, valid icons, explicit offline page, public-only same-origin caching and private/API exclusions.');
