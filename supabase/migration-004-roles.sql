-- Ajoute le rôle "controleur" (accès limité à l'ajout de contrôles SECT) en
-- plus de "admin" et "lecture". Permet aussi aux admins de changer le rôle
-- d'un autre compte (jusqu'ici un compte ne pouvait modifier que son propre
-- profil, et jamais son propre rôle).

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'controleur', 'lecture'));

-- Un admin peut modifier n'importe quel profil (typiquement pour changer un
-- rôle) ; un compte non-admin reste limité à son propre profil, rôle verrouillé
-- (policy déjà existante "profiles_update_own_role_locked", inchangée).
create policy "profiles_update_admin" on profiles
  for update using (is_admin()) with check (is_admin());

-- Un admin ou un contrôleur peut ajouter un contrôle SECT (mais pas créer,
-- modifier ou supprimer un item — ça reste réservé aux admins via les
-- policies items_insert_admin / items_update_admin / items_delete_admin,
-- inchangées).
create or replace function can_inspect()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('admin', 'controleur')
  );
$$ language sql security definer stable set search_path = public;

drop policy if exists "inspections_insert_admin" on inspections;
create policy "inspections_insert_admin_or_controleur" on inspections
  for insert with check (can_inspect());
