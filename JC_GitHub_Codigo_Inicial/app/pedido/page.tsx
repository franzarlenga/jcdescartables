'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
function StatusPage() {
  const params=useSearchParams(); const token=params.get('pedido') || '';
  const [data,setData]=useState<{code:string;status:string;total_cents:number}|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{if(!token)return;fetch(`/api/order-status?token=${encodeURIComponent(token)}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(setData).catch(()=>setError('No se pudo consultar el pedido.'));},[token]);
  const label:Record<string,string>={awaiting_payment:'Esperando confirmación del pago',paid:'Pago aprobado · pedido recibido',expired:'Plazo de pago vencido',payment_review:'Pago en revisión',cancelled:'Pedido cancelado'};
  return <main className="receipt"><Link className="logo" href="/">JC<span>.</span></Link><div className="receipt-box"><span className="eyebrow">ESTADO DEL PEDIDO</span><h1>{data ? data.code : 'Consultando...'}</h1><p>{data ? label[data.status]||'En proceso' : error || 'La confirmación puede demorar unos instantes.'}</p><p className="muted">No tomamos el resultado de la redirección como comprobante de pago. Solo se acredita cuando Mercado Pago confirma la operación en el servidor.</p><Link href="/" className="btn dark">Volver a la tienda</Link></div></main>;
}
export default function Pedido() {return <Suspense fallback={<main className="receipt">Consultando pedido…</main>}><StatusPage/></Suspense>}
