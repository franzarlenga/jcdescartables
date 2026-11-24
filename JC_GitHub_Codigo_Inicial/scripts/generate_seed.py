"""Regenera seed SQL desde el catálogo fuente de 337 SKU.
La migración inicial marca como JC los productos sin marca (acordado), preserva proveedor/costo.
No publica ni inventa precio o stock.
"""
from pathlib import Path
import csv, re
base=Path(__file__).resolve().parent.parent
source=base/'data'/'ATLAS_Catalogo_Importacion.csv'
rows=list(csv.DictReader(source.open(encoding='utf-8-sig',newline=''),delimiter=';'))
assert len(rows)==337, f'Catálogo incompleto: {len(rows)}'
def lit(x):
    if x is None or str(x)=='' :return 'NULL'
    return "'"+str(x).replace("'","''")+"'"
items=[]
for r in rows:
    sku=r['sku'].replace('_SMD_','_JC_')
    brand='JC' if r['marca']=='Sin marca indicada' else r['marca']
    internal=(r['marca']=='Sin marca indicada' or r.get('marca_revisar')=='SI')
    vals=[sku,r['nombre'],brand,internal,r['familia'],r['proveedor'],r['presentacion_compra'],r['ums_base'],r['ums_por_presentacion'],r['costo_ars'],r['iva_fuente'],r['pagina_fuente'],r['vigencia']]
    row=f"({lit(vals[0])},{lit(vals[1])},{lit(vals[2])},{str(vals[3]).lower()},{lit(vals[4])},{lit(vals[5])},{lit(vals[6])},{lit(vals[7])},{vals[8]},{vals[9]},{lit(vals[10])},{vals[11]},{lit(vals[12])})"
    items.append(row)
assert len(set(r['sku'].replace('_SMD_','_JC_') for r in rows))==337
out=base/'supabase/migrations/002_seed_catalog.sql'
parts=["-- JC · Catálogo original desde Lista_Costos_JC.pdf, vigencia 2026-11-15.\n-- JC es marca operativa para registros sin fabricante. No inferir fabricante.\n-- Reejecutable SIN borrar stock, precios, fotos ni pedidos.\n"]
parts.append('''insert into public.jc_products(sku,name,brand,brand_internal,family,supplier,original_presentation,base_unit,pack_base_qty,purchase_cost_ars,tax_source,source_page,cost_valid_from)
values\n'''+',\n'.join(items)+'''\non conflict(sku) do nothing;\n''')
parts.append('''insert into public.jc_stock(product_id)
select id from public.jc_products on conflict(product_id) do nothing;
insert into public.jc_offers(product_id,presentation,unit_label,units_base)
select id,'unit',case when base_unit='rollo' then 'Rollo individual' when base_unit='unidad' then 'Unidad individual' else 'Por '||base_unit end,1
from public.jc_products on conflict(product_id,presentation) do nothing;
insert into public.jc_offers(product_id,presentation,unit_label,units_base)
select id,'pack',original_presentation,pack_base_qty from public.jc_products
where pack_base_qty>1 on conflict(product_id,presentation) do nothing;
-- Precios quedan NULL; publicaciones desactivadas hasta autorización comercial.\n''')
groups=[
 ('arranque-rolan-original','Arranque Rolan · Rendidor original','Rolan','Rollos de arranque','ARR_ROL_'),
 ('higienico-elegante','Papel higiénico Elegante','Elegante','Papel higiénico','HIG_ELE_'),
 ('cocina-elegante','Rollos de cocina Elegante','Elegante','Rollos de cocina','COC_ELE_'),
 ('bobinas-elegante','Bobinas industriales Elegante','Elegante','Bobinas de papel','BOB_ELE_'),
 ('toallas-elegante','Toallas bobina Elegante','Elegante','Toallas bobina','TOA_ELE_'),
 ('servilletas-elegante','Servilletas Elegante','Elegante','Servilletas','SER_ELE_')]
parts.append('-- 6 grupos comerciales piloto, SIN PUBLICAR.\n')
for i,(slug,title,brand,family,prefix) in enumerate(groups):
 parts.append(f"insert into public.jc_groups(slug,title,brand,family,sort_order) values({lit(slug)},{lit(title)},{lit(brand)},{lit(family)},{i}) on conflict(slug) do nothing;\n")
 associated=[r for r in rows if r['sku'].startswith(prefix)]
 for j,r in enumerate(associated):
  sku=r['sku'].replace('_SMD_','_JC_')
  label=r['nombre']
  if prefix=='ARR_ROL_':
   m=re.search(r'(\d+x\d+)',label)
   label=m.group(1) if m else label
  else:
   label=re.sub(r'(?i)\s*Elegante\s*',' ',label).strip()
  parts.append(f"insert into public.jc_group_products(group_id,product_id,variant_label,sort_order)\nselect g.id,p.id,{lit(label)},{j} from public.jc_groups g, public.jc_products p\nwhere g.slug={lit(slug)} and p.sku={lit(sku)} on conflict(product_id) do nothing;\n")
out.write_text(''.join(parts),encoding='utf-8')
print('Productos:',len(rows),'Grupos:',len(groups),'Artículos piloto:',sum(len([r for r in rows if r['sku'].startswith(p)]) for *_,p in groups))
