import {NextResponse, type NextRequest} from 'next/server';
/** El mismo proyecto Vercel aloja tienda publica y ERP privado.
 * En gestion.jcdescartables.ar la raiz abre /gestion.
 * No reemplaza autenticacion ni las politicas RLS de Supabase.
 */
export function middleware(request:NextRequest){
 const host=(request.headers.get('host')||'').split(':')[0].toLowerCase();
 if(host==='gestion.jcdescartables.ar'&&request.nextUrl.pathname==='/'){
  const url=request.nextUrl.clone();url.pathname='/gestion';return NextResponse.rewrite(url);
 }
 return NextResponse.next();
}
export const config={matcher:['/']};
