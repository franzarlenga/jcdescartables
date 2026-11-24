import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=f=>readFileSync(new URL(f,root),'utf8');
test('Inicio V3 preserva tienda y catálogo',()=>{
 const s=read('components/store.tsx');
 for(const x of ['jc-home-hero','jc-home-feature','jc-home-lines','jc-home-sector-grid','jc-home-wholesale','jc-home-faq','jc-catalog-v2','jc-cart-drawer'])assert.ok(s.includes(x),`Falta ${x}`);
});
test('Este paquete público no expone módulo Gestión; el contenido de home se protege con RLS',()=>{
 const storefront=read('components/store.tsx'),sql=read('supabase/migrations/004_home_content.sql');
 assert.equal(existsSync(new URL('app/admin/page.tsx',root)),false);
 assert.equal(storefront.includes('href="/admin"'),false);
 assert.ok(sql.includes('jc_is_admin()'));
});
test('Publicaciones siguen sin inventar precios ni stock',()=>{
 const sql=read('supabase/migrations/003_categories_and_full_catalog.sql');
 assert.ok(sql.includes('create table if not exists public.jc_categories'));
 assert.ok(read('app/page.tsx').includes("from('public_storefront')"));
});
