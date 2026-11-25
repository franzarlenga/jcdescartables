import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/009_erp_operativo.sql','utf8');
const ui=fs.readFileSync('app/gestion/page.tsx','utf8');
const css=fs.readFileSync('app/gestion/gestion.module.css','utf8');
test('ERP opera con los mismos registros de productos, stock, ofertas y pedidos',()=>{
 for(const x of ['public.jc_products','public.jc_stock','public.jc_orders','public.jc_order_lines','public.jc_offers','public.jc_reservations'])assert.ok(sql.includes(x),x);
 assert.ok(ui.includes("db.from('jc_products')"));assert.ok(ui.includes("db.from('jc_groups')"));
});
test('Ventas ML manuales descuentan fisico y ordenes directas reservan',()=>{
 assert.match(sql,/if p_channel='ml' then\s+update public\.jc_stock/i);
 assert.match(sql,/else\s+insert into public\.jc_reservations/i);
 assert.match(sql,/p_ml_commission/);assert.match(sql,/expected_net_cents/);
 assert.match(sql,/unique index if not exists jc_ml_reference_unique/i);
});
test('Operaciones protegidas con admin, RLS e idempotencia',()=>{
 for(const name of ['jc_create_manual_sale','jc_record_manual_receipt','jc_record_expense','jc_reverse_ml_sale','jc_cancel_pending_erp_order'])assert.ok(sql.includes(name));
 assert.match(sql,/public\.jc_is_admin\(\)/);
 assert.match(sql,/on conflict do nothing returning operation_key/i);
 assert.match(sql,/jc_set_stock_count/);
 assert.match(sql,/if p_qty<v_reserved then raise exception/);
 assert.match(sql,/jc_capture_order_line_cost/);
});
test('Gestión privada incluye siete módulos reales y fotos desde celular',()=>{
 for(const label of ['dashboard','pedidos','inventario','finanzas','tareas','calendario','tienda'])assert.ok(ui.includes(`id:'${label}'`)||ui.includes(`tab==='${label}'`));
 for(const x of ['signInWithPassword','jc_is_admin','jc_set_stock_count','jc_create_manual_sale','jc_deliver_line','jc_record_expense','capture="environment"'])assert.ok(ui.includes(x),x);
 assert.match(css,/\.mobileNav/);assert.match(css,/\.sidebar/);
});
