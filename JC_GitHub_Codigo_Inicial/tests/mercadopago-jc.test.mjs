import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=f=>readFileSync(new URL(f,root),'utf8');
test('El negocio tiene contacto confirmado, email pendiente y checkout desactivado',()=>{
 const business=read('lib/jc-business.ts');
 assert.match(business,/Zelada 5561/);assert.match(business,/5053-3078/);assert.match(business,/email: null/);
 assert.match(read('.env.example'),/CHECKOUT_ENABLED=false/);
});
test('Mercado Pago crea el checkout en servidor y verifica el webhook',()=>{
 const checkout=read('app/api/checkout/route.ts');
 const wh=read('app/api/mp-webhook/route.ts');
 assert.ok(checkout.includes('if (process.env.CHECKOUT_ENABLED'));
 assert.ok(checkout.includes('jc_create_web_order'));
 assert.ok(checkout.includes('MP_MAX_INSTALLMENTS'));
 assert.ok(wh.includes('validateMpSignature'));
 assert.ok(wh.includes('jc_confirm_mp_payment'));
 assert.ok(wh.includes('net_received_cents'));
});
test('La migración guarda metadata de conciliación sin exponer los datos públicos',()=>{
 const sql=read('supabase/migrations/006_mp_reconciliation_and_jc_contact.sql');
 for (const f of ['net_received_cents','payment_method_id','installments','fee_details'])assert.ok(sql.includes(f));
});
