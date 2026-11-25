-- JC Gestion | 009: nucleo operativo compartido con Tienda V3.
-- EJECUTAR SOLO despues de 001..007 (no requiere 008 CRM).
-- Nunca carga stock, inventa precios ni publica articulos. Idempotente en creacion de objetos.

alter table public.jc_orders add column if not exists channel text not null default 'tienda';
alter table public.jc_products add column if not exists min_stock_base_qty numeric(15,3) check(min_stock_base_qty is null or min_stock_base_qty>=0);
alter table public.jc_orders add column if not exists external_reference text;
alter table public.jc_orders alter column buyer_email drop not null;
alter table public.jc_orders alter column buyer_phone drop not null;
alter table public.jc_orders alter column delivery_address drop not null;
create index if not exists jc_orders_channel_created_idx on public.jc_orders(channel,created_at desc);

create table if not exists public.jc_erp_operations (
 operation_key uuid primary key,
 actor_id uuid not null references auth.users(id),
 kind text not null,
 result jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.jc_ml_sales (
 order_id uuid primary key references public.jc_orders(id),
 sale_reference text,
 gross_cents bigint not null check(gross_cents>=0),
 commission_cents bigint not null default 0 check(commission_cents>=0),
 shipping_cents bigint not null default 0 check(shipping_cents>=0),
 other_charges_cents bigint not null default 0 check(other_charges_cents>=0),
 merchandise_cost_cents bigint,
 expected_net_cents bigint not null,
 expected_result_cents bigint,
 cancelled_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists jc_ml_reference_unique on public.jc_ml_sales(sale_reference) where sale_reference is not null and sale_reference <> '';

create table if not exists public.jc_manual_receipts (
 operation_key uuid primary key,
 order_id uuid not null references public.jc_orders(id),
 amount_cents bigint not null check(amount_cents>0),
 method text not null check(method in ('efectivo','transferencia','tarjeta','plataforma','otro')),
 reference text,
 verified_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id)
);
create index if not exists jc_manual_receipts_order on public.jc_manual_receipts(order_id);

create table if not exists public.jc_expense_categories (
 id bigint generated always as identity primary key,
 name text not null unique,
 active boolean not null default true
);
insert into public.jc_expense_categories(name) values
 ('Compra de mercadería'),('Pago a proveedores'),('Fletes y transporte'),('Combustible'),('Peajes'),
 ('Estacionamiento'),('Mantenimiento de vehículos'),('Seguros de vehículos'),('Reparaciones y repuestos'),
 ('Alquiler'),('Electricidad'),('Agua'),('Gas'),('Internet y telefonía'),('Sueldos y jornales'),
 ('Cargas sociales'),('Impuestos y tasas'),('Comisiones de Mercado Libre'),('Publicidad y marketing'),
 ('Software y suscripciones') on conflict(name) do nothing;

create table if not exists public.jc_erp_expenses (
 operation_key uuid primary key,
 category_id bigint references public.jc_expense_categories(id),
 category_snapshot text not null,
 amount_cents bigint not null check(amount_cents>0),
 method text not null check(method in ('efectivo','transferencia','tarjeta','otro')),
 note text not null default '',
 paid_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id)
);
create table if not exists public.jc_erp_tasks (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title))>0),
 notes text not null default '',
 stage text not null default 'pendiente' check(stage in ('pendiente','en_curso','terminada')),
 due_date date,
 order_id uuid references public.jc_orders(id),
 assigned_to uuid references auth.users(id),
 created_by uuid not null references auth.users(id),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.jc_erp_operations enable row level security;
alter table public.jc_ml_sales enable row level security;
alter table public.jc_manual_receipts enable row level security;
alter table public.jc_expense_categories enable row level security;
alter table public.jc_erp_expenses enable row level security;
alter table public.jc_erp_tasks enable row level security;

