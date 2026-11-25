import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Tienda y ERP utilizan un logo oficial común y fallback si falta el archivo',()=>{
 const shop=read('../components/store.tsx');
 const admin=read('../app/gestion/page.tsx');
 const logo=read('../components/jc-brand.tsx');
 assert.match(shop,/<JcBrand \/>/);
 assert.match(shop,/<JcBrand mode="dark" \/>/);
 assert.match(admin,/<JcBrand mode="dark"\/>/);
 assert.match(admin,/<JcBrand \/>/);
 assert.match(logo,/src="\/jc-logo\.png"/);
 assert.match(logo,/onError=\{\(\)=>setImageReady\(false\)\}/);
});
test('favicon de ambas rutas apuntan al logo de dominio compartido',()=>{
 const meta=read('../app/layout.tsx');
 assert.match(meta,/icons: \{icon:/);
 assert.match(meta,/\/jc-logo\.png/);
});
