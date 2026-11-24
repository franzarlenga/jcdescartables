import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/supabase';
import { validateMpSignature } from '@/lib/mp-signature';
export const runtime = 'nodejs';

async function processNotification(request: NextRequest) {
  const url=new URL(request.url);
  const dataId=url.searchParams.get('data.id');
  const requestId=request.headers.get('x-request-id');
  // No procesamos eventos no verificados.
  if (!validateMpSignature(request.headers.get('x-signature'),requestId,dataId,process.env.MP_WEBHOOK_SECRET)) {
    return NextResponse.json({error:'Firma inválida'},{status:401});
  }
  if (url.searchParams.get('type') !== 'payment' || !dataId || !/^\d+$/.test(dataId)) return NextResponse.json({ok:true});
  const token=process.env.MP_ACCESS_TOKEN;
  if (!token) return NextResponse.json({error:'Configuración incompleta'},{status:503});
  const response=await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`,{
    headers:{Authorization:`Bearer ${token}`},cache:'no-store'
  });
  if (!response.ok) return NextResponse.json({error:'Error al verificar pago'},{status:502});
  const payment=await response.json();
  if (String(payment.id) !== dataId || payment.status!=='approved') return NextResponse.json({ok:true});
  if (process.env.MP_TEST_MODE==='true' ? payment.live_mode===true : payment.live_mode===false) {
    return NextResponse.json({error:'Entorno de pago no coincide'},{status:409});
  }
  if (payment.currency_id!=='ARS' || !/^[0-9a-f-]{36}$/i.test(String(payment.external_reference||''))) {
    return NextResponse.json({error:'Referencia no válida'},{status:409});
  }
  const cents=Math.round(Number(payment.transaction_amount)*100);
  if (!Number.isSafeInteger(cents)||cents<=0) return NextResponse.json({error:'Monto inválido'},{status:409});
  const db=serverDb();
  const {error,result}=await (async()=>{const r=await db.rpc('jc_confirm_mp_payment',{
    p_order:payment.external_reference,p_payment_id:dataId,p_amount_cents:cents
  });return {error:r.error,result:r.data};})();
  if (error) return NextResponse.json({error:'No se pudo registrar el pago'},{status:500});
  // Conciliación: montos y cuotas reportados por Mercado Pago, sin inferir comisiones.
  const netRaw=payment.transaction_details?.net_received_amount;
  const netValue=netRaw==null?null:Number(netRaw);
  const netCents=netValue!==null&&Number.isFinite(netValue)&&netValue>=0&&Number.isSafeInteger(Math.round(netValue*100))?Math.round(netValue*100):null;
  const installments=Number(payment.installments);
  const breakdown=Array.isArray(payment.fee_details)?payment.fee_details:null;
  const {error:reconciliationError}=await db.from('jc_mp_payments').update({
    net_received_cents:netCents,
    payment_method_id:typeof payment.payment_method_id==='string'?payment.payment_method_id:null,
    payment_type_id:typeof payment.payment_type_id==='string'?payment.payment_type_id:null,
    installments:Number.isSafeInteger(installments)&&installments>=1?installments:null,
    fee_details:breakdown,
  }).eq('mp_payment_id',dataId).eq('order_id',payment.external_reference);
  if (reconciliationError) return NextResponse.json({error:'Error al registrar conciliación del pago'},{status:500});
  return NextResponse.json({ok:true,result});
}
export async function POST(request:NextRequest) {return processNotification(request);}
