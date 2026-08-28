-- Correctif : les fonctions security definer doivent fixer explicitement
-- search_path, sinon le trigger sur auth.users échoue silencieusement
-- ("Database error creating new user") car "profiles" n'est pas résolu.

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable set search_path = public;

create or replace function set_items_id_seq(new_value bigint)
returns void as $$
begin
  perform setval('public.items_id_seq', new_value);
end;
$$ language plpgsql security definer set search_path = public;
