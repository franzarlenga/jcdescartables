import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/supabase';
export const runtime='nodejs';
export async function GET(req:NextRequest){
  const token=new URL(req.url).searchParams.get('token');
  if(!token||!/^[0-9a-f-]{36}$/i.test(token))return NextResponse.json({error:'Token inválido'},{status:400});
  const {data,error}=await serverDb().from('jc_orders').select('code,status,total_cents').eq('public_token',token).maybeSingle();
  if(error||!data)return NextResponse.json({error:'Pedido no encontrado'},{status:404});
  return NextResponse.json(data,{'headers':{'Cache-Control':'no-store'}});
}
