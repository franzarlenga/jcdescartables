from pathlib import Path
from collections import defaultdict
import csv,re,unicodedata,hashlib
root=Path(__file__).resolve().parent.parent
rows=list(csv.DictReader((root/'data'/'ATLAS_Catalogo_Importacion.csv').open(encoding='utf-8-sig',newline=''),delimiter=';'))
assert len(rows)==337

def norm(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
    return re.sub('-+','-',re.sub('[^a-z0-9]+','-',s)).strip('-')
def q(s):return "'"+str(s).replace("'","''")+"'"
def official_brand(r):return 'JC' if r['marca']=='Sin marca indicada' else r['marca']

def subline(r):
    name=r['nombre'].lower(); fam=r['familia']; brand=official_brand(r)
    if fam=='Rollos de arranque':
        if 'titán' in name or 'titan' in name:return 'Titán'
        if 'celeste' in name:return 'Celeste'
        if 'cristal' in name:return 'Cristal'
        if brand=='Rolan':return 'Rendidor original'
    if fam=='Bolsas camiseta':
        for word,label in [('los nenitos','Los Nenitos'),('reforzada','Reforzada'),('estándar','Estándar'),('color','Color')]:
            if word in name:return label
    if fam=='Bolsas':
        for word,label in [('al vacío','Vacío'),('pp ','Polipropileno'),('e-commerce','E-commerce'),('residuos','Residuos'),('consorcio','Consorcio'),('kraft','Kraft'),('hielo','Hielo')]:
            if word in name:return label
    if fam=='Bandejas':
        for word,label in [('cartón roma','Cartón Roma'),('cartón marrón','Cartón marrón'),('dorada','Doradas'),('eco bandeja','Eco con tapa'),('micro','Microondas'),('aluminio','Aluminio')]:
            if word in name:return label
    if fam=='Papel higiénico':
        return 'Papel higiénico'
    if fam=='Film':
        if 'stretch' in name:return 'Stretch'
    if fam=='Platos':
        if 'dorado' in name:return 'Dorados'
    return ''

# Source-specific root categories; subcategories are the literal families from the PDF.
rubros=[]
for r in rows:
    if r['rubro'] not in rubros:rubros.append(r['rubro'])
rubro_names={
 'BANDEJAS Y ENVASES':'Bandejas y envases',
 'ROLLOS DE ARRANQUE':'Rollos de arranque',
 'CAMISETAS':'Bolsas camiseta',
 'BOLSAS':'Bolsas',
 'FILM, LÁMINAS Y ALUMINIO':'Film, láminas y aluminio',
 'PAPEL':'Papel y limpieza',
 'DESCARTABLES PLÁSTICOS Y VARIOS':'Descartables y varios'
}
allcats=[]
family_to_slug={}
for i,rubro in enumerate(rubros):
    parent_slug='d-'+norm(rubro)
    allcats.append((parent_slug,rubro_names[rubro],None,i))
    families=[]
    for x in rows:
        if x['rubro']==rubro and x['familia'] not in families: families.append(x['familia'])
    for j, family in enumerate(families):
        slug='c-'+norm(rubro)+'-'+norm(family)
        allcats.append((slug,family,parent_slug,j))
        family_to_slug[family]=slug

m=[]
m.append('''-- JC Gestión · V2 — árbol de categorías y catálogo comercial completo
-- Se ejecuta DESPUÉS de 001_jc_store.sql y 002_seed_catalog.sql.
-- No publica productos ni crea stock/precios falsos. Reejecutable.
create table if not exists public.jc_categories (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique,
 title text not null,
 parent_id uuid references public.jc_categories(id) on delete restrict,
 sort_order integer not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.jc_categories enable row level security;
drop policy if exists "admin categories" on public.jc_categories;
create policy "admin categories" on public.jc_categories for all to authenticated
 using ((select public.jc_is_admin())) with check ((select public.jc_is_admin()));
alter table public.jc_products add column if not exists category_id uuid references public.jc_categories(id);
alter table public.jc_groups add column if not exists category_id uuid references public.jc_categories(id);
create index if not exists jc_products_category_idx on public.jc_products(category_id);
create index if not exists jc_groups_category_idx on public.jc_groups(category_id);
''')
for slug,title,parent,order in allcats:
    m.append(f"insert into public.jc_categories(slug,title,sort_order) values({q(slug)},{q(title)},{order}) on conflict(slug) do nothing;\n")
for slug,title,parent,order in allcats:
    if parent:m.append(f"update public.jc_categories c set parent_id=p.id from public.jc_categories p where c.slug={q(slug)} and p.slug={q(parent)} and c.parent_id is null;\n")
for family,slug in family_to_slug.items():
    m.append(f"update public.jc_products p set category_id=c.id from public.jc_categories c where p.family={q(family)} and c.slug={q(slug)} and p.category_id is null;\n")

# Preserve six existing pilot groups; create conservative brand/line-based drafts for remaining SKUs.
known_pilot=set()
for prefix in ['ARR_ROL_','HIG_ELE_','COC_ELE_','BOB_ELE_','TOA_ELE_','SER_ELE_']:
    known_pilot.update(x['sku'].replace('_SMD_','_JC_') for x in rows if x['sku'].startswith(prefix))
remaining=[r for r in rows if r['sku'].replace('_SMD_','_JC_') not in known_pilot]
groups=defaultdict(list)
for r in remaining:
    key=(r['familia'],official_brand(r),subline(r))
    groups[key].append(r)
created=[]
for i,((family,brand,line),members) in enumerate(groups.items(),start=10):
    title=' · '.join([family,brand]+([line] if line else []))
    stem=norm(family)+'-'+norm(brand)+('-'+norm(line) if line else '')
    slug='auto-'+stem[:66]+'-'+hashlib.sha1(('::'.join((family,brand,line))).encode()).hexdigest()[:5]
    created.append((slug,title,len(members)))
    m.append(f"insert into public.jc_groups(slug,title,brand,family,sort_order,published) values({q(slug)},{q(title)},{q(brand)},{q(family)},{i},false) on conflict(slug) do nothing;\n")
    for j,r in enumerate(members):
        sku=r['sku'].replace('_SMD_','_JC_')
        label=r['nombre']
        m.append(f"insert into public.jc_group_products(group_id,product_id,variant_label,sort_order) select g.id,p.id,{q(label)},{j} from public.jc_groups g, public.jc_products p where g.slug={q(slug)} and p.sku={q(sku)} on conflict(product_id) do nothing;\n")

m.append('''-- Vincular todos los grupos comerciales (incluidos los pilotos) a su subcategoría.
update public.jc_groups g set category_id=p.category_id
from public.jc_group_products gp join public.jc_products p on p.id=gp.product_id
where gp.group_id=g.id and g.category_id is null and p.category_id is not null;

-- Esta vista pública no incluye costos, stock físico bruto, datos privados ni proveedores.
create or replace view public.public_storefront as
select g.id as group_id,g.slug,g.title as group_title,g.brand,g.family,g.image_path as group_image_path,
 p.id as product_id,p.sku,gp.variant_label as variant_name,p.image_path,
 o.id as offer_id,o.presentation,o.unit_label,o.units_base,o.price_cents,
 greatest(0,floor((coalesce(s.physical_base_qty,0)-coalesce(r.reserved_base_qty,0))/o.units_base))::integer as available_qty,
 c.id as category_id,c.slug as category_slug,c.title as category_name,
 d.id as department_id,d.slug as department_slug,d.title as department_name
from public.jc_groups g
join public.jc_group_products gp on gp.group_id=g.id
join public.jc_products p on p.id=gp.product_id
join public.jc_offers o on o.product_id=p.id
join public.jc_stock s on s.product_id=p.id
left join public.jc_categories c on c.id=g.category_id
left join public.jc_categories d on d.id=c.parent_id
left join lateral (
 select sum(z.base_qty) as reserved_base_qty from public.jc_reservations z
 where z.product_id=p.id and z.state='held'
) r on true
where g.published and p.active and o.enabled and o.price_cents is not null
and s.physical_base_qty is not null and s.physical_base_qty >= o.units_base
and (c.id is null or c.active) and (d.id is null or d.active);
grant select on public.public_storefront to anon,authenticated,service_role;
''')
out=root/'supabase/migrations/003_categories_and_full_catalog.sql'
out.write_text(''.join(m),encoding='utf-8')
print('category roots',len(rubros),'leaves',len(allcats)-len(rubros),'new groups',len(groups),'pilot SKUs',len(known_pilot),'remaining SKUs',len(remaining),'total',len(rows),'SQL',out.stat().st_size)
# also export a compact JSON of catalog metadata for offline preview, with no private costs
import json
preview=[]
for r in rows:
    preview.append({'sku':r['sku'].replace('_SMD_','_JC_'),'name':r['nombre'],'family':r['familia'],'department':rubro_names[r['rubro']],'brand':official_brand(r),'supplier':r['proveedor'],'pack':r['presentacion_compra'],'base_unit':r['ums_base'],'pack_units':float(r['ums_por_presentacion']),'line':subline(r),'cost':float(r['costo_ars'])})
(root/'data'/'jc_catalog_preview.json').write_text(json.dumps(preview,ensure_ascii=False),encoding='utf-8')
