import { NextRequest, NextResponse } from 'next/server';
import { CheckoutSchema } from '@/lib/validation';
import { serverDb } from '@/lib/supabase';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (process.env.CHECKOUT_ENABLED !== 'true') return NextResponse.json({error:'El cobro online todavía no está habilitado.'},{status:503});
  const token=process.env.MP_ACCESS_TOKEN;
  const site=process.env.APP_URL;
  if (!token || !site || !process.env.MP_WEBHOOK_SECRET) return NextResponse.json({error:'Falta configurar el sistema de pagos.'},{status:503});
  let data;
  try { data=CheckoutSchema.parse(await request.json()); }
  catch { return NextResponse.json({error:'Revisá los datos de contacto y las cantidades.'},{status:400}); }
  const db=serverDb();
  const {data:created,error}=await db.rpc('jc_create_web_order',{p_key:data.client_key,p_buyer:data.buyer,p_lines:data.lines});
  if (error || !created?.order_id) return NextResponse.json({error: error?.message || 'No se pudo reservar stock.'},{status:409});
  const orderId=created.order_id as string;
  // Reintentos: reutilizar la misma preferencia si ya se creó para este pedido.
  const previous=await db.from('jc_orders').select('payment_preference_id').eq('id',orderId).single();
  if(previous.data?.payment_preference_id){
    const response=await fetch(`https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(previous.data.payment_preference_id)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    if(response.ok){
      const saved=await response.json();
      const checkoutUrl=process.env.MP_TEST_MODE==='true'?saved.sandbox_init_point:saved.init_point;
      if(checkoutUrl)return NextResponse.json({checkout_url:checkoutUrl,code:created.code,public_token:created.public_token});
    }
  }
  // Las líneas se leen del servidor; nunca usar precios enviados desde el navegador.
  const {data:lines,error:lineError}=await db.from('jc_order_lines').select('sku,title,unit_label,quantity,unit_price_cents').eq('order_id',orderId);
  if (lineError || !lines?.length) return NextResponse.json({error:'Error al consultar el pedido.'},{status:500});
  const baseUrl=site.replace(/\/$/,'');
  const pref={
    items:lines.map(l=>({id:l.sku,title:`${l.title} · ${l.unit_label}`,quantity:l.quantity,currency_id:'ARS',unit_price:Number(l.unit_price_cents)/100})),
    payer:{name:data.buyer.name,email:data.buyer.email},
    external_reference:orderId,
    notification_url:`${baseUrl}/api/mp-webhook`,
    back_urls:{success:`${baseUrl}/pedido?pedido=${created.public_token}`,failure:`${baseUrl}/pedido?pedido=${created.public_token}`,pending:`${baseUrl}/pedido?pedido=${created.public_token}`},
    auto_return:'approved',
    expires:true,
    expiration_date_from:new Date().toISOString(),
    expiration_date_to:new Date(Date.now()+45*60*1000).toISOString(),
    ...(Number.isInteger(Number(process.env.MP_MAX_INSTALLMENTS)) && Number(process.env.MP_MAX_INSTALLMENTS)>=1 && Number(process.env.MP_MAX_INSTALLMENTS)<=12
      ? {payment_methods:{installments:Number(process.env.MP_MAX_INSTALLMENTS)}} : {})
  };
  try {
    const response=await fetch('https://api.mercadopago.com/checkout/preferences',{
      method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json','X-Idempotency-Key':orderId},
      body:JSON.stringify(pref),cache:'no-store'
    });
    const payload=await response.json();
    if (!response.ok || !payload.id) throw new Error('No se pudo crear la preferencia de pago.');
    await db.from('jc_orders').update({payment_preference_id:payload.id}).eq('id',orderId);
    const init=process.env.MP_TEST_MODE==='true' ? payload.sandbox_init_point : payload.init_point;
    if (!init) throw new Error('No se recibió enlace de pago.');
    return NextResponse.json({checkout_url:init,code:created.code,public_token:created.public_token});
  } catch {
    await db.rpc('jc_cancel_web_order',{p_id:orderId});
    return NextResponse.json({error:'Mercado Pago no pudo iniciar el cobro. No se concretó la compra.'},{status:502});
  }
}
