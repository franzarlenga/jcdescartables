import { browserDb } from '@/lib/supabase';
import type { Group, Offer } from '@/lib/types';
import Store from '@/components/store';
import {DEFAULT_HOME,type HomeContent} from '@/lib/home';
export const dynamic = 'force-dynamic';
export default async function Home() {
  let groups: Group[] = [];
  let error = '';
  let homeContent:HomeContent = DEFAULT_HOME;
  try {
    const db = browserDb();
    const res = await db.from('public_storefront').select('*').order('group_title').order('sku');
    if (res.error) throw res.error;
    const map = new Map<string, Group>();
    for (const r of (res.data ?? [])) {
      let g = map.get(r.group_id);
      if (!g) { g = {id:r.group_id, slug:r.slug, title:r.group_title, brand:r.brand, family:r.family, image_path:r.group_image_path, category_id:r.category_id, category_slug:r.category_slug, category_name:r.category_name, department_id:r.department_id, department_slug:r.department_slug, department_name:r.department_name, offers:[]}; map.set(r.group_id, g); }
      g.offers.push({offer_id:r.offer_id, product_id:r.product_id, sku:r.sku, variant_name:r.variant_name, unit_label:r.unit_label, presentation:r.presentation, units_base:Number(r.units_base), price_cents:r.price_cents, available_qty:Number(r.available_qty), image_path:r.image_path} as Offer);
    }
    groups = [...map.values()];
    const config=await db.from('jc_home_content').select('content').eq('id',1).maybeSingle();
    if(!config.error&&config.data?.content)homeContent={...DEFAULT_HOME,...config.data.content};
  } catch {error = 'La tienda todavía no está conectada a la base de JC.';}
  return <Store groups={groups} error={error} homeContent={homeContent} />;
}
