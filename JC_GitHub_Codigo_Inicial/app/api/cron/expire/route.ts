import { NextRequest,NextResponse } from 'next/server';
import {serverDb} from '@/lib/supabase';
export const runtime='nodejs';
export async function GET(req:NextRequest){
  const expected=process.env.CRON_SECRET;
  if(!expected||req.headers.get('authorization')!==`Bearer ${expected}`)
    return NextResponse.json({error:'No autorizado'},{status:401});
  const {data,error}=await serverDb().rpc('jc_expire_web_orders');
  if(error)return NextResponse.json({error:'No se pudo vencer reservas'},{status:500});
  return NextResponse.json({expired:data});
}
