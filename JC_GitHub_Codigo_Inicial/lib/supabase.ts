import { createClient } from '@supabase/supabase-js';

export function browserDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Falta configurar Supabase');
  return createClient(url, key);
}

export function serverDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta configurar Supabase servidor');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