-- Los datos operativos solo son visibles para el personal autorizado.
drop policy if exists "jc_erp_operations_admin" on public.jc_erp_operations;
create policy "jc_erp_operations_admin" on public.jc_erp_operations for select to authenticated using ((select public.jc_is_admin()));
drop policy if exists "jc_ml_sales_admin" on public.jc_ml_sales;
create policy "jc_ml_sales_admin" on public.jc_ml_sales for select to authenticated using ((select public.jc_is_admin()));
drop policy if exists "jc_manual_receipts_admin" on public.jc_manual_receipts;
create policy "jc_manual_receipts_admin" on public.jc_manual_receipts for select to authenticated using ((select public.jc_is_admin()));
drop policy if exists "jc_expense_categories_admin" on public.jc_expense_categories;
create policy "jc_expense_categories_admin" on public.jc_expense_categories for all to authenticated using ((select public.jc_is_admin())) with check ((select public.jc_is_admin()));
drop policy if exists "jc_erp_expenses_admin" on public.jc_erp_expenses;
create policy "jc_erp_expenses_admin" on public.jc_erp_expenses for select to authenticated using ((select public.jc_is_admin()));
drop policy if exists "jc_erp_tasks_admin" on public.jc_erp_tasks;
create policy "jc_erp_tasks_admin" on public.jc_erp_tasks for all to authenticated using ((select public.jc_is_admin())) with check ((select public.jc_is_admin()));
drop policy if exists "jc_reservations_admin_read" on public.jc_reservations;
create policy "jc_reservations_admin_read" on public.jc_reservations for select to authenticated using ((select public.jc_is_admin()));
drop policy if exists "jc_stock_movements_admin_read" on public.jc_stock_movements;
create policy "jc_stock_movements_admin_read" on public.jc_stock_movements for select to authenticated using ((select public.jc_is_admin()));

