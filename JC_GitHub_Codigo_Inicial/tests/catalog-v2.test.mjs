import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.join(path.dirname(new URL(import.meta.url).pathname),'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/jc_catalog_preview.json'),'utf8'));
const migration=fs.readFileSync(path.join(root,'supabase/migrations/003_categories_and_full_catalog.sql'),'utf8');
test('Catálogo profesional conserva exactamente 337 SKU únicos, con JC operativo',()=>{
 assert.equal(catalog.length,337);
 assert.equal(new Set(catalog.map(p=>p.sku)).size,337);
 assert.equal(catalog.filter(p=>p.brand==='JC').length,134);
 assert(catalog.every(p=>!p.sku.includes('_SMD_')));
});
test('Rubros, subcategorías y grupos comerciales provienen de la lista',()=>{
 assert.equal(new Set(catalog.map(p=>p.department)).size,7);
 assert.equal(new Set(catalog.map(p=>p.family)).size,31);
 assert.match(migration,/create table if not exists public\.jc_categories/);
 assert.match(migration,/category_id uuid references public\.jc_categories/);
 const groupCount=(migration.match(/insert into public\.jc_groups\(slug,title,brand,family,sort_order,published\)/g)||[]).length;
 assert.equal(groupCount,76); // se agregan a los 6 grupos piloto
});
test('No se inventan stock ni precios y todos los grupos nuevos quedan ocultos',()=>{
 assert.match(migration,/false\) on conflict\(slug\) do nothing/);
 assert.doesNotMatch(migration,/update public\.jc_offers set price_cents/);
 assert.doesNotMatch(migration,/update public\.jc_stock set physical_base_qty/);
});
test('Vista pública V2 no expone costos de compra ni clientes',()=>{
 const view=migration.split('create or replace view public.public_storefront as')[1].split('grant select on public.public_storefront')[0];
 assert.doesNotMatch(view,/purchase_cost_ars|buyer_email|buyer_phone|delivery_address|jc_orders/);
 assert.match(view,/department_slug/);
 assert.match(view,/category_slug/);
});
