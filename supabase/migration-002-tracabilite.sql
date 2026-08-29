-- Traçabilité : qui a créé/modifié un item.

alter table items add column if not exists created_by uuid references profiles(id);
alter table items add column if not exists updated_by uuid references profiles(id);

create or replace function set_items_audit()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  elsif TG_OP = 'UPDATE' then
    new.updated_by := auth.uid();
    new.created_by := old.created_by; -- ne change jamais après la création
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists items_set_audit on items;
create trigger items_set_audit
  before insert or update on items
  for each row execute function set_items_audit();

-- Permet à un admin de voir qui (email) a créé/modifié un item : les profils
-- ne sont visibles qu'aux comptes connectés (jamais au public en lecture seule).
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_authenticated" on profiles
  for select using (auth.role() = 'authenticated');
