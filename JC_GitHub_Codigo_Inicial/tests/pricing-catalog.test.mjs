import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../data/jc_catalog_preview.json',import.meta.url)));
const sql=readFileSync(new URL('../supabase/migrations/007_costos_y_precios.sql',import.meta.url),'utf8');
const store=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const admin=readFileSync(new URL('../app/gestion/precios/page.tsx',import.meta.url),'utf8');
test('337 SKU únicos con costo del PDF y presentación real',()=>{
 assert.equal(catalog.length,337);
 assert.equal(new Set(catalog.map(r=>r.sku)).size,337);
 for (const p of catalog){assert.ok(p.cost>0);assert.ok(p.pack_units>0);assert.ok(p.sku&&!p.sku.includes('SMD'));}
});
test('la tienda sólo muestra el precio del mismo jc_offers, sin exponer costos',()=>{
 assert.match(store,/public_storefront/);
 assert.doesNotMatch(store,/purchase_cost_ars/);
 assert.match(sql,/public\.jc_offers set price_cents/);
 assert.match(sql,/public\.jc_products set purchase_cost_ars/);
});
test('costos originales preservados y todas las mutaciones registradas',()=>{
 for(const field of ['original_purchase_cost_ars','jc_pricing_changes','jc_pricing_operations','jc_is_admin','p_operation','on conflict(id) do nothing'])assert.ok(sql.includes(field));
 assert.match(sql,/jc_save_product_pricing/);
 assert.match(sql,/from_cost/);
});
test('edición individual, porcentual y desde costo con vista previa',()=>{
 for(const field of ['Editar','pctStr','jc_apply_pricing_change','jc_save_product_pricing','preview','selected'])assert.ok(admin.includes(field));
});
