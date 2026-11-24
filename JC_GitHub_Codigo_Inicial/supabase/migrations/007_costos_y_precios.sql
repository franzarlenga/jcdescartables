-- JC Gestión · 007 Costos y precios por SKU: manual, porcentual y auditado.
-- Requiere 001..006 ejecutadas. No inicializa precios de venta ni publica ofertas.
-- Edición centralizada: tienda y ERP leen jc_offers.price_cents y jc_products.purchase_cost_ars.

alter table public.jc_products add column if not exists original_purchase_cost_ars numeric(15,2);
update public.jc_products set original_purchase_cost_ars=purchase_cost_ars
where original_purchase_cost_ars is null and purchase_cost_ars is not null;
alter table public.jc_products add column if not exists cost_updated_at timestamptz;
alter table public.jc_offers add column if not exists price_updated_at timestamptz;

create table if not exists public.jc_pricing_operations (
 id uuid primary key,
 actor_id uuid not null references auth.users(id),
 target text not null check (target in ('cost','price','mixed')),
 mode text not null check (mode in ('set','percent','from_cost')),
 input_value numeric(20,4) not null,
 note text not null default '',
 selected_count integer not null default 0,
 affected_count integer not null default 0,
 skipped_count integer not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists public.jc_pricing_changes (
 id bigint generated always as identity primary key,
 operation_id uuid not null references public.jc_pricing_operations(id),
 actor_id uuid not null references auth.users(id),
 product_id uuid not null references public.jc_products(id),
 offer_id uuid references public.jc_offers(id),
 presentation_snapshot text,
 sku_snapshot text not null,
 target text not null check(target in ('cost','price')),
 old_value numeric(20,2),
 new_value numeric(20,2) not null,
 created_at timestamptz not null default now()
);
create index if not exists jc_pricing_changes_product on public.jc_pricing_changes(product_id, created_at desc);
create index if not exists jc_pricing_changes_created on public.jc_pricing_changes(created_at desc);

alter table public.jc_pricing_operations enable row level security;
alter table public.jc_pricing_changes enable row level security;
drop policy if exists "jc_admin_pricing_operations_read" on public.jc_pricing_operations;
create policy "jc_admin_pricing_operations_read" on public.jc_pricing_operations
 for select to authenticated using ((select public.jc_is_admin()));
drop policy if exists "jc_admin_pricing_changes_read" on public.jc_pricing_changes;
create policy "jc_admin_pricing_changes_read" on public.jc_pricing_changes
 for select to authenticated using ((select public.jc_is_admin()));
-- No existen políticas de INSERT/UPDATE/DELETE para usuarios en el historial.
-- Todas las escrituras pasan por una operación transaccional con usuario autorizado.

create or replace function public.jc_apply_pricing_change(
  p_ids uuid[], p_target text, p_mode text, p_value numeric,
  p_note text default '', p_operation uuid default gen_random_uuid()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_expected integer;
  v_seen integer := 0;
  v_affected integer := 0;
  v_skipped integer := 0;
  v_product record;
  v_offer record;
  v_old numeric;
  v_new numeric;
  v_inserted uuid;
begin
  if not public.jc_is_admin() or v_user is null then raise exception 'No autorizado'; end if;
  if p_operation is null then raise exception 'Operación sin identificador'; end if;
  if p_ids is null or coalesce(array_length(p_ids,1),0)=0 or array_length(p_ids,1)>1000 then
    raise exception 'Elegí entre 1 y 1000 registros';
  end if;
  if array_position(p_ids,null) is not null then raise exception 'Identificadores inválidos'; end if;
  if p_target not in ('cost','price') or p_mode not in ('set','percent','from_cost') then
    raise exception 'Tipo de modificación inválido';
  end if;
  if p_value is null or p_value::text in ('NaN','Infinity','-Infinity') then raise exception 'Importe inválido'; end if;
  if p_mode='from_cost' and (p_target<>'price' or p_value<0 or p_value>1000) then
    raise exception 'Recargo sobre costo inválido';
  end if;
  if p_mode='percent' and (p_value <= -100 or p_value > 1000) then
    raise exception 'El porcentaje debe ser mayor que -100 y hasta 1000';
  end if;
  if p_mode='set' and ((p_target='cost' and (p_value<0 or p_value>999999999999))
    or (p_target='price' and (p_value<1 or p_value>999999999999999))) then
    raise exception 'El valor ingresado está fuera de rango';
  end if;
  if p_mode='set' and p_target='price' and p_value<>round(p_value) then
    raise exception 'El precio debe expresarse en centavos enteros';
  end if;
  if p_mode='set' and p_target='cost' and p_value<>round(p_value,2) then
    raise exception 'El costo admite como máximo dos decimales';
  end if;
  select count(*) into v_expected from (select distinct unnest(p_ids) as id) x;

  -- Idempotencia por operación: reintentos no vuelven a aumentar el precio.
  insert into public.jc_pricing_operations
    (id,actor_id,target,mode,input_value,note,selected_count)
  values(p_operation,v_user,p_target,p_mode,p_value,left(coalesce(p_note,''),300),v_expected)
  on conflict(id) do nothing returning id into v_inserted;
  if v_inserted is null then
    if not exists (select 1 from public.jc_pricing_operations where id=p_operation and actor_id=v_user
      and target=p_target and mode=p_mode and input_value=p_value) then
      raise exception 'Identificador de operación ya utilizado';
    end if;
    return (select jsonb_build_object('duplicate',true,'selected',selected_count,
       'updated',affected_count,'skipped',skipped_count)
       from public.jc_pricing_operations where id=p_operation);
  end if;

  if p_target='cost' then
    for v_product in
      select id,sku,purchase_cost_ars from public.jc_products
      where id=any(p_ids) order by id for update
    loop
      v_seen:=v_seen+1;
      v_old:=v_product.purchase_cost_ars;
      if p_mode='percent' and v_old is null then v_skipped:=v_skipped+1; continue; end if;
      v_new:=case when p_mode='set' then p_value
        else round(v_old*(1+p_value/100),2) end;
      if v_new<0 or v_new>999999999999 then raise exception 'Costo fuera de rango'; end if;
      if v_old is not distinct from v_new then v_skipped:=v_skipped+1; continue; end if;
      update public.jc_products set purchase_cost_ars=v_new,cost_updated_at=now(),cost_valid_from=current_date where id=v_product.id;
      insert into public.jc_pricing_changes
        (operation_id,actor_id,product_id,sku_snapshot,target,old_value,new_value)
      values (p_operation,v_user,v_product.id,v_product.sku,'cost',v_old,v_new);
      v_affected:=v_affected+1;
    end loop;
  else
    for v_offer in
      select o.id,o.product_id,o.price_cents,o.presentation,p.sku,p.purchase_cost_ars,p.pack_base_qty,o.units_base
      from public.jc_offers o join public.jc_products p on p.id=o.product_id
      where o.id=any(p_ids) order by o.id for update of o
    loop
      v_seen:=v_seen+1;
      v_old:=v_offer.price_cents;
      -- Porcentaje sólo sobre precios ya cargados. Jamás crear un precio ficticio desde NULL.
      if p_mode='percent' and v_old is null then v_skipped:=v_skipped+1; continue; end if;
      if p_mode='from_cost' and v_offer.purchase_cost_ars is null then v_skipped:=v_skipped+1; continue; end if;
      v_new:=case
        when p_mode='set' then p_value
        when p_mode='percent' then round(v_old*(1+p_value/100))
        else round(v_offer.purchase_cost_ars*v_offer.units_base/v_offer.pack_base_qty*(1+p_value/100)*100)
      end;
      if v_new<1 or v_new>999999999999999 then raise exception 'Precio fuera de rango'; end if;
      if v_old is not distinct from v_new then v_skipped:=v_skipped+1; continue; end if;
      update public.jc_offers set price_cents=v_new::bigint,price_updated_at=now() where id=v_offer.id;
      insert into public.jc_pricing_changes
        (operation_id,actor_id,product_id,offer_id,presentation_snapshot,sku_snapshot,target,old_value,new_value)
      values (p_operation,v_user,v_offer.product_id,v_offer.id,v_offer.presentation,v_offer.sku,'price',v_old,v_new);
      v_affected:=v_affected+1;
    end loop;
  end if;
  if v_seen<>v_expected then raise exception 'La selección contiene registros inexistentes'; end if;
  update public.jc_pricing_operations set affected_count=v_affected,skipped_count=v_skipped where id=p_operation;
  return jsonb_build_object('duplicate',false,'selected',v_expected,'updated',v_affected,'skipped',v_skipped);
end; $$;
grant select on public.jc_pricing_operations,public.jc_pricing_changes to authenticated;
revoke all on public.jc_pricing_operations, public.jc_pricing_changes from anon;
revoke all on function public.jc_apply_pricing_change(uuid[],text,text,numeric,text,uuid) from public,anon;
grant execute on function public.jc_apply_pricing_change(uuid[],text,text,numeric,text,uuid) to authenticated,service_role;


-- Edición de una ficha: costo y las dos presentaciones se guardan en una sola transacción.
-- NULL significa "no modificar ese campo"; jamás se eliminan precios accidentalmente.
create or replace function public.jc_save_product_pricing(
 p_product uuid, p_cost numeric default null,
 p_pack_cents bigint default null, p_unit_cents bigint default null,
 p_note text default '', p_operation uuid default gen_random_uuid()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := auth.uid();
 v_p public.jc_products%rowtype;
 v_o public.jc_offers%rowtype;
 v_count integer := 0;
 v_selected integer := 0;
 v_old numeric;
 v_new numeric;
 v_found_pack boolean := false;
 v_found_unit boolean := false;
 v_inserted uuid;
begin
 if not public.jc_is_admin() or v_actor is null then raise exception 'No autorizado'; end if;
 if p_operation is null or p_product is null then raise exception 'Operación inválida'; end if;
 if p_cost is null and p_pack_cents is null and p_unit_cents is null then
   raise exception 'No se indicó ningún campo';
 end if;
 if p_cost is not null and (p_cost<0 or p_cost>999999999999 or p_cost<>round(p_cost,2)) then
   raise exception 'Costo inválido';
 end if;
 if p_pack_cents is not null and (p_pack_cents<=0 or p_pack_cents>999999999999999) then
   raise exception 'Precio de bulto inválido';
 end if;
 if p_unit_cents is not null and (p_unit_cents<=0 or p_unit_cents>999999999999999) then
   raise exception 'Precio individual inválido';
 end if;
 v_selected := (p_cost is not null)::integer + (p_pack_cents is not null)::integer + (p_unit_cents is not null)::integer;
 insert into public.jc_pricing_operations(id,actor_id,target,mode,input_value,note,selected_count)
 values(p_operation,v_actor,'mixed','set',0,left(coalesce(p_note,''),300),v_selected)
 on conflict(id) do nothing returning id into v_inserted;
 if v_inserted is null then
   if not exists(select 1 from public.jc_pricing_operations where id=p_operation and actor_id=v_actor and target='mixed') then
     raise exception 'Identificador de operación ya utilizado';
   end if;
   return (select jsonb_build_object('duplicate',true,'updated',affected_count)
     from public.jc_pricing_operations where id=p_operation);
 end if;
 select * into v_p from public.jc_products where id=p_product for update;
 if not found then raise exception 'SKU inexistente'; end if;
 if p_cost is not null and v_p.purchase_cost_ars is distinct from p_cost then
   v_old:=v_p.purchase_cost_ars;
   update public.jc_products set purchase_cost_ars=p_cost,cost_updated_at=now(),cost_valid_from=current_date where id=p_product;
   insert into public.jc_pricing_changes(operation_id,actor_id,product_id,sku_snapshot,target,old_value,new_value)
   values(p_operation,v_actor,p_product,v_p.sku,'cost',v_old,p_cost);
   v_count:=v_count+1;
 end if;
 for v_o in select * from public.jc_offers where product_id=p_product order by id for update loop
   if v_o.presentation='pack' then v_found_pack:=true;v_new:=p_pack_cents;
   elsif v_o.presentation='unit' then v_found_unit:=true;v_new:=p_unit_cents;
   else continue; end if;
   if v_new is not null and v_o.price_cents is distinct from v_new then
     update public.jc_offers set price_cents=v_new::bigint,price_updated_at=now() where id=v_o.id;
     insert into public.jc_pricing_changes(operation_id,actor_id,product_id,offer_id,presentation_snapshot,sku_snapshot,target,old_value,new_value)
     values(p_operation,v_actor,p_product,v_o.id,v_o.presentation,v_p.sku,'price',v_o.price_cents,v_new);
     v_count:=v_count+1;
   end if;
 end loop;
 if (p_pack_cents is not null and not v_found_pack) or (p_unit_cents is not null and not v_found_unit) then
   raise exception 'La presentación seleccionada no existe';
 end if;
 update public.jc_pricing_operations set affected_count=v_count,skipped_count=v_selected-v_count where id=p_operation;
 return jsonb_build_object('duplicate',false,'updated',v_count);
end; $$;
revoke all on function public.jc_save_product_pricing(uuid,numeric,bigint,bigint,text,uuid) from public,anon;
grant execute on function public.jc_save_product_pricing(uuid,numeric,bigint,bigint,text,uuid) to authenticated,service_role;
