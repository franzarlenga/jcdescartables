import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const dir=path.join(path.dirname(new URL(import.meta.url).pathname),'..');
const schema=fs.readFileSync(path.join(dir,'supabase/migrations/001_jc_store.sql'),'utf8');
const seed=fs.readFileSync(path.join(dir,'supabase/migrations/002_seed_catalog.sql'),'utf8');
const raw=fs.readFileSync(path.join(dir,'data/ATLAS_Catalogo_Importacion.csv'),'utf8');
const lines=raw.trim().replace(/^\uFEFF/,'').split(/\r?\n/);
test('Se conservan los 337 SKU, sin referencias duplicadas',()=>{
 assert.equal(lines.length-1,337);
 const skus=lines.slice(1).map(s=>s.split(';')[0].replace('_SMD_','_JC_'));
 assert.equal(new Set(skus).size,337);
 assert(skus.includes('ARR_ROL_2535'));
 assert(skus.includes('BAN_JC_615'));
});
test('Se importan costos internos sin asignar precio de venta, stock ni publicación',()=>{
 assert.match(seed,/on conflict\(sku\) do nothing/i);
 assert.match(schema,/physical_base_qty numeric\(15,3\) check/i);
 assert.match(schema,/price_cents bigint check/i);
 assert.match(schema,/published boolean not null default false/i);
 assert.match(schema,/enabled boolean not null default false/i);
});
test('El catálogo público no expone costos de compra ni compradores',()=>{
 const view=schema.split('create or replace view public.public_storefront as')[1].split('grant select on public.public_storefront')[0];
 assert(!/purchase_cost_ars|buyer_email|buyer_phone|delivery_address|jc_orders/i.test(view));
});
test('El circuito está protegido de cobros duplicados y resta física solo al entregar',()=>{
 assert.match(schema,/mp_payment_id text primary key/);
 assert.match(schema,/operation_key uuid primary key/);
 assert.match(schema,/update public.jc_stock set physical_base_qty=physical_base_qty-l.base_per_unit\*p_quantity/);
 assert.match(schema,/for update/);
});
