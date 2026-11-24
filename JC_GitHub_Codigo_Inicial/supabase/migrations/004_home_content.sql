-- JC Tienda V3: contenido comercial editable desde el ERP, lectura pública limitada a esta tabla.
create table if not exists public.jc_home_content (
  id integer primary key default 1 check (id=1),
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.jc_home_content enable row level security;
drop policy if exists "home public read" on public.jc_home_content;
create policy "home public read" on public.jc_home_content for select to anon, authenticated using (true);
drop policy if exists "home admin write" on public.jc_home_content;
create policy "home admin write" on public.jc_home_content for all to authenticated
 using ((select public.jc_is_admin())) with check ((select public.jc_is_admin()));
grant select on public.jc_home_content to anon, authenticated;
grant insert,update,delete on public.jc_home_content to authenticated;
insert into public.jc_home_content(id,content) values(1,'{}') on conflict(id) do nothing;
