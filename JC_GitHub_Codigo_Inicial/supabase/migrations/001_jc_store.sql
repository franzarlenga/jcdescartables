-- JC Gestión + tienda pública · Fase 1
-- Ejecutar en el proyecto SUPABASE DE JC (no en FIERRO).
create extension if not exists pgcrypto;

create sequence if not exists public.jc_order_seq start 1;

create table if not exists public.jc_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.jc_is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$select exists(select 1 from public.jc_admin_users a where a.user_id = auth.uid())$$;
revoke all on function public.jc_is_admin() from public;
grant execute on function public.jc_is_admin() to authenticated, service_role;

create table if not exists public.jc_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  brand text not null,
  brand_internal boolean not null default false,
  family text not null,
  supplier text,
  original_presentation text not null,
  base_unit text not null,
  pack_base_qty numeric(15,3) not null check(pack_base_qty > 0),
  purchase_cost_ars numeric(15,2) check(purchase_cost_ars >= 0),
  tax_source text,
  source_page integer,
  cost_valid_from date,
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.jc_stock (
  product_id uuid primary key references public.jc_products(id) on delete restrict,
  physical_base_qty numeric(15,3) check(physical_base_qty >= 0),
  counted_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.jc_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  brand text not null,
  family text not null,
  image_path text,
  published boolean not null default false,
  sort_order integer not null default 0
);
create table if not exists public.jc_group_products (
  group_id uuid not null references public.jc_groups(id) on delete cascade,
  product_id uuid not null unique references public.jc_products(id) on delete restrict,
  variant_label text not null,
  sort_order integer not null default 0,
  primary key(group_id,product_id)
);
create table if not exists public.jc_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.jc_products(id) on delete cascade,
  presentation text not null check(presentation in ('unit','pack')),
  unit_label text not null,
  units_base numeric(15,3) not null check(units_base > 0),
  price_cents bigint check(price_cents is null or price_cents > 0),
  enabled boolean not null default false,
  unique(product_id,presentation)
);
create table if not exists public.jc_orders (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  checkout_key uuid not null unique,
  code text not null unique default ('PED-' || lpad(nextval('public.jc_order_seq')::text,6,'0')),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text not null,
  delivery_address text not null,
  buyer_notes text not null default '',
  status text not null default 'awaiting_payment' check(status in ('awaiting_payment','paid','partial_delivery','delivered','cancelled','expired','payment_review')),
  total_cents bigint not null default 0 check(total_cents >= 0),
  expires_at timestamptz not null default now() + interval '45 minutes',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  payment_preference_id text
);
create table if not exists public.jc_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.jc_orders(id),
  offer_id uuid not null references public.jc_offers(id),
  product_id uuid not null references public.jc_products(id),
  sku text not null,
  title text not null,
  unit_label text not null,
  presentation text not null,
  quantity integer not null check(quantity > 0),
  base_per_unit numeric(15,3) not null check(base_per_unit>0),
  delivered_quantity integer not null default 0 check(delivered_quantity >= 0),
  unit_price_cents bigint not null check(unit_price_cents > 0),
  unique(order_id,offer_id)
);
create table if not exists public.jc_reservations (
  id uuid primary key default gen_random_uuid(),
  order_line_id uuid not null unique references public.jc_order_lines(id),
  product_id uuid not null references public.jc_products(id),
  base_qty numeric(15,3) not null check(base_qty >= 0),
  state text not null default 'held' check(state in ('held','released','fulfilled'))
);
create index if not exists jc_reserve_product_active on public.jc_reservations(product_id) where state='held';
create table if not exists public.jc_mp_payments (
  mp_payment_id text primary key,
  order_id uuid not null references public.jc_orders(id),
  amount_cents bigint not null,
  processing_result text not null,
  received_at timestamptz not null default now()
);
create table if not exists public.jc_cash_movements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.jc_orders(id),
  mp_payment_id text not null unique,
  movement_type text not null default 'ING' check(movement_type='ING'),
  amount_cents bigint not null,
  created_at timestamptz not null default now()
);
create table if not exists public.jc_stock_movements (
  operation_key uuid primary key,
  product_id uuid not null references public.jc_products(id),
  order_line_id uuid references public.jc_order_lines(id),
  change_base_qty numeric(15,3) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- RLS: los datos privados JAMÁS se exponen al público.
alter table public.jc_admin_users enable row level security;
alter table public.jc_products enable row level security;
alter table public.jc_stock enable row level security;
alter table public.jc_groups enable row level security;
alter table public.jc_group_products enable row level security;
alter table public.jc_offers enable row level security;
alter table public.jc_orders enable row level security;
alter table public.jc_order_lines enable row level security;
alter table public.jc_reservations enable row level security;
alter table public.jc_mp_payments enable row level security;
alter table public.jc_cash_movements enable row level security;
alter table public.jc_stock_movements enable row level security;

create policy "admin products" on public.jc_products for all to authenticated using ((select public.jc_is_admin())) with check ((select public.jc_is_admin()));
create policy "admin stock read" on public.jc_stock for select to authenticated using ((select public.jc_is_admin()));
create policy "admin groups" on public.jc_groups for all to authenticated using ((select public.jc_is_admin())) with check ((select public.jc_is_admin()));
create policy "admin group products" on public.jc_group_products for all to authenticated using ((select public.jc_is_admin())) with check ((select public.jc_is_admin()));
create policy "admin offers" on public.jc_offers for all to authenticated using ((select public.jc_is_admin())) with check ((select public.jc_is_admin()));
create policy "admin orders read" on public.jc_orders for select to authenticated using ((select public.jc_is_admin()));
create policy "admin order lines read" on public.jc_order_lines for select to authenticated using ((select public.jc_is_admin()));
create policy "admin payments read" on public.jc_mp_payments for select to authenticated using ((select public.jc_is_admin()));
create policy "admin cash read" on public.jc_cash_movements for select to authenticated using ((select public.jc_is_admin()));
create policy "admin stockmov read" on public.jc_stock_movements for select to authenticated using ((select public.jc_is_admin()));

-- Vista pública restringida: solo SKU, precio de venta y disponibilidad. Nunca costos ni PII.
create or replace view public.public_storefront as
select g.id as group_id,g.slug,g.title as group_title,g.brand,g.family,g.image_path as group_image_path,
 p.id as product_id,p.sku,gp.variant_label as variant_name,p.image_path,
 o.id as offer_id,o.presentation,o.unit_label,o.units_base,o.price_cents,
 greatest(0,floor((coalesce(s.physical_base_qty,0)-coalesce(r.reserved_base_qty,0))/o.units_base))::integer as available_qty
from public.jc_groups g
join public.jc_group_products gp on gp.group_id=g.id
join public.jc_products p on p.id=gp.product_id
join public.jc_offers o on o.product_id=p.id
join public.jc_stock s on s.product_id=p.id
left join lateral (
 select sum(z.base_qty) as reserved_base_qty from public.jc_reservations z
 where z.product_id=p.id and z.state='held'
) r on true
where g.published and p.active and o.enabled and o.price_cents is not null
and s.physical_base_qty is not null and s.physical_base_qty >= o.units_base;
grant select on public.public_storefront to anon, authenticated, service_role;

-- RPC de conteo físico: solo para personal JC; NULL significa stock nunca cargado.
create or replace function public.jc_set_stock_count(p_product uuid,p_qty numeric,p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare old_qty numeric;
begin
 if not public.jc_is_admin() then raise exception 'No autorizado'; end if;
 if p_qty is null or p_qty<0 then raise exception 'Cantidad inválida'; end if;
 select physical_base_qty into old_qty from public.jc_stock where product_id=p_product for update;
 if not found then raise exception 'Artículo inexistente'; end if;
 update public.jc_stock set physical_base_qty=p_qty,counted_at=now(),updated_at=now() where product_id=p_product;
 insert into public.jc_stock_movements(operation_key,product_id,change_base_qty,reason)
 values(gen_random_uuid(),p_product,p_qty-coalesce(old_qty,0),'Conteo físico: '||left(p_note,250));
end; $$;
revoke all on function public.jc_set_stock_count(uuid,numeric,text) from public,anon;
grant execute on function public.jc_set_stock_count(uuid,numeric,text) to authenticated,service_role;

-- Crear pedido y reservar de forma atómica; importes SIEMPRE se calculan en servidor.
create or replace function public.jc_create_web_order(p_key uuid,p_buyer jsonb,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.jc_orders%rowtype;
declare v_p uuid;
declare v_row record;
declare v_available numeric;
declare v_physical numeric;
declare v_reserved numeric;
declare v_line_id uuid;
declare v_total bigint := 0;
begin
 if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines)>60 then
  raise exception 'Carrito incorrecto';
 end if;
 select * into v_order from public.jc_orders where checkout_key=p_key;
 if found then
  if v_order.status <> 'awaiting_payment' or v_order.expires_at < now() then raise exception 'Este carrito ya fue usado'; end if;
  return jsonb_build_object('order_id',v_order.id,'public_token',v_order.public_token,'code',v_order.code,'total_cents',v_order.total_cents);
 end if;
 -- Bloqueo ordenado de balances: previene reservas simultáneas que excedan stock.
 for v_p in
  select distinct o.product_id from jsonb_to_recordset(p_lines) as x(offer_id uuid,qty integer)
  join public.jc_offers o on o.id=x.offer_id order by o.product_id
 loop
  perform 1 from public.jc_stock where product_id=v_p for update;
 end loop;
 insert into public.jc_orders(checkout_key,buyer_name,buyer_email,buyer_phone,delivery_address,buyer_notes)
 values(p_key, p_buyer->>'name',p_buyer->>'email',p_buyer->>'phone',p_buyer->>'address',coalesce(p_buyer->>'notes','')) returning * into v_order;
 for v_row in
  select o.id offer_id,o.product_id,o.presentation,o.unit_label,o.units_base,o.price_cents,
         p.sku,p.name, x.qty
  from jsonb_to_recordset(p_lines) as x(offer_id uuid,qty integer)
  join public.jc_offers o on o.id=x.offer_id
  join public.jc_products p on p.id=o.product_id
  join public.jc_group_products gp on gp.product_id=p.id
  join public.jc_groups g on g.id=gp.group_id
  where p.active and g.published and o.enabled and o.price_cents>0
 loop
  if v_row.qty is null or v_row.qty<1 or v_row.qty>100 then raise exception 'Cantidad inválida'; end if;
  select physical_base_qty into v_physical from public.jc_stock where product_id=v_row.product_id;
  select coalesce(sum(base_qty),0) into v_reserved from public.jc_reservations where product_id=v_row.product_id and state='held';
  v_available := coalesce(v_physical,0)-v_reserved;
  if v_physical is null or v_available < v_row.units_base*v_row.qty then
    raise exception 'Sin stock suficiente para %',v_row.sku;
  end if;
  insert into public.jc_order_lines(order_id,offer_id,product_id,sku,title,unit_label,presentation,quantity,base_per_unit,unit_price_cents)
  values(v_order.id,v_row.offer_id,v_row.product_id,v_row.sku,v_row.name,v_row.unit_label,v_row.presentation,v_row.qty,v_row.units_base,v_row.price_cents)
  returning id into v_line_id;
  insert into public.jc_reservations(order_line_id,product_id,base_qty)
  values(v_line_id,v_row.product_id,v_row.units_base*v_row.qty);
  v_total := v_total + v_row.qty*v_row.price_cents;
 end loop;
 if (select count(*) from public.jc_order_lines where order_id=v_order.id) <> jsonb_array_length(p_lines) then
  raise exception 'Algunos artículos no están habilitados para la venta';
 end if;
 update public.jc_orders set total_cents=v_total where id=v_order.id;
 return jsonb_build_object('order_id',v_order.id,'public_token',v_order.public_token,'code',v_order.code,'total_cents',v_total);
end; $$;
revoke all on function public.jc_create_web_order(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.jc_create_web_order(uuid,jsonb,jsonb) to service_role;

create or replace function public.jc_cancel_web_order(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 update public.jc_orders set status='cancelled' where id=p_id and status='awaiting_payment';
 update public.jc_reservations r set state='released',base_qty=0 from public.jc_order_lines l
 where l.id=r.order_line_id and l.order_id=p_id and r.state='held' and exists(select 1 from public.jc_orders o where o.id=p_id and o.status='cancelled');
end; $$;
revoke all on function public.jc_cancel_web_order(uuid) from public,anon,authenticated;
grant execute on function public.jc_cancel_web_order(uuid) to service_role;

create or replace function public.jc_confirm_mp_payment(p_order uuid,p_payment_id text,p_amount_cents bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare v_order public.jc_orders%rowtype; v_result text;
begin
 select * into v_order from public.jc_orders where id=p_order for update;
 if not found then raise exception 'Pedido no existe'; end if;
 if v_order.status in ('paid','partial_delivery','delivered') then
  if exists(select 1 from public.jc_mp_payments where mp_payment_id=p_payment_id) then return 'duplicate'; end if;
  -- Segundo pago APROBADO distinto: nunca contabilizar dos veces; registrar para reembolso/revisión.
  insert into public.jc_mp_payments(mp_payment_id,order_id,amount_cents,processing_result)
  values(p_payment_id,p_order,p_amount_cents,'duplicate_charge_review') on conflict do nothing;
  return 'duplicate_charge_review';
 end if;
 if v_order.status <> 'awaiting_payment' or v_order.total_cents <> p_amount_cents then
  v_result := 'payment_review';
 else
  v_result := 'paid';
 end if;
 insert into public.jc_mp_payments(mp_payment_id,order_id,amount_cents,processing_result)
 values(p_payment_id,p_order,p_amount_cents,v_result) on conflict (mp_payment_id) do nothing;
 if not found then return 'duplicate'; end if;
 update public.jc_orders set status=v_result,paid_at=case when v_result='paid' then now() else paid_at end where id=p_order;
 if v_result='paid' then
  insert into public.jc_cash_movements(order_id,mp_payment_id,amount_cents) values(p_order,p_payment_id,p_amount_cents) on conflict do nothing;
 else
  -- Pago acreditado que no puede asociarse con seguridad: queda en revisión,
  -- sin prometer stock ni habilitar entrega automática.
  update public.jc_reservations r set state='released',base_qty=0 from public.jc_order_lines l
  where l.id=r.order_line_id and l.order_id=p_order and r.state='held';
 end if;
 return v_result;
end; $$;
revoke all on function public.jc_confirm_mp_payment(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.jc_confirm_mp_payment(uuid,text,bigint) to service_role;

create or replace function public.jc_expire_web_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_count integer := 0;
begin
 for v_id in select id from public.jc_orders where status='awaiting_payment' and expires_at<now() for update skip locked loop
  update public.jc_orders set status='expired' where id=v_id;
  update public.jc_reservations r set state='released',base_qty=0 from public.jc_order_lines l
   where l.order_id=v_id and l.id=r.order_line_id and r.state='held';
  v_count:=v_count+1;
 end loop;
 return v_count;
end; $$;
revoke all on function public.jc_expire_web_orders() from public,anon,authenticated;
grant execute on function public.jc_expire_web_orders() to service_role;

-- Entregas parciales: descuenta FÍSICO únicamente lo entregado, con idempotencia.
create or replace function public.jc_deliver_line(p_line uuid,p_quantity integer,p_operation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.jc_order_lines%rowtype; o public.jc_orders%rowtype; v_rem numeric;
begin
 if not public.jc_is_admin() then raise exception 'No autorizado'; end if;
 if p_quantity is null or p_quantity<1 then raise exception 'Cantidad inválida'; end if;
 if exists(select 1 from public.jc_stock_movements where operation_key=p_operation) then return; end if;
 select * into l from public.jc_order_lines where id=p_line for update;
 if not found then raise exception 'Renglón inexistente'; end if;
 select * into o from public.jc_orders where id=l.order_id for update;
 if o.status not in ('paid','partial_delivery') then raise exception 'No hay pago verificado'; end if;
 if p_quantity>l.quantity-l.delivered_quantity then raise exception 'Supera cantidad pendiente'; end if;
 perform 1 from public.jc_stock where product_id=l.product_id for update;
 update public.jc_stock set physical_base_qty=physical_base_qty-l.base_per_unit*p_quantity,updated_at=now() where product_id=l.product_id and physical_base_qty>=l.base_per_unit*p_quantity;
 if not found then raise exception 'Sin stock físico suficiente'; end if;
 update public.jc_order_lines set delivered_quantity=delivered_quantity+p_quantity where id=l.id;
 update public.jc_reservations set base_qty=greatest(0,base_qty-l.base_per_unit*p_quantity),
  state=case when base_qty<=l.base_per_unit*p_quantity then 'fulfilled' else 'held' end where order_line_id=l.id;
 insert into public.jc_stock_movements(operation_key,product_id,order_line_id,change_base_qty,reason)
 values(p_operation,l.product_id,l.id,-l.base_per_unit*p_quantity,'Entrega pedido '||o.code);
 if not exists(select 1 from public.jc_order_lines where order_id=o.id and delivered_quantity<quantity) then
  update public.jc_orders set status='delivered' where id=o.id;
 else update public.jc_orders set status='partial_delivery' where id=o.id; end if;
end; $$;
revoke all on function public.jc_deliver_line(uuid,integer,uuid) from public,anon;
grant execute on function public.jc_deliver_line(uuid,integer,uuid) to authenticated,service_role;

-- Fotografías de productos desde el panel privado.
insert into storage.buckets(id,name,public) values('jc-product-images','jc-product-images',true) on conflict(id) do nothing;
create policy "jc public image read" on storage.objects for select to public using(bucket_id='jc-product-images');
create policy "jc admin image insert" on storage.objects for insert to authenticated with check(bucket_id='jc-product-images' and (select public.jc_is_admin()));
create policy "jc admin image update" on storage.objects for update to authenticated using(bucket_id='jc-product-images' and (select public.jc_is_admin())) with check(bucket_id='jc-product-images' and (select public.jc_is_admin()));
create policy "jc admin image delete" on storage.objects for delete to authenticated using(bucket_id='jc-product-images' and (select public.jc_is_admin()));