-- Evita conteos que dejen reservas comprometidas sin existencias.
create or replace function public.jc_set_stock_count(p_product uuid,p_qty numeric,p_note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare v_old numeric; v_reserved numeric;
begin
 if not public.jc_is_admin() then raise exception 'No autorizado'; end if;
 if p_qty is null or p_qty<0 or p_qty>999999999 then raise exception 'Cantidad inválida'; end if;
 select physical_base_qty into v_old from public.jc_stock where product_id=p_product for update;
 if not found then raise exception 'Artículo inexistente'; end if;
 select coalesce(sum(base_qty),0) into v_reserved from public.jc_reservations where product_id=p_product and state='held';
 if p_qty<v_reserved then raise exception 'El conteo no puede ser menor que el stock reservado (%)',v_reserved; end if;
 update public.jc_stock set physical_base_qty=p_qty,counted_at=now(),updated_at=now() where product_id=p_product;
 insert into public.jc_stock_movements(operation_key,product_id,change_base_qty,reason)
 values(gen_random_uuid(),p_product,p_qty-coalesce(v_old,0),'Conteo físico: '||left(coalesce(p_note,''),250));
end; $$;
revoke all on function public.jc_set_stock_count(uuid,numeric,text) from public,anon;
grant execute on function public.jc_set_stock_count(uuid,numeric,text) to authenticated,service_role;

-- Venta manual: directo reserva; Mercado Libre descuenta stock fisico al guardarse.
-- Los precios enviados deben ser positivos: nunca se inventan a partir del costo.
create or replace function public.jc_create_manual_sale(
 p_operation uuid,p_channel text,p_buyer text,p_lines jsonb,
 p_ml_commission bigint default 0,p_ml_shipping bigint default 0,p_ml_other bigint default 0,
 p_reference text default '',p_notes text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_order public.jc_orders%rowtype; v_row record; v_p uuid;
 v_old numeric; v_res numeric; v_need numeric; v_total bigint:=0; v_cost numeric:=0;
 v_unknown_cost boolean:=false; v_line uuid; v_op uuid; v_result jsonb; v_input_count integer;
begin
 if not public.jc_is_admin() or v_user is null then raise exception 'No autorizado'; end if;
 if p_operation is null then raise exception 'Falta identificador de operación'; end if;
 if p_channel not in ('ml','directo') then raise exception 'Canal inválido'; end if;
 if p_channel='ml' and (p_ml_commission<0 or p_ml_shipping<0 or p_ml_other<0) then raise exception 'Cargos inválidos'; end if;
 if p_channel='ml' and length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Ingresá el número de venta de Mercado Libre'; end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>80 then raise exception 'Seleccioná de 1 a 80 renglones'; end if;
 v_input_count:=jsonb_array_length(p_lines);
 -- Idempotencia durable: mismo UUID no genera otra venta ni otro movimiento.
 insert into public.jc_erp_operations(operation_key,actor_id,kind)
 values(p_operation,v_user,'venta_'||p_channel) on conflict do nothing returning operation_key into v_op;
 if v_op is null then
  select result into v_result from public.jc_erp_operations where operation_key=p_operation and actor_id=v_user and kind='venta_'||p_channel;
  if v_result is null then raise exception 'Identificador de operación ya utilizado'; end if;
  return v_result;
 end if;
 -- Bloqueos de stock ordenados evitan reservas simultáneas incompatibles con la tienda.
 for v_p in
  select distinct o.product_id from jsonb_to_recordset(p_lines) as x(offer_id uuid,quantity integer,unit_price_cents bigint)
  join public.jc_offers o on o.id=x.offer_id order by o.product_id
 loop
  perform 1 from public.jc_stock where product_id=v_p for update;
 end loop;
 -- Referencias ML duplicadas se bloquean por indice unico, sin doble descuento.
 insert into public.jc_orders(checkout_key,buyer_name,buyer_email,buyer_phone,delivery_address,buyer_notes,status,channel,external_reference,expires_at)
 values(gen_random_uuid(),coalesce(nullif(btrim(p_buyer),''),'Consumidor final'),null,null,null,left(coalesce(p_notes,''),500),
  case when p_channel='ml' then 'delivered' else 'awaiting_payment' end,
  p_channel,nullif(btrim(p_reference),''),now()+interval '10 years') returning * into v_order;
 for v_row in
  select x.offer_id,x.quantity,x.unit_price_cents,o.product_id,o.presentation,o.unit_label,o.units_base,
  p.sku,p.name,p.purchase_cost_ars,p.pack_base_qty,p.active
  from jsonb_to_recordset(p_lines) as x(offer_id uuid,quantity integer,unit_price_cents bigint)
  join public.jc_offers o on o.id=x.offer_id
  join public.jc_products p on p.id=o.product_id
 loop
  if not v_row.active or v_row.quantity is null or v_row.quantity<1 or v_row.quantity>100000
    or v_row.unit_price_cents is null or v_row.unit_price_cents<=0 or v_row.unit_price_cents>999999999999
  then raise exception 'Revisá la cantidad y el precio de %',v_row.sku; end if;
  select physical_base_qty into v_old from public.jc_stock where product_id=v_row.product_id;
  select coalesce(sum(base_qty),0) into v_res from public.jc_reservations where product_id=v_row.product_id and state='held';
  v_need:=v_row.units_base*v_row.quantity;
  if v_old is null or v_old-v_res<v_need then raise exception 'Stock disponible insuficiente para %',v_row.sku; end if;
  insert into public.jc_order_lines(order_id,offer_id,product_id,sku,title,unit_label,presentation,quantity,base_per_unit,
    delivered_quantity,unit_price_cents)
  values(v_order.id,v_row.offer_id,v_row.product_id,v_row.sku,v_row.name,v_row.unit_label,v_row.presentation,
    v_row.quantity,v_row.units_base,case when p_channel='ml' then v_row.quantity else 0 end,v_row.unit_price_cents)
  returning id into v_line;
  if p_channel='ml' then
   update public.jc_stock set physical_base_qty=physical_base_qty-v_need,updated_at=now() where product_id=v_row.product_id;
   insert into public.jc_stock_movements(operation_key,product_id,order_line_id,change_base_qty,reason)
   values(gen_random_uuid(),v_row.product_id,v_line,-v_need,'Venta Mercado Libre manual '||v_order.code);
  else
   insert into public.jc_reservations(order_line_id,product_id,base_qty,state)
   values(v_line,v_row.product_id,v_need,'held');
  end if;
  v_total:=v_total+(v_row.quantity*v_row.unit_price_cents);
  if v_row.purchase_cost_ars is null then v_unknown_cost:=true;
  else v_cost:=v_cost+(v_row.purchase_cost_ars/v_row.pack_base_qty)*v_need*100; end if;
 end loop;
 if (select count(*) from public.jc_order_lines where order_id=v_order.id)<>v_input_count
 then raise exception 'Oferta inexistente o artículos repetidos: corregí el pedido'; end if;
 update public.jc_orders set total_cents=v_total where id=v_order.id;
 if p_channel='ml' then
  insert into public.jc_ml_sales(order_id,sale_reference,gross_cents,commission_cents,shipping_cents,other_charges_cents,
    merchandise_cost_cents,expected_net_cents,expected_result_cents)
  values(v_order.id,nullif(btrim(p_reference),''),v_total,p_ml_commission,p_ml_shipping,p_ml_other,
    case when v_unknown_cost then null else round(v_cost)::bigint end,
    v_total-p_ml_commission-p_ml_shipping-p_ml_other,
    case when v_unknown_cost then null else v_total-p_ml_commission-p_ml_shipping-p_ml_other-round(v_cost)::bigint end);
 end if;
 v_result:=jsonb_build_object('order_id',v_order.id,'code',v_order.code,'channel',p_channel,'total_cents',v_total,
   'platform_net_cents',case when p_channel='ml' then v_total-p_ml_commission-p_ml_shipping-p_ml_other else null end);
 update public.jc_erp_operations set result=v_result where operation_key=p_operation;
 return v_result;
end; $$;
revoke all on function public.jc_create_manual_sale(uuid,text,text,jsonb,bigint,bigint,bigint,text,text) from public,anon;
grant execute on function public.jc_create_manual_sale(uuid,text,text,jsonb,bigint,bigint,bigint,text,text) to authenticated,service_role;

-- Cobros verificados por un usuario: no confundir con comprobantes o ventas registradas.
create or replace function public.jc_record_manual_receipt(p_operation uuid,p_order uuid,p_amount bigint,p_method text,p_reference text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_order public.jc_orders%rowtype;v_paid bigint;v_inserted uuid;
begin
 if not public.jc_is_admin() or v_user is null then raise exception 'No autorizado'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Importe inválido'; end if;
 if p_method not in ('efectivo','transferencia','tarjeta','plataforma','otro') then raise exception 'Medio inválido'; end if;
 select * into v_order from public.jc_orders where id=p_order for update;
 if not found or v_order.channel not in ('ml','directo') or v_order.status in ('cancelled','expired') then raise exception 'Pedido no válido'; end if;
 insert into public.jc_manual_receipts(operation_key,order_id,amount_cents,method,reference,created_by)
 values(p_operation,p_order,p_amount,p_method,left(coalesce(p_reference,''),150),v_user)
 on conflict(operation_key) do nothing returning operation_key into v_inserted;
 if v_inserted is null then
  if not exists(select 1 from public.jc_manual_receipts where operation_key=p_operation and order_id=p_order and amount_cents=p_amount and created_by=v_user)
  then raise exception 'Identificador usado para otro cobro'; end if;
  return jsonb_build_object('duplicate',true);
 end if;
 select coalesce(sum(amount_cents),0) into v_paid from public.jc_manual_receipts where order_id=p_order;
 if v_paid>v_order.total_cents and v_order.channel='directo' then raise exception 'El cobro supera el saldo'; end if;
 if v_order.channel='directo' and v_paid>=v_order.total_cents then
   update public.jc_orders set status='paid',paid_at=now() where id=p_order and status='awaiting_payment';
 end if;
 return jsonb_build_object('paid_cents',v_paid,'remaining_cents',greatest(0,v_order.total_cents-v_paid));
end; $$;
revoke all on function public.jc_record_manual_receipt(uuid,uuid,bigint,text,text) from public,anon;
grant execute on function public.jc_record_manual_receipt(uuid,uuid,bigint,text,text) to authenticated,service_role;

create or replace function public.jc_record_expense(p_operation uuid,p_category bigint,p_amount bigint,p_method text,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_cat text;v_inserted uuid;
begin
 if not public.jc_is_admin() or v_user is null then raise exception 'No autorizado'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Importe inválido'; end if;
 if p_method not in ('efectivo','transferencia','tarjeta','otro') then raise exception 'Medio inválido'; end if;
 select name into v_cat from public.jc_expense_categories where id=p_category and active=true;
 if not found then raise exception 'Concepto inválido'; end if;
 insert into public.jc_erp_expenses(operation_key,category_id,category_snapshot,amount_cents,method,note,created_by)
 values(p_operation,p_category,v_cat,p_amount,p_method,left(coalesce(p_note,''),300),v_user)
 on conflict(operation_key) do nothing returning operation_key into v_inserted;
 if v_inserted is null then return jsonb_build_object('duplicate',true); end if;
 return jsonb_build_object('saved',true);
end; $$;
revoke all on function public.jc_record_expense(uuid,bigint,bigint,text,text) from public,anon;
grant execute on function public.jc_record_expense(uuid,bigint,bigint,text,text) to authenticated,service_role;

-- Reversión auditada de venta ML: solo cuando no hay cobros y sigue íntegramente entregada.
create or replace function public.jc_reverse_ml_sale(p_operation uuid,p_order uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_order public.jc_orders%rowtype;v_line record;v_result jsonb;v_op uuid;
begin
 if not public.jc_is_admin() or v_user is null then raise exception 'No autorizado'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Indicá motivo de reversión'; end if;
 insert into public.jc_erp_operations(operation_key,actor_id,kind) values(p_operation,v_user,'reversa_ml')
 on conflict do nothing returning operation_key into v_op;
 if v_op is null then
  select result into v_result from public.jc_erp_operations where operation_key=p_operation and actor_id=v_user and kind='reversa_ml';
  if v_result is null then raise exception 'Identificador de reversión ya utilizado'; end if;
  return v_result;
 end if;
 select * into v_order from public.jc_orders where id=p_order for update;
 if not found or v_order.channel<>'ml' or v_order.status<>'delivered' then raise exception 'Venta no reversible'; end if;
 if exists(select 1 from public.jc_manual_receipts where order_id=p_order) then raise exception 'La venta ya tiene cobros: revisar antes de revertir'; end if;
 for v_line in select product_id,quantity,base_per_unit,sku from public.jc_order_lines where order_id=p_order order by product_id loop
  perform 1 from public.jc_stock where product_id=v_line.product_id for update;
  update public.jc_stock set physical_base_qty=physical_base_qty+v_line.quantity*v_line.base_per_unit,updated_at=now() where product_id=v_line.product_id;
  insert into public.jc_stock_movements(operation_key,product_id,change_base_qty,reason)
  values(gen_random_uuid(),v_line.product_id,v_line.quantity*v_line.base_per_unit,'Reversa ML '||v_order.code||': '||left(p_reason,160));
 end loop;
 update public.jc_ml_sales set cancelled_at=now() where order_id=p_order;
 update public.jc_orders set status='cancelled' where id=p_order;
 v_result:=jsonb_build_object('reversed',true,'code',v_order.code);
 update public.jc_erp_operations set result=v_result where operation_key=p_operation;
 return v_result;
end; $$;
revoke all on function public.jc_reverse_ml_sale(uuid,uuid,text) from public,anon;
grant execute on function public.jc_reverse_ml_sale(uuid,uuid,text) to authenticated,service_role;

-- Congelar costo del renglon al crear pedidos NUEVOS, para preservar resultados historicos.
-- Renglones previos sin costo conocido permanecen NULL, no se reescribe el pasado.
alter table public.jc_order_lines add column if not exists cost_cents_snapshot bigint;
create or replace function public.jc_capture_order_line_cost() returns trigger language plpgsql security definer set search_path='' as $$
declare v_cost numeric;v_pack numeric;
begin
 select purchase_cost_ars,pack_base_qty into v_cost,v_pack from public.jc_products where id=new.product_id;
 if v_cost is not null and v_pack>0 then
  new.cost_cents_snapshot := round((v_cost/v_pack)*new.base_per_unit*new.quantity*100)::bigint;
 end if;
 return new;
end; $$;
drop trigger if exists jc_capture_order_line_cost on public.jc_order_lines;
create trigger jc_capture_order_line_cost before insert on public.jc_order_lines
 for each row execute function public.jc_capture_order_line_cost();

-- Cancelar un pedido pendiente sin cobros ni entregas; libera reservas y no toca fisico.
-- Un pago de MP posterior a la cancelacion queda para revision, nunca como entrega automatica.
create or replace function public.jc_cancel_pending_erp_order(p_operation uuid,p_order uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_order public.jc_orders%rowtype;v_op uuid;v_result jsonb;
begin
 if not public.jc_is_admin() or v_user is null then raise exception 'No autorizado'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Indicá motivo'; end if;
 insert into public.jc_erp_operations(operation_key,actor_id,kind)
 values(p_operation,v_user,'cancelar_pendiente') on conflict do nothing returning operation_key into v_op;
 if v_op is null then
  select result into v_result from public.jc_erp_operations where operation_key=p_operation and actor_id=v_user and kind='cancelar_pendiente';
  if v_result is null then raise exception 'Identificador de operación utilizado'; end if;
  return v_result;
 end if;
 select * into v_order from public.jc_orders where id=p_order for update;
 if not found or v_order.channel not in ('tienda','directo') or v_order.status not in ('awaiting_payment','payment_review')
 then raise exception 'El pedido no está pendiente o no es cancelable'; end if;
 if exists(select 1 from public.jc_manual_receipts where order_id=p_order)
    or exists(select 1 from public.jc_mp_payments where order_id=p_order and processing_result='paid')
    or exists(select 1 from public.jc_order_lines where order_id=p_order and delivered_quantity>0)
 then raise exception 'Existen cobros o entregas: requiere revisión'; end if;
 update public.jc_orders set status='cancelled' where id=p_order;
 update public.jc_reservations r set base_qty=0,state='released'
 from public.jc_order_lines l where l.id=r.order_line_id and l.order_id=p_order and r.state='held';
 v_result:=jsonb_build_object('cancelled',true,'code',v_order.code,'reason',left(p_reason,200));
 update public.jc_erp_operations set result=v_result where operation_key=p_operation;
 return v_result;
end; $$;
revoke all on function public.jc_cancel_pending_erp_order(uuid,uuid,text) from public,anon;
grant execute on function public.jc_cancel_pending_erp_order(uuid,uuid,text) to authenticated,service_role;
